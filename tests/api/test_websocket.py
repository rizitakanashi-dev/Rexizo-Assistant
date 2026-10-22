"""Integration test disseminasi event lewat WebSocket."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

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
