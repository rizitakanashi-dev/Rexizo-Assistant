"""Test suite AI Core: orchestrator, tool registry, provider, dan kontrak chat.

Semua test berjalan offline memakai FakeProvider (tanpa API key dan tanpa
jaringan), sesuai ketetapan Main Agent.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from jarvis_api.core.config import Settings
from jarvis_api.db.repository import CameraRepository, EventRepository
from jarvis_api.db.session import Database
from jarvis_api.main import create_app
from jarvis_api.services.llm import (
    DattioProvider,
    FakeProvider,
    LLMResponse,
    ProviderError,
    parse_tool_call_from_text,
)
from jarvis_api.services.tools import ToolRegistry, register_builtin_tools


@pytest.fixture
def make_client(tmp_path):
    """Membuat TestClient dengan konfigurasi khusus per test."""
    clients: list[TestClient] = []

    def _make(**overrides: Any) -> TestClient:
        index = len(clients)
        base: dict[str, Any] = {
            "_env_file": None,
            "database_url": f"sqlite+aiosqlite:///{tmp_path / f'ai_core_{index}.db'}",
            "storage_dir": tmp_path / f"storage_{index}",
            "test_mode": True,
            "surveillance_enabled": False,
            "api_key": None,
        }
        base.update(overrides)
        settings = Settings(**base)
        client = TestClient(create_app(settings))
        clients.append(client)
        client.__enter__()
        return client

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


async def _seed(session: AsyncSession) -> None:
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


@pytest.fixture
async def seeded_db(tmp_path) -> Database:
    db = Database(f"sqlite+aiosqlite:///{tmp_path / 'seeded.db'}")
    await db.create_all()
    async with db.session() as session:
        await _seed(session)
    yield db
    await db.dispose()


# --- Orchestrator ---------------------------------------------------------


def test_factual_question_triggers_tool_call(make_client) -> None:
    client = make_client()
    response = client.post(
        "/api/v1/chat/messages",
        json={"conversation_id": "conv_1", "message": "ada orang di kamera depan?"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["tools_executed"]
    assert payload["tools_executed"][0]["name"] == "get_recent_events"
    assert payload["tools_executed"][0]["status"] == "ok"
    assert payload["meta"]["stop_reason"] == "completed"
    assert payload["meta"]["tool_calls"] == 1


def test_non_factual_question_does_not_call_tool(make_client) -> None:
    client = make_client()
    payload = client.post(
        "/api/v1/chat/messages",
        json={"conversation_id": "conv_2", "message": "halo, apa kabar?"},
    ).json()
    assert payload["tools_executed"] == []


def test_tool_first_always_forces_tool(make_client) -> None:
    client = make_client(ai_tool_first="always")
    payload = client.post(
        "/api/v1/chat/messages",
        json={"conversation_id": "conv_3", "message": "halo, apa kabar?"},
    ).json()
    assert payload["tools_executed"]
    assert payload["meta"]["stop_reason"] == "completed"


def test_no_tool_grounding_fallback_is_honest(make_client) -> None:
    """Bila model tidak pernah memakai tool, jawaban harus non-klaim."""

    class SilentProvider(FakeProvider):
        async def complete(self, messages, tools=None, tool_choice=None):  # type: ignore[no-untyped-def]
            self.calls.append({"messages": messages})
            return LLMResponse(content="Pasti ada orang di depan pintu.")

    client = make_client()
    app = client.app
    app.state.llm = SilentProvider()
    app.state.chat_service._llm = SilentProvider()

    payload = client.post(
        "/api/v1/chat/messages",
        json={"conversation_id": "conv_4", "message": "ada orang di kamera depan?"},
    ).json()
    assert payload["meta"]["stop_reason"] == "no_tool_grounding"
    assert "tidak memiliki data tool" in payload["reply"].lower()


def test_conversation_id_is_generated_when_missing(make_client) -> None:
    import uuid

    client = make_client()
    payload = client.post(
        "/api/v1/chat/messages", json={"message": "status sistem sekarang"}
    ).json()
    assert uuid.UUID(payload["conversation_id"])
    history = client.get(f"/api/v1/chat/conversations/{payload['conversation_id']}/history")
    assert history.status_code == 200
    assert history.json()["conversation_id"] == payload["conversation_id"]


def test_client_message_id_is_idempotent(make_client) -> None:
    client = make_client()
    body = {
        "conversation_id": "conv_idem",
        "message": "ada orang di kamera depan?",
        "client_message_id": "cm-1",
    }
    first = client.post("/api/v1/chat/messages", json=body).json()
    second = client.post("/api/v1/chat/messages", json=body).json()
    assert second["meta"]["stop_reason"] == "idempotent_replay"
    assert second["reply"] == first["reply"]
    history = client.get("/api/v1/chat/history?conversation_id=conv_idem").json()
    user_messages = [m for m in history["messages"] if m["role"] == "user"]
    assert len(user_messages) == 1


def test_message_limit_is_enforced(make_client) -> None:
    client = make_client()
    response = client.post("/api/v1/chat/messages", json={"message": "a" * 2001})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "AI_INVALID_REQUEST"


def test_error_envelope_shape(make_client) -> None:
    client = make_client()
    response = client.post("/api/v1/chat/messages", json={"message": ""})
    assert response.status_code == 422
    body = response.json()
    assert set(body["error"]) == {"code", "message", "details"}


def test_ai_disabled_returns_ai_disabled(make_client) -> None:
    client = make_client(ai_enabled=False)
    response = client.post("/api/v1/chat/messages", json={"message": "halo"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_DISABLED"


def test_delete_conversation_archives_softly(make_client) -> None:
    client = make_client()
    client.post("/api/v1/chat/messages", json={"conversation_id": "conv_del", "message": "halo"})
    deleted = client.delete("/api/v1/chat/conversations/conv_del")
    assert deleted.status_code == 200
    assert deleted.json()["archived"] is True
    missing = client.delete("/api/v1/chat/conversations/conv_unknown")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"


def test_status_exposes_ai_block(make_client) -> None:
    client = make_client()
    payload = client.get("/api/v1/system/status").json()
    assert payload["ai"]["provider"] == "fake"
    assert payload["ai"]["enabled"] is True


def test_chat_endpoint_alias_path(make_client) -> None:
    client = make_client()
    response = client.post("/api/v1/chat", json={"message": "halo"})
    assert response.status_code == 200
    assert response.json()["reply"]


# --- Tool registry --------------------------------------------------------


def test_alias_resolves_to_canonical_name() -> None:
    registry = register_builtin_tools(ToolRegistry())
    assert registry.canonical_name("list_cameras") == "get_camera_list"
    assert registry.get("list_cameras") is registry.get("get_camera_list")


def test_mutating_tools_are_not_exposed_to_llm() -> None:
    registry = register_builtin_tools(ToolRegistry())
    names = {schema["function"]["name"] for schema in registry.schemas()}
    assert "get_camera_list" in names
    assert "search_events" in names
    assert "restart_camera_stream" not in names
    assert "delete_event_history" not in names

    with_mutating = {schema["function"]["name"] for schema in registry.schemas(True)}
    assert "delete_event_history" in with_mutating


async def test_search_events_matches_keyword(session: AsyncSession, settings: Settings) -> None:
    await _seed(session)
    registry = register_builtin_tools(ToolRegistry())
    from jarvis_api.db.repository import AuditRepository
    from jarvis_api.db.repository import CameraRepository as Cameras
    from jarvis_api.services.tools import ToolContext

    context = ToolContext(
        settings=settings,
        cameras=Cameras(session),
        events=EventRepository(session),
        audit=AuditRepository(session),
    )
    result = await registry.execute("search_events", {"query": "person"}, context)
    assert result.payload
    assert result.payload[0]["camera_name"] == "Front Door"

    kosong = await registry.execute("search_events", {"query": "kucing"}, context)
    assert kosong.payload == []


async def test_system_status_tool_uses_metrics_provider(
    session: AsyncSession, settings: Settings
) -> None:
    from jarvis_api.db.repository import AuditRepository
    from jarvis_api.db.repository import CameraRepository as Cameras
    from jarvis_api.services.metrics import StaticMetricsProvider, SystemMetrics
    from jarvis_api.services.tools import ToolContext

    registry = register_builtin_tools(ToolRegistry())
    context = ToolContext(
        settings=settings,
        cameras=Cameras(session),
        events=EventRepository(session),
        audit=AuditRepository(session),
        metrics=StaticMetricsProvider(
            SystemMetrics(cpu_usage_percent=12.5, memory_usage_percent=34.0, disk_free_gb=99.0)
        ),
    )
    result = await registry.execute("get_system_status", {}, context)
    assert result.status == "ok"
    payload = result.payload
    assert payload["cpu_usage_percent"] == 12.5
    assert payload["memory_usage_percent"] == 34.0
    assert payload["disk_free_gb"] == 99.0


# --- Provider -------------------------------------------------------------


def test_parse_tool_call_from_text_handles_fenced_json() -> None:
    call = parse_tool_call_from_text('```tool_call {"tool": "get_camera_list", "arguments": {}}```')
    assert call is not None
    assert call.name == "get_camera_list"


def test_parse_tool_call_from_plain_json() -> None:
    call = parse_tool_call_from_text('{"tool": "get_system_status", "arguments": {}}')
    assert call is not None
    assert call.name == "get_system_status"


def test_parse_tool_call_returns_none_for_prose() -> None:
    assert parse_tool_call_from_text("Halo, apa kabar?") is None


async def test_dattio_provider_maps_auth_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    provider = DattioProvider(
        base_url="https://dattio.invalid/v1",
        api_key="k",
        model="m",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(ProviderError) as excinfo:
        await provider.complete([{"role": "user", "content": "halo"}])
    assert excinfo.value.kind == "auth"
    assert excinfo.value.retryable is False


async def test_dattio_provider_retries_on_rate_limit() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, json={"error": "slow down"})
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "halo"}}], "usage": {}}
        )

    provider = DattioProvider(
        base_url="https://dattio.invalid/v1",
        api_key="k",
        model="m",
        backoff=0.01,
        transport=httpx.MockTransport(handler),
    )
    response = await provider.complete([{"role": "user", "content": "halo"}])
    assert response.content == "halo"
    assert calls["n"] == 2


async def test_dattio_provider_passes_native_tools() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = __import__("json").loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    provider = DattioProvider(
        base_url="https://dattio.invalid/v1",
        api_key="k",
        model="m",
        tool_mode="native",
        transport=httpx.MockTransport(handler),
    )
    tools = [
        {
            "type": "function",
            "function": {"name": "get_camera_list", "description": "daftar kamera"},
        }
    ]
    await provider.complete([{"role": "user", "content": "halo"}], tools, "required")
    assert captured["payload"]["tools"][0]["function"]["name"] == "get_camera_list"
    assert captured["payload"]["tool_choice"] == "required"


async def test_dattio_provider_downgrades_to_prompt_mode() -> None:
    captured: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = __import__("json").loads(request.content)
        captured.append(payload)
        if "tools" in payload:
            return httpx.Response(400, json={"error": "tools not supported"})
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": '```tool_call {"tool": "get_camera_list"}```'}}]
            },
        )

    provider = DattioProvider(
        base_url="https://dattio.invalid/v1",
        api_key="k",
        model="m",
        tool_mode="auto",
        transport=httpx.MockTransport(handler),
    )
    tools = [
        {
            "type": "function",
            "function": {"name": "get_camera_list", "description": "daftar kamera"},
        }
    ]
    response = await provider.complete([{"role": "user", "content": "halo"}], tools)
    assert len(captured) == 2
    assert "tools" not in captured[1]
    assert response.tool_calls[0].name == "get_camera_list"
