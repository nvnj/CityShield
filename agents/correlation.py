"""Correlation agent: multi-signal Gemini reasoning across crowd, traffic, and sentiment.

Invariant: Gemini reasons; deterministic code computes metrics.
All signal values are pre-computed from Elasticsearch before this call.
Gemini only performs the cross-stream reasoning and produces the severity label.
"""

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path

import google.genai as genai
from google.genai import types
from opentelemetry import trace

from agents._gemini import extract_text, get_client, strip_fences

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("cityshield.agents")

# Load prompt at module import time (ALWAYS rule from ADK_TASK_TEMPLATE)
_PROMPT_PATH = Path(__file__).parent / "prompts" / "correlation_risk.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_REQUIRED_KEYS = {"severity", "confidence", "signals_used", "primary_signal", "rationale", "timestamp"}
_VALID_SEVERITIES = {"informational", "moderate", "severe"}




def _summarise_window(docs: list[dict], stream: str) -> dict:
    """Compute deterministic summary stats from a window of docs.

    Gemini receives these summaries — not raw doc lists — to keep the
    user message concise and ensure Gemini does reasoning, not arithmetic.
    """
    if not docs:
        return {"stream": stream, "doc_count": 0, "note": "no data in window"}

    if stream == "crowd":
        densities = [d.get("density", 0) for d in docs if d.get("density") is not None]
        return {
            "stream": stream,
            "doc_count": len(docs),
            "avg_density": round(sum(densities) / len(densities), 4) if densities else 0,
            "max_density": round(max(densities), 4) if densities else 0,
            "avg_headcount": round(sum(d.get("headcount", 0) for d in docs) / len(docs)),
            "zones": list({d.get("zone") for d in docs if d.get("zone")}),
        }
    elif stream == "traffic":
        counts = [d.get("vehicle_count", 0) for d in docs if d.get("vehicle_count") is not None]
        speeds = [d.get("speed_avg", 0) for d in docs if d.get("speed_avg") is not None]
        incidents = sum(1 for d in docs if d.get("incident"))
        return {
            "stream": stream,
            "doc_count": len(docs),
            "avg_vehicle_count": round(sum(counts) / len(counts)) if counts else 0,
            "min_speed_avg": round(min(speeds), 1) if speeds else 0,
            "incident_count": incidents,
            "roads": list({d.get("road") for d in docs if d.get("road")}),
        }
    elif stream == "sentiment":
        scores = [d.get("sentiment_score", 0) for d in docs if d.get("sentiment_score") is not None]
        all_kw: list[str] = []
        for d in docs:
            all_kw.extend(d.get("keywords", []) or [])
        from collections import Counter
        top_kw = [k for k, _ in Counter(all_kw).most_common(6)]
        return {
            "stream": stream,
            "doc_count": len(docs),
            "avg_sentiment": round(sum(scores) / len(scores), 4) if scores else 0,
            "min_sentiment": round(min(scores), 4) if scores else 0,
            "top_keywords": top_kw,
        }
    return {"stream": stream, "doc_count": len(docs)}


def assess(
    crowd_window: list[dict],
    traffic_window: list[dict],
    sentiment_window: list[dict],
    anomaly_scores: dict,
    context: dict,
) -> dict:
    """Call Gemini to reason about the joint signal picture and return an assessment.

    Args:
        crowd_window: Recent docs from crowd-stream.
        traffic_window: Recent docs from traffic-stream.
        sentiment_window: Recent docs from sentiment-stream.
        anomaly_scores: {stream: float} from Elastic ML results index.
        context: {zone, window_minutes, time_to_event_minutes, baseline_density}.

    Returns:
        Assessment dict matching the contract in DIGITAL_TWIN.md.
    """
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    client = get_client()

    # Deterministic summaries — Gemini does reasoning, not arithmetic
    crowd_summary = _summarise_window(crowd_window, "crowd")
    traffic_summary = _summarise_window(traffic_window, "traffic")
    sentiment_summary = _summarise_window(sentiment_window, "sentiment")

    user_message = json.dumps({
        "crowd_window": crowd_summary,
        "traffic_window": traffic_summary,
        "sentiment_window": sentiment_summary,
        "anomaly_scores": anomaly_scores,
        "context": context,
    }, indent=2)

    with tracer.start_as_current_span("correlation_risk") as span:
        span.set_attribute("model", model)
        span.set_attribute("zone", context.get("zone", "all"))

        try:
            response = client.models.generate_content(
                model=model,
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM_PROMPT,
                    temperature=0.2,
                    max_output_tokens=8192,
                ),
            )
            raw = extract_text(response)
        except Exception as e:
            logger.error("Gemini call failed in correlation_risk: %s", e)
            raise

    try:
        parsed = json.loads(strip_fences(raw))
    except json.JSONDecodeError as e:
        logger.error("JSON parse failed in correlation_risk. raw=%r err=%s", raw[:200], e)
        raise ValueError(f"Gemini returned non-JSON in correlation_risk: {e}") from e

    missing = _REQUIRED_KEYS - parsed.keys()
    if missing:
        raise ValueError(f"correlation_risk response missing keys: {missing}. got={list(parsed.keys())}")

    if parsed["severity"] not in _VALID_SEVERITIES:
        raise ValueError(f"Invalid severity: {parsed['severity']!r}")

    # Ensure timestamp is present and ISO 8601
    if not parsed.get("timestamp"):
        parsed["timestamp"] = datetime.now(UTC).isoformat()

    logger.info(
        "Correlation assessment: severity=%s confidence=%.2f primary=%s",
        parsed["severity"], parsed.get("confidence", 0), parsed.get("primary_signal"),
    )
    return parsed
