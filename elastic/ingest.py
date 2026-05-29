"""Synthetic traffic and sentiment feeders for CityShield.

CLI usage:
    uv run python -m elastic.ingest --mode traffic|sentiment|both [--duration-minutes N]
    uv run python -m elastic.ingest --mode both --replay [--timeline PATH]
"""

import argparse
import json
import logging
import random
import time
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

from elastic.client import get_client, setup_indices

load_dotenv()

logger = logging.getLogger(__name__)

# Roads monitored around the venue
_ROADS = ["Olympic_Blvd_N", "Gate_C_Approach", "Stadium_Way", "Transit_Hub_Rd", "Park_Ave_S"]
_ZONES = ["gate_a", "gate_b", "gate_c", "concourse_main", "transit_hub"]

# Geo bounding box around a stadium (synthetic lat/lon)
_GEO_CENTERS = {
    "gate_a":        {"lat": 34.0141, "lon": -118.2879},
    "gate_b":        {"lat": 34.0138, "lon": -118.2871},
    "gate_c":        {"lat": 34.0135, "lon": -118.2865},
    "concourse_main": {"lat": 34.0140, "lon": -118.2874},
    "transit_hub":   {"lat": 34.0145, "lon": -118.2890},
}

_POSITIVE_KEYWORDS = ["excited", "crowd", "kickoff", "soccer", "worldcup", "amazing", "gooo"]
_NEUTRAL_KEYWORDS  = ["parking", "gate", "line", "waiting", "arriving", "stadium"]
_NEGATIVE_KEYWORDS = ["crush", "stuck", "blocked", "help", "panic", "crowded", "unsafe", "emergency"]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _spike_traffic(road: str, zone: str) -> dict:
    """Generate a traffic surge doc — vehicle count well above normal, incident flag."""
    normal_min, normal_max = 20, 60
    return {
        "road": road,
        "timestamp": _now_iso(),
        "vehicle_count": random.randint(85, 140),
        "speed_avg": round(random.uniform(2.0, 8.0), 1),
        "incident": random.random() < 0.4,
        "normal_range": {"min": normal_min, "max": normal_max},
        "zone": zone,
    }


def _baseline_traffic(road: str, zone: str) -> dict:
    """Generate a normal baseline traffic doc."""
    normal_min, normal_max = 20, 60
    return {
        "road": road,
        "timestamp": _now_iso(),
        "vehicle_count": random.randint(normal_min, normal_max),
        "speed_avg": round(random.uniform(18.0, 45.0), 1),
        "incident": False,
        "normal_range": {"min": normal_min, "max": normal_max},
        "zone": zone,
    }


def _spike_sentiment(zone: str) -> dict:
    """Generate a negative sentiment spike doc."""
    keywords = random.sample(_NEGATIVE_KEYWORDS, k=random.randint(2, 4))
    center = _GEO_CENTERS[zone]
    return {
        "geo": {
            "lat": center["lat"] + random.uniform(-0.001, 0.001),
            "lon": center["lon"] + random.uniform(-0.001, 0.001),
        },
        "timestamp": _now_iso(),
        "sentiment_score": round(random.uniform(-0.9, -0.4), 3),
        "keywords": keywords,
        "source": "synthetic-replay",
        "zone": zone,
    }


def _baseline_sentiment(zone: str) -> dict:
    """Generate a positive/neutral baseline sentiment doc."""
    pool = _POSITIVE_KEYWORDS if random.random() < 0.6 else _NEUTRAL_KEYWORDS
    keywords = random.sample(pool, k=random.randint(1, 3))
    center = _GEO_CENTERS[zone]
    return {
        "geo": {
            "lat": center["lat"] + random.uniform(-0.002, 0.002),
            "lon": center["lon"] + random.uniform(-0.002, 0.002),
        },
        "timestamp": _now_iso(),
        "sentiment_score": round(random.uniform(0.1, 0.8), 3),
        "keywords": keywords,
        "source": "synthetic-baseline",
        "zone": zone,
    }


