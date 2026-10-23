"""Frame sources: RTSP capture dengan reconnect loop, dan synthetic feed untuk testing."""

from __future__ import annotations

import logging
import time
from typing import Protocol

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class CaptureError(RuntimeError):
    """Gagal membuka atau membaca stream."""


class FrameSource(Protocol):
    def read(self) -> tuple[bool, np.ndarray | None]:
        """Membaca satu frame. Mengembalikan (ok, frame)."""

    def release(self) -> None:
        """Melepas resource capture."""


class RtspFrameSource:
    """Sumber frame RTSP berbasis OpenCV dengan loop reconnect otomatis.

    `read()` tidak pernah melempar error koneksi berkepanjangan: ketika stream
    terputus, source mencoba menyambung kembali dengan backoff eksponensial dan
    mengembalikan `(False, None)` sampai koneksi pulih.
    """

    def __init__(
        self,
        url: str | int,
        reconnect_delay_seconds: float = 3.0,
        max_reconnect_delay_seconds: float = 30.0,
    ) -> None:
        self._url = url
        self._reconnect_delay = reconnect_delay_seconds
        self._max_reconnect_delay = max_reconnect_delay_seconds
        self._capture: cv2.VideoCapture | None = None
        self._delay = reconnect_delay_seconds
        self._next_attempt = 0.0

    def _open_capture(self) -> cv2.VideoCapture:
        target: str | int = self._url
        if isinstance(target, str):
            target_str = target.strip()
            if target_str.isdigit():
                target = int(target_str)
            elif target_str.startswith("device://"):
                dev_id = target_str.replace("device://", "").strip()
                target = int(dev_id) if dev_id.isdigit() else dev_id
            else:
                target = target_str
        return cv2.VideoCapture(target)

    def _ensure_capture(self) -> bool:
        if self._capture is not None and self._capture.isOpened():
            return True
        now = time.monotonic()
        if now < self._next_attempt:
            return False
        self._capture = self._open_capture()
        if not self._capture.isOpened():
            logger.warning("Gagal membuka stream sumber (%s), mencoba lagi dalam %.1fs", self._url, self._delay)
            self._release_capture()
            self._delay = min(self._delay * 2, self._max_reconnect_delay)
            self._next_attempt = now + self._delay
            return False
        self._delay = self._reconnect_delay
        return True

    def read(self) -> tuple[bool, np.ndarray | None]:
        if not self._ensure_capture():
            return False, None
        assert self._capture is not None
        ok, frame = self._capture.read()
        if not ok or frame is None:
            logger.warning("Stream RTSP terputus, memicu reconnect")
            self._release_capture()
            self._next_attempt = time.monotonic() + self._delay
            self._delay = min(self._delay * 2, self._max_reconnect_delay)
            return False, None
        return True, frame

    def _release_capture(self) -> None:
        if self._capture is not None:
            self._capture.release()
            self._capture = None

    def release(self) -> None:
        self._release_capture()


class SyntheticFrameSource:
    """Feed kamera sintetis 640x480 dengan objek bergerak, tanpa perangkat fisik.

    Berguna untuk CI dan demo lokal: scene statis + siluet MovingObject yang
    bergerak diperiodik sehingga MOG2 menghasilkan motion signal.
    """

    def __init__(
        self,
        width: int = 640,
        height: int = 480,
        fps: float = 10.0,
        seed: int = 7,
    ) -> None:
        self._width = width
        self._height = height
        self._frame_interval = 1.0 / fps if fps > 0 else 0.1
        self._rng = np.random.default_rng(seed)
        self._background = self._build_background()
        self._frame_index = 0
        self._last_emit = time.monotonic()

    def _build_background(self) -> np.ndarray:
        gradient = np.linspace(40, 90, self._height, dtype=np.float32)
        background = np.repeat(gradient[:, None], self._width, axis=1)
        background = np.stack([background, background * 0.95, background * 0.9], axis=-1)
        noise = self._rng.normal(0, 1.5, (self._height, self._width, 1))
        return np.clip(background + noise, 0, 255).astype(np.uint8)

    def _draw_subject(self, frame: np.ndarray) -> None:
        phase = (self._frame_index % 90) / 90.0
        x = int(60 + (self._width - 200) * phase)
        y = int(self._height * 0.35)
        cv2.rectangle(frame, (x, y), (x + 70, y + 150), (48, 52, 58), thickness=-1)
        cv2.circle(frame, (x + 35, y - 18), 22, (48, 52, 58), thickness=-1)

    def read(self) -> tuple[bool, np.ndarray | None]:
        now = time.monotonic()
        wait = self._last_emit + self._frame_interval - now
        if wait > 0:
            time.sleep(wait)
        self._last_emit = time.monotonic()
        frame = self._background.copy()
        self._draw_subject(frame)
        self._frame_index += 1
        return True, frame

    def release(self) -> None:
        return None
