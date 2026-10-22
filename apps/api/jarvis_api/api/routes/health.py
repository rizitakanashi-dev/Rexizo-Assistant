"""Endpoint health dan status sistem."""

from __future__ import annotations

import time
from datetime import UTC, datetime

from fastapi import APIRouter

from ...db.repository import CameraRepository, EventRepository
from ...schemas import HealthResponse, SystemStatus
from ...services.metrics import build_metrics_provider
from ..deps import ApiKeyDep, SessionDep, SettingsDep

router = APIRouter(tags=["system"])

_STARTED_AT = time.monotonic()


@router.get("/health", response_model=HealthResponse, dependencies=[ApiKeyDep])
async def health(settings: SettingsDep) -> HealthResponse:
    """Status kesehatan sistem dan komponennya."""
    llm_status = (
        "available" if settings.llm_enabled else ("mock" if settings.test_mode else "unavailable")
    )
    return HealthResponse(
        status="healthy",
        version=settings.version,
        uptime_seconds=round(time.monotonic() - _STARTED_AT, 2),
        components={
            "database": "connected",
            "surveillance_workers": "running",
            "llm_service": llm_status,
        },
    )


@router.get("/system/status", response_model=SystemStatus, dependencies=[ApiKeyDep])
async def system_status(session: SessionDep, settings: SettingsDep) -> SystemStatus:
    """Ringkasan metrik sistem lokal."""
    cameras = await CameraRepository(session).list()
    midnight = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    events_today = await EventRepository(session).count_since(midnight)
    metrics = build_metrics_provider().snapshot(settings.storage_dir)
    return SystemStatus(
        cpu_usage_percent=metrics.cpu_usage_percent,
        memory_usage_percent=metrics.memory_usage_percent,
        disk_free_gb=metrics.disk_free_gb,
        active_cameras=sum(1 for camera in cameras if camera.status == "online"),
        total_cameras=len(cameras),
        events_today=events_today,
        ai={
            "enabled": settings.ai_enabled,
            "provider": settings.llm_provider_name,
            "model": settings.dattio_model,
            "degraded": not settings.llm_enabled,
            "tool_mode": settings.dattio_tool_mode,
        },
    )
