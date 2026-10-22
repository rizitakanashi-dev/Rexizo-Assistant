"""Endpoint query event surveillance."""

from __future__ import annotations

import json
from datetime import datetime

import fastapi
from fastapi import APIRouter, HTTPException, Query, Response, status

from ...db.repository import EventRepository
from ...schemas import EventItem, EventPage
from ..deps import ApiKeyDep, SessionDep

router = APIRouter(prefix="/events", tags=["events"])


def _to_item(event) -> EventItem:
    metadata: dict = {}
    if event.metadata_json:
        try:
            metadata = json.loads(event.metadata_json)
        except json.JSONDecodeError:  # pragma: no cover - data rusak
            metadata = {}
    return EventItem(
        id=event.id,
        camera_id=event.camera_id,
        camera_name=event.camera_name,
        event_type=event.event_type,
        timestamp=event.timestamp,
        confidence=event.confidence,
        metadata=metadata,
        snapshot_path=f"/api/v1/events/{event.id}/snapshot" if event.snapshot_path else None,
        is_mock=event.is_mock,
    )


@router.get("", response_model=EventPage, dependencies=[ApiKeyDep])
async def list_events(
    session: SessionDep,
    camera_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> EventPage:
    """Query log event dengan filter kamera, jenis event, dan rentang waktu."""
    total, events = await EventRepository(session).query(
        camera_id=camera_id,
        event_type=event_type,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        offset=offset,
    )
    return EventPage(
        total=total,
        limit=limit,
        offset=offset,
        items=[_to_item(event) for event in events],
    )


@router.get("/{event_id}/snapshot", dependencies=[ApiKeyDep])
async def event_snapshot(event_id: str, session: SessionDep, request: fastapi.Request) -> Response:
    """Unduh snapshot statis yang tersimpan saat event terpicu."""
    event = await EventRepository(session).get(event_id)
    if event is None or not event.snapshot_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot event tidak ditemukan"
        )
    settings = request.app.state.settings
    snapshot_path = settings.snapshot_dir / event.snapshot_path
    if not snapshot_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File snapshot tidak ditemukan"
        )
    return Response(content=snapshot_path.read_bytes(), media_type="image/jpeg")
