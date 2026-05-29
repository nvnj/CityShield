"""Orchestrator: runs the full CityShield assessment pipeline.

Owns execution sequence. All data flows through return values — no shared state.
Elasticsearch is the data plane; Gemini is the reasoning plane.

Pipeline (per DIGITAL_TWIN.md):
  1. setup_indices()              — idempotent, safe on every call
  2. get_recent_window() x3      — crowd, traffic, sentiment
  3. get_anomaly_results()        — Elastic ML results (may be empty)
  4. correlation.assess()         — Gemini: joint signal reasoning
  5. planner.plan()               — Gemini: graded response sequence
  6. incident_writer.write()      — Gemini: operator packet
  7. create_incident()            — writes to cityshield-alerts
  Returns full pipeline result dict.
"""

import logging
import os
from datetime import UTC, datetime

from dotenv import load_dotenv

load_dotenv()

from agents import correlation, incident_writer, planner
from elastic.client import get_client, setup_indices
from elastic.tools import create_incident, get_anomaly_results, get_recent_window

logger = logging.getLogger(__name__)

# ML job IDs — empty list until Kibana ML jobs are configured
_ANOMALY_JOB_IDS = [
    "crowd_density_anomaly",
    "traffic_surge_anomaly",
    "sentiment_drop_anomaly",
]

# Zone resource context — static config for demo; extend as needed
_ZONE_CONTEXT: dict[str, dict] = {
    "gate_a": {"stewards_available": 12, "lanes": 4, "gates": ["A1", "A2", "A3", "A4"]},
    "gate_b": {"stewards_available": 8, "lanes": 3, "gates": ["B1", "B2", "B3"]},
    "gate_c": {"stewards_available": 10, "lanes": 3, "gates": ["C1", "C2", "C3"]},
    "concourse_main": {"stewards_available": 20, "lanes": 6, "gates": []},
    "transit_hub": {"stewards_available": 6, "lanes": 2, "gates": []},
}
_DEFAULT_ZONE_CONTEXT = {"stewards_available": 8, "lanes": 2, "gates": []}


def run_assessment(
    zone: str | None = None,
    window_minutes: int = 5,
) -> dict:
    """Run the full CityShield assessment pipeline and return the result.

    Args:
        zone: Optional zone filter (e.g. "gate_a"). None = all zones.
        window_minutes: How far back to read from each stream.

    Returns:
        {
          "incident_id": str,
          "assessment": dict,   # from correlation agent
          "plan": dict,         # from planner agent
          "packet": dict,       # from incident writer agent
          "escalate": bool,
          "zone": str | None,
          "window_minutes": int,
          "pipeline_started_at": str,
          "pipeline_completed_at": str,
        }

    Raises:
        Exception: Propagates any agent or Elasticsearch failure.
    """
    started_at = datetime.now(UTC).isoformat()
    es = get_client()

    # Step 1 — ensure indices exist (idempotent)
    setup_indices(es)

    # Step 2 — read recent windows from all three streams
    logger.info("Reading signal windows: zone=%s window=%dm", zone, window_minutes)
    crowd_window = get_recent_window("crowd-stream", window_minutes, zone, es=es)
    traffic_window = get_recent_window("traffic-stream", window_minutes, zone, es=es)
    sentiment_window = get_recent_window("sentiment-stream", window_minutes, zone, es=es)

    logger.info(
        "Windows: crowd=%d traffic=%d sentiment=%d docs",
        len(crowd_window), len(traffic_window), len(sentiment_window),
    )

    # Step 3 — collect anomaly scores (empty dict if no ML jobs configured yet)
    anomaly_scores: dict[str, float] = {}
    for job_id in _ANOMALY_JOB_IDS:
        results = get_anomaly_results(job_id, window_minutes, es=es)
        if results:
            # Use the highest anomaly_score from recent results for this job
            stream_name = job_id.split("_")[0]  # "crowd", "traffic", "sentiment"
            anomaly_scores[stream_name] = max(
                r.get("anomaly_score", 0) for r in results
            )

    # Step 4 — correlation + risk (Gemini call #1)
    context = {
        "zone": zone or "all",
        "window_minutes": window_minutes,
        "time_to_event_minutes": _minutes_to_kickoff(),
        "baseline_density": 0.3,  # configurable per venue
    }
    logger.info("Running correlation assessment...")
    assessment = correlation.assess(
        crowd_window=crowd_window,
        traffic_window=traffic_window,
        sentiment_window=sentiment_window,
        anomaly_scores=anomaly_scores,
        context=context,
    )

    # Step 5 — response planner (Gemini call #2)
    past_incidents = get_recent_window("cityshield-alerts", minutes=120, zone=zone, es=es)
    zone_ctx = _ZONE_CONTEXT.get(zone or "", _DEFAULT_ZONE_CONTEXT)
    logger.info("Running response planner...")
    plan = planner.plan(
        assessment=assessment,
        past_incidents=past_incidents,
        zone_context={**zone_ctx, "zone": zone or "all"},
    )

    # Step 6 — incident writer (Gemini call #3)
    logger.info("Writing incident packet...")
    packet = incident_writer.write(
        assessment=assessment,
        plan=plan,
        zone=zone or "all",
        timestamp=assessment["timestamp"],
    )

    # Step 7 — write to cityshield-alerts (custom Elastic tool, not MCP)
    incident_id = create_incident(
        packet={**packet, "assessment": assessment, "plan": plan},
        es=es,
    )

    completed_at = datetime.now(UTC).isoformat()
    logger.info(
        "Pipeline complete: incident_id=%s severity=%s escalate=%s",
        incident_id, assessment["severity"], plan["escalate_immediately"],
    )

    return {
        "incident_id": incident_id,
        "assessment": assessment,
        "plan": plan,
        "packet": packet,
        "escalate": plan["escalate_immediately"],
        "zone": zone,
        "window_minutes": window_minutes,
        "pipeline_started_at": started_at,
        "pipeline_completed_at": completed_at,
    }


def _minutes_to_kickoff() -> int:
    """Minutes until next scheduled kickoff (hardcoded for demo; wire to real schedule)."""
    # Demo: treat 19:00 local as kickoff
    now = datetime.now(UTC)
    kickoff_hour = int(os.getenv("KICKOFF_HOUR_UTC", "19"))
    kickoff = now.replace(hour=kickoff_hour, minute=0, second=0, microsecond=0)
    if kickoff < now:
        kickoff = kickoff.replace(day=now.day + 1)
    delta = int((kickoff - now).total_seconds() / 60)
    return max(0, delta)
