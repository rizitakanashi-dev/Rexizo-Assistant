"""Broadcaster WebSocket untuk disseminasi event real-time."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class EventBroadcaster:
    """Mengelola koneksi WebSocket dan menyiarkan payload event ke semua client."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)
        logger.info("Client WebSocket terhubung (total=%d)", len(self._clients))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)
        logger.info("Client WebSocket terputus (total=%d)", len(self._clients))

    async def broadcast(self, payload: dict[str, Any]) -> int:
        """Mengirim payload ke semua client; mengembalikan jumlah penerima."""
        async with self._lock:
            clients = list(self._clients)
        delivered = 0
        for client in clients:
            try:
                await client.send_json(payload)
                delivered += 1
            except Exception as exc:
                logger.warning("Gagal mengirim event ke client WebSocket: %s", exc)
                await self.disconnect(client)
        return delivered
