"""Integration test chat end-to-end dengan LLM mock."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from jarvis_api.db.repository import CameraRepository, EventRepository


async def _seed_event(session: AsyncSession) -> None:
    await CameraRepository(session).create(
        camera_id="cam_front", name="Front Door", rtsp_url="rtsp://localhost/1"
    )
    await EventRepository(session).create(
        event_id="evt_1",
        camera_id="cam_front",
        camera_name="Front Door",
        event_type="object_detected",
        timestamp=datetime.now(UTC),
        confidence=0.89,
        metadata={"label": "person"},
    )


async def test_chat_uses_tool_and_answers_from_database(
    client: TestClient, session: AsyncSession
) -> None:
    await _seed_event(session)
    response = client.post(
        "/api/v1/chat/messages",
        json={
            "conversation_id": "conv_test",
            "message": "Apakah ada orang di kamera depan dalam 15 menit terakhir?",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["conversation_id"] == "conv_test"
    assert payload["tools_executed"]
    assert payload["tools_executed"][0]["tool_name"] == "get_recent_events"
    assert "Front Door" in payload["reply"]


async def test_chat_history_is_persisted(client: TestClient, session: AsyncSession) -> None:
    await _seed_event(session)
    client.post(
        "/api/v1/chat/messages",
        json={"conversation_id": "conv_hist", "message": "status kamera sekarang"},
    )
    history = client.get("/api/v1/chat/history?conversation_id=conv_hist").json()
    assert history["conversation_id"] == "conv_hist"
    roles = [message["role"] for message in history["messages"]]
    assert "user" in roles
    assert "assistant" in roles


async def test_chat_rejects_empty_message(client: TestClient) -> None:
    response = client.post(
        "/api/v1/chat/messages", json={"conversation_id": "conv_x", "message": ""}
    )
    assert response.status_code == 422


async def test_chat_never_returns_rtsp_credentials(
    client: TestClient, session: AsyncSession
) -> None:
    await _seed_event(session)
    response = client.post(
        "/api/v1/chat/messages",
        json={"conversation_id": "conv_privacy", "message": "tampilkan daftar kamera"},
    )
    assert response.status_code == 200
    assert "rtsp://" not in response.text
    assert "localhost/1" not in response.text
