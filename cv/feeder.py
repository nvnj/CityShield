"""CV feeder: samples video frames, estimates crowd density, writes to crowd-stream.

CLI usage:
    uv run python -m cv.feeder --video-path crowd.mp4 --zone gate_a
    uv run python -m cv.feeder --source webcam --zone concourse_main --interval 5
    uv run python -m cv.feeder --replay [--timeline PATH]
"""

import argparse
import asyncio
import json
import logging
import time
from datetime import UTC, datetime
from pathlib import Path

import cv2
from dotenv import load_dotenv

from cv.estimator import DensityReading, estimate_density, open_source
from elastic.client import get_client, setup_indices

load_dotenv()

logger = logging.getLogger(__name__)


def _reading_to_doc(reading: DensityReading) -> dict:
    """Convert a DensityReading to the crowd-stream Elasticsearch document shape."""
    return {
        "camera_id":       reading.camera_id,
        "timestamp":       datetime.now(UTC).isoformat(),
        "zone":            reading.zone,
        "density":         reading.density,
        "headcount":       reading.headcount,
        "motion_variance": reading.motion_variance,
        "source":          reading.source,
    }


def run_feeder(
    source: str,
    video_path: str | None,
    zone: str,
    interval_seconds: int = 10,
    zone_capacity: int = 400,
    camera_id: str = "cam-01",
    max_readings: int = 0,
) -> None:
    """Main feeder loop: read frames → estimate density → write to crowd-stream.

    Args:
        source: "file" or "webcam".
        video_path: Path to video file (source=="file").
        zone: Zone label for Elasticsearch docs.
        interval_seconds: Seconds between density readings.
        zone_capacity: Max headcount for density→headcount conversion.
        camera_id: Camera identifier written to Elasticsearch.
        max_readings: Stop after this many readings (0 = run until video ends / Ctrl-C).
    """
    es = get_client()
    setup_indices(es)

    cap = open_source(source, video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    # Frames to skip between readings (at least 1 frame for the flow pair)
    skip_frames = max(1, int(fps * interval_seconds))

    logger.info(
        "CV feeder started: source=%s zone=%s interval=%ds fps=%.1f",
        source, zone, interval_seconds, fps,
    )

    readings_done = 0
    prev_gray: cv2.typing.MatLike | None = None
    frame_count = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                if source == "file":
                    # Loop the video for continuous demo operation
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    prev_gray = None
                    frame_count = 0
                    logger.info("Video looped")
                    continue
                else:
                    logger.warning("Webcam read failed, stopping")
                    break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frame_count += 1

            # Need two frames to compute flow
            if prev_gray is None:
                prev_gray = gray
                continue

            # Only compute a reading every `skip_frames` frames
            if frame_count % skip_frames != 0:
                prev_gray = gray
                continue

            try:
                reading = estimate_density(
                    prev_gray=prev_gray,
                    curr_gray=gray,
                    zone=zone,
                    zone_capacity=zone_capacity,
                    camera_id=camera_id,
                )
                doc = _reading_to_doc(reading)
                es.index(index="crowd-stream", document=doc)
                readings_done += 1
                print(
                    f"[ok] zone={reading.zone} "
                    f"density={reading.density:.3f} "
                    f"headcount={reading.headcount} "
                    f"variance={reading.motion_variance:.5f}",
                    flush=True,
                )
            except Exception as e:
                logger.error("Failed to estimate or index reading: %s", e)

            prev_gray = gray

            if max_readings > 0 and readings_done >= max_readings:
                logger.info("Reached max_readings=%d, stopping", max_readings)
                break

            # For webcam, honour the wall-clock interval
            if source == "webcam":
                time.sleep(interval_seconds)

    except KeyboardInterrupt:
        logger.info("Feeder interrupted by user")
    finally:
        cap.release()
        logger.info("CV feeder finished: %d readings written to crowd-stream", readings_done)


_DEFAULT_TIMELINE = Path(__file__).parent.parent / "elastic" / "surge_timeline.json"


def run_replay_feeder(timeline_path: Path = _DEFAULT_TIMELINE) -> None:
    """Replay crowd-stream events from a pre-recorded surge timeline.

    Writes synthetic crowd docs with the exact density/headcount values from the
    timeline — no CV inference, no video required. Replays only events with
    stream == "crowd". Timing follows t_offset_seconds from the timeline start.
    """
    es = get_client()
    setup_indices(es)

    with timeline_path.open() as f:
        timeline = json.load(f)

    zone = timeline["zone"]
    events = [e for e in timeline["events"] if e["stream"] == "crowd"]
    events.sort(key=lambda e: e["t_offset_seconds"])

    logger.info("CV replay started: %d crowd events, zone=%s", len(events), zone)

    start = time.monotonic()

    for event in events:
        target_t = event["t_offset_seconds"]
        elapsed = time.monotonic() - start
        wait = target_t - elapsed
        if wait > 0:
            time.sleep(wait)

        doc = {
            "camera_id": event.get("camera_id", "cam-01"),
            "timestamp": datetime.now(UTC).isoformat(),
            "zone": zone,
            "density": event["density"],
            "headcount": event["headcount"],
            "motion_variance": event["motion_variance"],
            "source": "replay",
        }

        try:
            es.index(index="crowd-stream", document=doc)
            print(
                f"[replay t+{target_t}s] zone={zone} "
                f"density={event['density']:.3f} "
                f"headcount={event['headcount']} "
                f"label={event.get('label', '')}",
                flush=True,
            )
        except Exception as e:
            logger.error("Replay crowd index failed at t+%ds: %s", target_t, e)

    logger.info("CV replay complete")


_VIDEO_PATH = Path(__file__).parent / "crowd.mp4"


async def run_cv_feeder_async(
    zone: str = "gate_a",
    zone_capacity: int = 400,
    camera_id: str = "cam-01",
    write_interval_seconds: int = 10,
    frames_per_sample: int = 10,
) -> None:
    """Async CV feeder for background use from the FastAPI lifespan.

    Loops crowd.mp4 indefinitely, processes every Nth frame with the optical-flow
    estimator, and writes density readings to crowd-stream every
    write_interval_seconds. Blocking CV and ES calls run in a thread-pool executor
    so the asyncio event loop is never held.

    Silently skips if the video file does not exist — the API still starts cleanly.
    """
    if not _VIDEO_PATH.exists():
        logger.warning(
            "CV feeder: video not found at %s — skipping crowd-stream writes", _VIDEO_PATH
        )
        return

    from elastic.client import get_client, setup_indices
    from cv.estimator import estimate_density

    loop = asyncio.get_running_loop()

    es = await loop.run_in_executor(None, get_client)
    await loop.run_in_executor(None, setup_indices, es)

    import cv2  # guarded import — not available in all envs

    def _open_cap() -> cv2.VideoCapture:
        cap = cv2.VideoCapture(str(_VIDEO_PATH))
        if not cap.isOpened():
            raise RuntimeError(f"Could not open {_VIDEO_PATH}")
        return cap

    cap: cv2.VideoCapture = await loop.run_in_executor(None, _open_cap)
    readings_done = 0
    frame_count = 0
    prev_gray = None

    logger.info("CV feeder started: video=%s zone=%s interval=%ds", _VIDEO_PATH.name, zone, write_interval_seconds)

    try:
        while True:
            def _read_frame():
                return cap.read()

            ret, frame = await loop.run_in_executor(None, _read_frame)

            if not ret:
                # End of file — loop back to start
                await loop.run_in_executor(None, lambda: cap.set(cv2.CAP_PROP_POS_FRAMES, 0))
                prev_gray = None
                frame_count = 0
                logger.debug("CV feeder: video looped")
                continue

            frame_count += 1

            # Convert to grayscale in executor
            gray = await loop.run_in_executor(
                None, lambda f=frame: cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
            )

            # Need a previous frame to compute optical flow
            if prev_gray is None:
                prev_gray = gray
                continue

            # Only run the estimator on every Nth frame
            if frame_count % frames_per_sample != 0:
                prev_gray = gray
                continue

            try:
                pg, cg = prev_gray, gray
                reading = await loop.run_in_executor(
                    None,
                    lambda: estimate_density(
                        prev_gray=pg,
                        curr_gray=cg,
                        zone=zone,
                        zone_capacity=zone_capacity,
                        camera_id=camera_id,
                    ),
                )
                doc = _reading_to_doc(reading)
                await loop.run_in_executor(
                    None, lambda d=doc: es.index(index="crowd-stream", document=d)
                )
                readings_done += 1
                logger.debug(
                    "CV feeder: zone=%s density=%.3f headcount=%d",
                    reading.zone, reading.density, reading.headcount,
                )
                if readings_done % 10 == 0:
                    logger.info("CV feeder: %d readings written to crowd-stream", readings_done)
            except Exception as e:
                logger.error("CV feeder estimate/index failed: %s", e)

            prev_gray = gray

            # Yield to the event loop; pace writes to once per interval
            await asyncio.sleep(write_interval_seconds)

    except asyncio.CancelledError:
        logger.info("CV feeder cancelled after %d readings", readings_done)
        raise
    finally:
        await loop.run_in_executor(None, cap.release)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CityShield CV crowd density feeder")
    parser.add_argument("--source", choices=["file", "webcam"], default="file")
    parser.add_argument("--video-path", default=None, help="Path to video file")
    parser.add_argument("--zone", default="gate_a", help="Zone name for ES docs")
    parser.add_argument("--interval", type=int, default=10, help="Seconds between readings")
    parser.add_argument("--zone-capacity", type=int, default=400, help="Max headcount for zone")
    parser.add_argument("--camera-id", default="cam-01", help="Camera identifier")
    parser.add_argument("--max-readings", type=int, default=0, help="Stop after N readings (0=unlimited)")
    parser.add_argument("--replay", action="store_true", help="Replay crowd events from surge_timeline.json")
    parser.add_argument("--timeline", default=None, help="Path to replay timeline JSON")
    return parser.parse_args()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    args = _parse_args()

    if args.replay:
        timeline_path = Path(args.timeline) if args.timeline else _DEFAULT_TIMELINE
        run_replay_feeder(timeline_path)
    else:
        run_feeder(
            source=args.source,
            video_path=args.video_path,
            zone=args.zone,
            interval_seconds=args.interval,
            zone_capacity=args.zone_capacity,
            camera_id=args.camera_id,
            max_readings=args.max_readings,
        )
