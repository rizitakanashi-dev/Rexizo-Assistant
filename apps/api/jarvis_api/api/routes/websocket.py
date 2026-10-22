"""Endpoint WebSocket untuk disseminasi event real-time."""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from ...db.models import SurveillanceEvent
from ...services.broadcaster import EventBroadcaster

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])

HEARTBEAT_SECONDS = 30.0
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}


@router.websocket("/ws/events")
async def events_socket(websocket: WebSocket) -> None:
    """Koneksi WebSocket dua arah untuk update event real-time."""
    settings = websocket.app.state.settings
    api_key = websocket.query_params.get("api_key") or websocket.headers.get("x-jarvis-api-key")

    if settings.api_key:
        if not api_key or not hmac.compare_digest(api_key, settings.api_key):
            await websocket.close(code=1008)
            return
    else:
        client_host = websocket.client.host if websocket.client else None
        if client_host not in LOCAL_HOSTS:
            await websocket.close(code=1008)
            return

    broadcaster: EventBroadcaster = websocket.app.state.broadcaster
    await broadcaster.connect(websocket)

    since_str = websocket.query_params.get("since")
    if since_str:
        try:
            clean_since = since_str.strip().replace(" ", "+").replace("Z", "+00:00")
            since_dt = datetime.fromisoformat(clean_since)
            if since_dt.tzinfo is None:
                since_dt = since_dt.replace(tzinfo=UTC)
        except ValueError:
            since_dt = None

        if since_dt:
            try:
                database = websocket.app.state.database
                async with database.session() as session:
                    result = await session.execute(
                        select(SurveillanceEvent)
                        .where(SurveillanceEvent.timestamp > since_dt)
                        .order_by(SurveillanceEvent.timestamp.asc())
                        .limit(200)
                    )
                    catchup_events = list(result.scalars().all())

                for evt in catchup_events:
                    metadata = {}
                    if evt.metadata_json:
                        try:
                            metadata = json.loads(evt.metadata_json)
                        except Exception:
                            metadata = {}
                    snap_url = f"/api/v1/events/{evt.id}/snapshot"
                    iso_ts = evt.timestamp.isoformat().replace("+00:00", "Z")
                    await websocket.send_json(
                        {
                            "event": "NEW_EVENT",
                            "data": {
                                "id": evt.id,
                                "camera_id": evt.camera_id,
                                "camera_name": evt.camera_name,
                                "event_type": evt.event_type,
                                "timestamp": iso_ts,
                                "confidence": evt.confidence,
                                "metadata": metadata,
                                "snapshot_path": snap_url,
                                "snapshot_url": snap_url,
                                "is_mock": evt.is_mock,
                            },
                        }
                    )
            except Exception as exc:
                logger.warning("Gagal mengirim catch-up events pada WS: %s", exc)

    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_text(), timeout=HEARTBEAT_SECONDS
                )
            except TimeoutError:
                await websocket.send_json({"event": "PING"})
                continue
            if message == "ping":
                await websocket.send_json({"event": "PONG"})
    except WebSocketDisconnect:
        logger.info("Client WebSocket menutup koneksi")
    except Exception as exc:
        logger.warning("Kesalahan pada WebSocket events: %s", exc)
    finally:
        await broadcaster.disconnect(websocket)
