"""Penyimpanan snapshot frame lokal (JPEG) di direktori storage."""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class SnapshotStore:
    """Menyimpan snapshot event ke disk lokal dan menyediakan path relatif."""

    def __init__(self, directory: Path | str, jpeg_quality: int = 85) -> None:
        self._directory = Path(directory)
        self._jpeg_quality = jpeg_quality
        self._directory.mkdir(parents=True, exist_ok=True)

    @property
    def directory(self) -> Path:
        return self._directory

    def save(self, camera_id: str, event_id: str, frame: np.ndarray) -> str | None:
        """Menyimpan frame sebagai JPEG, mengembalikan path relatif terhadap direktori store."""
        if frame is None or frame.size == 0:
            return None
        filename = f"{camera_id}_{event_id}.jpg"
        target = self._directory / filename
        params = [int(cv2.IMWRITE_JPEG_QUALITY), self._jpeg_quality]
        try:
            success = cv2.imwrite(str(target), frame, params)
        except cv2.error as exc:  # pragma: no cover - bergantung pada filesystem
            logger.error("Gagal menyimpan snapshot %s: %s", target, exc)
            return None
        if not success:
            logger.error("Gagal menyimpan snapshot %s", target)
            return None
        return filename

    def absolute_path(self, relative_path: str) -> Path:
        return self._directory / Path(relative_path).name
