"""Motion detection berbasis background subtraction MOG2 (OpenCV)."""

from __future__ import annotations

import cv2
import numpy as np

from .models import MotionResult


class MotionDetector:
    """Detektor gerakan MOG2.

    `detect()` mengembalikan MotionResult berisi status motion dan persentase
    area foreground terhadap frame. Status motion butuh `min_consecutive_frames`
    frame berturut-turut agar noise sesaat tidak memicu event.
    """

    def __init__(
        self,
        area_threshold_percent: float = 1.0,
        min_consecutive_frames: int = 2,
        history: int = 300,
        var_threshold: float = 16.0,
    ) -> None:
        self._area_threshold_percent = area_threshold_percent
        self._min_consecutive_frames = max(1, min_consecutive_frames)
        self._streak = 0
        self._subtractor = cv2.createBackgroundSubtractorMOG2(
            history=history, varThreshold=var_threshold, detectShadows=False
        )

    def reset(self) -> None:
        self._streak = 0
        self._subtractor = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=16.0)

    def detect(self, frame: np.ndarray) -> MotionResult:
        if frame is None or frame.size == 0:
            return MotionResult(motion=False, area_percent=0.0)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mask = self._subtractor.apply(gray)
        _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
        mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
        area_percent = float(np.count_nonzero(mask)) / float(mask.size) * 100.0
        if area_percent >= self._area_threshold_percent:
            self._streak += 1
        else:
            self._streak = 0
        motion = self._streak >= self._min_consecutive_frames
        return MotionResult(motion=motion, area_percent=round(area_percent, 4))
