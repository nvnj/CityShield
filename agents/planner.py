"""Response planner agent: sequences a graded operator response via Gemini.

Receives the correlation assessment and past incidents, returns an ordered
action plan. Does NOT recompute severity — that is locked in the assessment.
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

_PROMPT_PATH = Path(__file__).parent / "prompts" / "response_planner.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_REQUIRED_KEYS = {"actions", "reassess_in_minutes", "escalate_immediately"}




def _summarise_past_incidents(incidents: list[dict]) -> list[dict]:
    """Trim past incidents to the fields the planner needs, keeping payload small."""
    out = []
    for inc in incidents[:5]:  # cap at 5 comparable incidents
        out.append({
            "severity":      inc.get("severity"),
            "location":      inc.get("location"),
            "headline":      inc.get("headline"),
            "operator_action": inc.get("operator_action"),
            "recommended_actions": inc.get("recommended_actions", [])[:3],
        })
    return out


def plan(
    assessment: dict,
    past_incidents: list[dict],
    zone_context: dict,
) -> dict:
    """Call Gemini to produce a sequenced, graded response plan.

    Args:
        assessment: Output of agents/correlation.py assess().
        past_incidents: Recent incidents from cityshield-alerts (for context).
        zone_context: Available resources {zone, stewards_available, gates, lanes}.

    Returns:
        Plan dict matching the contract in DIGITAL_TWIN.md.
    """
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    client = get_client()

    user_message = json.dumps({
        "assessment": assessment,
        "past_incidents": _summarise_past_incidents(past_incidents),
        "zone_context": zone_context,
    }, indent=2)

    with tracer.start_as_current_span("response_planner") as span:
        span.set_attribute("model", model)
        span.set_attribute("severity", assessment.get("severity", "unknown"))

        try:
            response = client.models.generate_content(
                model=model,
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM_PROMPT,
                    temperature=0.3,
                    max_output_tokens=8192,
                ),
            )
            raw = extract_text(response)
        except Exception as e:
            logger.error("Gemini call failed in response_planner: %s", e)
            raise

    try:
        parsed = json.loads(strip_fences(raw))
    except json.JSONDecodeError as e:
        logger.error("JSON parse failed in response_planner. raw=%r err=%s", raw[:200], e)
        raise ValueError(f"Gemini returned non-JSON in response_planner: {e}") from e

    missing = _REQUIRED_KEYS - parsed.keys()
    if missing:
        raise ValueError(f"response_planner response missing keys: {missing}")

    if not isinstance(parsed.get("actions"), list):
        raise ValueError("response_planner: 'actions' must be a list")

    # Ensure escalation_reason exists (null if not escalating)
    parsed.setdefault("escalation_reason", None)

    logger.info(
        "Response plan: %d actions escalate=%s reassess_in=%sm",
        len(parsed["actions"]),
        parsed["escalate_immediately"],
        parsed["reassess_in_minutes"],
    )
    return parsed
