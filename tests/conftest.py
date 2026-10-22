"""Fixture bersama untuk seluruh test suite JARVIS."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from jarvis_api.core.config import Settings
from jarvis_api.db.session import Database
from jarvis_api.main import create_app


@pytest.fixture
def settings(tmp_path) -> Settings:
    """Konfigurasi terisolasi: database dan storage di tmp_path, LLM mock."""
    return Settings(
        _env_file=None,
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'jarvis.db'}",
        storage_dir=tmp_path / "storage",
        test_mode=True,
        mock_camera_feed=True,
        surveillance_enabled=False,
        api_key=None,
    )


@pytest.fixture
async def database(settings: Settings) -> AsyncIterator[Database]:
    db = Database(settings.database_url)
    await db.create_all()
    yield db
    await db.dispose()


@pytest.fixture
async def session(database: Database) -> AsyncIterator[AsyncSession]:
    async with database.session() as db_session:
        yield db_session


@pytest.fixture
def app(settings: Settings):
    return create_app(settings)


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def app_with_surveillance(settings: Settings):
    surveillance_settings = settings.model_copy(update={"surveillance_enabled": True})
    return create_app(surveillance_settings)


@pytest.fixture
def surveillance_client(app_with_surveillance) -> Iterator[TestClient]:
    with TestClient(app_with_surveillance) as test_client:
        yield test_client
