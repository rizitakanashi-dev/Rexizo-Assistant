"""Tool bawaan JARVIS (read-only, mutating, dan destructive)."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import psutil
from pydantic import BaseModel, Field

from ..metrics import SystemMetrics
from .base import EmptyParams, ToolContext, ToolRisk, ToolSpec
from .registry import ToolRegistry

logger = logging.getLogger(__name__)


class RecentEventsParams(BaseModel):
    camera_id: str | None = Field(default=None, description="Filter ID kamera")
    event_type: str | None = Field(
        default=None, description="motion | object_detected | camera_status"
    )
    minutes_ago: int = Field(default=15, ge=1, le=1440, description="Rentang waktu ke belakang")
    limit: int = Field(default=10, ge=1, le=50, description="Jumlah event maksimum")


class SearchEventsParams(BaseModel):
    query: str | None = Field(
        default=None,
        description="Kata kunci yang dicocokkan ke nama kamera, jenis event, atau label objek",
    )
    camera_id: str | None = Field(default=None, description="Filter ID kamera")
    event_type: str | None = Field(
        default=None, description="motion | object_detected | camera_status"
    )
    minutes_ago: int = Field(default=60, ge=1, le=1440, description="Rentang waktu ke belakang")
    limit: int = Field(default=20, ge=1, le=100, description="Jumlah event maksimum")


class RestartCameraParams(BaseModel):
    camera_id: str = Field(description="ID kamera yang stream-nya akan direstart")


class DeleteHistoryParams(BaseModel):
    older_than_days: int = Field(default=30, ge=1, le=3650, description="Umur data yang dihapus")


class LaunchAppParams(BaseModel):
    app_name: str = Field(
        description="Nama aplikasi yang ingin dibuka di Arch Linux (misal: firefox, brave, chrome, discord, spotify, steam, code, vscode, terminal, kitty, thunar, dsb)"
    )
    args: str | None = Field(
        default=None,
        description="Argumen baris perintah atau URL tambahan jika ada",
    )


class SystemControlParams(BaseModel):
    action: str = Field(
        description="Aksi kontrol sistem: volume_up | volume_down | volume_mute | set_volume | brightness_up | brightness_down | set_brightness | media_play_pause | media_next | media_prev | lock_screen | notify"
    )
    value: str | None = Field(
        default=None,
        description="Nilai aksi (misal persen volume '50%', persen brightness '80%', atau teks pesan notifikasi)",
    )


class RunTerminalCommandParams(BaseModel):
    command: str = Field(
        description="Perintah shell terminal Linux (bash) yang ingin dieksekusi di Arch Linux"
    )


class TakeScreenshotParams(BaseModel):
    filename: str | None = Field(
        default=None,
        description="Nama file screenshot opsional (default: screenshot_<timestamp>.png)",
    )


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _event_payload(event: Any) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    if event.metadata_json:
        try:
            metadata = json.loads(event.metadata_json)
        except json.JSONDecodeError:  # pragma: no cover - data rusak
            metadata = {}
    return {
        "id": event.id,
        "camera_id": event.camera_id,
        "camera_name": event.camera_name,
        "event_type": event.event_type,
        "timestamp": _iso(event.timestamp),
        "confidence": event.confidence,
        "metadata": metadata,
        "is_mock": event.is_mock,
    }


def _matches_keyword(payload: dict[str, Any], keyword: str) -> bool:
    needle = keyword.strip().lower()
    if not needle:
        return True
    haystack = " ".join(
        [
            str(payload.get("camera_name", "")),
            str(payload.get("event_type", "")),
            str(payload.get("metadata", {})),
        ]
    ).lower()
    return needle in haystack


def _psutil_metrics(storage_dir: Any) -> SystemMetrics:
    """Fallback bacaan metrik langsung dari `psutil` bila provider tidak disuntikkan."""
    disk_free_gb = 0.0
    try:
        disk_free_gb = round(psutil.disk_usage(str(storage_dir)).free / (1024**3), 2)
    except OSError as exc:  # pragma: no cover - bergantung pada filesystem
        logger.warning("Gagal membaca info disk: %s", exc)
    return SystemMetrics(
        cpu_usage_percent=round(psutil.cpu_percent(interval=None), 2),
        memory_usage_percent=round(psutil.virtual_memory().percent, 2),
        disk_free_gb=disk_free_gb,
    )


async def _get_system_status(params: EmptyParams, context: ToolContext) -> dict[str, Any]:
    cameras = await context.cameras.list()
    midnight = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    events_today = await context.events.count_since(midnight)
    storage_dir = context.settings.storage_dir
    metrics = (
        context.metrics.snapshot(storage_dir) if context.metrics else _psutil_metrics(storage_dir)
    )
    return {
        "summary": (
            f"{len(cameras)} kamera terdaftar, {events_today} event hari ini, "
            f"CPU {metrics.cpu_usage_percent:.1f}%"
        ),
        "cpu_usage_percent": metrics.cpu_usage_percent,
        "memory_usage_percent": metrics.memory_usage_percent,
        "disk_free_gb": metrics.disk_free_gb,
        "active_cameras": sum(1 for camera in cameras if camera.status == "online"),
        "total_cameras": len(cameras),
        "events_today": events_today,
    }


async def _get_camera_list(params: EmptyParams, context: ToolContext) -> list[dict[str, Any]]:
    cameras = await context.cameras.list()
    return [
        {
            "id": camera.id,
            "name": camera.name,
            "status": camera.status,
            "fps": camera.fps,
            "is_enabled": camera.is_enabled,
            "last_seen_at": _iso(camera.last_seen_at),
            "is_mock": camera.is_mock,
        }
        for camera in cameras
    ]


async def _get_recent_events(
    params: RecentEventsParams, context: ToolContext
) -> list[dict[str, Any]]:
    since = datetime.now(UTC) - timedelta(minutes=params.minutes_ago)
    _, events = await context.events.query(
        camera_id=params.camera_id,
        event_type=params.event_type,
        start_time=since,
        limit=params.limit,
    )
    return [_event_payload(event) for event in events]


async def _search_events(params: SearchEventsParams, context: ToolContext) -> list[dict[str, Any]]:
    """Pencarian event multi-field (kamera, jenis, label objek, kata kunci)."""
    since = datetime.now(UTC) - timedelta(minutes=params.minutes_ago)
    _, events = await context.events.query(
        camera_id=params.camera_id,
        event_type=params.event_type,
        start_time=since,
        limit=max(params.limit * 5, 100),
    )
    payload = [_event_payload(event) for event in events]
    if params.query:
        payload = [item for item in payload if _matches_keyword(item, params.query)]
    return payload[: params.limit]


async def _restart_camera_stream(
    params: RestartCameraParams, context: ToolContext
) -> dict[str, Any]:
    if context.surveillance is None:
        return {"status": "error", "message": "Runtime surveillance tidak aktif"}
    camera = await context.cameras.get(params.camera_id)
    if camera is None:
        return {"status": "error", "message": f"Kamera '{params.camera_id}' tidak terdaftar"}
    await context.surveillance.restart_camera(params.camera_id)
    return {
        "status": "ok",
        "message": f"Stream kamera {camera.name} ({camera.id}) direstart",
    }


async def _delete_event_history(
    params: DeleteHistoryParams, context: ToolContext
) -> dict[str, Any]:
    threshold = datetime.now(UTC) - timedelta(days=params.older_than_days)
    deleted = await context.events.delete_older_than(threshold)
    return {
        "status": "ok",
        "message": f"{deleted} event lebih tua dari {params.older_than_days} hari dihapus",
        "deleted": deleted,
    }


APP_COMMAND_MAP: dict[str, list[str]] = {
    "firefox": ["firefox"],
    "browser": ["firefox", "brave", "brave-browser", "chromium"],
    "web": ["firefox", "brave", "brave-browser"],
    "brave": ["brave", "brave-browser", "com.brave.Browser"],
    "chrome": ["google-chrome-stable", "chromium", "brave", "brave-browser", "firefox"],
    "code": ["code", "code-oss"],
    "vscode": ["code", "code-oss"],
    "vs code": ["code", "code-oss"],
    "visual studio code": ["code", "code-oss"],
    "discord": ["discord", "vesktop"],
    "spotify": ["spotify"],
    "steam": ["steam"],
    "telegram": ["telegram-desktop"],
    "obs": ["obs"],
    "vlc": ["vlc"],
    "mpv": ["mpv"],
    "gimp": ["gimp"],
    "terminal": ["kitty", "foot", "alacritty", "konsole"],
    "konsol": ["kitty", "foot", "alacritty", "konsole"],
    "kitty": ["kitty"],
    "foot": ["foot"],
    "file manager": ["thunar", "nautilus", "dolphin", "pcmanfm"],
    "files": ["thunar", "nautilus", "dolphin", "pcmanfm"],
    "berkas": ["thunar", "nautilus", "dolphin", "pcmanfm"],
    "calculator": ["gnome-calculator", "kcalc", "galculator"],
    "kalkulator": ["gnome-calculator", "kcalc", "galculator"],
}


def _resolve_executable(app_name: str) -> list[str]:
    import shutil
    key = app_name.strip().lower()
    if key in APP_COMMAND_MAP:
        for c in APP_COMMAND_MAP[key]:
            if shutil.which(c):
                return [c]
    first = key.split()[0] if key else ""
    if first and shutil.which(first):
        return [first]
    if shutil.which("gtk-launch"):
        return ["gtk-launch", key]
    if shutil.which("xdg-open"):
        return ["xdg-open", key]
    return [key]


async def _launch_app(params: LaunchAppParams, context: ToolContext) -> dict[str, Any]:
    import os
    import subprocess
    cmd_parts = _resolve_executable(params.app_name)
    if params.args:
        cmd_parts.append(params.args)
    try:
        env = os.environ.copy()
        if "WAYLAND_DISPLAY" not in env and "DISPLAY" not in env:
            env["WAYLAND_DISPLAY"] = "wayland-1"
            env["DISPLAY"] = ":1"
        subprocess.Popen(
            cmd_parts,
            start_new_session=True,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {
            "status": "launched",
            "app": params.app_name,
            "command": " ".join(cmd_parts),
            "message": f"Aplikasi {params.app_name} berhasil dibuka di sistem Arch Linux.",
        }
    except Exception as exc:
        logger.error("Gagal membuka aplikasi %s: %s", params.app_name, exc)
        return {"status": "error", "app": params.app_name, "message": str(exc)}


async def _system_control(params: SystemControlParams, context: ToolContext) -> dict[str, Any]:
    import asyncio
    import os
    import re
    import shutil
    import subprocess
    act = params.action.strip().lower()
    env = os.environ.copy()
    val = params.value or ""

    async def _run(cmd: list[str]) -> None:
        await asyncio.to_thread(subprocess.run, cmd, check=False, env=env)

    try:
        if act == "volume_up":
            if shutil.which("wpctl"):
                await _run(["wpctl", "set-volume", "-l", "1.5", "@DEFAULT_AUDIO_SINK@", "5%+"])
            elif shutil.which("pamixer"):
                await _run(["pamixer", "-i", "5"])
            return {"status": "ok", "action": "volume_up", "message": "Volume suara dinaikkan 5%"}

        if act == "volume_down":
            if shutil.which("wpctl"):
                await _run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%-"])
            elif shutil.which("pamixer"):
                await _run(["pamixer", "-d", "5"])
            return {"status": "ok", "action": "volume_down", "message": "Volume suara diturunkan 5%"}

        if act == "volume_mute":
            if shutil.which("wpctl"):
                await _run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"])
            elif shutil.which("pamixer"):
                await _run(["pamixer", "-t"])
            return {"status": "ok", "action": "volume_mute", "message": "Status mute volume di-toggle"}

        if act == "set_volume":
            m = re.search(r"(\d+(?:\.\d+)?)", val)
            pct_num = max(0, min(150, int(round(float(m.group(1)))))) if m else 50
            if shutil.which("pamixer"):
                await _run(["pamixer", "--set-volume", str(min(100, pct_num))])
            elif shutil.which("wpctl"):
                ratio = round(pct_num / 100.0, 2)
                await _run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", str(ratio)])
            return {"status": "ok", "action": "set_volume", "message": f"Volume diatur ke {pct_num}%"}

        if act == "brightness_up":
            if shutil.which("brightnessctl"):
                await _run(["brightnessctl", "set", "+10%"])
            return {"status": "ok", "action": "brightness_up", "message": "Kecerahan layar dinaikkan 10%"}

        if act == "brightness_down":
            if shutil.which("brightnessctl"):
                await _run(["brightnessctl", "set", "10%-"])
            return {"status": "ok", "action": "brightness_down", "message": "Kecerahan layar diturunkan 10%"}

        if act == "set_brightness":
            m = re.search(r"(\d+(?:\.\d+)?)", val)
            pct_num = max(1, min(100, int(round(float(m.group(1)))))) if m else 50
            clean_pct = f"{pct_num}%"
            if shutil.which("brightnessctl"):
                await _run(["brightnessctl", "set", clean_pct])
            return {"status": "ok", "action": "set_brightness", "message": f"Kecerahan layar diatur ke {clean_pct}"}

        if act in ("media_play_pause", "media_play", "media_pause"):
            if shutil.which("playerctl"):
                cmd = "play-pause" if act == "media_play_pause" else act.replace("media_", "")
                await _run(["playerctl", cmd])
            return {"status": "ok", "action": act, "message": f"Kontrol pemutar musik ({act}) berhasil"}

        if act == "media_next":
            if shutil.which("playerctl"):
                await _run(["playerctl", "next"])
            return {"status": "ok", "action": "media_next", "message": "Memutar lagu berikutnya"}

        if act == "media_prev":
            if shutil.which("playerctl"):
                await _run(["playerctl", "previous"])
            return {"status": "ok", "action": "media_prev", "message": "Memutar lagu sebelumnya"}

        if act == "lock_screen":
            if shutil.which("loginctl"):
                await _run(["loginctl", "lock-session"])
            elif shutil.which("hyprlock"):
                subprocess.Popen(["hyprlock"], start_new_session=True, env=env)
            return {"status": "ok", "action": "lock_screen", "message": "Layar sistem dikunci"}

        if act == "notify":
            msg = val or "Pemberitahuan dari Rexizo Assistant"
            if shutil.which("notify-send"):
                await _run(["notify-send", "Rexizo Assistant", msg])
            return {"status": "ok", "action": "notify", "message": f"Notifikasi terkirim: {msg}"}

        return {"status": "error", "action": act, "message": f"Aksi kontrol '{act}' tidak dikenali"}
    except Exception as exc:
        return {"status": "error", "action": act, "message": str(exc)}


async def _run_terminal_command(
    params: RunTerminalCommandParams, context: ToolContext
) -> dict[str, Any]:
    import asyncio
    import os
    import subprocess
    try:
        proc = await asyncio.to_thread(
            subprocess.run,
            params.command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=15,
            env=os.environ.copy(),
        )
        return {
            "status": "completed" if proc.returncode == 0 else "failed",
            "returncode": proc.returncode,
            "stdout": proc.stdout[-2500:] if proc.stdout else "",
            "stderr": proc.stderr[-1000:] if proc.stderr else "",
            "command": params.command,
        }
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "command": params.command, "message": "Perintah melebihi batas 15 detik"}
    except Exception as exc:
        return {"status": "error", "command": params.command, "message": str(exc)}


async def _take_screenshot(
    params: TakeScreenshotParams, context: ToolContext
) -> dict[str, Any]:
    import asyncio
    import os
    import re
    import shutil
    import subprocess
    import time
    from pathlib import Path
    pictures_dir = (Path.home() / "Pictures").resolve()
    pictures_dir.mkdir(parents=True, exist_ok=True)
    raw_name = Path(params.filename).name if params.filename else f"screenshot_{int(time.time())}.png"
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", raw_name) or f"screenshot_{int(time.time())}.png"
    if not safe_name.lower().endswith(".png"):
        safe_name += ".png"
    dest = (pictures_dir / safe_name).resolve()
    if not dest.is_relative_to(pictures_dir):
        return {"status": "error", "message": "Nama file screenshot tidak valid"}
    env = os.environ.copy()
    if "WAYLAND_DISPLAY" not in env and "DISPLAY" not in env:
        env["WAYLAND_DISPLAY"] = "wayland-1"
        env["DISPLAY"] = ":1"

    try:
        if shutil.which("grim"):
            proc = await asyncio.to_thread(
                subprocess.run,
                ["grim", str(dest)],
                env=env,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if proc.returncode == 0 and dest.exists():
                return {
                    "status": "success",
                    "saved_to": str(dest),
                    "size_bytes": dest.stat().st_size,
                    "message": f"Screenshot berhasil diambil dan disimpan ke {dest}",
                }
        return {"status": "error", "message": "Alat screenshot 'grim' tidak tersedia atau gagal"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


def register_builtin_tools(registry: ToolRegistry) -> ToolRegistry:
    """Mendaftarkan seluruh tool bawaan ke registry."""
    registry.register(
        ToolSpec(
            name="get_system_status",
            description=(
                "Ambil status sistem lokal: penggunaan CPU/memori, ruang disk, jumlah "
                "kamera aktif, dan jumlah event hari ini."
            ),
            parameters=EmptyParams,
            handler=_get_system_status,
            risk=ToolRisk.SAFE,
        )
    )
    registry.register(
        ToolSpec(
            name="get_camera_list",
            description=(
                "Ambil daftar kamera terdaftar beserta status koneksi (online/offline/error) "
                "dan frame rate. Tidak mengembalikan kredensial RTSP."
            ),
            parameters=EmptyParams,
            handler=_get_camera_list,
            risk=ToolRisk.SAFE,
            aliases=["list_cameras"],
        )
    )
    registry.register(
        ToolSpec(
            name="get_recent_events",
            description=(
                "Ambil log event surveillance terbaru (motion, object_detected) dengan "
                "filter kamera, jenis event, dan rentang menit ke belakang."
            ),
            parameters=RecentEventsParams,
            handler=_get_recent_events,
            risk=ToolRisk.SAFE,
        )
    )
    registry.register(
        ToolSpec(
            name="search_events",
            description=(
                "Cari event surveillance berdasarkan kata kunci (nama kamera, jenis event, "
                "label objek seperti person/vehicle) dalam rentang waktu tertentu."
            ),
            parameters=SearchEventsParams,
            handler=_search_events,
            risk=ToolRisk.SAFE,
        )
    )
    registry.register(
        ToolSpec(
            name="restart_camera_stream",
            description="Restart worker stream RTSP untuk satu kamera.",
            parameters=RestartCameraParams,
            handler=_restart_camera_stream,
            risk=ToolRisk.MUTATING,
        )
    )
    registry.register(
        ToolSpec(
            name="delete_event_history",
            description="Hapus riwayat event lama dari database lokal.",
            parameters=DeleteHistoryParams,
            handler=_delete_event_history,
            risk=ToolRisk.DESTRUCTIVE,
        )
    )
    registry.register(
        ToolSpec(
            name="launch_application",
            description=(
                "Buka aplikasi apa pun di desktop Arch Linux (misal: firefox, brave, chrome, "
                "discord, spotify, steam, code, terminal, kitty, dsb)."
            ),
            parameters=LaunchAppParams,
            handler=_launch_app,
            risk=ToolRisk.MUTATING,
            aliases=["open_app", "launch_app"],
        )
    )
    registry.register(
        ToolSpec(
            name="system_control",
            description=(
                "Kontrol audio, layar, media, dan notifikasi sistem Arch Linux: "
                "volume_up, volume_down, volume_mute, set_volume, brightness_up, "
                "brightness_down, set_brightness, media_play_pause, media_next, media_prev, "
                "lock_screen, notify."
            ),
            parameters=SystemControlParams,
            handler=_system_control,
            risk=ToolRisk.MUTATING,
            aliases=["control_system"],
        )
    )
    registry.register(
        ToolSpec(
            name="run_terminal_command",
            description="Jalankan perintah bash terminal Linux di sistem Arch Linux.",
            parameters=RunTerminalCommandParams,
            handler=_run_terminal_command,
            risk=ToolRisk.MUTATING,
            aliases=["terminal_exec", "run_command"],
        )
    )
    registry.register(
        ToolSpec(
            name="take_screenshot",
            description="Ambil tangkapan layar (screenshot) desktop Linux Wayland dan simpan ke file gambar.",
            parameters=TakeScreenshotParams,
            handler=_take_screenshot,
            risk=ToolRisk.MUTATING,
            aliases=["screenshot"],
        )
    )
    return registry
