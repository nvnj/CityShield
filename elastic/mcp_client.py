"""Elastic MCP connection for the CityShield agent read path.

The base `mcp-server-elasticsearch` npm package exposes ONLY:
  search, esql/query, list_indices, get_mappings

It has NO write capability and NO /ml/anomaly endpoint.
Writes go through elastic/tools.py (direct elasticsearch-py).

This module provides:
  1. build_mcp_toolset() — returns a McpToolset the ADK agent registers as tools
  2. esql_query()        — direct ES|QL helper for the orchestrator (no MCP subprocess)
"""

import logging
import os

from elastic.client import get_client

logger = logging.getLogger(__name__)


def build_mcp_toolset():
    """Build and return a McpToolset connected to mcp-server-elasticsearch.

    Uses StdioConnectionParams to launch the npm package as a subprocess.
    On Windows, the executable must be `npx.cmd` (not bare `npx`).

    The returned toolset is passed into the ADK agent's tools=[] list so that
    Gemini can call search, esql_query, list_indices, and get_mappings directly.

    Returns:
        McpToolset instance configured for this deployment's Elasticsearch cluster.

    Raises:
        RuntimeError: If ELASTIC_URL or ELASTIC_API_KEY are not set.
    """
    from google.adk.tools.mcp_tool.mcp_toolset import McpToolset, StdioConnectionParams
    from mcp import StdioServerParameters

    url = os.environ.get("ELASTIC_URL")
    api_key = os.environ.get("ELASTIC_API_KEY")
    if not url or not api_key:
        raise RuntimeError("ELASTIC_URL and ELASTIC_API_KEY must be set to build MCP toolset")

    # npx.cmd is required on Windows; harmless on Linux/Mac where npx.cmd doesn't exist
    # but npx resolves correctly via PATH. Keep npx.cmd for cross-platform safety.
    npx_cmd = "npx.cmd" if os.name == "nt" else "npx"

    server_params = StdioServerParameters(
        command=npx_cmd,
        args=["-y", "mcp-server-elasticsearch"],
        env={
            "ELASTICSEARCH_URL": url,
            "ELASTICSEARCH_API_KEY": api_key,
        },
    )

    toolset = McpToolset(
        connection_params=StdioConnectionParams(
            server_params=server_params,
            timeout=30.0,
        ),
        # Restrict to the read-only tools the base server exposes.
        # This makes the agent's available surface explicit and prevents
        # accidental writes if a future MCP server version adds write tools.
        tool_filter=["search", "esql_query", "list_indices", "get_mappings"],
    )

    logger.info("MCP toolset built: target=%s", url)
    return toolset


def esql_query(query: str, max_rows: int = 200) -> list[dict]:
    """Run an ES|QL query directly via elasticsearch-py (no MCP subprocess).

    Used by the Orchestrator to build window context outside the agent loop.
    Faster than spinning up a subprocess for each read.

    Args:
        query: Full ES|QL query string.
        max_rows: Hard cap on returned rows (applied via LIMIT in query if absent).

    Returns:
        List of row dicts with column names as keys.
        Empty list on error or no results.
    """
    es = get_client()

    # Inject LIMIT if the caller didn't include one, to prevent runaway reads
    normalised = query.strip().upper()
    if "LIMIT" not in normalised:
        query = query.rstrip() + f"\n| LIMIT {max_rows}"

    try:
        resp = es.esql.query(query=query, format="json")
        columns = [c["name"] for c in resp.get("columns", [])]
        rows = resp.get("values", [])
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        logger.error("ES|QL query failed: %s | query: %s", e, query[:120])
        return []
