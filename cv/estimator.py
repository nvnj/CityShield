"""Crowd density estimator using optical flow motion magnitude.

Produces aggregate density only — no individual identification or tracking.
Output fields match the crowd-stream Elasticsearch mapping exactly:
  {zone, density, headcount, motion_variance, source, camera_id}
"""

from dataclasses import dataclass

import cv2
import numpy as np

# Farneback optical flow parameters — tuned for crowd footage
_FLOW_PARAMS: dict = dict(
    pyr_scale=0.5,
    levels=3,
    winsize=15,
    iterations=3,
    poly_n=5,
    poly_sigma=1.2,
    flags=0,
)

# Magnitude cap: pixels moving faster than this (px/frame) are treated as noise
_MAG_CAP = 20.0


@dataclass
class DensityReading:
    zone: str
    density: float          # 0.0–1.0 normalised motion magnitude
    headcount: int          # density * zone_capacity
    motion_variance: float  # spatial variance of the flow magnitude map
    source: str             # always "cv-optical-flow"
    camera_id: str


def estimate_density(
    prev_gray: np.ndarray,
    curr_gray: np.ndarray,
    zone: str,
    zone_capacity: int = 400,
    camera_id: str = "cam-01",
) -> DensityReading:
    """Compute crowd density from two consecutive grayscale frames.

    Uses dense optical flow (Farneback). Returns aggregate motion statistics
    only — no per-person tracking or identification of any kind.

    Args:
        prev_gray: Previous frame (grayscale uint8, same shape as curr_gray).
        curr_gray: Current frame (grayscale uint8).
        zone: Zone label written to Elasticsearch (e.g. "gate_a").
        zone_capacity: Maximum expected headcount for this zone.
        camera_id: Camera identifier written to Elasticsearch.

    Returns:
        DensityReading with all fields populated.
    """
    flow = cv2.calcOpticalFlowFarneback(prev_gray, curr_gray, None, **_FLOW_PARAMS)

    # Per-pixel motion magnitude
    mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])

    # Cap outliers (camera shake, compression artifacts)
    mag = np.clip(mag, 0.0, _MAG_CAP)

    # Normalised density: mean magnitude / cap → 0–1
    density = float(np.mean(mag) / _MAG_CAP)
    density = min(max(density, 0.0), 1.0)

    # Spatial variance of the magnitude map (high = uneven crowd, pockets of surge)
    motion_variance = float(np.var(mag) / (_MAG_CAP ** 2))

    headcount = int(density * zone_capacity)

    return DensityReading(
        zone=zone,
        density=round(density, 4),
        headcount=headcount,
        motion_variance=round(motion_variance, 6),
        source="cv-optical-flow",
        camera_id=camera_id,
    )


def open_source(source: str, video_path: str | None = None) -> cv2.VideoCapture:
    """Open a VideoCapture from a file path or webcam index.

    Args:
        source: "file" or "webcam".
        video_path: Path to video file (required when source == "file").

    Returns:
        Opened cv2.VideoCapture.

    Raises:
        ValueError: If source is invalid or file cannot be opened.
    """
    if source == "webcam":
        cap = cv2.VideoCapture(0)
    elif source == "file":
        if not video_path:
            raise ValueError("--video-path is required when --source is 'file'")
        cap = cv2.VideoCapture(video_path)
    else:
        raise ValueError(f"Unknown source: {source!r}. Use 'file' or 'webcam'.")

    if not cap.isOpened():
        raise ValueError(f"Could not open video source: {source!r} path={video_path!r}")

    return cap
