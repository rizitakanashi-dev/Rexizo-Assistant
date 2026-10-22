"""Lapisan repository: satu-satunya akses ke database."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AuditLog, Camera, ChatMessage, Conversation, SurveillanceEvent


def _utcnow() -> datetime:
    return datetime.now(UTC)


class CameraRepository:
    """Akses tabel `cameras`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> list[Camera]:
        result = await self._session.execute(select(Camera).order_by(Camera.name))
        return list(result.scalars().all())

    async def get(self, camera_id: str) -> Camera | None:
        return await self._session.get(Camera, camera_id)

    async def create(
        self,
        camera_id: str,
        name: str,
        rtsp_url: str,
        motion_detection_enabled: bool = True,
        object_detection_enabled: bool = True,
        is_mock: bool = False,
    ) -> Camera:
        camera = Camera(
            id=camera_id,
            name=name,
            rtsp_url=rtsp_url,
            motion_detection_enabled=motion_detection_enabled,
            object_detection_enabled=object_detection_enabled,
            is_mock=is_mock,
            status="connecting",
        )
        self._session.add(camera)
        await self._session.commit()
        await self._session.refresh(camera)
        return camera

    async def set_status(
        self, camera_id: str, status: str, fps: float | None = None
    ) -> Camera | None:
        camera = await self.get(camera_id)
        if camera is None:
            return None
        camera.status = status
        if fps is not None:
            camera.fps = fps
        if status == "online":
            camera.last_seen_at = _utcnow()
        await self._session.commit()
        await self._session.refresh(camera)
        return camera

    async def set_enabled(self, camera_id: str, is_enabled: bool) -> Camera | None:
        camera = await self.get(camera_id)
        if camera is None:
            return None
        camera.is_enabled = is_enabled
        await self._session.commit()
        await self._session.refresh(camera)
        return camera


class EventRepository:
    """Akses tabel `surveillance_events`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        event_id: str,
        camera_id: str,
        camera_name: str,
        event_type: str,
        timestamp: datetime,
        confidence: float | None = None,
        snapshot_path: str | None = None,
        metadata: dict[str, Any] | None = None,
        is_mock: bool = False,
    ) -> SurveillanceEvent:
        event = SurveillanceEvent(
            id=event_id,
            camera_id=camera_id,
            camera_name=camera_name,
            event_type=event_type,
            timestamp=timestamp,
            confidence=confidence,
            snapshot_path=snapshot_path,
            metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
            is_mock=is_mock,
        )
        self._session.add(event)
        await self._session.commit()
        await self._session.refresh(event)
        return event

    async def get(self, event_id: str) -> SurveillanceEvent | None:
        return await self._session.get(SurveillanceEvent, event_id)

    async def query(
        self,
        camera_id: str | None = None,
        event_type: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[int, list[SurveillanceEvent]]:
        filters = []
        if camera_id:
            filters.append(SurveillanceEvent.camera_id == camera_id)
        if event_type:
            filters.append(SurveillanceEvent.event_type == event_type)
        if start_time:
            filters.append(SurveillanceEvent.timestamp >= start_time)
        if end_time:
            filters.append(SurveillanceEvent.timestamp <= end_time)

        count_result = await self._session.execute(
            select(func.count()).select_from(SurveillanceEvent).where(*filters)
        )
        total = int(count_result.scalar_one())
        result = await self._session.execute(
            select(SurveillanceEvent)
            .where(*filters)
            .order_by(SurveillanceEvent.timestamp.desc())
            .limit(limit)
            .offset(offset)
        )
        return total, list(result.scalars().all())

    async def count_since(self, since: datetime) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(SurveillanceEvent)
            .where(SurveillanceEvent.timestamp >= since)
        )
        return int(result.scalar_one())

    async def delete_older_than(self, before: datetime) -> int:
        result = await self._session.execute(
            select(SurveillanceEvent).where(SurveillanceEvent.timestamp < before)
        )
        events = list(result.scalars().all())
        for event in events:
            await self._session.delete(event)
        await self._session.commit()
        return len(events)


class ChatRepository:
    """Akses tabel `conversations` dan `chat_messages`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_conversation(self, conversation_id: str) -> Conversation:
        conversation = await self._session.get(Conversation, conversation_id)
        if conversation is None:
            conversation = Conversation(id=conversation_id, title="Percakapan")
            self._session.add(conversation)
            await self._session.commit()
            await self._session.refresh(conversation)
        return conversation

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_name: str | None = None,
        tool_result: Any | None = None,
        client_message_id: str | None = None,
    ) -> ChatMessage:
        message = ChatMessage(
            id=uuid.uuid4().hex,
            conversation_id=conversation_id,
            role=role,
            content=content,
            tool_calls_json=json.dumps(tool_calls, ensure_ascii=False) if tool_calls else None,
            tool_name=tool_name,
            tool_result_json=(
                json.dumps(tool_result, ensure_ascii=False) if tool_result is not None else None
            ),
            client_message_id=client_message_id,
        )
        self._session.add(message)
        await self._session.commit()
        await self._session.refresh(message)
        return message

    async def history(self, conversation_id: str, limit: int = 30) -> list[ChatMessage]:
        result = await self._session.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
        )
        messages = list(result.scalars().all())
        return list(reversed(messages))

    async def find_by_client_message_id(
        self, conversation_id: str, client_message_id: str
    ) -> ChatMessage | None:
        """Cari pesan user dengan id idempotensi tertentu."""
        result = await self._session.execute(
            select(ChatMessage).where(
                ChatMessage.conversation_id == conversation_id,
                ChatMessage.client_message_id == client_message_id,
            )
        )
        return result.scalars().first()

    async def replay(self, conversation_id: str, client_message_id: str) -> tuple[str, str] | None:
        """Ambil jawaban sebelumnya untuk pesan yang sama (idempotensi).

        Mengembalikan `(reply, message_id)` bila pesan dengan id tersebut sudah
        pernah dijawab, selain itu `None`.
        """
        existing = await self.find_by_client_message_id(conversation_id, client_message_id)
        if existing is None:
            return None
        history = await self.history(conversation_id, limit=200)
        seen = False
        candidate: tuple[str, str] | None = None
        for message in history:
            if message.id == existing.id:
                seen = True
                continue
            if not seen:
                continue
            if message.role == "user":
                break
            if message.role == "assistant" and message.content:
                candidate = (message.content, message.id)
        return candidate

    async def archive_conversation(self, conversation_id: str) -> bool:
        """Soft-delete: tandai percakapan sebagai diarsipkan."""
        conversation = await self._session.get(Conversation, conversation_id)
        if conversation is None:
            return False
        conversation.archived_at = _utcnow()
        await self._session.commit()
        return True


class AuditRepository:
    """Akses tabel `audit_logs`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def log(
        self,
        action: str,
        tool_name: str | None = None,
        parameters: dict[str, Any] | None = None,
        result_summary: str | None = None,
        success: bool = True,
    ) -> AuditLog:
        entry = AuditLog(
            action=action,
            tool_name=tool_name,
            parameters_json=json.dumps(parameters or {}, ensure_ascii=False)
            if parameters
            else None,
            result_summary=result_summary,
            success=success,
        )
        self._session.add(entry)
        await self._session.commit()
        await self._session.refresh(entry)
        return entry
