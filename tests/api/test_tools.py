"""Unit test Tool Registry: allowlist, validasi skema, dan izin mutating."""

from __future__ import annotations

from datetime import UTC

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from jarvis_api.core.config import Settings
from jarvis_api.db.models import AuditLog
from jarvis_api.db.repository import AuditRepository, CameraRepository, EventRepository
from jarvis_api.services.tools import (
    ToolContext,
    ToolNotFoundError,
    ToolPermissionError,
    ToolRegistry,
    ToolValidationError,
    register_builtin_tools,
)


def _context(session: AsyncSession, settings: Settings) -> ToolContext:
    return ToolContext(
        settings=settings,
        cameras=CameraRepository(session),
        events=EventRepository(session),
        audit=AuditRepository(session),
    )


async def test_unknown_tool_is_rejected(session: AsyncSession, settings: Settings) -> None:
    registry = register_builtin_tools(ToolRegistry())
    with pytest.raises(ToolNotFoundError):
        await registry.execute("rm_rf", {}, _context(session, settings))


async def test_unknown_tool_is_audited(session: AsyncSession, settings: Settings) -> None:
    registry = register_builtin_tools(ToolRegistry())
    with pytest.raises(ToolNotFoundError):
        await registry.execute("shell_exec", {"cmd": "ls"}, _context(session, settings))
    result = await session.execute(select(AuditLog))
    entries = list(result.scalars().all())
    assert len(entries) == 1
    assert entries[0].action == "tool_rejected"
    assert entries[0].success is False


async def test_invalid_parameters_are_rejected(session: AsyncSession, settings: Settings) -> None:
    registry = register_builtin_tools(ToolRegistry())
    with pytest.raises(ToolValidationError):
        await registry.execute(
            "get_recent_events", {"minutes_ago": 99999}, _context(session, settings)
        )


async def test_mutating_tool_requires_explicit_authorization(
    session: AsyncSession, settings: Settings
) -> None:
    registry = register_builtin_tools(ToolRegistry())
    with pytest.raises(ToolPermissionError):
        await registry.execute(
            "delete_event_history", {"older_than_days": 30}, _context(session, settings)
        )


async def test_destructive_tool_runs_when_authorized(
    session: AsyncSession, settings: Settings
) -> None:
    registry = register_builtin_tools(ToolRegistry())
    result = await registry.execute(
        "delete_event_history",
        {"older_than_days": 30},
        _context(session, settings),
        allow_mutating=True,
    )
    assert result.payload["status"] == "ok"
    assert result.summary


async def test_safe_tool_executes(session: AsyncSession, settings: Settings) -> None:
    registry = register_builtin_tools(ToolRegistry())
    context = _context(session, settings)
    await CameraRepository(session).create(
        camera_id="cam_front", name="Front Door", rtsp_url="rtsp://localhost/1"
    )
    result = await registry.execute("get_camera_list", {}, context)
    assert isinstance(result.payload, list)
    assert result.payload[0]["id"] == "cam_front"
    assert "rtsp_url" not in result.payload[0]


async def test_get_recent_events_returns_metadata(
    session: AsyncSession, settings: Settings
) -> None:
    from datetime import datetime

    registry = register_builtin_tools(ToolRegistry())
    context = _context(session, settings)
    await EventRepository(session).create(
        event_id="evt_1",
        camera_id="cam_front",
        camera_name="Front Door",
        event_type="object_detected",
        timestamp=datetime.now(UTC),
        confidence=0.9,
        metadata={"label": "person"},
    )
    result = await registry.execute("get_recent_events", {"minutes_ago": 5}, context)
    assert result.payload[0]["metadata"]["label"] == "person"
    assert result.payload[0]["camera_name"] == "Front Door"


async def test_tool_schemas_are_openai_compatible() -> None:
    registry = register_builtin_tools(ToolRegistry())
    schemas = registry.schemas()
    assert schemas
    for schema in schemas:
        assert schema["type"] == "function"
        assert "name" in schema["function"]
        assert "parameters" in schema["function"]


async def test_duplicate_registration_is_rejected() -> None:
    registry = register_builtin_tools(ToolRegistry())
    with pytest.raises(ValueError):
        register_builtin_tools(registry)
