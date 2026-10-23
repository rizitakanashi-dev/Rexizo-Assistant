"""Provider LLM: Dattio AI (OpenAI-compatible) dan FakeProvider offline.

Aturan yang dijaga modul ini:

- Tidak ada base URL, model, atau API key yang di-hardcode; semuanya lewat env.
- Mode tool-calling ganda (`native` dan `prompt`) karena dukungan function-calling
  di katalog Dattio tidak seragam antar model.
- Kegagalan provider dipetakan ke `ProviderError` dengan `kind` yang stabil
  supaya lapisan HTTP bisa memetakan ke error envelope yang konsisten.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from ..core.sanitize import sanitize_text

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


class ProviderError(RuntimeError):
    """Kegagalan memanggil provider LLM."""

    def __init__(
        self,
        message: str,
        kind: str = "upstream",
        retryable: bool = False,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.retryable = retryable
        self.status_code = status_code


# Alias kompatibilitas dengan implementasi sebelumnya.
LLMError = ProviderError


@dataclass
class ToolCall:
    """Permintaan pemanggilan tool dari LLM."""

    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    """Balasan model: teks dan/atau tool call."""

    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    usage: dict[str, Any] = field(default_factory=dict)

    @property
    def has_tool_calls(self) -> bool:
        return bool(self.tool_calls)


class LLMProvider(Protocol):
    """Kontrak provider LLM yang dipakai orchestrator."""

    name: str

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | None = None,
    ) -> LLMResponse: ...


# Alias kompatibilitas.
LLMClient = LLMProvider


_TOOL_CALL_BLOCK = re.compile(
    r"```(?:tool_call|json)?\s*(\{.*?\})\s*```",
    re.DOTALL | re.IGNORECASE,
)


def parse_tool_call_from_text(content: str) -> ToolCall | None:
    """Ambil satu tool call dari teks model (mode prompt).

    Bentuk yang diterima:
    - blok ```tool_call {"tool": "get_camera_list", "arguments": {}}```
    - JSON mentah di dalam ``` ``` ``` atau di teks biasa.
    """
    if not content:
        return None
    candidates: list[str] = []
    for match in _TOOL_CALL_BLOCK.finditer(content):
        candidates.append(match.group(1))
    stripped = content.strip()
    if stripped.startswith("{"):
        candidates.append(stripped)
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        name = data.get("tool") or data.get("name") or data.get("tool_name")
        if not name:
            continue
        arguments = data.get("arguments") or data.get("parameters") or data.get("args") or {}
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                arguments = {}
        if not isinstance(arguments, dict):
            arguments = {}
        return ToolCall(
            id=str(data.get("id") or "call_prompt_0"), name=str(name), arguments=arguments
        )
    return None


class DattioProvider:
    """Klien HTTP untuk Dattio AI dengan API kompatibel OpenAI.

    Hanya metadata terstruktur (label objek, keyakinan, timestamp, nama kamera)
    yang dikirim keluar. Snapshot dan frame video tidak pernah dikirim.
    """

    name = "dattio"

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 30.0,
        tool_mode: str | None = None,
        max_retries: int = 2,
        backoff: float = 0.5,
        circuit_failures: int = 3,
        circuit_cooldown: float = 30.0,
        temperature: float = 0.2,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        resolved_mode = tool_mode or os.environ.get("DATTIO_TOOL_MODE", "auto")
        self._tool_mode = resolved_mode if resolved_mode in {"auto", "native", "prompt"} else "auto"
        self._max_retries = max(0, max_retries)
        self._backoff = backoff
        self._circuit_failures = circuit_failures
        self._circuit_cooldown = circuit_cooldown
        self._temperature = temperature
        self._transport = transport
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0
        self._native_supported = True

    @property
    def model(self) -> str:
        return self._model

    @property
    def tool_mode(self) -> str:
        if self._tool_mode == "auto":
            return "native" if self._native_supported else "prompt"
        return self._tool_mode

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | None = None,
    ) -> LLMResponse:
        self._ensure_circuit_closed()
        payload = self._build_payload(messages, tools, tool_choice)
        try:
            data = await self._post_with_retry(payload)
        except ProviderError as exc:
            if exc.kind == "unsupported_tools" and self._tool_mode == "auto":
                # Provider menolak tool calling native: turun ke mode prompt.
                payload = self._build_payload(messages, tools, tool_choice)
                data = await self._post_with_retry(payload)
            else:
                self._consecutive_failures += 1
                raise exc
        self._consecutive_failures = 0
        return self._parse(data)

    def _build_payload(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        tool_choice: str | None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": list(messages),
            "temperature": self._temperature,
            "stream": False,
        }
        if tools and self.tool_mode == "native":
            payload["tools"] = tools
            if tool_choice:
                payload["tool_choice"] = tool_choice
        elif tools and self.tool_mode == "prompt":
            payload["messages"] = self._inject_tool_instructions(messages, tools)
        return payload

    @staticmethod
    def _inject_tool_instructions(
        messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        catalog = "\n".join(
            f"- {tool['function']['name']}: {tool['function']['description']}" for tool in tools
        )
        instruction = (
            "Kamu boleh memakai tool berikut:\n"
            f"{catalog}\n"
            "Jika tool dibutuhkan, balas PERSIS dengan satu blok JSON "
            '```tool_call {"tool": "nama_tool", "arguments": {}}``` dan tanpa teks lain. '
            "Jika tidak ada tool yang dibutuhkan, balas langsung dalam bahasa biasa."
        )
        enriched = list(messages)
        if enriched and enriched[0].get("role") == "system":
            first = dict(enriched[0])
            first["content"] = f"{first.get('content', '')}\n\n{instruction}"
            enriched[0] = first
        else:
            enriched.insert(0, {"role": "system", "content": instruction})
        return enriched

    def _ensure_circuit_closed(self) -> None:
        if self._consecutive_failures < self._circuit_failures:
            return
        if time.monotonic() < self._circuit_open_until:
            raise ProviderError(
                "Provider LLM sedang dinonaktifkan sementara (circuit breaker terbuka).",
                kind="circuit_open",
                retryable=True,
            )
        self._consecutive_failures = 0

    async def _post_with_retry(self, payload: dict[str, Any]) -> dict[str, Any]:
        last_error: ProviderError | None = None
        for attempt in range(self._max_retries + 1):
            try:
                return await self._post(payload)
            except ProviderError as exc:
                last_error = exc
                if not exc.retryable or attempt >= self._max_retries:
                    raise
                delay = self._backoff * (2**attempt)
                logger.warning(
                    "Percobaan %s ke provider LLM gagal (%s); ulang dalam %.1fs",
                    attempt + 1,
                    exc.kind,
                    delay,
                )
                await asyncio.sleep(delay)
        raise last_error or ProviderError("Provider LLM tidak merespons.", kind="upstream")

    async def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport
            ) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise ProviderError(
                "Provider LLM melewati batas waktu.", kind="timeout", retryable=True
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                "Tidak dapat menghubungi provider LLM.", kind="network", retryable=True
            ) from exc

        if response.status_code in {401, 403}:
            raise ProviderError(
                "Provider LLM menolak kredensial (401/403).",
                kind="auth",
                retryable=False,
                status_code=response.status_code,
            )
        if response.status_code == 400 and self._tool_mode == "auto" and payload.get("tools"):
            self._native_supported = False
            logger.warning("Provider menolak parameter tools; turun ke mode prompt.")
            raise ProviderError(
                "Provider LLM tidak mendukung tool calling native.",
                kind="unsupported_tools",
                retryable=False,
                status_code=400,
            )
        if response.status_code >= 400:
            raise ProviderError(
                f"Provider LLM merespons dengan status {response.status_code}.",
                kind="upstream",
                retryable=response.status_code in RETRYABLE_STATUS,
                status_code=response.status_code,
            )
        try:
            return response.json()
        except json.JSONDecodeError as exc:
            raise ProviderError(
                "Respons LLM tidak valid (bukan JSON).", kind="invalid_response"
            ) from exc

    def _parse(self, data: dict[str, Any]) -> LLMResponse:
        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(
                "Struktur respons LLM tidak dikenal.", kind="invalid_response"
            ) from exc
        tool_calls: list[ToolCall] = []
        for index, raw_call in enumerate(message.get("tool_calls") or []):
            function = raw_call.get("function") or {}
            arguments = function.get("arguments") or "{}"
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments)
                except json.JSONDecodeError:
                    logger.warning("Argumen tool bukan JSON valid: %s", sanitize_text(arguments))
                    arguments = {}
            tool_calls.append(
                ToolCall(
                    id=raw_call.get("id") or f"call_{index}",
                    name=function.get("name", ""),
                    arguments=arguments if isinstance(arguments, dict) else {},
                )
            )
        content = message.get("content")
        if not tool_calls and content:
            parsed = parse_tool_call_from_text(content)
            if parsed is not None:
                tool_calls.append(parsed)
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        return LLMResponse(content=content, tool_calls=tool_calls, raw=data, usage=usage)


_EVENT_KEYWORDS = re.compile(
    r"\b(event|events|gerak|motion|kejadian|orang|person|maling|terakhir|recent|terdetect)\b",
    re.IGNORECASE,
)
_SEARCH_KEYWORDS = re.compile(r"\b(cari|carikan|search|temukan|find|filter)\b", re.IGNORECASE)
_SYSTEM_KEYWORDS = re.compile(
    r"\b(sistem|system|cpu|ram|disk|penyimpanan|storage|server)\b", re.IGNORECASE
)
_CAMERA_KEYWORDS = re.compile(r"\b(kamera|camera|cctv|front door|depan)\b", re.IGNORECASE)


class FakeProvider:
    """Provider LLM offline deterministik untuk unit test.

    Mensimulasikan alur tool-calling: pertanyaan dipetakan ke tool yang sesuai,
    dan setelah tool dipanggil, jawaban final dirangkum dari hasil tool tersebut.
    """

    name = "fake"

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    @property
    def model(self) -> str:
        return "fake"

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | None = None,
    ) -> LLMResponse:
        self.calls.append({"messages": messages, "tools": tools, "tool_choice": tool_choice})
        tool_result = self._last_tool_message(messages)
        if tool_result is not None:
            return LLMResponse(content=self._summarize(tool_result[0], tool_result[1]))
        user_text = self._last_user_text(messages)
        tool_name = self._pick_tool(user_text, tools)
        if tool_name is None and tool_choice == "required":
            tool_name = self._default_tool(tools)
        if tool_name is None:
            return LLMResponse(
                content=(
                    "At your service, Sir. J.A.R.V.I.S. online. Semua sensor perimeter dan kamera pengawas berada dalam kondisi siaga. Ada yang bisa saya bantu?"
                )
            )
        return LLMResponse(
            content=None,
            tool_calls=[ToolCall(id=f"call_mock_{len(self.calls)}", name=tool_name, arguments={})],
            raw={"fake": True},
        )

    def _last_tool_message(self, messages: list[dict[str, Any]]) -> tuple[str, Any] | None:
        for message in reversed(messages):
            if message.get("role") == "tool":
                content = message.get("content") or "{}"
                try:
                    return message.get("name", "tool"), json.loads(content)
                except json.JSONDecodeError:
                    return message.get("name", "tool"), content
        return None

    def _last_user_text(self, messages: list[dict[str, Any]]) -> str:
        for message in reversed(messages):
            if message.get("role") == "user":
                return str(message.get("content", ""))
        return ""

    def _pick_tool(self, user_text: str, tools: list[dict[str, Any]] | None) -> str | None:
        available = {tool["function"]["name"] for tool in tools or []}
        candidates: list[str] = []
        if _SEARCH_KEYWORDS.search(user_text):
            candidates.append("search_events")
        if _EVENT_KEYWORDS.search(user_text):
            candidates.append("get_recent_events")
        if _SYSTEM_KEYWORDS.search(user_text):
            candidates.append("get_system_status")
        if _CAMERA_KEYWORDS.search(user_text):
            candidates.append("get_camera_list")
        for candidate in candidates:
            if candidate in available:
                return candidate
        return None

    def _default_tool(self, tools: list[dict[str, Any]] | None) -> str | None:
        available = {tool["function"]["name"] for tool in tools or []}
        for candidate in ("get_recent_events", "get_system_status", "get_camera_list"):
            if candidate in available:
                return candidate
        return None

    def _summarize(self, tool_name: str, payload: Any) -> str:
        if tool_name in {"get_camera_list", "list_cameras"} and isinstance(payload, list):
            if not payload:
                return "Belum ada kamera yang terdaftar, Sir."
            details = ", ".join(
                f"{item.get('name')} ({item.get('status')})" for item in payload[:5]
            )
            return f"Siap Sir, terdapat {len(payload)} kamera terdaftar: {details}."
        if tool_name in {"get_recent_events", "search_events"} and isinstance(payload, list):
            if not payload:
                return "Perimeter bersih, Sir. Tidak ada event yang tercatat pada rentang waktu tersebut."
            latest = payload[0]
            return (
                f"Laporan perimeter, Sir: ditemukan {len(payload)} event terbaru. Terakhir tercatat: "
                f"{latest.get('event_type')} di kamera {latest.get('camera_name')} "
                f"pada {latest.get('timestamp')}."
            )
        if tool_name == "get_system_status" and isinstance(payload, dict):
            return (
                "Status diagnostik sistem nominal, Sir: CPU "
                f"{payload.get('cpu_usage_percent')}%, memori "
                f"{payload.get('memory_usage_percent')}%, disk bebas "
                f"{payload.get('disk_free_gb')} GB, {payload.get('active_cameras')} dari "
                f"{payload.get('total_cameras')} kamera online, {payload.get('events_today')} "
                "event hari ini."
            )
        return "Data telah diverifikasi dari sistem lokal, Sir."


# Alias kompatibilitas dengan implementasi sebelumnya.
DattioClient = DattioProvider
MockLLMClient = FakeProvider
