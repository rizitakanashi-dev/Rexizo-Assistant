"""Endpoint chat dengan asisten AI.

Kontrak mengikuti docs/API-CONTRACTS.md §2.4 (path kanonik `/chat/messages` dan
`/chat/history`) plus tambahan dari delta D-1..D-5: `client_message_id`,
payload `meta`, `tools_executed` yang kaya, endpoint history per percakapan,
dan soft-delete percakapan.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, status
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
