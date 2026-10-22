"""Endpoint manajemen kamera dan streaming."""

from __future__ import annotations

import asyncio
import re

import cv2
import fastapi
from fastapi import APIRouter, HTTPException, Response, status

from ...db.repository import CameraRepository
from ...schemas import CameraCreate, CameraStatus
from ..deps import ApiKeyDep, SessionDep, SurveillanceDep

router = APIRouter(prefix="/cameras", tags=["cameras"])

_RTSP_PATTERN = re.compile(r"^(rtsp|rtmp|http|https)://[^\s/]+", re.IGNORECASE)


def _to_schema(camera) -> CameraStatus:
    return CameraStatus(
        id=camera.id,
        name=camera.name,
        is_enabled=camera.is_enabled,
        status=camera.status,
        fps=camera.fps,
        last_seen_at=camera.last_seen_at,
        stream_url_preview=f"/api/v1/cameras/{camera.id}/stream",
        snapshot_url=f"/api/v1/cameras/{camera.id}/snapshot",
    )


@router.get("", response_model=list[CameraStatus], dependencies=[ApiKeyDep])
async def list_cameras(session: SessionDep) -> list[CameraStatus]:
    """Daftar kamera terdaftar. URL RTSP tidak pernah dikembalikan."""
    cameras = await CameraRepository(session).list()
    return [_to_schema(camera) for camera in cameras]


@router.post(
    "",
    response_model=CameraStatus,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ApiKeyDep],
)
async def create_camera(
    payload: CameraCreate, session: SessionDep, surveillance: SurveillanceDep
) -> CameraStatus:
    """Mendaftarkan kamera baru. Kredensial RTSP disimpan hanya di sisi backend."""
    if not _RTSP_PATTERN.match(payload.rtsp_url):
        raise HTTPException(
            status_code=422,
            detail="Format URL stream tidak valid (butuh scheme rtsp/rtmp/http)",
        )
    repository = CameraRepository(session)
    if await repository.get(payload.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Kamera '{payload.id}' sudah ada"
        )
    camera = await repository.create(
        camera_id=payload.id,
        name=payload.name,
        rtsp_url=payload.rtsp_url,
        motion_detection_enabled=payload.motion_detection_enabled,
        object_detection_enabled=payload.object_detection_enabled,
        is_mock=False,
    )
    await surveillance.sync_cameras()
    return _to_schema(camera)


@router.get("/{camera_id}/snapshot", dependencies=[ApiKeyDep])
async def camera_snapshot(camera_id: str, surveillance: SurveillanceDep) -> Response:
    """Snapshot JPEG terkini langsung dari frame terakhir worker."""
    frame = surveillance.latest_frame(camera_id)
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Belum ada frame tersedia untuk kamera ini",
        )
    success, buffer = cv2.imencode(".jpg", frame)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Gagal encode snapshot"
        )
    return Response(content=buffer.tobytes(), media_type="image/jpeg")


@router.get("/{camera_id}/stream", dependencies=[ApiKeyDep])
async def camera_stream(
    camera_id: str, surveillance: SurveillanceDep
) -> fastapi.responses.StreamingResponse:
    """Stream MJPEG langsung dari frame worker kamera."""
    if surveillance.runtime.worker_status(camera_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak aktif")

    async def frame_generator():
        while True:
            frame = surveillance.latest_frame(camera_id)
            if frame is not None:
                success, buffer = cv2.imencode(".jpg", frame)
                if success:
                    yield (
                        b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
                    )
            await asyncio.sleep(0.1)

    return fastapi.responses.StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )
