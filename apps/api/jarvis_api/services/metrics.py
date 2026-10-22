"""Sumber metrik sistem lokal.

Ruling Main Agent: `SystemMetricsProvider` dibuat oleh Agent 1 dengan `psutil`
plus fixture in-memory untuk pengujian unit.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import psutil

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SystemMetrics:
    """Snapshot metrik sistem pada satu waktu."""

    cpu_usage_percent: float
    memory_usage_percent: float
    disk_free_gb: float


class SystemMetricsProvider(Protocol):
    """Kontrak sumber metrik sistem."""

    def snapshot(self, storage_dir: Path) -> SystemMetrics: ...


class PsutilMetricsProvider:
    """Pembacaan metrik nyata dari sistem lokal memakai `psutil`."""

    name = "psutil"

    def snapshot(self, storage_dir: Path) -> SystemMetrics:
        try:
            disk_free_gb = round(psutil.disk_usage(str(storage_dir)).free / (1024**3), 2)
        except OSError as exc:  # pragma: no cover - bergantung pada filesystem
            logger.warning("Gagal membaca info disk: %s", exc)
            disk_free_gb = 0.0
        return SystemMetrics(
            cpu_usage_percent=round(psutil.cpu_percent(interval=None), 2),
            memory_usage_percent=round(psutil.virtual_memory().percent, 2),
            disk_free_gb=disk_free_gb,
        )


@dataclass(frozen=True)
class StaticMetricsProvider:
    """Fixture in-memory untuk unit test offline."""

    metrics: SystemMetrics
    name: str = "static"

    def snapshot(self, storage_dir: Path) -> SystemMetrics:
        return self.metrics


def build_metrics_provider() -> SystemMetricsProvider:
    """Provider default untuk runtime."""
    return PsutilMetricsProvider()
