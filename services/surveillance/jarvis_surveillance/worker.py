"""Worker thread per kamera: ingest frame → deteksi → event, dengan error isolation."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from typing import Protocol

import numpy as np

from .capture import FrameSource
from .detectors import ObjectDetector
from .models import CameraSpec, SurveillanceEvent
from .motion import MotionDetector
from .pipeline import EventPipeline

logger = logging.getLogger(__name__)

STATUS_ONLINE = "online"
STATUS_OFFLINE = "offline"
STATUS_CONNECTING = "connecting"
STATUS_RECONNECTING = "reconnecting"
STATUS_ERROR = "error"

#: Kosakata status kamera yang sah (dipakai validasi di lapisan atas).
CAMERA_STATUSES: tuple[str, ...] = (
    STATUS_ONLINE,
    STATUS_OFFLINE,
    STATUS_CONNECTING,
    STATUS_RECONNECTING,
    STATUS_ERROR,
)


class StatusCallback(Protocol):
    def __call__(
        self, camera_id: str, status: str, fps: float | None = None, reason: str | None = None
    ) -> None: ...


class SurveillanceWorker:
    """Membaca stream kamera secara terus-menerus di thread terpisah.

    Kegagalan capture, deteksi, maupun penyimpanan tidak pernah menghentikan
    worker atau proses utama: error dicatat sebagai status `error` lalu worker
    melanjutkan dengan backoff.
    """

    def __init__(
        self,
        camera: CameraSpec,
        source: FrameSource,
        pipeline: EventPipeline,
        motion_detector: MotionDetector,
        object_detector: ObjectDetector,
        on_event: Callable[[SurveillanceEvent], None],
        on_status: StatusCallback,
        loop_interval: float = 0.05,
    ) -> None:
        self._camera = camera
        self._source = source
        self._pipeline = pipeline
        self._motion_detector = motion_detector
        self._object_detector = object_detector
        self._on_event = on_event
        self._on_status = on_status
        self._loop_interval = loop_interval
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._latest_frame: np.ndarray | None = None
        self._lock = threading.Lock()
        self._status: str = ""
        self._ever_online: bool = False
        self._last_notify: float = time.monotonic()

    @property
    def camera_id(self) -> str:
        return self._camera.id

    @property
    def status(self) -> str:
        return self._status

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self.run, name=f"surveillance-{self._camera.id}", daemon=True
        )
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=timeout)
            self._thread = None
        try:
            self._source.release()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Gagal melepas source kamera %s: %s", self._camera.id, exc)

    def latest_frame(self) -> np.ndarray | None:
        with self._lock:
            return self._latest_frame

    def _set_status(self, status: str, fps: float | None = None, reason: str | None = None) -> None:
        now = time.monotonic()
        changed = status != self._status
        stale = (now - self._last_notify) >= 1.0
        if not changed and not (fps is not None and stale):
            return
        self._status = status
        self._last_notify = now
        if status == STATUS_ONLINE:
            self._ever_online = True
        try:
            self._on_status(self._camera.id, status, fps, reason)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Callback status kamera %s gagal: %s", self._camera.id, exc)

    def run(self) -> None:
        logger.info("Worker surveillance untuk kamera %s dimulai", self._camera.id)
        while not self._stop_event.is_set():
            try:
                self._process_once()
            except Exception as exc:
                logger.exception("Kesalahan pada worker kamera %s: %s", self._camera.id, exc)
                self._set_status(STATUS_ERROR, reason=str(exc))
                self._stop_event.wait(self._loop_interval)
        logger.info("Worker surveillance untuk kamera %s dihentikan", self._camera.id)

    def _process_once(self) -> None:
        ok, frame = self._source.read()
        if not ok or frame is None:
            # Kamera yang belum pernah online masih dalam proses sambung pertama
            # (`connecting`); kamera yang sudah online berarti stream terputus dan
            # perlu disambung kembali (`reconnecting`).
            status = STATUS_RECONNECTING if self._ever_online else STATUS_CONNECTING
            self._set_status(status, reason="stream tidak tersedia")
            self._stop_event.wait(self._loop_interval)
            return
        with self._lock:
            self._latest_frame = frame
        motion = self._motion_detector.detect(frame)
        detections = []
        if motion.motion:
            detections = self._object_detector.detect(frame)
        events = self._pipeline.process(frame, motion, detections)
        for event in events:
            try:
                self._on_event(event)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Gagal memproses event %s: %s", event.id, exc)
        self._set_status(STATUS_ONLINE, fps=self._estimate_fps())

    def _estimate_fps(self) -> float:
        now = time.monotonic()
        previous = getattr(self, "_last_frame_time", None)
        self._last_frame_time = now
        if previous is None:
            return 0.0
        elapsed = max(now - previous, 1e-6)
        return round(1.0 / elapsed, 2)
