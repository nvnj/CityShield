"""FastAPI app: CityShield operator API.

Endpoints:
  POST /assess              — run full pipeline, return assessment + plan + packet
  GET  /incidents           — list recent cityshield-alerts docs
  GET  /incidents/{id}      — single incident by ID
  POST /approve             — record operator action (human gate before notify)
  GET  /signals/crowd       — recent crowd-stream docs (time-series)
  GET  /signals/traffic     — recent traffic-stream docs (time-series)
  GET  /signals/sentiment   — recent sentiment-stream docs (time-series)
  GET  /signals/latest/{zone} — latest single reading per stream for a zone (gauge data)
  GET  /health              — Cloud Run startup probe

CORS: localhost:5173 (Vite dev) + explicit production origins.
NOTE: Do NOT use wildcard allow_origins — use allow_origin_regex for patterns
(Starlette limitation confirmed in ADK_TASK_TEMPLATE.md).
"""

import asyncio
import logging
import os
import random
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def _traffic_feeder_loop() -> None:
    """Async traffic feeder — runs forever, yields to the event loop between ticks."""
    from elastic.client import get_client, setup_indices
    from elastic.ingest import _ROADS, _ZONES, _baseline_traffic, _spike_traffic

    loop = asyncio.get_running_loop()
    es = await loop.run_in_executor(None, get_client)
    await loop.run_in_executor(None, setup_indices, es)

    tick = 0
    logger.info("Background traffic feeder started")
    while True:
        road = random.choice(_ROADS)
        zone = random.choice(_ZONES)
        is_spike = random.random() < 0.15
        doc = _spike_traffic(road, zone) if is_spike else _baseline_traffic(road, zone)
        try:
            await loop.run_in_executor(None, lambda: es.index(index="traffic-stream", document=doc))
            tick += 1
            if tick % 10 == 0:
                logger.info("Traffic feeder: %d docs indexed", tick)
        except Exception as e:
            logger.error("Traffic feeder index failed: %s", e)
        await asyncio.sleep(5)


