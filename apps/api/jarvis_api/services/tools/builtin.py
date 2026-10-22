"""Tool bawaan JARVIS (read-only, mutating, dan destructive)."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import psutil
from pydantic import BaseModel, Field

from ..metrics import SystemMetrics
from .base import EmptyParams, ToolContext, ToolRisk, ToolSpec
from .registry import ToolRegistry

logger = logging.getLogger(__name__)


class RecentEventsParams(BaseModel):
    camera_id: str | None = Field(default=None, description="Filter ID kamera")
    event_type: str | None = Field(
        default=None, description="motion | object_detected | camera_status"
    )
    minutes_ago: int = Field(default=15, ge=1, le=1440, description="Rentang waktu ke belakang")
    limit: int = Field(default=10, ge=1, le=50, description="Jumlah event maksimum")


class SearchEventsParams(BaseModel):
    query: str | None = Field(
        default=None,
        description="Kata kunci yang dicocokkan ke nama kamera, jenis event, atau label objek",
    )
    camera_id: str | None = Field(default=None, description="Filter ID kamera")
    event_type: str | None = Field(
        default=None, description="motion | object_detected | camera_status"
    )
    minutes_ago: int = Field(default=60, ge=1, le=1440, description="Rentang waktu ke belakang")
    limit: int = Field(default=20, ge=1, le=100, description="Jumlah event maksimum")


class RestartCameraParams(BaseModel):
    camera_id: str = Field(description="ID kamera yang stream-nya akan direstart")


class DeleteHistoryParams(BaseModel):
    older_than_days: int = Field(default=30, ge=1, le=3650, description="Umur data yang dihapus")


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _event_payload(event: Any) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    if event.metadata_json:
        try:
            metadata = json.loads(event.metadata_json)
        except json.JSONDecodeError:  # pragma: no cover - data rusak
            metadata = {}
    return {
        "id": event.id,
        "camera_id": event.camera_id,
        "camera_name": event.camera_name,
        "event_type": event.event_type,
        "timestamp": _iso(event.timestamp),
        "confidence": event.confidence,
        "metadata": metadata,
        "is_mock": event.is_mock,
    }


def _matches_keyword(payload: dict[str, Any], keyword: str) -> bool:
    needle = keyword.strip().lower()
    if not needle:
        return True
    haystack = " ".join(
        [
            str(payload.get("camera_name", "")),
            str(payload.get("event_type", "")),
            str(payload.get("metadata", {})),
        ]
    ).lower()
    return needle in haystack


def _psutil_metrics(storage_dir: Any) -> SystemMetrics:
    """Fallback bacaan metrik langsung dari `psutil` bila provider tidak disuntikkan."""
    disk_free_gb = 0.0
    try:
        disk_free_gb = round(psutil.disk_usage(str(storage_dir)).free / (1024**3), 2)
    except OSError as exc:  # pragma: no cover - bergantung pada filesystem
        logger.warning("Gagal membaca info disk: %s", exc)
    return SystemMetrics(
        cpu_usage_percent=round(psutil.cpu_percent(interval=None), 2),
        memory_usage_percent=round(psutil.virtual_memory().percent, 2),
        disk_free_gb=disk_free_gb,
    )


async def _get_system_status(params: EmptyParams, context: ToolContext) -> dict[str, Any]:
    cameras = await context.cameras.list()
    midnight = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    events_today = await context.events.count_since(midnight)
    storage_dir = context.settings.storage_dir
    metrics = (
        context.metrics.snapshot(storage_dir) if context.metrics else _psutil_metrics(storage_dir)
    )
    return {
        "summary": (
            f"{len(cameras)} kamera terdaftar, {events_today} event hari ini, "
            f"CPU {metrics.cpu_usage_percent:.1f}%"
        ),
        "cpu_usage_percent": metrics.cpu_usage_percent,
        "memory_usage_percent": metrics.memory_usage_percent,
        "disk_free_gb": metrics.disk_free_gb,
        "active_cameras": sum(1 for camera in cameras if camera.status == "online"),
        "total_cameras": len(cameras),
        "events_today": events_today,
    }


async def _get_camera_list(params: EmptyParams, context: ToolContext) -> list[dict[str, Any]]:
    cameras = await context.cameras.list()
    return [
        {
            "id": camera.id,
            "name": camera.name,
            "status": camera.status,
            "fps": camera.fps,
            "is_enabled": camera.is_enabled,
            "last_seen_at": _iso(camera.last_seen_at),
            "is_mock": camera.is_mock,
        }
        for camera in cameras
    ]


async def _get_recent_events(
    params: RecentEventsParams, context: ToolContext
) -> list[dict[str, Any]]:
    since = datetime.now(UTC) - timedelta(minutes=params.minutes_ago)
    _, events = await context.events.query(
        camera_id=params.camera_id,
        event_type=params.event_type,
        start_time=since,
        limit=params.limit,
    )
    return [_event_payload(event) for event in events]


async def _search_events(params: SearchEventsParams, context: ToolContext) -> list[dict[str, Any]]:
    """Pencarian event multi-field (kamera, jenis, label objek, kata kunci)."""
    since = datetime.now(UTC) - timedelta(minutes=params.minutes_ago)
    _, events = await context.events.query(
        camera_id=params.camera_id,
        event_type=params.event_type,
        start_time=since,
        limit=max(params.limit * 5, 100),
    )
    payload = [_event_payload(event) for event in events]
    if params.query:
        payload = [item for item in payload if _matches_keyword(item, params.query)]
    return payload[: params.limit]


async def _restart_camera_stream(
    params: RestartCameraParams, context: ToolContext
) -> dict[str, Any]:
    if context.surveillance is None:
        return {"status": "error", "message": "Runtime surveillance tidak aktif"}
    camera = await context.cameras.get(params.camera_id)
    if camera is None:
        return {"status": "error", "message": f"Kamera '{params.camera_id}' tidak terdaftar"}
    await context.surveillance.restart_camera(params.camera_id)
    return {
        "status": "ok",
        "message": f"Stream kamera {camera.name} ({camera.id}) direstart",
    }


async def _delete_event_history(
    params: DeleteHistoryParams, context: ToolContext
) -> dict[str, Any]:
    threshold = datetime.now(UTC) - timedelta(days=params.older_than_days)
    deleted = await context.events.delete_older_than(threshold)
    return {
        "status": "ok",
        "message": f"{deleted} event lebih tua dari {params.older_than_days} hari dihapus",
        "deleted": deleted,
    }


def register_builtin_tools(registry: ToolRegistry) -> ToolRegistry:
    """Mendaftarkan seluruh tool bawaan ke registry."""
    registry.register(
        ToolSpec(
            name="get_system_status",
            description=(
                "Ambil status sistem lokal: penggunaan CPU/memori, ruang disk, jumlah "
                "kamera aktif, dan jumlah event hari ini."
            ),
            parameters=EmptyParams,
            handler=_get_system_status,
            risk=ToolRisk.SAFE,
        )
    )
    registry.register(
        ToolSpec(
            name="get_camera_list",
            description=(
                "Ambil daftar kamera terdaftar beserta status koneksi (online/offline/error) "
                "dan frame rate. Tidak mengembalikan kredensial RTSP."
            ),
            parameters=EmptyParams,
            handler=_get_camera_list,
            risk=ToolRisk.SAFE,
            aliases=["list_cameras"],
        )
    )
    registry.register(
        ToolSpec(
            name="get_recent_events",
            description=(
                "Ambil log event surveillance terbaru (motion, object_detected) dengan "
                "filter kamera, jenis event, dan rentang menit ke belakang."
            ),
            parameters=RecentEventsParams,
            handler=_get_recent_events,
            risk=ToolRisk.SAFE,
        )
    )
    registry.register(
        ToolSpec(
            name="search_events",
            description=(
                "Cari event surveillance berdasarkan kata kunci (nama kamera, jenis event, "
                "label objek seperti person/vehicle) dalam rentang waktu tertentu."
            ),
            parameters=SearchEventsParams,
            handler=_search_events,
            risk=ToolRisk.SAFE,
        )
    )
    registry.register(
        ToolSpec(
            name="restart_camera_stream",
            description="Restart worker stream RTSP untuk satu kamera.",
            parameters=RestartCameraParams,
            handler=_restart_camera_stream,
            risk=ToolRisk.MUTATING,
        )
    )
    registry.register(
        ToolSpec(
            name="delete_event_history",
            description="Hapus riwayat event lama dari database lokal.",
            parameters=DeleteHistoryParams,
            handler=_delete_event_history,
            risk=ToolRisk.DESTRUCTIVE,
        )
    )
    return registry
