"""Custom Elastic write tools and window-query helpers for the CityShield agent.

WRITE path: direct elasticsearch-py (NOT MCP — MCP is read-only).
READ path helpers: wraps ES|QL/search queries reused across agents.

Tool signatures here are called by agents/orchestrator.py.
Do NOT rename without updating the orchestrator.
"""

import logging
import uuid
from datetime import UTC, datetime

from elasticsearch import Elasticsearch

from elastic.client import get_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Read helpers (called by Orchestrator to build agent context)
# ---------------------------------------------------------------------------

def get_recent_window(
    index: str,
    minutes: int,
    zone: str | None = None,
    es: Elasticsearch | None = None,
    max_docs: int = 200,
) -> list[dict]:
    """Return up to max_docs recent documents from an index within the last N minutes.

    Uses ES|QL for clean time-window queries — preferred over query DSL for stream reads.
    Falls back to query DSL if ES|QL returns no columns (empty index).

    Args:
        index: Elasticsearch index name (e.g. "crowd-stream").
        minutes: How far back to look.
        zone: Optional zone filter. None = all zones.
        es: Optional pre-built client; created from env if None.
        max_docs: Maximum documents to return.

    Returns:
        List of document dicts, newest first.
    """
    if es is None:
        es = get_client()

    zone_clause = f' AND zone == "{zone}"' if zone else ""
    esql = (
        f'FROM {index} '
        f'| WHERE timestamp > NOW() - {minutes} minutes{zone_clause} '
        f'| SORT timestamp DESC '
        f'| LIMIT {max_docs}'
    )

    try:
        resp = es.esql.query(query=esql, format="json")
        columns = [c["name"] for c in resp.get("columns", [])]
        rows = resp.get("values", [])
        if columns and rows:
            return [dict(zip(columns, row)) for row in rows]
        # ES|QL returns empty columns when index has no data — fall through
        logger.debug("ES|QL returned empty for %s, falling back to search", index)
    except Exception as e:
        logger.warning("ES|QL query failed for %s (%s), falling back to search", index, e)

    # Fallback: query DSL
    try:
        query: dict = {"range": {"timestamp": {"gte": f"now-{minutes}m"}}}
        if zone:
            query = {"bool": {"filter": [query, {"term": {"zone": zone}}]}}
        result = es.search(
            index=index,
            query=query,
            sort=[{"timestamp": "desc"}],
            size=max_docs,
        )
        return [h["_source"] for h in result["hits"]["hits"]]
    except Exception as e:
        logger.error("Search fallback also failed for %s: %s", index, e)
        return []


def get_anomaly_results(
    job_id: str,
    window_minutes: int = 5,
    es: Elasticsearch | None = None,
) -> list[dict]:
    """Query Elastic ML anomaly results for a given job within the last N minutes.

    ML jobs write results to .ml-anomalies-* — we query that index, never call
    a /ml/anomaly MCP endpoint (which does not exist).

    Args:
        job_id: Elastic ML job ID (e.g. "crowd_density_anomaly").
        window_minutes: How far back to look.
        es: Optional pre-built client.

    Returns:
        List of anomaly result dicts, sorted by anomaly_score descending.
        Empty list if the job has no recent results (normal before ML jobs are set up).
    """
    if es is None:
        es = get_client()

    try:
        result = es.search(
            index=".ml-anomalies-*",
            query={
                "bool": {
                    "filter": [
                        {"term": {"job_id": job_id}},
                        {"range": {"timestamp": {"gte": f"now-{window_minutes}m"}}},
                    ]
                }
            },
            sort=[{"anomaly_score": "desc"}],
            size=50,
        )
        return [h["_source"] for h in result["hits"]["hits"]]
    except Exception as e:
        # .ml-anomalies-* may not exist before any ML job has run — treat as empty
        logger.debug("Anomaly query returned nothing for job %s: %s", job_id, e)
        return []


# ---------------------------------------------------------------------------
# Write tools (custom Elastic tools — NOT MCP)
# ---------------------------------------------------------------------------

def create_incident(
    packet: dict,
    incident_id: str | None = None,
    es: Elasticsearch | None = None,
) -> str:
    """Write an incident packet to cityshield-alerts and return the incident ID.

    This is a custom Elastic write tool. MCP does not support writes.
    The Orchestrator calls this after the Incident writer agent produces the packet.

    Args:
        packet: Incident packet from agents/incident_writer.py.
        incident_id: Optional caller-supplied UUID. Generated here if None.
        es: Optional pre-built client.

    Returns:
        incident_id string (UUID).

    Raises:
        RuntimeError: If the Elasticsearch index call fails.
    """
    if es is None:
        es = get_client()

    if incident_id is None:
        incident_id = str(uuid.uuid4())

    doc = {
        "incident_id":   incident_id,
        "incident_type": "crowd_surge",
        "severity":      packet.get("severity", "unknown"),
        "location":      packet.get("location", ""),
        "headline":      packet.get("headline", ""),
        "summary":       packet.get("summary", ""),
        "evidence":      packet.get("evidence", []),
        "recommended_actions": packet.get("recommended_actions", []),
        "recommendation": "; ".join(packet.get("recommended_actions", [])),
        "created_at":    datetime.now(UTC).isoformat(),
        "operator_action": "pending",
        # Store full nested objects for console display
        "assessment":    packet.get("assessment"),
        "plan":          packet.get("plan"),
    }

    try:
        es.index(index="cityshield-alerts", id=incident_id, document=doc)
        logger.info("Incident written: id=%s severity=%s", incident_id, doc["severity"])
        return incident_id
    except Exception as e:
        logger.error("Failed to write incident %s: %s", incident_id, e)
        raise RuntimeError(f"create_incident failed: {e}") from e


def record_operator_action(
    incident_id: str,
    action: str,
    note: str = "",
    es: Elasticsearch | None = None,
) -> None:
    """Update an existing incident with the operator's decision.

    Called by POST /approve after human review. Does NOT trigger notify —
    that is a separate step gated on this call succeeding (invariant #3).

    Args:
        incident_id: UUID of the incident to update.
        action: One of "approve", "dismiss", "edit".
        note: Optional operator note.
        es: Optional pre-built client.
    """
    if es is None:
        es = get_client()

    try:
        es.update(
            index="cityshield-alerts",
            id=incident_id,
            doc={
                "operator_action":    action,
                "operator_note":      note,
                "operator_action_at": datetime.now(UTC).isoformat(),
            },
        )
        logger.info("Operator action recorded: id=%s action=%s", incident_id, action)
    except Exception as e:
        logger.error("Failed to record operator action for %s: %s", incident_id, e)
        raise RuntimeError(f"record_operator_action failed: {e}") from e
