"""Runtime hosting worker surveillance untuk banyak kamera."""

from __future__ import annotations

import logging
import queue
import threading
import time
from collections.abc import Callable, Iterator

import numpy as np

from .capture import FrameSource, RtspFrameSource, SyntheticFrameSource
from .config import SurveillanceConfig
from .detectors import NullObjectDetector, ObjectDetector, OpenCVObjectDetector
from .models import CameraSpec, SurveillanceEvent
from .motion import MotionDetector
from .pipeline import EventPipeline
from .storage import SnapshotStore
from .worker import SurveillanceWorker

logger = logging.getLogger(__name__)


class SurveillanceRuntime:
    """Mengelola sekumpulan worker kamera dan antrean event.

    Runtime tidak bergantung pada package API: event dikirim ke `events` queue
    sehingga persistensi dan broadcast tetap diurus oleh lapisan aplikasi.
    """

    def __init__(
        self,
        config: SurveillanceConfig,
        snapshot_store: SnapshotStore,
        source_factory: Callable[[CameraSpec], FrameSource] | None = None,
        detector_factory: Callable[[CameraSpec], ObjectDetector] | None = None,
    ) -> None:
        self._config = config
        self._store = snapshot_store
        self._source_factory = source_factory or self._default_source
        self._detector_factory = detector_factory or self._default_detector
        self._workers: dict[str, SurveillanceWorker] = {}
        self._lock = threading.Lock()
        self.events: queue.Queue[SurveillanceEvent] = queue.Queue()
        self.statuses: queue.Queue[tuple[str, str, float | None, str | None]] = queue.Queue()

    def _default_source(self, camera: CameraSpec) -> FrameSource:
        if camera.is_mock:
            return SyntheticFrameSource(
                width=self._config.synthetic_width,
                height=self._config.synthetic_height,
                fps=self._config.synthetic_fps,
            )
        return RtspFrameSource(
            camera.rtsp_url,
            reconnect_delay_seconds=self._config.reconnect_delay_seconds,
            max_reconnect_delay_seconds=self._config.max_reconnect_delay_seconds,
        )

    def _default_detector(self, camera: CameraSpec) -> ObjectDetector:
        if not self._config.object_model_path:
            return NullObjectDetector()
        try:
            return OpenCVObjectDetector(
                self._config.object_model_path,
                self._config.object_labels,
                confidence_threshold=self._config.object_confidence_threshold,
            )
        except Exception as exc:  # pragma: no cover - bergantung pada model
            logger.error("Gagal memuat model object detection: %s", exc)
            return NullObjectDetector()

    def sync(self, cameras: list[CameraSpec]) -> None:
        """Menyesuaikan worker aktif dengan daftar kamera terkini."""
        wanted = {camera.id: camera for camera in cameras if camera.is_enabled}
        with self._lock:
            for camera_id in list(self._workers):
                if camera_id not in wanted:
                    worker = self._workers.pop(camera_id)
                    worker.stop()
            for camera_id, camera in wanted.items():
                if camera_id in self._workers:
                    continue
                worker = self._build_worker(camera)
                self._workers[camera_id] = worker
                worker.start()

    def _build_worker(self, camera: CameraSpec) -> SurveillanceWorker:
        pipeline = EventPipeline(camera, self._store, self._config)
        motion_detector = MotionDetector(
            area_threshold_percent=self._config.motion_area_threshold_percent,
            min_consecutive_frames=self._config.min_motion_frames,
        )
        return SurveillanceWorker(
            camera=camera,
            source=self._source_factory(camera),
            pipeline=pipeline,
            motion_detector=motion_detector,
            object_detector=self._detector_factory(camera),
            on_event=self.events.put,
            on_status=self._on_status,
        )

    def _on_status(
        self, camera_id: str, status: str, fps: float | None = None, reason: str | None = None
    ) -> None:
        logger.info("Status kamera %s -> %s (fps=%s) %s", camera_id, status, fps, reason or "")
        self.statuses.put((camera_id, status, fps, reason))

    def stop(self) -> None:
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
        for worker in workers:
            worker.stop()

    def restart_camera(self, camera: CameraSpec) -> bool:
        """Mengganti worker kamera dengan instance baru (restart stream)."""
        with self._lock:
            existing = self._workers.pop(camera.id, None)
        if existing is not None:
            existing.stop()
        worker = self._build_worker(camera)
        with self._lock:
            self._workers[camera.id] = worker
        worker.start()
        return True

    def worker_status(self, camera_id: str) -> str | None:
        with self._lock:
            worker = self._workers.get(camera_id)
        return worker.status if worker else None

    def latest_frame(self, camera_id: str) -> np.ndarray | None:
        with self._lock:
            worker = self._workers.get(camera_id)
        return worker.latest_frame() if worker else None

    def frames(self, camera_id: str, fps: float = 8.0) -> Iterator[np.ndarray | None]:
        """Generator frame untuk streaming MJPEG."""
        interval = 1.0 / fps if fps > 0 else 0.1
        while True:
            frame = self.latest_frame(camera_id)
            if frame is not None:
                yield frame
            time.sleep(interval)
