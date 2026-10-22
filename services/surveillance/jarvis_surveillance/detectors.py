"""Object detection adapters.

Adapter default (`NullObjectDetector`) sengaja tidak memuat model apa pun agar
runtime lokal tetap ringan. Model ONNX (YOLOv8n / MobileNet-SSD) dapat dipasang
tanpa mengubah pipeline: cukup isi `object_model_path` dan label class.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

from .models import Detection

logger = logging.getLogger(__name__)


class ObjectDetector(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Mendeteksi objek pada frame."""


class NullObjectDetector:
    """Detector tanpa model: selalu mengembalikan daftar kosong."""

    def detect(self, frame: np.ndarray) -> list[Detection]:
        return []


class ScriptedObjectDetector:
    """Detector untuk test: mengembalikan deteksi yang sudah disetel."""

    def __init__(self, detections: Sequence[Detection] | None = None) -> None:
        self._detections = list(detections or [])

    def detect(self, frame: np.ndarray) -> list[Detection]:
        return list(self._detections)


class OpenCVObjectDetector:
    """Object detector berbasis OpenCV DNN untuk model ONNX (YOLOv8n dan sejenisnya)."""

    def __init__(
        self,
        model_path: str,
        labels: Sequence[str],
        confidence_threshold: float = 0.5,
        input_size: tuple[int, int] = (640, 640),
    ) -> None:
        self._labels = list(labels)
        self._confidence_threshold = confidence_threshold
        self._input_size = input_size
        self._net = cv2.dnn.readNetFromONNX(model_path)
        self._output_names = self._net.getUnconnectedOutLayersNames()

    def detect(self, frame: np.ndarray) -> list[Detection]:
        if frame is None or frame.size == 0:
            return []
        height, width = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(frame, 1 / 255.0, self._input_size, swapRB=True, crop=False)
        self._net.setInput(blob)
        try:
            outputs = self._net.forward(self._output_names)
        except cv2.error as exc:  # pragma: no cover - bergantung pada model
            logger.error("Object detection gagal: %s", exc)
            return []
        return self._postprocess(outputs, width, height)

    def _postprocess(self, outputs: list, width: int, height: int) -> list[Detection]:
        raw = outputs[0]
        if raw.ndim == 3:
            raw = raw[0]
        detections: list[Detection] = []
        for row in raw:
            scores = row[4:]
            class_id = int(np.argmax(scores))
            confidence = float(scores[class_id])
            if confidence < self._confidence_threshold:
                continue
            center_x, center_y, box_w, box_h = (float(value) for value in row[:4])
            x1 = int(max(0, center_x - box_w / 2))
            y1 = int(max(0, center_y - box_h / 2))
            x2 = int(min(width, center_x + box_w / 2))
            y2 = int(min(height, center_y + box_h / 2))
            label = self._labels[class_id] if class_id < len(self._labels) else str(class_id)
            detections.append(Detection(label=label, confidence=confidence, bbox=(x1, y1, x2, y2)))
        return detections


def load_labels(path: str | Path | None) -> tuple[str, ...]:
    """Membaca label class satu per baris dari file teks."""
    if not path:
        return ()
    labels_path = Path(path)
    if not labels_path.exists():
        logger.warning("File label object detection tidak ditemukan: %s", labels_path)
        return ()
    return tuple(
        line.strip()
        for line in labels_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    )
