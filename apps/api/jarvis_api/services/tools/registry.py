"""Tool registry: strict allowlist, validasi parameter, dan audit eksekusi."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from pydantic import BaseModel, ValidationError

from .base import ToolContext, ToolSpec

logger = logging.getLogger(__name__)


class ToolError(RuntimeError):
    """Basis error tool."""


class ToolNotFoundError(ToolError):
    """Tool di luar allowlist."""


class ToolValidationError(ToolError):
    """Parameter tool tidak valid."""


class ToolPermissionError(ToolError):
    """Tool mutating/destructive dijalankan tanpa otorisasi."""


class ToolResult:
    """Hasil eksekusi tool."""

    def __init__(
        self,
        tool_name: str,
        parameters: dict[str, Any],
        payload: Any,
        summary: str,
        duration_ms: int = 0,
        status: str = "ok",
        requested_name: str | None = None,
    ) -> None:
        self.tool_name = tool_name
        self.parameters = parameters
        self.payload = payload
        self.summary = summary
        self.duration_ms = duration_ms
        self.status = status
        self.requested_name = requested_name or tool_name

    def as_dict(self) -> dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "parameters": self.parameters,
            "result_summary": self.summary,
        }

    def to_content(self) -> str:
        """Serialisasi payload menjadi konten pesan tool (OpenAI-compatible)."""
        if isinstance(self.payload, str):
            return self.payload
        return json.dumps(self.payload, ensure_ascii=False, default=str)


class ToolRegistry:
    """Daftar allowlist tool yang boleh dieksekusi JARVIS."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}
        self._aliases: dict[str, str] = {}

    def register(self, spec: ToolSpec) -> ToolSpec:
        if spec.name in self._tools:
            raise ValueError(f"Tool '{spec.name}' sudah terdaftar")
        self._tools[spec.name] = spec
        for alias in spec.aliases:
            if alias in self._tools or alias in self._aliases:
                raise ValueError(f"Alias tool '{alias}' sudah terdaftar")
            self._aliases[alias] = spec.name
        return spec

    def unregister(self, name: str) -> None:
        spec = self._tools.pop(name, None)
        if spec is None:
            return
        for alias in spec.aliases:
            self._aliases.pop(alias, None)

    def canonical_name(self, name: str) -> str:
        """Resolusi alias ke nama kanonikal tool."""
        return self._aliases.get(name, name)

    def get(self, name: str) -> ToolSpec | None:
        return self._tools.get(self.canonical_name(name))

    def list_specs(self) -> list[ToolSpec]:
        return list(self._tools.values())

    def names(self) -> list[str]:
        return sorted(self._tools)

    def aliases(self) -> dict[str, str]:
        return dict(self._aliases)

    def schemas(self, include_mutating: bool = False) -> list[dict[str, Any]]:
        """Skema fungsi untuk LLM.

        Default hanya tool read-only (SAFE) yang diekspos; tool mutating atau
        destructive tidak pernah dikirim ke model kecuali diaktifkan eksplisit.
        """
        specs = [spec for spec in self._tools.values() if include_mutating or spec.is_read_only]
        return [spec.openai_schema() for spec in specs]

    async def execute(
        self,
        name: str,
        arguments: dict[str, Any] | None,
        context: ToolContext,
        allow_mutating: bool = False,
    ) -> ToolResult:
        """Menjalankan tool dengan validasi allowlist, skema, dan izin."""
        requested_name = name
        canonical = self.canonical_name(name)
        spec = self._tools.get(canonical)
        if spec is None:
            await context.audit.log(
                action="tool_rejected",
                tool_name=requested_name,
                parameters=arguments or {},
                result_summary="tool tidak ada dalam allowlist",
                success=False,
            )
            logger.warning("Permintaan tool di luar allowlist: %s", requested_name)
            raise ToolNotFoundError(f"Tool '{requested_name}' tidak terdaftar")

        if not spec.is_read_only and not allow_mutating:
            await context.audit.log(
                action="tool_permission_denied",
                tool_name=canonical,
                parameters=arguments or {},
                result_summary=f"risiko {spec.risk.value} membutuhkan otorisasi eksplisit",
                success=False,
            )
            raise ToolPermissionError(
                f"Tool '{canonical}' berisiko {spec.risk.value} dan memerlukan konfirmasi eksplisit"
            )

        payload = arguments or {}
        try:
            validated: BaseModel = spec.parameters.model_validate(payload)
        except ValidationError as exc:
            await context.audit.log(
                action="tool_validation_failed",
                tool_name=canonical,
                parameters=payload,
                result_summary=exc.errors(include_url=False)[0].get("msg", "invalid"),
                success=False,
            )
            raise ToolValidationError(f"Parameter tool '{canonical}' tidak valid: {exc}") from exc

        started = time.perf_counter()
        result = await spec.handler(validated, context)
        duration_ms = int((time.perf_counter() - started) * 1000)
        summary = summarize(result)
        await context.audit.log(
            action="tool_executed",
            tool_name=canonical,
            parameters=payload,
            result_summary=summary,
            success=True,
        )
        return ToolResult(
            tool_name=canonical,
            parameters=payload,
            payload=result,
            summary=summary,
            duration_ms=duration_ms,
            status="ok",
            requested_name=requested_name,
        )


def summarize(payload: Any) -> str:
    """Ringkasan singkat hasil tool untuk audit dan respons chat."""
    if isinstance(payload, str):
        return payload[:200]
    if isinstance(payload, list):
        return f"{len(payload)} item"
    if isinstance(payload, dict):
        for key in ("summary", "message", "status"):
            value = payload.get(key)
            if isinstance(value, str):
                return value[:200]
        return ", ".join(f"{key}={payload[key]}" for key in list(payload)[:5])
    return str(payload)[:200]
