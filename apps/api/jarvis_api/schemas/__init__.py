"""Skema Pydantic untuk API publik (sesuai docs/API-CONTRACTS.md)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

MAX_MESSAGE_CHARS = 2000


class CameraStatus(BaseModel):
    id: str
    name: str
    is_enabled: bool
    status: str = Field(description="online | offline | connecting | error")
    fps: float | None = None
    last_seen_at: datetime | None = None
    stream_url_preview: str
    snapshot_url: str


class CameraCreate(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    rtsp_url: str = Field(min_length=1, max_length=512)
    motion_detection_enabled: bool = True
    object_detection_enabled: bool = True


class EventItem(BaseModel):
    id: str
    camera_id: str
    camera_name: str
    event_type: str
    timestamp: datetime
    confidence: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    snapshot_path: str | None = None
    is_mock: bool = False


class EventPage(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[EventItem]


class ChatRequest(BaseModel):
    conversation_id: str | None = Field(default=None, max_length=64)
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    client_message_id: str | None = Field(default=None, max_length=64)


class ToolExecution(BaseModel):
    """Satu eksekusi tool.

    `name`, `status`, `duration_ms`, dan `result` adalah bentuk baru (D-2);
    `tool_name`, `parameters`, dan `result_summary` dipertahankan agar kontrak
    lama di docs/API-CONTRACTS.md §2.4 tetap kompatibel.
    """

    name: str
    tool_name: str
    status: str = Field(default="ok", description="ok | error | denied")
    duration_ms: int = 0
    parameters: dict[str, Any] = Field(default_factory=dict)
    result: Any | None = None
    result_summary: str = ""
    error: str | None = None


class ChatMeta(BaseModel):
    """Metadata diagnostik percakapan."""

    provider: str
    model: str | None = None
    latency_ms: int = 0
    rounds: int = 0
    tool_calls: int = 0
    stop_reason: str = "completed"
    degraded: bool = False
    usage: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    reply: str
    tools_executed: list[ToolExecution] = Field(default_factory=list)
    meta: ChatMeta = Field(default_factory=lambda: ChatMeta(provider="unknown"))
    created_at: datetime


class ChatHistoryItem(BaseModel):
    id: str
    role: str
    content: str
    tool_name: str | None = None
    created_at: datetime


class ChatHistory(BaseModel):
    conversation_id: str
    messages: list[ChatHistoryItem]


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: float
    components: dict[str, str]


class SystemStatus(BaseModel):
    cpu_usage_percent: float
    memory_usage_percent: float
    disk_free_gb: float
    active_cameras: int
    total_cameras: int
    events_today: int
    ai: dict[str, Any] = Field(default_factory=dict)
