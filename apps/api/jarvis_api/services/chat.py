"""Orkestrasi percakapan: pesan user → LLM → tool → jawaban final.

Aturan utama (docs/AI-CORE-DESIGN.md §7):

- Tool-first untuk pertanyaan faktual: fakta hanya boleh berasal dari tool.
- `reply` (narasi LLM) dipisahkan dari `tools_executed[].result` (data otoritatif).
- Deadline keras 60 detik, maksimal 4 ronde, dan fallback jujur bila model
  tetap tidak memakai tool (`stop_reason="no_tool_grounding"`).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import Settings
from ..core.errors import ChatError, ErrorCode
from ..db.repository import AuditRepository, CameraRepository, ChatRepository, EventRepository
from ..schemas import ChatMeta, ChatResponse, ToolExecution
from .llm import LLMProvider, ProviderError
from .metrics import SystemMetricsProvider, build_metrics_provider
from .prompts import build_system_prompt, sanitize_for_llm
from .tools import (
    ToolContext,
    ToolError,
    ToolNotFoundError,
    ToolPermissionError,
    ToolRegistry,
    ToolValidationError,
)

logger = logging.getLogger(__name__)

# Heuristik intent faktual (docs/AI-CORE-DESIGN.md §7.4.1). Menentukan apakah
# orchestrator mewajibkan tool call, bukan apa yang ditanyakan.
FACTUAL_KEYWORDS = re.compile(
    r"\b(kamera|camera|cctv|orang|person|binatang|animal|gerak|motion|event|kejadian|"
    r"status|sistem|system|disk|storage|penyimpanan|memori|memory|cpu|ram|snapshot|"
    r"offline|online|terakhir|recent|login)\b",
    re.IGNORECASE,
)


def requires_grounding(message: str, mode: str = "auto") -> bool:
    """True bila percakapan wajib berpijak pada data tool."""
    if mode == "never":
        return False
    if mode == "always":
        return True
    return bool(FACTUAL_KEYWORDS.search(message))


class ChatService:
    """Menjalankan percakapan multimodal-teks dengan dukungan tool calling."""

    def __init__(
        self,
        llm: LLMProvider,
        registry: ToolRegistry,
        settings: Settings,
        history_limit: int = 10,
        surveillance: Any | None = None,
        metrics: SystemMetricsProvider | None = None,
    ) -> None:
        self._llm = llm
        self._registry = registry
        self._settings = settings
        self._history_limit = history_limit
        self._surveillance = surveillance
        self._metrics = metrics or build_metrics_provider()

    async def send_message(
        self,
        session: AsyncSession,
        conversation_id: str | None,
        message: str,
        client_message_id: str | None = None,
    ) -> ChatResponse:
        """Memproses satu pesan pengguna dan mengembalikan jawaban JARVIS."""
        started = time.perf_counter()
        settings = self._settings

        if not settings.ai_enabled:
            raise ChatError(
                ErrorCode.AI_DISABLED,
                "Asisten AI sedang dinonaktifkan.",
                status_code=503,
            )

        clean_message = sanitize_for_llm((message or "").strip())
        if not clean_message:
            raise ChatError(
                ErrorCode.AI_INVALID_REQUEST,
                "Pesan tidak boleh kosong.",
                status_code=422,
            )
        if len(clean_message) > settings.ai_max_message_chars:
            raise ChatError(
                ErrorCode.AI_INVALID_REQUEST,
                "Pesan terlalu panjang.",
                status_code=422,
                details={"max_chars": settings.ai_max_message_chars},
            )

        chat_repo = ChatRepository(session)
        cameras = CameraRepository(session)
        events = EventRepository(session)
        audit = AuditRepository(session)

        conversation_key = (conversation_id or "").strip() or str(uuid.uuid4())
        await chat_repo.ensure_conversation(conversation_key)

        if client_message_id:
            replay = await chat_repo.replay(conversation_key, client_message_id)
            if replay is not None:
                reply, message_id = replay
                return ChatResponse(
                    conversation_id=conversation_key,
                    message_id=message_id,
                    reply=reply,
                    tools_executed=[],
                    meta=ChatMeta(
                        provider=self._provider_name(),
                        model=self._provider_model(),
                        latency_ms=int((time.perf_counter() - started) * 1000),
                        rounds=0,
                        tool_calls=0,
                        stop_reason="idempotent_replay",
                        degraded=False,
                    ),
                    created_at=datetime.now(UTC),
                )

        await chat_repo.add_message(
            conversation_key,
            "user",
            clean_message,
            client_message_id=client_message_id,
        )

        history = await chat_repo.history(conversation_key, limit=self._history_limit)
        messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt()}]
        for item in history:
            if item.role in {"user", "assistant"}:
                messages.append({"role": item.role, "content": item.content})
            elif item.role == "tool":
                messages.append({
                    "role": "user",
                    "content": f"[Hasil Sistem ({item.tool_name or 'tool'})]: {item.content}",
                })

        tool_schemas = self._tool_schemas()
        context = ToolContext(
            settings=settings,
            cameras=cameras,
            events=events,
            audit=audit,
            surveillance=self._surveillance,
            metrics=self._metrics,
        )

        executed: list[ToolExecution] = []
        reply = ""
        stop_reason = "completed"
        rounds = 0
        degraded = False
        usage: dict[str, Any] = {}
        force_tool = requires_grounding(clean_message, settings.ai_tool_first)
        forced_retry_done = False

        try:
            async with asyncio.timeout(settings.ai_chat_deadline_seconds):
                for round_index in range(max(1, settings.llm_max_tool_iterations)):
                    rounds = round_index + 1
                    tool_choice = "required" if force_tool and round_index == 0 else None
                    response = await self._call_llm(messages, tool_schemas, tool_choice)

                    if not response.tool_calls:
                        if force_tool and round_index == 0 and not forced_retry_done:
                            # Model mengabaikan kewajiban tool: coba sekali lagi
                            # dengan tool_choice eksplisit, lalu jujur bila tetap gagal.
                            forced_retry_done = True
                            messages.append(
                                {
                                    "role": "user",
                                    "content": (
                                        "Gunakan satu tool yang tersedia untuk menjawab "
                                        "pertanyaan ini, lalu jawab berdasarkan hasilnya."
                                    ),
                                }
                            )
                            continue
                        reply = response.content or ""
                        if force_tool and not executed:
                            stop_reason = "no_tool_grounding"
                            reply = self._honest_fallback(reply)
                        await chat_repo.add_message(conversation_key, "assistant", reply)
                        if isinstance(response.usage, dict) and response.usage:
                            usage = response.usage
                        break

                    if isinstance(response.usage, dict) and response.usage:
                        usage = response.usage

                    messages.append(
                        {
                            "role": "assistant",
                            "content": response.content,
                            "tool_calls": [
                                {
                                    "id": call.id,
                                    "type": "function",
                                    "function": {
                                        "name": call.name,
                                        "arguments": json.dumps(call.arguments, ensure_ascii=False),
                                    },
                                }
                                for call in response.tool_calls
                            ],
                        }
                    )
                    await chat_repo.add_message(
                        conversation_key,
                        "assistant",
                        response.content or "",
                        tool_calls=[
                            {"name": call.name, "arguments": call.arguments}
                            for call in response.tool_calls
                        ],
                    )

                    for call in response.tool_calls:
                        tool_message, execution = await self._run_tool(call, context)
                        messages.append(tool_message)
                        executed.append(execution)
                        await chat_repo.add_message(
                            conversation_key,
                            "tool",
                            tool_message["content"],
                            tool_name=execution.name,
                            tool_result=execution.result,
                        )
                else:
                    stop_reason = "max_rounds"
                    reply = (
                        "Percakapan mencapai batas jumlah pemanggilan tool. "
                        "Sederhanakan pertanyaan Anda atau periksa status sistem."
                    )
                    await chat_repo.add_message(conversation_key, "assistant", reply)
        except TimeoutError as exc:
            raise ChatError(
                ErrorCode.AI_TIMEOUT,
                "Waktu pemrosesan percakapan habis (deadline).",
                status_code=504,
                details={"deadline_seconds": settings.ai_chat_deadline_seconds},
            ) from exc
        except ProviderError as exc:
            logger.error("Provider LLM gagal: %s", exc)
            if exc.kind == "rate_limited":
                raise ChatError(
                    ErrorCode.AI_RATE_LIMITED,
                    "Provider AI sedang membatasi permintaan. Coba lagi sebentar.",
                    status_code=429,
                ) from exc
            if exc.kind in {"timeout"}:
                raise ChatError(
                    ErrorCode.AI_TIMEOUT,
                    "Provider AI tidak merespons tepat waktu.",
                    status_code=504,
                ) from exc
            degraded = True
            raise ChatError(
                ErrorCode.AI_PROVIDER_ERROR,
                "Penyedia AI sedang bermasalah. Silakan coba lagi.",
                status_code=502,
                details={"kind": exc.kind},
            ) from exc

        message_id = str(uuid.uuid4())
        return ChatResponse(
            conversation_id=conversation_key,
            message_id=message_id,
            reply=reply,
            tools_executed=executed,
            meta=ChatMeta(
                provider=self._provider_name(),
                model=self._provider_model(),
                latency_ms=int((time.perf_counter() - started) * 1000),
                rounds=rounds,
                tool_calls=len(executed),
                stop_reason=stop_reason,
                degraded=degraded,
                usage=usage,
            ),
            created_at=datetime.now(UTC),
        )

    def _tool_schemas(self) -> list[dict[str, Any]]:
        if not self._settings.ai_tools_enabled:
            return []
        include_mutating = self._settings.ai_mutating_tools_enabled
        return self._registry.schemas(include_mutating=include_mutating)

    async def _call_llm(
        self,
        messages: list[dict[str, Any]],
        tool_schemas: list[dict[str, Any]],
        tool_choice: str | None,
    ) -> Any:
        return await self._llm.complete(messages, tool_schemas, tool_choice)

    def _provider_name(self) -> str:
        return str(getattr(self._llm, "name", "unknown"))

    def _provider_model(self) -> str | None:
        model = getattr(self._llm, "model", None)
        return str(model) if model else None

    @staticmethod
    def _honest_fallback(reply: str) -> str:
        """Jawaban non-klaim bila model tetap tidak memakai tool."""
        if reply and not any(
            word in reply.lower() for word in ("tidak ada data", "tidak tersedia")
        ):
            return (
                "Saya tidak memiliki data tool untuk memverifikasi pertanyaan itu, jadi saya "
                "tidak bisa menyatakan jawaban secara faktual."
            )
        return reply

    async def _run_tool(
        self, call: Any, context: ToolContext
    ) -> tuple[dict[str, Any], ToolExecution]:
        allow_mutating = self._settings.ai_mutating_tools_enabled
        try:
            result = await asyncio.wait_for(
                self._registry.execute(
                    call.name, call.arguments, context, allow_mutating=allow_mutating
                ),
                timeout=25.0,
            )
        except TimeoutError:
            logger.warning("Tool '%s' timeout (>25s)", call.name)
            status = "timeout"
            msg = f"Tool '{call.name}' melebihi batas waktu eksekusi (25 detik)"
            content = json.dumps({"error": msg}, ensure_ascii=False)
            return (
                {"role": "tool", "tool_call_id": call.id, "name": call.name, "content": content},
                ToolExecution(
                    name=call.name,
                    tool_name=call.name,
                    status=status,
                    duration_ms=25000,
                    parameters=call.arguments or {},
                    result=None,
                    result_summary=f"timeout: {msg}",
                    error=msg,
                ),
            )
        except ToolError as exc:
            logger.warning("Tool '%s' gagal: %s", call.name, exc)
            if isinstance(exc, ToolValidationError):
                status = "invalid_arguments"
            elif _is_denied(exc):
                status = "denied"
            else:
                status = "error"
            content = json.dumps({"error": str(exc)}, ensure_ascii=False)
            return (
                {"role": "tool", "tool_call_id": call.id, "name": call.name, "content": content},
                ToolExecution(
                    name=call.name,
                    tool_name=call.name,
                    status=status,
                    duration_ms=0,
                    parameters=call.arguments or {},
                    result=None,
                    result_summary=f"{status}: {exc}",
                    error=str(exc),
                ),
            )
        except ProviderError as exc:  # pragma: no cover - protektor tambahan
            logger.error("Kesalahan LLM saat menjalankan tool: %s", exc)
            content = json.dumps({"error": str(exc)}, ensure_ascii=False)
            return (
                {"role": "tool", "tool_call_id": call.id, "name": call.name, "content": content},
                ToolExecution(
                    name=call.name,
                    tool_name=call.name,
                    status="error",
                    duration_ms=0,
                    parameters=call.arguments or {},
                    result=None,
                    result_summary=f"error: {exc}",
                    error=str(exc),
                ),
            )
        return (
            {
                "role": "tool",
                "tool_call_id": call.id,
                "name": result.tool_name,
                "content": result.to_content(),
            },
            ToolExecution(
                name=result.tool_name,
                tool_name=result.tool_name,
                status=result.status,
                duration_ms=result.duration_ms,
                parameters=result.parameters,
                result=result.payload,
                result_summary=result.summary,
            ),
        )


def _is_denied(exc: Exception) -> bool:
    """True bila tool ditolak karena allowlist atau izin, bukan karena bug."""
    return isinstance(exc, (ToolNotFoundError, ToolPermissionError))
