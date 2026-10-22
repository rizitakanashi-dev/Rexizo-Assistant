"""Event pipeline: motion/object → debounce → snapshot → event."""

from __future__ import annotations

import logging
import time

import numpy as np

from .config import SurveillanceConfig
from .models import (
    EVENT_TYPE_MOTION,
    EVENT_TYPE_OBJECT_DETECTED,
    CameraSpec,
    Detection,
    MotionResult,
    SurveillanceEvent,
    new_event_id,
)
from .storage import SnapshotStore

logger = logging.getLogger(__name__)


class EventPipeline:
    """Mengubah hasil deteksi menjadi event surveillance yang ter-debounce.

    Debounce bersifat per (kamera, jenis event, label objek): event `person`
    tidak menyilenced event `car`, dan event `motion` memiliki jendela sendiri.
    """

    def __init__(
        self,
        camera: CameraSpec,
        snapshot_store: SnapshotStore,
        config: SurveillanceConfig | None = None,
    ) -> None:
        self._camera = camera
        self._store = snapshot_store
        self._config = config or SurveillanceConfig()
        self._last_emitted: dict[str, float] = {}

    def _debounced(self, key: str, now: float) -> bool:
        previous = self._last_emitted.get(key)
        if previous is not None and (now - previous) < self._config.debounce_seconds:
            return True
        self._last_emitted[key] = now
        return False

    def process(
        self,
        frame: np.ndarray,
        motion: MotionResult,
        detections: list[Detection] | None = None,
    ) -> list[SurveillanceEvent]:
        """Memproses satu frame dan mengembalikan event yang lolos debounce."""
        if not motion.motion:
            return []
        now = time.time()
        events: list[SurveillanceEvent] = []
        if self._camera.motion_detection_enabled and not self._debounced("motion", now):
            events.append(self._build_event(EVENT_TYPE_MOTION, frame, now, motion, None))
        if self._camera.object_detection_enabled:
            for detection in detections or []:
                key = f"{EVENT_TYPE_OBJECT_DETECTED}:{detection.label}"
                if self._debounced(key, now):
                    continue
                events.append(
                    self._build_event(EVENT_TYPE_OBJECT_DETECTED, frame, now, motion, detection)
                )
        return events

    def _build_event(
        self,
        event_type: str,
        frame: np.ndarray,
        now: float,
        motion: MotionResult,
        detection: Detection | None,
    ) -> SurveillanceEvent:
        event_id = new_event_id()
        metadata: dict[str, object] = {"motion_area_percent": motion.area_percent}
        confidence: float | None = None
        if detection is not None:
            metadata.update(detection.as_dict())
            confidence = round(detection.confidence, 4)
        snapshot_path = self._store.save(self._camera.id, event_id, frame)
        return SurveillanceEvent(
            id=event_id,
            camera_id=self._camera.id,
            camera_name=self._camera.name,
            event_type=event_type,
            timestamp=now,
            confidence=confidence,
            snapshot_path=snapshot_path,
            metadata=metadata,
            is_mock=self._camera.is_mock,
        )
