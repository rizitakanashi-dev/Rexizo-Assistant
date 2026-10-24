"""Layanan notifikasi desktop sistem Linux (notify-send) untuk alert keamanan CCTV."""

from __future__ import annotations

import asyncio
import logging
import shutil
import time

logger = logging.getLogger(__name__)

# Cooldown per kamera (dalam detik) agar tidak membanjiri notifikasi desktop
_COOLDOWN_SECONDS = 15.0
_last_notified: dict[str, float] = {}


async def send_system_notification(camera_name: str, event_type: str, details: str = "") -> bool:
    """Kirim notifikasi desktop Linux menggunakan notify-send jika terinstal."""
    now = time.monotonic()
    last_time = _last_notified.get(camera_name, 0.0)
    if now - last_time < _COOLDOWN_SECONDS:
        return False
    _last_notified[camera_name] = now

    notify_send = shutil.which("notify-send")
    if not notify_send:
        return False

    is_person = (
        "person" in details.lower()
        or "orang" in details.lower()
        or event_type == "object_detected"
    )
    urgency = "critical" if is_person else "normal"
    title = "Rexizo Security Alert"
    body = f"Peringatan: Orang terdeteksi di {camera_name}!" if is_person else f"Gerakan terdeteksi di {camera_name}!"
    if details and not is_person:
        body += f" ({details})"

    try:
        proc = await asyncio.create_subprocess_exec(
            notify_send,
            "-u",
            urgency,
            "-a",
            "Rexizo Assistant",
            "-i",
            "security-high",
            title,
            body,
        )
        await proc.wait()
        return True
    except Exception as exc:
        logger.debug("Desktop notification notify-send gagal: %s", exc)
        return False
