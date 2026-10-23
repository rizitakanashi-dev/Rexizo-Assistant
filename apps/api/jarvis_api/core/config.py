"""Konfigurasi aplikasi (env-driven).

Seluruh nilai sensitif dibaca dari environment atau file `.env` (yang wajib
di-gitignore). Tidak ada API key, base URL provider, atau nama model yang
di-hardcode di dalam kode.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ToolMode = Literal["auto", "native", "prompt"]
ToolFirstMode = Literal["auto", "always", "never"]


class Settings(BaseSettings):
    """Seluruh konfigurasi runtime JARVIS.

    Tidak ada secret yang di-hardcode: nilai sensitif dibaca dari environment
    atau file `.env` (yang wajib di-gitignore).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="JARVIS_",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "JARVIS"
    version: str = "0.1.0-mvp"
    api_prefix: str = "/api/v1"
    host: str = "127.0.0.1"
    port: int = 8000

    database_url: str = "sqlite+aiosqlite:///./storage/jarvis.db"
    storage_dir: Path = Path("./storage")

    api_key: str | None = None
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # --- Dattio AI (OpenAI-compatible) -------------------------------------
    # Nama env mengikuti ketetapan Main Agent: DATTIO_* (tanpa prefix).
    # Prefix JARVIS_ tetap diterima sebagai alternatif.
    dattio_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATTIO_API_KEY", "JARVIS_DATTIO_API_KEY", "OPENROUTER_API_KEY"),
    )
    dattio_base_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATTIO_BASE_URL", "JARVIS_DATTIO_BASE_URL", "OPENROUTER_BASE_URL"),
    )
    dattio_model: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATTIO_MODEL", "JARVIS_DATTIO_MODEL", "OPENROUTER_MODEL"),
    )
    dattio_tool_mode: ToolMode = Field(
        default="auto",
        validation_alias=AliasChoices("DATTIO_TOOL_MODE", "JARVIS_DATTIO_TOOL_MODE"),
    )
    dattio_temperature: float = Field(
        default=0.2,
        validation_alias=AliasChoices("DATTIO_TEMPERATURE", "JARVIS_DATTIO_TEMPERATURE"),
    )

    # --- Guardrail AI Core -------------------------------------------------
    ai_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("AI_ENABLED", "JARVIS_AI_ENABLED"),
    )
    ai_tools_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("AI_TOOLS_ENABLED", "JARVIS_AI_TOOLS_ENABLED"),
    )
    ai_mutating_tools_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "AI_MUTATING_TOOLS_ENABLED", "JARVIS_AI_MUTATING_TOOLS_ENABLED"
        ),
    )
    ai_tool_first: ToolFirstMode = Field(
        default="auto",
        validation_alias=AliasChoices("AI_TOOL_FIRST", "JARVIS_AI_TOOL_FIRST"),
    )
    ai_max_message_chars: int = Field(
        default=2000,
        validation_alias=AliasChoices("AI_MAX_MESSAGE_CHARS", "JARVIS_AI_MAX_MESSAGE_CHARS"),
    )
    ai_chat_deadline_seconds: float = Field(
        default=60.0,
        validation_alias=AliasChoices(
            "AI_CHAT_DEADLINE_SECONDS", "JARVIS_AI_CHAT_DEADLINE_SECONDS"
        ),
    )

    # --- Resilience LLM ----------------------------------------------------
    llm_timeout_seconds: float = 30.0
    llm_max_tool_iterations: int = 4
    llm_max_retries: int = 2
    llm_retry_backoff_seconds: float = 0.5
    llm_circuit_failures: int = 3
    llm_circuit_cooldown_seconds: float = 30.0

    test_mode: bool = False

    mock_camera_feed: bool = True
    surveillance_enabled: bool = True
    motion_area_threshold_percent: float = 1.0
    min_motion_frames: int = 2
    event_debounce_seconds: float = 10.0
    object_detection_model_path: str | None = None
    object_detection_labels_path: str | None = None
    object_detection_confidence: float = 0.5
    synthetic_fps: float = 10.0
    reconnect_delay_seconds: float = 3.0

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def snapshot_dir(self) -> Path:
        return self.storage_dir / "snapshots"

    @property
    def llm_enabled(self) -> bool:
        """True hanya bila AI aktif dan provider LLM dikonfigurasi lengkap."""
        if self.test_mode or not self.ai_enabled:
            return False
        return bool(self.dattio_api_key and self.dattio_base_url and self.dattio_model)

    @property
    def llm_provider_name(self) -> str:
        return "dattio" if self.llm_enabled else "fake"


@lru_cache
def get_settings() -> Settings:
    return Settings()
