"""Value objects shared across the surveillance pipeline."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

EVENT_TYPE_MOTION = "motion"
EVENT_TYPE_OBJECT_DETECTED = "object_detected"
EVENT_TYPE_CAMERA_STATUS = "camera_status"


def new_event_id() -> str:
    """Event id format documented in docs/EVENT-SCHEMA.md: evt_<timestamp_ms>_<random>."""
    return f"evt_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"


@dataclass(slots=True)
class CameraSpec:
    """Konfigurasi kamera yang dibutuhkan worker (tanpa dependensi ke API package)."""

    id: str
    name: str
    rtsp_url: str
    is_enabled: bool = True
    motion_detection_enabled: bool = True
    object_detection_enabled: bool = True
    is_mock: bool = False


@dataclass(slots=True)
class Detection:
    """Hasil object detection untuk satu objek di dalam frame."""

    label: str
    confidence: float
    bbox: tuple[int, int, int, int]

    def as_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 4),
            "bbox": [int(value) for value in self.bbox],
        }


@dataclass(slots=True)
class MotionResult:
    """Hasil motion detection untuk satu frame."""

    motion: bool
    area_percent: float


@dataclass(slots=True)
class SurveillanceEvent:
    """Event surveillance yang mengikuti schema docs/EVENT-SCHEMA.md."""

    id: str
    camera_id: str
    camera_name: str
    event_type: str
    timestamp: float
    confidence: float | None = None
    snapshot_path: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    is_mock: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "camera_id": self.camera_id,
            "camera_name": self.camera_name,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "confidence": self.confidence,
            "snapshot_path": self.snapshot_path,
            "metadata": self.metadata,
            "is_mock": self.is_mock,
        }
