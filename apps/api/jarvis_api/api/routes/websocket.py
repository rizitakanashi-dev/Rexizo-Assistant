"""Endpoint WebSocket untuk disseminasi event real-time."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ...services.broadcaster import EventBroadcaster

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])

HEARTBEAT_SECONDS = 30.0


@router.websocket("/ws/events")
async def events_socket(websocket: WebSocket) -> None:
    """Koneksi WebSocket dua arah untuk update event real-time."""
    broadcaster: EventBroadcaster = websocket.app.state.broadcaster
    await broadcaster.connect(websocket)
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
