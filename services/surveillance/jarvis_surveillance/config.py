"""Configuration for the surveillance worker runtime."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class SurveillanceConfig:
    """Tuning knobs for ingest, detection and event emission."""

    motion_area_threshold_percent: float = 1.0
    min_motion_frames: int = 2
    debounce_seconds: float = 10.0
    object_confidence_threshold: float = 0.5
    object_model_path: str | None = None
    object_labels: tuple[str, ...] = ()
    synthetic_fps: float = 10.0
    synthetic_width: int = 640
    synthetic_height: int = 480
    reconnect_delay_seconds: float = 3.0
    max_reconnect_delay_seconds: float = 30.0
    snapshot_jpeg_quality: int = 85
    target_labels: tuple[str, ...] = field(default_factory=lambda: ("person", "car", "dog", "cat"))
