"""Integration test lifecycle worker surveillance dan isolasi kegagalan."""

from __future__ import annotations

import time

import numpy as np

from jarvis_surveillance.capture import SyntheticFrameSource
from jarvis_surveillance.config import SurveillanceConfig
from jarvis_surveillance.detectors import NullObjectDetector
from jarvis_surveillance.models import CameraSpec
from jarvis_surveillance.motion import MotionDetector
from jarvis_surveillance.pipeline import EventPipeline
from jarvis_surveillance.storage import SnapshotStore
from jarvis_surveillance.worker import SurveillanceWorker


def _camera() -> CameraSpec:
    return CameraSpec(
        id="cam_front", name="Front Door", rtsp_url="rtsp://localhost/1", is_mock=True
    )


def test_worker_detects_motion_and_emits_event(tmp_path) -> None:
    store = SnapshotStore(tmp_path)
    camera = _camera()
    pipeline = EventPipeline(camera, store, SurveillanceConfig(debounce_seconds=0.0))
    events: list = []
    statuses: list[str] = []

    worker = SurveillanceWorker(
        camera=camera,
        source=SyntheticFrameSource(width=320, height=240, fps=100),
        pipeline=pipeline,
        motion_detector=MotionDetector(area_threshold_percent=0.5, min_consecutive_frames=2),
        object_detector=NullObjectDetector(),
        on_event=events.append,
        on_status=lambda camera_id, status, fps=None, reason=None: statuses.append(status),
    )
    worker.start()
    deadline = time.monotonic() + 8
    while not events and time.monotonic() < deadline:
        time.sleep(0.05)
    worker.stop()

    assert events, "worker harus menghasilkan event motion"
    assert events[0].camera_id == "cam_front"
    assert events[0].event_type == "motion"
    assert "online" in statuses
    assert worker.latest_frame() is not None


def test_worker_survives_capture_error(tmp_path) -> None:
    class ExplodingSource:
        def read(self):
            raise RuntimeError("koneksi kamera putus total")

        def release(self) -> None:
            return None

    store = SnapshotStore(tmp_path)
    camera = _camera()
    statuses: list[str] = []

    worker = SurveillanceWorker(
        camera=camera,
        source=ExplodingSource(),
        pipeline=EventPipeline(camera, store),
        motion_detector=MotionDetector(),
        object_detector=NullObjectDetector(),
        on_event=lambda event: None,
        on_status=lambda camera_id, status, fps=None, reason=None: statuses.append(status),
    )
    worker.start()
    deadline = time.monotonic() + 5
    while "error" not in statuses and time.monotonic() < deadline:
        time.sleep(0.05)
    worker.stop()

    assert "error" in statuses
    assert worker.status == "error"


def test_worker_marks_camera_connecting_when_stream_unavailable(tmp_path) -> None:
    class EmptySource:
        def read(self):
            return False, None

        def release(self) -> None:
            return None

    store = SnapshotStore(tmp_path)
    camera = _camera()
    statuses: list[str] = []

    worker = SurveillanceWorker(
        camera=camera,
        source=EmptySource(),
        pipeline=EventPipeline(camera, store),
        motion_detector=MotionDetector(),
        object_detector=NullObjectDetector(),
        on_event=lambda event: None,
        on_status=lambda camera_id, status, fps=None, reason=None: statuses.append(status),
    )
    worker.start()
    deadline = time.monotonic() + 3
    while "connecting" not in statuses and time.monotonic() < deadline:
        time.sleep(0.05)
    worker.stop()

    assert "connecting" in statuses


def test_worker_accepts_latest_frame(tmp_path) -> None:
    store = SnapshotStore(tmp_path)
    camera = _camera()
    worker = SurveillanceWorker(
        camera=camera,
        source=SyntheticFrameSource(width=160, height=120, fps=100),
        pipeline=EventPipeline(camera, store),
        motion_detector=MotionDetector(),
        object_detector=NullObjectDetector(),
        on_event=lambda event: None,
        on_status=lambda camera_id, status, fps=None, reason=None: None,
    )
    worker.start()
    deadline = time.monotonic() + 3
    frame = None
    while frame is None and time.monotonic() < deadline:
        frame = worker.latest_frame()
        time.sleep(0.05)
    worker.stop()
    assert isinstance(frame, np.ndarray)
    assert frame.shape == (120, 160, 3)
