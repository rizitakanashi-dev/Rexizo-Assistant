"""Test kosakata status kamera dan transisi `connecting` → `reconnecting` → `online`."""

from __future__ import annotations

import time

import numpy as np

from jarvis_surveillance import (
    CAMERA_STATUSES,
    STATUS_CONNECTING,
    STATUS_ERROR,
    STATUS_OFFLINE,
    STATUS_ONLINE,
    STATUS_RECONNECTING,
)
from jarvis_surveillance.config import SurveillanceConfig
from jarvis_surveillance.detectors import NullObjectDetector
from jarvis_surveillance.models import CameraSpec
from jarvis_surveillance.motion import MotionDetector
from jarvis_surveillance.pipeline import EventPipeline
from jarvis_surveillance.runtime import SurveillanceRuntime
from jarvis_surveillance.storage import SnapshotStore
from jarvis_surveillance.worker import SurveillanceWorker


def _camera() -> CameraSpec:
    return CameraSpec(
        id="cam_front", name="Front Door", rtsp_url="rtsp://localhost/1", is_mock=True
    )


class ScriptedFrameSource:
    """Frame source palsu dengan skrip hasil `read()` per pemanggilan."""

    def __init__(self, script: list[tuple[bool, bool]]) -> None:
        self._script = script
        self._index = 0
        self._frame = np.zeros((120, 160, 3), dtype=np.uint8)

    def read(self):
        ok, has_frame = self._script[min(self._index, len(self._script) - 1)]
        self._index += 1
        if not ok or not has_frame:
            return False, None
        return True, self._frame

    def release(self) -> None:
        return None


def _worker(source, tmp_path, statuses) -> SurveillanceWorker:
    store = SnapshotStore(tmp_path)
    camera = _camera()
    return SurveillanceWorker(
        camera=camera,
        source=source,
        pipeline=EventPipeline(camera, store, SurveillanceConfig(debounce_seconds=0.0)),
        motion_detector=MotionDetector(area_threshold_percent=0.5, min_consecutive_frames=1),
        object_detector=NullObjectDetector(),
        on_event=lambda event: None,
        on_status=lambda camera_id, status, fps=None, reason=None: statuses.append(status),
    )


def test_status_vocabulary_includes_reconnecting() -> None:
    assert STATUS_RECONNECTING == "reconnecting"
    assert set(CAMERA_STATUSES) == {
        STATUS_ONLINE,
        STATUS_OFFLINE,
        STATUS_CONNECTING,
        STATUS_RECONNECTING,
        STATUS_ERROR,
    }


def test_status_transitions_are_monotonic(tmp_path) -> None:
    """`reconnecting` hanya boleh muncul setelah kamera pernah `online`."""
    statuses: list[str] = []
    source = ScriptedFrameSource([(False, False), (True, True), (False, False), (True, True)])
    worker = _worker(source, tmp_path, statuses)

    worker._process_once()
    assert worker.status == STATUS_CONNECTING

    worker._process_once()
    assert worker.status == STATUS_ONLINE

    worker._process_once()
    assert worker.status == STATUS_RECONNECTING

    worker._process_once()
    assert worker.status == STATUS_ONLINE

    assert statuses.index(STATUS_ONLINE) < statuses.index(STATUS_RECONNECTING)


def test_reconnecting_never_precedes_online(tmp_path) -> None:
    """Sumber yang tidak pernah menghasilkan frame tidak boleh pernah `reconnecting`."""
    statuses: list[str] = []
    source = ScriptedFrameSource([(False, False)])
    worker = _worker(source, tmp_path, statuses)

    for _ in range(5):
        worker._process_once()

    assert STATUS_RECONNECTING not in statuses
    assert worker.status == STATUS_CONNECTING


def test_runtime_forwards_reconnecting_status(tmp_path) -> None:
    """Runtime meneruskan status `reconnecting` apa adanya ke antrean status."""
    store = SnapshotStore(tmp_path)
    runtime = SurveillanceRuntime(SurveillanceConfig(), store)
    runtime._on_status("cam_front", STATUS_RECONNECTING, 0.0, "stream tidak tersedia")
    camera_id, status, _fps, reason = runtime.statuses.get_nowait()
    assert camera_id == "cam_front"
    assert status == STATUS_RECONNECTING
    assert reason == "stream tidak tersedia"


def test_worker_recovers_to_online_after_reconnect(tmp_path) -> None:
    statuses: list[str] = []
    source = ScriptedFrameSource([(True, True), (False, False), (True, True)])
    worker = _worker(source, tmp_path, statuses)

    worker._process_once()
    worker._process_once()
    assert worker.status == STATUS_RECONNECTING
    worker._process_once()
    assert worker.status == STATUS_ONLINE
    assert statuses[-1] == STATUS_ONLINE


def test_worker_thread_reports_reconnecting(tmp_path) -> None:
    """Level worker (thread nyata) juga campaigned `reconnecting`."""
    statuses: list[str] = []
    source = ScriptedFrameSource([(False, False)])
    worker = _worker(source, tmp_path, statuses)
    worker.start()
    deadline = time.monotonic() + 3
    while STATUS_CONNECTING not in statuses and time.monotonic() < deadline:
        time.sleep(0.05)
    worker.stop()
    assert STATUS_CONNECTING in statuses
    assert STATUS_RECONNECTING not in statuses
