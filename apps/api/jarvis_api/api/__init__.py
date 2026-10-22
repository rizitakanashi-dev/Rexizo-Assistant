"""Router API."""

from fastapi import APIRouter

from .routes import cameras, chat, events, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(cameras.router)
api_router.include_router(events.router)
api_router.include_router(chat.router)

__all__ = ["api_router"]
