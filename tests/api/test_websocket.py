"""Integration test disseminasi event lewat WebSocket."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from jarvis_api.main import create_app
from jarvis_surveillance.models import SurveillanceEvent


def _event(camera_id: str = "cam_front") -> SurveillanceEvent:
    return SurveillanceEvent(
        id="evt_ws_1",
        camera_id=camera_id,
        camera_name="Front Door",
        event_type="motion",
        timestamp=time.time(),
        metadata={"motion_area_percent": 8.2},
        is_mock=True,
    )


def test_websocket_receives_new_event(
    surveillance_client: TestClient, app_with_surveillance
) -> None:
    runtime = app_with_surveillance.state.surveillance.runtime
    with surveillance_client.websocket_connect("/ws/events") as websocket:
        runtime.events.put(_event())
        message = websocket.receive_json()
    assert message["event"] == "NEW_EVENT"
    assert message["data"]["id"] == "evt_ws_1"
    assert message["data"]["camera_id"] == "cam_front"
    assert message["data"]["is_mock"] is True
    assert message["data"]["snapshot_url"] == "/api/v1/events/evt_ws_1/snapshot"


def test_websocket_event_is_persisted(
    surveillance_client: TestClient, app_with_surveillance
) -> None:
    runtime = app_with_surveillance.state.surveillance.runtime
    with surveillance_client.websocket_connect("/ws/events") as websocket:
        runtime.events.put(_event("cam_persisted"))
        websocket.receive_json()
    deadline = time.monotonic() + 5
    payload: dict = {}
    while time.monotonic() < deadline:
        payload = surveillance_client.get("/api/v1/events").json()
        if payload["total"]:
            break
        time.sleep(0.1)
    assert payload["total"] == 1
    assert payload["items"][0]["camera_id"] == "cam_persisted"


def test_websocket_heartbeat_pong(surveillance_client: TestClient) -> None:
    with surveillance_client.websocket_connect("/ws/events") as websocket:
        websocket.send_text("ping")
        message = websocket.receive_json()
    assert message["event"] == "PONG"


def test_websocket_auth_required_when_configured(settings) -> None:
    secured_settings = settings.model_copy(
        update={"api_key": "secret123", "surveillance_enabled": True}
    )
    secured_app = create_app(secured_settings)
    with TestClient(secured_app) as client:
        with pytest.raises(WebSocketDisconnect) as exc_info, client.websocket_connect("/ws/events"):
            pass
        assert exc_info.value.code == 1008

        # Query parameter ?api_key=secret123 works
        with client.websocket_connect("/ws/events?api_key=secret123") as ws:
            ws.send_text("ping")
            assert ws.receive_json()["event"] == "PONG"

        # Header x-jarvis-api-key works
        with client.websocket_connect(
            "/ws/events", headers={"X-JARVIS-API-KEY": "secret123"}
        ) as ws:
            ws.send_text("ping")
            assert ws.receive_json()["event"] == "PONG"

        # Header x-rexizo-api-key works
        with client.websocket_connect(
            "/ws/events", headers={"X-REXIZO-API-KEY": "secret123"}
        ) as ws:
            ws.send_text("ping")
            assert ws.receive_json()["event"] == "PONG"


def test_websocket_catchup_since(surveillance_client: TestClient, app_with_surveillance) -> None:
    runtime = app_with_surveillance.state.surveillance.runtime
    runtime.events.put(_event("cam_catchup"))

    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        res = surveillance_client.get("/api/v1/events").json()
        if res["total"]:
            break
        time.sleep(0.05)

    past = (datetime.now(UTC) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    with surveillance_client.websocket_connect(f"/ws/events?since={past}") as websocket:
        message = websocket.receive_json()
        assert message["event"] == "NEW_EVENT"
        assert message["data"]["camera_id"] == "cam_catchup"
        assert message["data"]["snapshot_url"] == "/api/v1/events/evt_ws_1/snapshot"


def test_websocket_broadcasts_camera_status(
    surveillance_client: TestClient, app_with_surveillance
) -> None:
    runtime = app_with_surveillance.state.surveillance.runtime
    with surveillance_client.websocket_connect("/ws/events") as websocket:
        runtime.statuses.put(("cam_front", "reconnecting", 0.0, "stream_dropped"))
        message = websocket.receive_json()
    assert message["event"] == "CAMERA_STATUS"
    assert message["data"]["camera_id"] == "cam_front"
    assert message["data"]["status"] == "reconnecting"
