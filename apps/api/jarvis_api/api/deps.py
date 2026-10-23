"""Dependency injection FastAPI."""

from __future__ import annotations

import hmac
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import Settings
from ..db.session import Database
from ..services.broadcaster import EventBroadcaster
from ..services.chat import ChatService
from ..services.llm import LLMClient
from ..services.surveillance import SurveillanceService
from ..services.tools import ToolRegistry

LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_registry(request: Request) -> ToolRegistry:
    return request.app.state.registry


def get_llm(request: Request) -> LLMClient:
    return request.app.state.llm


def get_broadcaster(request: Request) -> EventBroadcaster:
    return request.app.state.broadcaster


def get_surveillance(request: Request) -> SurveillanceService:
    return request.app.state.surveillance


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    database: Database = request.app.state.database
    async with database.session() as session:
        yield session


async def require_api_key(
    request: Request,
    x_rexizo_api_key: Annotated[str | None, Header(alias="X-REXIZO-API-KEY")] = None,
    x_jarvis_api_key: Annotated[str | None, Header(alias="X-JARVIS-API-KEY")] = None,
) -> None:
    """Melindungi API: API key bila dikonfigurasi, selain itu hanya localhost.

    Prototipe lokal: tanpa API key, akses dibatasi ke klien loopback.
    """
    settings: Settings = request.app.state.settings
    provided_key = x_rexizo_api_key or x_jarvis_api_key
    if settings.api_key:
        if not provided_key or not hmac.compare_digest(provided_key, settings.api_key):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="API key tidak valid"
            )
        return
    client_host = request.client.host if request.client else None
    if client_host not in LOCAL_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses tanpa API key hanya diizinkan dari localhost",
        )


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
RegistryDep = Annotated[ToolRegistry, Depends(get_registry)]
BroadcasterDep = Annotated[EventBroadcaster, Depends(get_broadcaster)]
SurveillanceDep = Annotated[SurveillanceService, Depends(get_surveillance)]
ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
ApiKeyDep = Depends(require_api_key)
