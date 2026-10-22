"""Definisi tool: schema input, risiko, dan handler."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict

from ...core.config import Settings
from ...db.repository import AuditRepository, CameraRepository, EventRepository
from ..metrics import SystemMetricsProvider


class ToolRisk(StrEnum):
    """Tingkat risiko tool sesuai docs/SECURITY.md."""

    SAFE = "safe"
    MUTATING = "mutating"
    DESTRUCTIVE = "destructive"


@dataclass
class ToolContext:
    """Dependensi yang boleh diakses handler tool."""

    settings: Settings
    cameras: CameraRepository
    events: EventRepository
    audit: AuditRepository
    surveillance: Any | None = None
    metrics: SystemMetricsProvider | None = None


class EmptyParams(BaseModel):
    """Parameter kosong untuk tool tanpa argumen."""

    model_config = ConfigDict(extra="forbid")


@dataclass
class ToolSpec:
    """Satu tool yang terdaftar di `ToolRegistry`."""

    name: str
    description: str
    parameters: type[BaseModel]
    handler: Callable[[BaseModel, ToolContext], Awaitable[Any]]
    risk: ToolRisk = ToolRisk.SAFE
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)

    @property
    def is_read_only(self) -> bool:
        """True bila tool aman dipanggil tanpa konfirmasi eksplisit."""
        return self.risk is ToolRisk.SAFE

    def openai_schema(self) -> dict[str, Any]:
        """Konversi ke format fungsi OpenAI-compatible."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters.model_json_schema(),
            },
        }
