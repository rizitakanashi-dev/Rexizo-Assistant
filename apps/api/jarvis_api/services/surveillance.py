"""Adapter surveillance untuk sisi API: sinkronisasi kamera, persistensi event, broadcast."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from jarvis_surveillance import CameraSpec, SurveillanceConfig, SurveillanceRuntime
from jarvis_surveillance.detectors import load_labels
from jarvis_surveillance.storage import SnapshotStore

from ..core.config import Settings
from ..db.repository import CameraRepository, EventRepository
from ..db.session import Database
from .broadcaster import EventBroadcaster

logger = logging.getLogger(__name__)


class SurveillanceService:
    """Menjembatani runtime surveillance (thread) dengan FastAPI (asyncio)."""

    def __init__(
        self,
        settings: Settings,
        database: Database,
        broadcaster: EventBroadcaster,
    ) -> None:
        self._settings = settings
        self._database = database
        self._broadcaster = broadcaster
        config = SurveillanceConfig(
            motion_area_threshold_percent=settings.motion_area_threshold_percent,
            min_motion_frames=settings.min_motion_frames,
            debounce_seconds=settings.event_debounce_seconds,
            object_confidence_threshold=settings.object_detection_confidence,
            object_model_path=settings.object_detection_model_path,
            object_labels=load_labels(settings.object_detection_labels_path),
            synthetic_fps=settings.synthetic_fps,
            reconnect_delay_seconds=settings.reconnect_delay_seconds,
        )
        self._store = SnapshotStore(
            Path(settings.snapshot_dir), jpeg_quality=config.snapshot_jpeg_quality
        )
        self._runtime = SurveillanceRuntime(config, self._store)
        self._tasks: list[asyncio.Task] = []
        self._running = False

    @property
    def runtime(self) -> SurveillanceRuntime:
        return self._runtime

    @property
    def snapshot_store(self) -> SnapshotStore:
        return self._store

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        await self.sync_cameras()
        self._tasks = [
            asyncio.create_task(self._consume_events(), name="jarvis-event-consumer"),
            asyncio.create_task(self._consume_statuses(), name="jarvis-status-consumer"),
        ]
        logger.info("Surveillance service aktif")

    async def stop(self) -> None:
        self._running = False
        self._runtime.events.put(None)
        self._runtime.statuses.put(None)
        for task in self._tasks:
            try:
                await asyncio.wait_for(task, timeout=5.0)
            except TimeoutError:
                task.cancel()
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.warning("Error saat menghentikan task surveillance: %s", exc)
        self._tasks = []
        self._runtime.stop()
        logger.info("Surveillance service dihentikan")

    async def sync_cameras(self) -> None:
        """Menyesuaikan worker aktif dengan daftar kamera di database."""
        async with self._database.session() as session:
            repo = CameraRepository(session)
            cameras = await repo.list()
            if not cameras and not self._settings.test_mode and self._settings.mock_camera_feed:
                logger.info("Database kamera kosong — mendaftarkan kamera demo sintetis")
                c1 = await repo.create(
                    camera_id="cam_front",
                    name="Kamera Depan",
                    rtsp_url="rtsp://mock/cam_front",
                    motion_detection_enabled=True,
                    object_detection_enabled=True,
                    is_mock=True,
                )
                c2 = await repo.create(
                    camera_id="cam_backyard",
                    name="Kamera Halaman",
                    rtsp_url="rtsp://mock/cam_backyard",
                    motion_detection_enabled=True,
                    object_detection_enabled=True,
                    is_mock=True,
                )
                cameras = [c1, c2]

            # Auto-register local webcam device if available and not yet registered
            if not self._settings.test_mode:
                device_path = Path("/dev/video0")
                if device_path.exists() and await repo.get("cam_device") is None:
                    logger.info("Perangkat kamera lokal terdeteksi (/dev/video0) — mendaftarkan cam_device")
                    await repo.create(
                        camera_id="cam_device",
                        name="Kamera Device (Webcam)",
                        rtsp_url="/dev/video0",
                        motion_detection_enabled=True,
                        object_detection_enabled=True,
                        is_mock=False,
                    )
                    cameras = await repo.list()
        specs = [
            CameraSpec(
                id=camera.id,
                name=camera.name,
                rtsp_url=camera.rtsp_url,
                is_enabled=camera.is_enabled,
                motion_detection_enabled=camera.motion_detection_enabled,
                object_detection_enabled=camera.object_detection_enabled,
                is_mock=bool(camera.is_mock),
            )
            for camera in cameras
        ]
        self._runtime.sync(specs)

    async def restart_camera(self, camera_id: str) -> bool:
        async with self._database.session() as session:
            camera = await CameraRepository(session).get(camera_id)
            if camera is None:
                return False
            spec = CameraSpec(
                id=camera.id,
                name=camera.name,
                rtsp_url=camera.rtsp_url,
                is_enabled=camera.is_enabled,
                motion_detection_enabled=camera.motion_detection_enabled,
                object_detection_enabled=camera.object_detection_enabled,
                is_mock=bool(camera.is_mock),
            )
        return self._runtime.restart_camera(spec)

    def latest_frame(self, camera_id: str) -> np.ndarray | None:
        return self._runtime.latest_frame(camera_id)

    def frames(self, camera_id: str, fps: float = 8.0):
        return self._runtime.frames(camera_id, fps=fps)

    async def _consume_events(self) -> None:
        while True:
            event = await asyncio.to_thread(self._runtime.events.get)
            if event is None:
                return
            try:
                await self._persist_event(event)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("Gagal menyimpan event %s: %s", event.id, exc)

    async def _consume_statuses(self) -> None:
        while True:
            status = await asyncio.to_thread(self._runtime.statuses.get)
            if status is None:
                return
            camera_id, camera_status, fps, reason = status
            try:
                cam = None
                async with self._database.session() as session:
                    cam = await CameraRepository(session).set_status(camera_id, camera_status, fps)
                name = cam.name if cam else camera_id
                last_seen = (
                    cam.last_seen_at.isoformat().replace("+00:00", "Z")
                    if cam and cam.last_seen_at
                    else None
                )
                is_mock = cam.is_mock if cam else False
                await self._broadcaster.broadcast(
                    {
                        "event": "CAMERA_STATUS",
                        "data": {
                            "camera_id": camera_id,
                            "name": name,
                            "status": camera_status,
                            "fps": fps,
                            "last_seen_at": last_seen,
                            "is_mock": is_mock,
                        },
                    }
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("Gagal memperbarui status kamera %s: %s", camera_id, exc)

    async def _persist_event(self, event: Any) -> None:
        timestamp = datetime.fromtimestamp(event.timestamp, tz=UTC)
        async with self._database.session() as session:
            await EventRepository(session).create(
                event_id=event.id,
                camera_id=event.camera_id,
                camera_name=event.camera_name,
                event_type=event.event_type,
                timestamp=timestamp,
                confidence=event.confidence,
                snapshot_path=event.snapshot_path,
                metadata=event.metadata,
                is_mock=event.is_mock,
            )
        await self._broadcaster.broadcast(
            {
                "event": "NEW_EVENT",
                "data": {
                    "id": event.id,
                    "camera_id": event.camera_id,
                    "camera_name": event.camera_name,
                    "event_type": event.event_type,
                    "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
                    "confidence": event.confidence,
                    "metadata": event.metadata,
                    "snapshot_url": f"/api/v1/events/{event.id}/snapshot",
                    "is_mock": event.is_mock,
                },
            }
        )
