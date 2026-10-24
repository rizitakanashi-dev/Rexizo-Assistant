"""Unit tests untuk desktop notification service."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from jarvis_api.services.notifier import _last_notified, send_system_notification


@pytest.mark.asyncio
async def test_send_system_notification_success():
    _last_notified.clear()
    with patch("shutil.which", return_value="/usr/bin/notify-send"), \
         patch("asyncio.create_subprocess_exec") as mock_exec:
        proc_mock = AsyncMock()
        proc_mock.wait = AsyncMock(return_value=0)
        mock_exec.return_value = proc_mock

        res = await send_system_notification("Kamera Depan", "object_detected", "person")
        assert res is True
        mock_exec.assert_called_once()
        args = mock_exec.call_args[0]
        assert args[0] == "/usr/bin/notify-send"
        assert "Kamera Depan" in args[-1]


@pytest.mark.asyncio
async def test_send_system_notification_cooldown():
    _last_notified["Kamera Cooldown"] = 9999999999.0
    res = await send_system_notification("Kamera Cooldown", "motion")
    assert res is False


@pytest.mark.asyncio
async def test_send_system_notification_no_binary():
    _last_notified.clear()
    with patch("shutil.which", return_value=None):
        res = await send_system_notification("Kamera 1", "motion")
        assert res is False
