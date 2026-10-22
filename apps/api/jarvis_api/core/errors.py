"""Error envelope tunggal AI Core: `{"error": {"code", "message", "details"}}`.

Sesuai delta kontrak D-3 yang disetujui Main Agent, seluruh kegagalan pada
endpoint chat memakai bentuk yang sama supaya frontend dapat_branch logika
error di satu tempat.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute


class ErrorCode:
    """Kode error stabil yang dipakai lintas layer AI Core."""

    AI_DISABLED = "AI_DISABLED"
    AI_INVALID_REQUEST = "AI_INVALID_REQUEST"
    AI_PROVIDER_ERROR = "AI_PROVIDER_ERROR"
    AI_RATE_LIMITED = "AI_RATE_LIMITED"
    AI_TIMEOUT = "AI_TIMEOUT"
    AI_UNAVAILABLE = "AI_UNAVAILABLE"
    TOOL_NOT_ALLOWED = "TOOL_NOT_ALLOWED"
    TOOL_DENIED = "TOOL_DENIED"
    NOT_FOUND = "NOT_FOUND"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ChatError(Exception):
    """Kesalahan yang aman ditampilkan ke pengguna sebagai error envelope."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def payload(self) -> dict[str, Any]:
        return error_payload(self.code, self.message, self.details)


def error_payload(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    """Bentuk error envelope yang konsisten."""
    return {"error": {"code": code, "message": message, "details": details or {}}}


def error_response(
    code: str,
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_payload(code, message, details))


class EnvelopeRoute(APIRoute):
    """API route yang mengembalikan error envelope untuk seluruh route AI Core."""

    def get_route_handler(self):  # type: ignore[no-untyped-def]
        original_handler = super().get_route_handler()

        async def custom_route_handler(request: Request) -> Any:
            try:
                return await original_handler(request)
            except ChatError as exc:
                return JSONResponse(status_code=exc.status_code, content=exc.payload())
            except RequestValidationError as exc:
                return JSONResponse(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    content=error_payload(
                        ErrorCode.AI_INVALID_REQUEST,
                        "Permintaan tidak valid.",
                        {"errors": jsonable_encoder(exc.errors())},
                    ),
                )

        return custom_route_handler
