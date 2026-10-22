"""Unit test event pipeline: debounce, metadata, snapshot, dan flag mock."""

from __future__ import annotations

import numpy as np

from jarvis_surveillance.config import SurveillanceConfig
from jarvis_surveillance.models import CameraSpec, Detection, MotionResult
from jarvis_surveillance.pipeline import EventPipeline
from jarvis_surveillance.storage import SnapshotStore


def _camera(is_mock: bool = True) -> CameraSpec:
    return CameraSpec(
        id="cam_front",
        name="Front Door",
        rtsp_url="rtsp://localhost/1",
        is_mock=is_mock,
    )


def _frame() -> np.ndarray:
    frame = np.zeros((60, 80, 3), dtype=np.uint8)
    frame[:, :] = 100
    return frame


def test_motion_event_is_created_with_snapshot(tmp_path) -> None:
    store = SnapshotStore(tmp_path)
    pipeline = EventPipeline(_camera(), store, SurveillanceConfig(debounce_seconds=10.0))
    events = pipeline.process(_frame(), MotionResult(motion=True, area_percent=4.2))
    assert len(events) == 1
    event = events[0]
    assert event.event_type == "motion"
    assert event.metadata["motion_area_percent"] == 4.2
    assert event.is_mock is True
    assert event.snapshot_path is not None
    assert (tmp_path / event.snapshot_path).exists()


def test_no_event_without_motion(tmp_path) -> None:
    store = SnapshotStore(tmp_path)
    pipeline = EventPipeline(_camera(), store)
    assert pipeline.process(_frame(), MotionResult(motion=False, area_percent=0.0)) == []


def test_repeated_motion_is_debounced(tmp_path) -> None:
    store = SnapshotStore(tmp_path)
    pipeline = EventPipeline(_camera(), store, SurveillanceConfig(debounce_seconds=60.0))
    first = pipeline.process(_frame(), MotionResult(motion=True, area_percent=3.0))
    second = pipeline.process(_frame(), MotionResult(motion=True, area_percent=3.0))
    assert len(first) == 1
    assert second == []


def test_object_detection_event_carries_label_and_bbox(tmp_path) -> None:
    store = SnapshotStore(tmp_path)
    pipeline = EventPipeline(_camera(), store, SurveillanceConfig(debounce_seconds=0.0))
    detection = Detection(label="person", confidence=0.87, bbox=(10, 20, 60, 120))
    events = pipeline.process(_frame(), MotionResult(motion=True, area_percent=5.0), [detection])
    object_events = [event for event in events if event.event_type == "object_detected"]
    assert len(object_events) == 1
    assert object_events[0].confidence == 0.87
    assert object_events[0].metadata["label"] == "person"
    assert object_events[0].metadata["bbox"] == [10, 20, 60, 120]


def test_object_debounce_is_per_label(tmp_path) -> None:
    store = SnapshotStore(tmp_path)
    pipeline = EventPipeline(_camera(), store, SurveillanceConfig(debounce_seconds=60.0))
    person = Detection(label="person", confidence=0.9, bbox=(1, 2, 3, 4))
    car = Detection(label="car", confidence=0.8, bbox=(5, 6, 7, 8))
    first = pipeline.process(_frame(), MotionResult(motion=True, area_percent=5.0), [person])
    second = pipeline.process(_frame(), MotionResult(motion=True, area_percent=5.0), [person, car])
    assert [
        event.metadata.get("label") for event in first if event.event_type == "object_detected"
    ] == ["person"]
    assert [
        event.metadata.get("label") for event in second if event.event_type == "object_detected"
    ] == ["car"]


def test_object_detection_can_be_disabled(tmp_path) -> None:
    store = SnapshotStore(tmp_path)
    camera = _camera()
    camera.object_detection_enabled = False
    pipeline = EventPipeline(camera, store)
    detection = Detection(label="person", confidence=0.9, bbox=(1, 2, 3, 4))
    events = pipeline.process(_frame(), MotionResult(motion=True, area_percent=5.0), [detection])
    assert [event.event_type for event in events] == ["motion"]
