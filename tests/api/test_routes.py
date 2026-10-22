"""Integration test endpoint REST JARVIS."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jarvis_api.core.config import Settings
from jarvis_api.main import create_app


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert payload["version"] == "0.1.0-mvp"
    assert "database" in payload["components"]
    assert payload["components"]["llm_service"] == "not_configured"
    assert payload["mock_mode"] is True


def test_system_status_endpoint(client: TestClient) -> None:
    response = client.get("/api/v1/system/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_cameras"] == 0
    assert payload["active_cameras"] == 0
    assert payload["events_today"] == 0
    assert "cpu_usage_percent" in payload
    assert payload["ai"]["state"] == "not_configured"
    assert payload["ai"]["degraded"] is True


def test_camera_crud_never_exposes_rtsp_url(client: TestClient) -> None:
    assert client.get("/api/v1/cameras").json() == []
    response = client.post(
        "/api/v1/cameras",
        json={
            "id": "cam_front",
            "name": "Front Door",
            "rtsp_url": "rtsp://admin:secret@192.168.1.10:554/stream1",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["id"] == "cam_front"
    assert payload["status"] in {"connecting", "offline", "online", "error"}
    assert "rtsp_url" not in payload
    assert "secret" not in response.text

    listing = client.get("/api/v1/cameras").json()
    assert len(listing) == 1
    assert "rtsp_url" not in listing[0]


def test_camera_creation_rejects_invalid_stream_url(client: TestClient) -> None:
    response = client.post(
        "/api/v1/cameras",
        json={"id": "cam_bad", "name": "Bad", "rtsp_url": "bukan-url"},
    )
    assert response.status_code == 422


def test_camera_creation_rejects_duplicate_id(client: TestClient) -> None:
    payload = {"id": "cam_dup", "name": "Dup", "rtsp_url": "rtsp://localhost/1"}
    assert client.post("/api/v1/cameras", json=payload).status_code == 201
    assert client.post("/api/v1/cameras", json=payload).status_code == 409


def test_events_endpoint_returns_empty_page(client: TestClient) -> None:
    response = client.get("/api/v1/events")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["items"] == []
    assert payload["limit"] == 50


def test_events_endpoint_rejects_out_of_range_limit(client: TestClient) -> None:
    assert client.get("/api/v1/events?limit=999").status_code == 422


def test_event_snapshot_returns_404_when_missing(client: TestClient) -> None:
    assert client.get("/api/v1/events/evt_unknown/snapshot").status_code == 404


def test_camera_snapshot_returns_404_without_worker(client: TestClient) -> None:
    assert client.get("/api/v1/cameras/cam_unknown/snapshot").status_code == 404


def test_api_key_is_required_when_configured(settings: Settings) -> None:
    secured = settings.model_copy(update={"api_key": "rahasia-local"})
    with TestClient(create_app(secured)) as secured_client:
        assert secured_client.get("/api/v1/cameras").status_code == 401
        response = secured_client.get(
            "/api/v1/cameras", headers={"X-JARVIS-API-KEY": "rahasia-local"}
        )
        assert response.status_code == 200
