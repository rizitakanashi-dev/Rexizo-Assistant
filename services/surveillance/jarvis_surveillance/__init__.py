"""JARVIS surveillance service — RTSP ingest, motion/object detection, event pipeline."""

from .config import SurveillanceConfig
from .models import CameraSpec, Detection, MotionResult, SurveillanceEvent
from .runtime import SurveillanceRuntime
from .worker import (
    CAMERA_STATUSES,
    STATUS_CONNECTING,
    STATUS_ERROR,
    STATUS_OFFLINE,
    STATUS_ONLINE,
    STATUS_RECONNECTING,
)

__all__ = [
    "CAMERA_STATUSES",
    "STATUS_CONNECTING",
    "STATUS_ERROR",
    "STATUS_OFFLINE",
    "STATUS_ONLINE",
    "STATUS_RECONNECTING",
    "CameraSpec",
    "Detection",
    "MotionResult",
    "SurveillanceConfig",
    "SurveillanceEvent",
    "SurveillanceRuntime",
]
