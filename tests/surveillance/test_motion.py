"""Unit test motion detector MOG2."""

from __future__ import annotations

import numpy as np

from jarvis_surveillance.motion import MotionDetector


def _static_frame() -> np.ndarray:
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    frame[:, :] = (40, 40, 40)
    return frame


def test_static_scene_produces_no_motion() -> None:
    detector = MotionDetector(area_threshold_percent=1.0, min_consecutive_frames=2)
    frame = _static_frame()
    for _ in range(10):
        result = detector.detect(frame)
    assert result.motion is False
    assert result.area_percent < 1.0


def test_moving_object_triggers_motion() -> None:
    detector = MotionDetector(area_threshold_percent=1.0, min_consecutive_frames=2)
    frame = _static_frame()
    for _ in range(10):
        detector.detect(frame)
    frame[40:90, 30:80] = (220, 220, 220)
    first = detector.detect(frame)
    second = detector.detect(frame)
    assert first.motion is False
    assert second.motion is True
    assert second.area_percent > 1.0


def test_empty_frame_is_handled() -> None:
    detector = MotionDetector()
    result = detector.detect(np.array([]))
    assert result.motion is False
    assert result.area_percent == 0.0
