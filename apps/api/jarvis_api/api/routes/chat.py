"""Endpoint chat dengan asisten AI.

Kontrak mengikuti docs/API-CONTRACTS.md §2.4 (path kanonik `/chat/messages` dan
`/chat/history`) plus tambahan dari delta D-1..D-5: `client_message_id`,
payload `meta`, `tools_executed` yang kaya, endpoint history per percakapan,
dan soft-delete percakapan.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from fastapi import APIRouter, Query, Response, status
from fastapi.responses import JSONResponse

from ...core.errors import ChatError, EnvelopeRoute, ErrorCode
from ...db.repository import ChatRepository
from ...schemas import ChatHistory, ChatHistoryItem, ChatRequest, ChatResponse
from ..deps import ApiKeyDep, ChatServiceDep, SessionDep

router = APIRouter(prefix="/chat", tags=["chat"], route_class=EnvelopeRoute)


@router.post("/messages", response_model=ChatResponse, dependencies=[ApiKeyDep])
@router.post("", response_model=ChatResponse, dependencies=[ApiKeyDep])
async def send_message(
    payload: ChatRequest, session: SessionDep, chat_service: ChatServiceDep
) -> ChatResponse:
    """Kirim pesan teks ke Rexizo dan dapatkan jawaban berbasis data lokal."""
    return await chat_service.send_message(
        session,
        payload.conversation_id,
        payload.message,
        payload.client_message_id,
    )


@router.get("/history", response_model=ChatHistory, dependencies=[ApiKeyDep])
async def chat_history(
    session: SessionDep,
    conversation_id: str = Query(default="conv_default"),
    limit: int = Query(default=30, ge=1, le=200),
) -> ChatHistory:
    """Riwayat percakapan untuk sebuah conversation_id."""
    messages = await ChatRepository(session).history(conversation_id, limit=limit)
    return ChatHistory(
        conversation_id=conversation_id,
        messages=[
            ChatHistoryItem(
                id=message.id,
                role=message.role,
                content=message.content,
                tool_name=message.tool_name,
                created_at=message.created_at,
            )
            for message in messages
        ],
    )


@router.get(
    "/conversations/{conversation_id}/history",
    response_model=ChatHistory,
    dependencies=[ApiKeyDep],
)
async def conversation_history(
    conversation_id: str, session: SessionDep, limit: int = Query(default=30, ge=1, le=200)
) -> ChatHistory:
    """Riwayat percakapan (path per-percakapan sesuai delta D-4)."""
    return await chat_history(session, conversation_id=conversation_id, limit=limit)


@router.delete("/conversations/{conversation_id}", dependencies=[ApiKeyDep])
async def archive_conversation(conversation_id: str, session: SessionDep) -> JSONResponse:
    """Arsipkan percakapan (soft-delete, data tidak dihapus permanen)."""
    archived = await ChatRepository(session).archive_conversation(conversation_id)
    if not archived:
        raise ChatError(
            ErrorCode.NOT_FOUND,
            "Percakapan tidak ditemukan.",
            status_code=status.HTTP_404_NOT_FOUND,
            details={"conversation_id": conversation_id},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"conversation_id": conversation_id, "archived": True},
    )


@router.get("/tts")
async def text_to_speech(
    text: str = Query(..., max_length=1500),
    persona: str = Query(default="nozomi"),
) -> Response:
    """Sintesis audio WAV lokal langsung dari mesin Linux via espeak-ng."""
    clean = re.sub(r"[*_#`~>\[\]()]", " ", text)
    clean = re.sub(r"https?://\S+", "", clean).strip()
    if not clean:
        return Response(content=b"", media_type="audio/wav")

    voice = "id+f3" if persona == "nozomi" else "id+m3"
    pitch = "82" if persona == "nozomi" else "45"
    speed = "145" if persona == "nozomi" else "135"

    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        cmd = ["espeak-ng", "-v", voice, "-p", pitch, "-s", speed, "-w", path, clean[:800]]
        proc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        if proc.returncode == 0 and os.path.exists(path):
            with open(path, "rb") as f:
                data = f.read()
            return Response(content=data, media_type="audio/wav")
    except Exception:
        pass
    finally:
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
    return Response(content=b"", media_type="audio/wav", status_code=status.HTTP_200_OK)