def run_traffic_feeder(duration_minutes: float = 0) -> None:
    """Emit synthetic traffic docs to traffic-stream every 5 seconds.

    Spikes occur ~15% of the time on a random road.
    Runs indefinitely when duration_minutes == 0.
    """
    es = get_client()
    setup_indices(es)

    deadline = time.monotonic() + duration_minutes * 60 if duration_minutes > 0 else float("inf")
    tick = 0

    logger.info("Traffic feeder started (duration=%sm, infinite=%s)", duration_minutes, duration_minutes == 0)

    while time.monotonic() < deadline:
        road = random.choice(_ROADS)
        zone = random.choice(_ZONES)
        is_spike = random.random() < 0.15

        doc = _spike_traffic(road, zone) if is_spike else _baseline_traffic(road, zone)

        try:
            es.index(index="traffic-stream", document=doc)
            tick += 1
            if tick % 10 == 0:
                logger.info("Traffic feeder: %d docs indexed", tick)
            else:
                logger.debug("Indexed traffic doc: road=%s spike=%s", road, is_spike)
        except Exception as e:
            logger.error("Failed to index traffic doc: %s", e)

        time.sleep(5)

    logger.info("Traffic feeder finished: %d total docs", tick)


def run_sentiment_feeder(duration_minutes: float = 0) -> None:
    """Emit synthetic sentiment docs to sentiment-stream every 5 seconds.

    Negative spikes occur ~10% of the time.
    Runs indefinitely when duration_minutes == 0.
    """
    es = get_client()
    setup_indices(es)

    deadline = time.monotonic() + duration_minutes * 60 if duration_minutes > 0 else float("inf")
    tick = 0

    logger.info("Sentiment feeder started (duration=%sm, infinite=%s)", duration_minutes, duration_minutes == 0)

    while time.monotonic() < deadline:
        zone = random.choice(_ZONES)
        is_spike = random.random() < 0.10

        doc = _spike_sentiment(zone) if is_spike else _baseline_sentiment(zone)

        try:
            es.index(index="sentiment-stream", document=doc)
            tick += 1
            if tick % 10 == 0:
                logger.info("Sentiment feeder: %d docs indexed", tick)
            else:
                logger.debug("Indexed sentiment doc: zone=%s spike=%s", zone, is_spike)
        except Exception as e:
            logger.error("Failed to index sentiment doc: %s", e)

        time.sleep(5)

    logger.info("Sentiment feeder finished: %d total docs", tick)


def run_surge(zone: str = "gate_a", duration_minutes: float = 2) -> None:
    """Spike both traffic and sentiment simultaneously to trigger a severe assessment."""
    es = get_client()
    setup_indices(es)

    deadline = time.monotonic() + duration_minutes * 60
    road = "Gate_C_Approach"
    tick = 0

    logger.info("SURGE MODE: zone=%s duration=%sm", zone, duration_minutes)

    while time.monotonic() < deadline:
        try:
            es.index(index="traffic-stream", document=_spike_traffic(road, zone))
            es.index(index="sentiment-stream", document=_spike_sentiment(zone))
            tick += 1
            logger.info("Surge tick %d: traffic+sentiment spiked at %s", tick, zone)
        except Exception as e:
            logger.error("Surge index failed: %s", e)
        time.sleep(5)

    logger.info("Surge complete: %d ticks", tick)


_DEFAULT_TIMELINE = Path(__file__).parent / "surge_timeline.json"