async def _sentiment_feeder_loop() -> None:
    """Async sentiment feeder — runs forever, yields to the event loop between ticks."""
    from elastic.client import get_client, setup_indices
    from elastic.ingest import _ZONES, _baseline_sentiment, _spike_sentiment

    loop = asyncio.get_running_loop()
    es = await loop.run_in_executor(None, get_client)
    await loop.run_in_executor(None, setup_indices, es)

    tick = 0
    logger.info("Background sentiment feeder started")
    while True:
        zone = random.choice(_ZONES)
        is_spike = random.random() < 0.10
        doc = _spike_sentiment(zone) if is_spike else _baseline_sentiment(zone)
        try:
            await loop.run_in_executor(None, lambda: es.index(index="sentiment-stream", document=doc))
            tick += 1
            if tick % 10 == 0:
                logger.info("Sentiment feeder: %d docs indexed", tick)
        except Exception as e:
            logger.error("Sentiment feeder index failed: %s", e)
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Set up indices and start background synthetic feeders on startup."""
    from elastic.client import get_client, setup_indices
    try:
        setup_indices(get_client())
        logger.info("Elasticsearch indices verified on startup")
    except Exception as e:
        logger.error("Startup index setup failed: %s", e)

    from cv.feeder import run_cv_feeder_async

    traffic_task   = asyncio.create_task(_traffic_feeder_loop(),   name="traffic-feeder")
    sentiment_task = asyncio.create_task(_sentiment_feeder_loop(), name="sentiment-feeder")
    cv_task        = asyncio.create_task(run_cv_feeder_async(),    name="cv-feeder")
    logger.info("Background feeders scheduled (traffic, sentiment, cv)")

    yield

    traffic_task.cancel()
    sentiment_task.cancel()
    cv_task.cancel()
    try:
        await asyncio.gather(traffic_task, sentiment_task, cv_task, return_exceptions=True)
    except Exception:
        pass
    logger.info("Background feeders stopped")


app = FastAPI(title="CityShield API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://cityshield-hackathon.web.app",
        "https://cityshield-hackathon.firebaseapp.com",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AssessRequest(BaseModel):
    zone: str | None = None
    window_minutes: int = 5


class ApproveRequest(BaseModel):
    incident_id: str
    action: str          # "approve" | "dismiss" | "edit"
    note: str = ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    """Cloud Run startup probe — must respond 200 before traffic is routed."""
    return {"status": "ok"}


@app.post("/assess")
def assess(req: AssessRequest):
    """Run the full assessment pipeline and return the result.

    Takes 30–90s depending on Gemini latency. The console shows a spinner.
    """
    from agents.orchestrator import run_assessment
    try:
        result = run_assessment(zone=req.zone, window_minutes=req.window_minutes)
        return result
    except Exception as e:
        logger.error("Assessment pipeline failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/incidents")
def list_incidents(limit: int = 20, zone: str | None = None):
    """Return recent incidents from cityshield-alerts, newest first."""
    from elastic.tools import get_recent_window
    try:
        docs = get_recent_window(
            "cityshield-alerts",
            minutes=60 * 24,  # last 24 hours
            zone=zone,
            max_docs=limit,
        )
        return {"incidents": docs, "count": len(docs)}
    except Exception as e:
        logger.error("Failed to list incidents: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/incidents/{incident_id}")
def get_incident(incident_id: str):
    """Return a single incident by ID."""
    from elastic.client import get_client
    es = get_client()
    try:
        result = es.get(index="cityshield-alerts", id=incident_id)
        return result["_source"]
    except Exception as e:
        logger.error("Failed to get incident %s: %s", incident_id, e)
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")


@app.post("/approve")
def approve(req: ApproveRequest):
    """Record the operator's decision on an incident.

    INVARIANT #3: No external notification fires until this endpoint is called.
    The notify action is a placeholder — the human gate is this call.
    """
    if req.action not in {"approve", "dismiss", "edit"}:
        raise HTTPException(status_code=400, detail="action must be approve|dismiss|edit")

    from elastic.tools import record_operator_action
    try:
        record_operator_action(req.incident_id, req.action, req.note)
    except Exception as e:
        logger.error("Failed to record operator action: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    # Notify placeholder — fires ONLY after human approval, never before
    if req.action == "approve":
        _notify_placeholder(req.incident_id)

    return {
        "incident_id": req.incident_id,
        "action": req.action,
        "status": "recorded",
    }


@app.get("/signals/crowd")
def signals_crowd(minutes: int = 30, zone: str | None = None):
    """Recent crowd-stream docs for the Signals chart."""
    from elastic.tools import get_recent_window
    try:
        return get_recent_window("crowd-stream", minutes=minutes, zone=zone, max_docs=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/signals/traffic")
def signals_traffic(minutes: int = 30, zone: str | None = None):
    """Recent traffic-stream docs for the Signals chart."""
    from elastic.tools import get_recent_window
    try:
        return get_recent_window("traffic-stream", minutes=minutes, zone=zone, max_docs=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/signals/sentiment")
def signals_sentiment(minutes: int = 30, zone: str | None = None):
    """Recent sentiment-stream docs for the Signals chart."""
    from elastic.tools import get_recent_window
    try:
        return get_recent_window("sentiment-stream", minutes=minutes, zone=zone, max_docs=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/signals/latest/{zone}")
def signals_latest(zone: str):
    """Return the latest single reading from each stream for a zone.

    Used by the gauge cards in the dashboard. Returns the most recent document
    from crowd-stream, traffic-stream, and sentiment-stream for the given zone,
    merged into one flat response.

    Returns zeros/defaults if no data is present so gauges always render.
    """
    from elastic.tools import get_recent_window
    result = {
        "zone": zone,
        "density": 0.0,
        "headcount": 0,
        "speed_avg": 0.0,
        "vehicle_count": 0,
        "incident": "none",
        "sentiment_score": 0.0,
        "keywords": [],
        "timestamp": None,
    }
    try:
        crowd = get_recent_window("crowd-stream", minutes=10, zone=zone, max_docs=1)
        if crowd:
            result["density"] = float(crowd[0].get("density") or 0)
            result["headcount"] = int(crowd[0].get("headcount") or 0)
            result["timestamp"] = crowd[0].get("timestamp")
    except Exception as e:
        logger.warning("signals_latest crowd failed for zone=%s: %s", zone, e)

    try:
        traffic = get_recent_window("traffic-stream", minutes=10, zone=zone, max_docs=1)
        if traffic:
            result["speed_avg"] = float(traffic[0].get("speed_avg") or 0)
            result["vehicle_count"] = int(traffic[0].get("vehicle_count") or 0)
            result["incident"] = str(traffic[0].get("incident") or "none")
    except Exception as e:
        logger.warning("signals_latest traffic failed for zone=%s: %s", zone, e)

    try:
        sentiment = get_recent_window("sentiment-stream", minutes=10, zone=zone, max_docs=1)
        if sentiment:
            result["sentiment_score"] = float(sentiment[0].get("sentiment_score") or 0)
            result["keywords"] = list(sentiment[0].get("keywords") or [])
    except Exception as e:
        logger.warning("signals_latest sentiment failed for zone=%s: %s", zone, e)

    return result


def _notify_placeholder(incident_id: str) -> None:
    """Stub for outbound notification (Slack/webhook).

    Called only after operator approval. Implement when the console is live.
    """
    logger.info("NOTIFY (placeholder): incident %s approved — outbound hook would fire here", incident_id)
