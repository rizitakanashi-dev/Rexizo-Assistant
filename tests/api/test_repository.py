"""Unit test repository database (insert, filter, pagination, serialisasi metadata)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from jarvis_api.db.repository import CameraRepository, EventRepository


def _timestamp(minutes_ago: int) -> datetime:
    return datetime.now(UTC) - timedelta(minutes=minutes_ago)


async def test_insert_and_read_camera(session: AsyncSession) -> None:
    repository = CameraRepository(session)
    camera = await repository.create(
        camera_id="cam_front",
        name="Front Door",
        rtsp_url="rtsp://user:secret@192.168.1.10:554/stream",
    )
    assert camera.id == "cam_front"
    assert camera.status == "connecting"

    fetched = await repository.get("cam_front")
    assert fetched is not None
    assert fetched.rtsp_url.startswith("rtsp://")


async def test_event_insert_and_metadata_roundtrip(session: AsyncSession) -> None:
    repository = EventRepository(session)
    await repository.create(
        event_id="evt_1",
        camera_id="cam_front",
        camera_name="Front Door",
        event_type="object_detected",
        timestamp=_timestamp(1),
        confidence=0.89,
        snapshot_path="cam_front_evt_1.jpg",
        metadata={"label": "person", "bbox": [120, 80, 240, 360], "motion_area_percent": 14.5},
    )
    event = await repository.get("evt_1")
    assert event is not None
    assert event.confidence == 0.89
    assert "person" in event.metadata_json


async def test_event_query_filters(session: AsyncSession) -> None:
    repository = EventRepository(session)
    await repository.create(
        event_id="evt_motion",
        camera_id="cam_front",
        camera_name="Front Door",
        event_type="motion",
        timestamp=_timestamp(5),
    )
    await repository.create(
        event_id="evt_person",
        camera_id="cam_back",
        camera_name="Backyard",
        event_type="object_detected",
        timestamp=_timestamp(2),
        confidence=0.7,
    )
    await repository.create(
        event_id="evt_old",
        camera_id="cam_front",
        camera_name="Front Door",
        event_type="motion",
        timestamp=_timestamp(500),
    )

    total, events = await repository.query(camera_id="cam_front")
    assert total == 2
    assert {event.id for event in events} == {"evt_motion", "evt_old"}

    total, events = await repository.query(event_type="object_detected")
    assert total == 1
    assert events[0].id == "evt_person"

    total, events = await repository.query(start_time=_timestamp(60))
    assert total == 2
    assert all(event.id != "evt_old" for event in events)


async def test_event_query_pagination(session: AsyncSession) -> None:
    repository = EventRepository(session)
    for index in range(5):
        await repository.create(
            event_id=f"evt_{index}",
            camera_id="cam_front",
            camera_name="Front Door",
            event_type="motion",
            timestamp=_timestamp(index),
        )
    total, page = await repository.query(limit=2, offset=0)
    assert total == 5
    assert len(page) == 2

    _, page = await repository.query(limit=2, offset=4)
    assert len(page) == 1


async def test_event_count_since_and_delete(session: AsyncSession) -> None:
    repository = EventRepository(session)
    await repository.create(
        event_id="evt_new",
        camera_id="cam_front",
        camera_name="Front Door",
        event_type="motion",
        timestamp=_timestamp(1),
    )
    await repository.create(
        event_id="evt_ancient",
        camera_id="cam_front",
        camera_name="Front Door",
        event_type="motion",
        timestamp=_timestamp(5000),
    )
    assert await repository.count_since(_timestamp(60)) == 1
    deleted = await repository.delete_older_than(_timestamp(1000))
    assert deleted == 1
    assert await repository.get("evt_ancient") is None


async def test_camera_status_update(session: AsyncSession) -> None:
    repository = CameraRepository(session)
    await repository.create(camera_id="cam_front", name="Front Door", rtsp_url="rtsp://localhost/1")
    updated = await repository.set_status("cam_front", "online", fps=15.0)
    assert updated is not None
    assert updated.status == "online"
    assert updated.fps == 15.0
    assert updated.last_seen_at is not None


@pytest.mark.parametrize("missing_id", ["cam_missing"])
async def test_camera_get_missing(session: AsyncSession, missing_id: str) -> None:
    assert await CameraRepository(session).get(missing_id) is None
