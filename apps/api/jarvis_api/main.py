"""Entry point aplikasi FastAPI JARVIS."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import api_router
from .api.routes import websocket
from .core.config import Settings, get_settings
from .core.logging import configure_logging
from .db.session import Database
from .services.broadcaster import EventBroadcaster
from .services.chat import ChatService
from .services.llm import DattioClient, MockLLMClient
from .services.surveillance import SurveillanceService
from .services.tools import ToolRegistry, register_builtin_tools

logger = logging.getLogger(__name__)


def build_llm(settings: Settings):
    """Memilih klien LLM: Dattio AI nyata, atau mock offline saat test mode."""
    if settings.llm_enabled:
        return DattioClient(
            base_url=settings.dattio_base_url or "",
            api_key=settings.dattio_api_key or "",
            model=settings.dattio_model,
            timeout=settings.llm_timeout_seconds,
        )
    logger.warning("Dattio AI tidak dikonfigurasi — berjalan dalam TEST MODE dengan LLM mock")
    return MockLLMClient()


def create_app(settings: Settings | None = None) -> FastAPI:
    """Menyusun aplikasi FastAPI beserta seluruh dependensinya."""
    settings = settings or get_settings()
    configure_logging()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    settings.snapshot_dir.mkdir(parents=True, exist_ok=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        database = Database(settings.database_url)
        await database.create_all()
        registry = register_builtin_tools(ToolRegistry())
        llm = build_llm(settings)
        broadcaster = EventBroadcaster()
        surveillance = SurveillanceService(settings, database, broadcaster)
        chat_service = ChatService(llm, registry, settings, surveillance=surveillance)

        app.state.settings = settings
        app.state.database = database
        app.state.registry = registry
        app.state.llm = llm
        app.state.broadcaster = broadcaster
        app.state.surveillance = surveillance
        app.state.chat_service = chat_service

        if settings.surveillance_enabled:
            await surveillance.start()
        try:
            yield
        finally:
            await surveillance.stop()
            await database.dispose()

    app = FastAPI(
        title=f"{settings.app_name} API",
        version=settings.version,
        description="Local intelligent assistant dengan kemampuan surveillance.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)
    app.include_router(websocket.router)
    return app


app = create_app()