def run_replay(timeline_path: Path = _DEFAULT_TIMELINE) -> None:
    """Replay a pre-recorded surge timeline into traffic-stream and sentiment-stream.

    Reads the JSON timeline, waits between events according to t_offset_seconds,
    and writes only traffic/sentiment docs (crowd docs are handled by cv/feeder.py --replay).
    This makes the demo fully reproducible — identical signal pattern every run.
    """
    es = get_client()
    setup_indices(es)

    with timeline_path.open() as f:
        timeline = json.load(f)

    zone = timeline["zone"]
    events = sorted(timeline["events"], key=lambda e: e["t_offset_seconds"])

    logger.info("Replay started: %d events, zone=%s, file=%s", len(events), zone, timeline_path)

    start = time.monotonic()

    for event in events:
        target_t = event["t_offset_seconds"]
        stream = event["stream"]

        # Skip crowd events — those are replayed by cv/feeder.py
        if stream == "crowd":
            continue

        # Sleep until the event's scheduled offset
        elapsed = time.monotonic() - start
        wait = target_t - elapsed
        if wait > 0:
            time.sleep(wait)

        ts = datetime.now(UTC).isoformat()
        geo_center = _GEO_CENTERS.get(zone, {"lat": 34.014, "lon": -118.288})

        try:
            if stream == "traffic":
                doc = {
                    "road": event["road"],
                    "timestamp": ts,
                    "vehicle_count": event["vehicle_count"],
                    "speed_avg": event["speed_avg"],
                    "incident": event["incident"],
                    "normal_range": {"min": 20, "max": 60},
                    "zone": zone,
                }
                es.index(index="traffic-stream", document=doc)
                logger.info(
                    "[replay t+%ds] traffic: vehicles=%d speed=%.1f incident=%s label=%s",
                    target_t, event["vehicle_count"], event["speed_avg"],
                    event["incident"], event.get("label", ""),
                )

            elif stream == "sentiment":
                doc = {
                    "geo": {
                        "lat": geo_center["lat"] + random.uniform(-0.001, 0.001),
                        "lon": geo_center["lon"] + random.uniform(-0.001, 0.001),
                    },
                    "timestamp": ts,
                    "sentiment_score": event["sentiment_score"],
                    "keywords": event["keywords"],
                    "source": "replay",
                    "zone": zone,
                }
                es.index(index="sentiment-stream", document=doc)
                logger.info(
                    "[replay t+%ds] sentiment: score=%.2f keywords=%s label=%s",
                    target_t, event["sentiment_score"],
                    event["keywords"], event.get("label", ""),
                )

        except Exception as e:
            logger.error("Replay index failed at t+%ds stream=%s: %s", target_t, stream, e)

    logger.info("Replay complete")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CityShield synthetic data feeders")
    parser.add_argument(
        "--mode",
        choices=["traffic", "sentiment", "both", "surge", "replay"],
        default="both",
        help="Which feeder(s) to run",
    )
    parser.add_argument(
        "--duration-minutes",
        type=float,
        default=0,
        help="How long to run (0 = run forever)",
    )
    parser.add_argument(
        "--zone",
        default="gate_a",
        help="Zone for surge mode",
    )
    parser.add_argument(
        "--replay",
        action="store_true",
        help="Run both feeders in replay mode from surge_timeline.json",
    )
    parser.add_argument(
        "--timeline",
        default=None,
        help="Path to replay timeline JSON (default: elastic/surge_timeline.json)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    import threading

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    args = _parse_args()

    if args.replay or args.mode == "replay":
        timeline_path = Path(args.timeline) if args.timeline else _DEFAULT_TIMELINE
        run_replay(timeline_path)

    elif args.mode == "surge":
        run_surge(zone=args.zone, duration_minutes=args.duration_minutes or 2)

    elif args.mode == "traffic":
        run_traffic_feeder(duration_minutes=args.duration_minutes)

    elif args.mode == "sentiment":
        run_sentiment_feeder(duration_minutes=args.duration_minutes)

    elif args.mode == "both":
        t_traffic = threading.Thread(
            target=run_traffic_feeder,
            kwargs={"duration_minutes": args.duration_minutes},
            daemon=True,
        )
        t_sentiment = threading.Thread(
            target=run_sentiment_feeder,
            kwargs={"duration_minutes": args.duration_minutes},
            daemon=True,
        )
        t_traffic.start()
        t_sentiment.start()
        t_traffic.join()
        t_sentiment.join()
