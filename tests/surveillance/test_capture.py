"""Unit test sumber frame: RTSP dan feed sintetis."""

from __future__ import annotations

import numpy as np

from jarvis_surveillance.capture import RtspFrameSource, SyntheticFrameSource


def test_synthetic_source_produces_expected_frame() -> None:
    source = SyntheticFrameSource(width=320, height=240, fps=100)
    ok, frame = source.read()
    assert ok is True
    assert frame is not None
    assert frame.shape == (240, 320, 3)
    assert frame.dtype == np.uint8
    source.release()


def test_synthetic_source_moves_subject_between_frames() -> None:
    source = SyntheticFrameSource(width=320, height=240, fps=100)
    _, first = source.read()
    for _ in range(10):
        _, frame = source.read()
    assert first is not None and frame is not None
    assert not np.array_equal(first, frame)


def test_rtsp_source_returns_false_instead_of_raising() -> None:
    source = RtspFrameSource("rtsp://127.0.0.1:1/tidak-ada", reconnect_delay_seconds=0.01)
    ok, frame = source.read()
    assert ok is False
    assert frame is None
    source.release()
