"""JARVIS surveillance service — RTSP ingest, motion/object detection, event pipeline."""

from .config import SurveillanceConfig
from .models import CameraSpec, Detection, MotionResult, SurveillanceEvent
from .runtime import SurveillanceRuntime

__all__ = [
    "CameraSpec",
    "Detection",
    "MotionResult",
    "SurveillanceConfig",
    "SurveillanceEvent",
    "SurveillanceRuntime",
]
