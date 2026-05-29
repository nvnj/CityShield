"""Incident writer agent: composes the plain-language operator packet via Gemini.

CRITICAL INVARIANT: severity is COPIED from the assessment — never recomputed here.
The incident writer explains what is happening and what to do. It does not re-derive
any signal values or severity labels.
"""

import json
import logging
import os
from pathlib import Path

import google.genai as genai
from google.genai import types
from opentelemetry import trace

from agents._gemini import extract_text, get_client, strip_fences

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("cityshield.agents")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "incident_writer.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_REQUIRED_KEYS = {"headline", "severity", "location", "summary", "evidence", "recommended_actions"}




def write(
    assessment: dict,
    plan: dict,
    zone: str,
    timestamp: str,
) -> dict:
    """Call Gemini to write the operator-facing incident packet.

    Args:
        assessment: Output of agents/correlation.py assess().
        plan: Output of agents/planner.py plan().
        zone: Zone label (e.g. "gate_a").
        timestamp: ISO 8601 assessment timestamp.

    Returns:
        Incident packet dict matching the contract in DIGITAL_TWIN.md.
        severity is guaranteed to be copied from assessment, not recomputed.
    """
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    client = get_client()

    user_message = json.dumps({
        "assessment": assessment,
        "plan": plan,
        "zone": zone,
        "timestamp": timestamp,
    }, indent=2)

    with tracer.start_as_current_span("incident_writer") as span:
        span.set_attribute("model", model)
        span.set_attribute("zone", zone)
        span.set_attribute("severity", assessment.get("severity", "unknown"))

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
            logger.error("Gemini call failed in incident_writer: %s", e)
            raise

    try:
        parsed = json.loads(strip_fences(raw))
    except json.JSONDecodeError as e:
        logger.error("JSON parse failed in incident_writer. raw=%r err=%s", raw[:200], e)
        raise ValueError(f"Gemini returned non-JSON in incident_writer: {e}") from e

    missing = _REQUIRED_KEYS - parsed.keys()
    if missing:
        raise ValueError(f"incident_writer response missing keys: {missing}")

    # INVARIANT: severity must be copied from assessment, never recomputed.
    # Enforce this unconditionally — Gemini may drift on rare calls.
    parsed["severity"] = assessment["severity"]

    logger.info(
        "Incident packet written: headline=%r severity=%s location=%s",
        parsed.get("headline", "")[:60],
        parsed["severity"],
        parsed.get("location"),
    )
    return parsed
