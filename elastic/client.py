"""Elasticsearch client and index setup for CityShield."""

import os
import logging
from elasticsearch import Elasticsearch, BadRequestError

logger = logging.getLogger(__name__)

# Index mappings keyed by index name
_INDEX_MAPPINGS: dict[str, dict] = {
    "crowd-stream": {
        "mappings": {
            "properties": {
                "camera_id":       {"type": "keyword"},
                "timestamp":       {"type": "date"},
                "zone":            {"type": "keyword"},
                "density":         {"type": "float"},
                "headcount":       {"type": "integer"},
                "motion_variance": {"type": "float"},
                "source":          {"type": "keyword"},
            }
        }
    },
    "traffic-stream": {
        "mappings": {
            "properties": {
                "road":          {"type": "keyword"},
                "timestamp":     {"type": "date"},
                "vehicle_count": {"type": "integer"},
                "speed_avg":     {"type": "float"},
                "incident":      {"type": "boolean"},
                "normal_range":  {
                    "properties": {
                        "min": {"type": "integer"},
                        "max": {"type": "integer"},
                    }
                },
                "zone":          {"type": "keyword"},
            }
        }
    },
    "sentiment-stream": {
        "mappings": {
            "properties": {
                "geo": {
                    "properties": {
                        "lat": {"type": "float"},
                        "lon": {"type": "float"},
                    }
                },
                "timestamp":       {"type": "date"},
                "sentiment_score": {"type": "float"},
                "keywords":        {"type": "keyword"},
                "source":          {"type": "keyword"},
                "zone":            {"type": "keyword"},
            }
        }
    },
    "cityshield-alerts": {
        "mappings": {
            "properties": {
                "incident_type":    {"type": "keyword"},
                "severity":         {"type": "keyword"},
                "location":         {"type": "keyword"},
                "recommendation":   {"type": "text"},
                "created_at":       {"type": "date"},
                "operator_action":  {"type": "keyword"},
                "headline":         {"type": "text"},
                "summary":          {"type": "text"},
                "evidence":         {"type": "text"},
                "recommended_actions": {"type": "text"},
                "assessment":       {"type": "object", "enabled": False},
                "plan":             {"type": "object", "enabled": False},
            }
        }
    },
    "anomaly-results": {
        "mappings": {
            "properties": {
                "job_id":         {"type": "keyword"},
                "timestamp":      {"type": "date"},
                "anomaly_score":  {"type": "float"},
                "stream":         {"type": "keyword"},
                "zone":           {"type": "keyword"},
                "record_score":   {"type": "float"},
                "bucket_span":    {"type": "integer"},
            }
        }
    },
}


def get_client() -> Elasticsearch:
    """Return an authenticated Elasticsearch client from env vars."""
    url = os.getenv("ELASTIC_URL")
    api_key = os.getenv("ELASTIC_API_KEY")
    if not url or not api_key:
        raise RuntimeError("ELASTIC_URL and ELASTIC_API_KEY must be set in environment")
    return Elasticsearch(url, api_key=api_key)


def setup_indices(es: Elasticsearch | None = None) -> None:
    """Create all CityShield indices if they don't exist. Safe to call on every startup."""
    if es is None:
        es = get_client()

    for index_name, body in _INDEX_MAPPINGS.items():
        try:
            if not es.indices.exists(index=index_name):
                es.indices.create(index=index_name, **body)
                logger.info("Created index: %s", index_name)
            else:
                logger.debug("Index already exists: %s", index_name)
        except BadRequestError as e:
            # resource_already_exists_exception is safe to ignore
            if "resource_already_exists_exception" in str(e):
                logger.debug("Index already exists (race): %s", index_name)
            else:
                logger.error("Failed to create index %s: %s", index_name, e)
                raise
        except Exception as e:
            logger.error("Unexpected error creating index %s: %s", index_name, e)
            raise


if __name__ == "__main__":
    import sys
    from dotenv import load_dotenv

    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    es = get_client()
    for index_name, body in _INDEX_MAPPINGS.items():
        try:
            if not es.indices.exists(index=index_name):
                es.indices.create(index=index_name, **body)
                print(f"✓ Created: {index_name}")
            else:
                print(f"  Exists:  {index_name}")
        except BadRequestError as e:
            if "resource_already_exists_exception" in str(e):
                print(f"  Exists:  {index_name}")
            else:
                print(f"✗ Failed:  {index_name} — {e}", file=sys.stderr)
                sys.exit(1)
