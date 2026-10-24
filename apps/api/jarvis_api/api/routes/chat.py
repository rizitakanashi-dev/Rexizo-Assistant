"""Endpoint chat dengan asisten AI.

Kontrak mengikuti docs/API-CONTRACTS.md §2.4 (path kanonik `/chat/messages` dan
`/chat/history`) plus tambahan dari delta D-1..D-5: `client_message_id`,
payload `meta`, `tools_executed` yang kaya, endpoint history per percakapan,
dan soft-delete percakapan.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import re
import subprocess
import tempfile
from collections import OrderedDict

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import JSONResponse

from ...core.errors import ChatError, EnvelopeRoute, ErrorCode
from ...db.repository import ChatRepository
from ...schemas import ChatHistory, ChatHistoryItem, ChatRequest, ChatResponse
from ..deps import ApiKeyDep, ChatServiceDep, SessionDep

router = APIRouter(prefix="/chat", tags=["chat"], route_class=EnvelopeRoute)

_TTS_CACHE: OrderedDict[tuple[str, str, str, str], tuple[bytes, str]] = OrderedDict()
_TTS_CACHE_MAX = 64
_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001F9FF"
    "\U00002600-\U000027BF"
    "\U0001FA00-\U0001FAFF"
    "\U00002700-\U000027BF"
    "\U0000FE00-\U0000FE0F"
    "]+",
    flags=re.UNICODE,
)


@router.post("/messages", response_model=ChatResponse, dependencies=[ApiKeyDep])
@router.post("", response_model=ChatResponse, dependencies=[ApiKeyDep])
async def send_message(
    payload: ChatRequest, session: SessionDep, chat_service: ChatServiceDep
) -> ChatResponse:
    """Kirim pesan teks ke Rexizo dan dapatkan jawaban berbasis data lokal."""
    return await chat_service.send_message(
        session,
        payload.conversation_id,
        payload.message,
        payload.client_message_id,
    )


@router.get("/history", response_model=ChatHistory, dependencies=[ApiKeyDep])
async def chat_history(
    session: SessionDep,
    conversation_id: str = Query(default="conv_default"),
    limit: int = Query(default=30, ge=1, le=200),
) -> ChatHistory:
    """Riwayat percakapan untuk sebuah conversation_id."""
    messages = await ChatRepository(session).history(conversation_id, limit=limit)
    return ChatHistory(
        conversation_id=conversation_id,
        messages=[
            ChatHistoryItem(
                id=message.id,
                role=message.role,
                content=message.content,
                tool_name=message.tool_name,
                created_at=message.created_at,
            )
            for message in messages
        ],
    )


@router.get(
    "/conversations/{conversation_id}/history",
    response_model=ChatHistory,
    dependencies=[ApiKeyDep],
)
async def conversation_history(
    conversation_id: str, session: SessionDep, limit: int = Query(default=30, ge=1, le=200)
) -> ChatHistory:
    """Riwayat percakapan (path per-percakapan sesuai delta D-4)."""
    return await chat_history(session, conversation_id=conversation_id, limit=limit)


@router.delete("/conversations/{conversation_id}", dependencies=[ApiKeyDep])
async def archive_conversation(conversation_id: str, session: SessionDep) -> JSONResponse:
    """Arsipkan percakapan (soft-delete, data tidak dihapus permanen)."""
    archived = await ChatRepository(session).archive_conversation(conversation_id)
    if not archived:
        raise ChatError(
            ErrorCode.NOT_FOUND,
            "Percakapan tidak ditemukan.",
            status_code=status.HTTP_404_NOT_FOUND,
            details={"conversation_id": conversation_id},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"conversation_id": conversation_id, "archived": True},
    )


def _store_tts_cache(key: tuple[str, str, str, str], data: bytes, media_type: str) -> None:
    if not data:
        return
    _TTS_CACHE[key] = (data, media_type)
    _TTS_CACHE.move_to_end(key)
    while len(_TTS_CACHE) > _TTS_CACHE_MAX:
        _TTS_CACHE.popitem(last=False)


@router.api_route("/tts", methods=["GET", "HEAD"])
async def text_to_speech(
    request: Request,
    text: str = Query(default="", max_length=1500),
    persona: str = Query(default="nozomi"),
    voice_id: str | None = Query(default=None),
    pitch: float | None = Query(default=None),
    rate: float | None = Query(default=None),
) -> Response:
    """Sintesis audio menggunakan Voice Cloning (ElevenLabs / Fish Audio) bila dikonfigurasi,
    atau fallback otomatis ke Edge Neural TTS / espeak-ng."""
    audio_headers = {"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=300"}

    if request.method == "HEAD":
        return Response(content=b"", media_type="audio/mpeg", headers=audio_headers)

    clean = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean)
    clean = re.sub(r"[*_#`~>\[\]()]", " ", clean)
    clean = re.sub(r"https?://\S+", "", clean)
    clean = _EMOJI_RE.sub(" ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean:
        return Response(content=b"", media_type="audio/wav", headers=audio_headers)

    cache_key = (
        clean[:1000],
        persona,
        f"{pitch:.2f}" if pitch is not None else "def",
        f"{rate:.2f}" if rate is not None else "def",
    )
    cached = _TTS_CACHE.get(cache_key)
    if cached is not None:
        _TTS_CACHE.move_to_end(cache_key)
        return Response(content=cached[0], media_type=cached[1], headers=audio_headers)

    from ...core.config import get_settings
    settings = get_settings()

    # 1. Fish Audio S2.1 Pro Free (Voice Cloning Gratis untuk Developer)
    if settings.fish_audio_api_key:
        try:
            import httpx
            fish_voice_id = voice_id or settings.fish_audio_voice_id or "933563129e564b19a115bedd57b7406a"
            url = "https://api.fish.audio/v1/tts"
            headers = {
                "Authorization": f"Bearer {settings.fish_audio_api_key}",
                "Content-Type": "application/json",
            }
            body = {
                "text": clean[:1000],
                "reference_id": fish_voice_id,
                "format": "mp3",
                "model": "s2.1-pro-free",
            }
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(url, headers=headers, json=body)
                if resp.status_code == 200 and resp.content:
                    _store_tts_cache(cache_key, resp.content, "audio/mpeg")
                    return Response(content=resp.content, media_type="audio/mpeg", headers=audio_headers)
        except Exception:
            pass  # Fallback ke ElevenLabs / Edge TTS / local

    # 2. Cloud Voice Cloning (ElevenLabs) jika API key & Voice ID tersedia
    target_voice_id = voice_id or settings.elevenlabs_voice_id
    if settings.elevenlabs_api_key and target_voice_id:
        try:
            import httpx
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{target_voice_id}?output_format=mp3_44100_128"
            headers = {
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            }
            body = {
                "text": clean[:1000],
                "model_id": settings.elevenlabs_model_id or "eleven_multilingual_v2",
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, json=body)
                if resp.status_code == 200 and resp.content:
                    _store_tts_cache(cache_key, resp.content, "audio/mpeg")
                    return Response(content=resp.content, media_type="audio/mpeg", headers=audio_headers)
        except Exception:
            pass  # Fallback ke Edge TTS / local

    # 3. Free Neural TTS via edge-tts (100% Gratis, Tanpa Langganan, Suara Anime / Alami Jernih)
    try:
        import edge_tts

        if persona == "nozomi":
            has_japanese = bool(re.search(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]", clean))
            pitch_delta = int(round(((pitch if pitch is not None else 1.35) - 1.35) * 40))
            rate_delta = int(round(((rate if rate is not None else 1.05) - 1.05) * 50))
            if has_japanese:
                voice_name = "ja-JP-NanamiNeural"
                hz = max(-20, min(55, 16 + pitch_delta))
                pct = max(-35, min(40, -3 + rate_delta))
            else:
                # Kalibrasi presisi berdasarkan file audio Nozomi yang diunggah pengguna:
                # Nada tinggi lembut manis (+28Hz) dan tempo santai manja (-4%)
                voice_name = "id-ID-GadisNeural"
                hz = max(-20, min(55, 28 + pitch_delta))
                pct = max(-35, min(40, -4 + rate_delta))
            p_val = f"{hz:+d}Hz"
            r_val = f"{pct:+d}%"
        elif persona == "rexizo":
            pitch_delta = int(round(((pitch if pitch is not None else 0.95) - 0.95) * 40))
            rate_delta = int(round(((rate if rate is not None else 1.02) - 1.02) * 50))
            voice_name = "id-ID-ArdiNeural"
            hz = max(-30, min(30, -4 + pitch_delta))
            pct = max(-35, min(40, 2 + rate_delta))
            p_val = f"{hz:+d}Hz"
            r_val = f"{pct:+d}%"
        else:
            pitch_delta = int(round(((pitch if pitch is not None else 1.0) - 1.0) * 40))
            rate_delta = int(round(((rate if rate is not None else 1.0) - 1.0) * 50))
            voice_name = "id-ID-GadisNeural"
            p_val = f"{max(-30, min(50, pitch_delta)):+d}Hz"
            r_val = f"{max(-35, min(40, rate_delta)):+d}%"

        communicate = edge_tts.Communicate(clean[:1000], voice_name, pitch=p_val, rate=r_val)
        audio_buffer = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer += chunk["data"]

        if audio_buffer:
            _store_tts_cache(cache_key, audio_buffer, "audio/mpeg")
            return Response(content=audio_buffer, media_type="audio/mpeg", headers=audio_headers)
    except Exception:
        pass  # Fallback ke offline espeak-ng jika jaringan terputus

    # 4. Offline local fallback via espeak-ng di Arch Linux (non-blocking)
    def _run_espeak() -> bytes:
        voice = "id+f3" if persona == "nozomi" else "id+m3"
        p_espeak = "82" if persona == "nozomi" else "45"
        s_espeak = "145" if persona == "nozomi" else "135"
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        try:
            cmd = ["espeak-ng", "-v", voice, "-p", p_espeak, "-s", s_espeak, "-w", path, clean[:800]]
            proc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            if proc.returncode == 0 and os.path.exists(path):
                with open(path, "rb") as f:
                    return f.read()
        except Exception:
            pass
        finally:
            if os.path.exists(path):
                with contextlib.suppress(OSError):
                    os.remove(path)
        return b""

    wav_data = await asyncio.to_thread(_run_espeak)
    if wav_data:
        _store_tts_cache(cache_key, wav_data, "audio/wav")
        return Response(content=wav_data, media_type="audio/wav", headers=audio_headers)

    return Response(content=b"", media_type="audio/wav", status_code=status.HTTP_200_OK, headers=audio_headers)


@router.post("/stt")
async def speech_to_text(
    request: Request,
    lang: str = Query(default="id-ID"),
) -> JSONResponse:
    """Transkripsi audio rekaman mikrofon (MediaRecorder WebM/OGG/WAV) menjadi teks.
    Kompatibel 100% di semua browser Linux termasuk Brave Browser."""
    raw_audio = await request.body()
    if not raw_audio or len(raw_audio) < 100:
        return JSONResponse(status_code=200, content={"text": "", "language": lang})

    def _transcribe(audio_bytes: bytes, language: str) -> str:
        import speech_recognition as sr

        in_fd, in_path = tempfile.mkstemp(suffix=".webm")
        out_fd, out_path = tempfile.mkstemp(suffix=".wav")
        os.close(in_fd)
        os.close(out_fd)
        try:
            with open(in_path, "wb") as f:
                f.write(audio_bytes)
            proc = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    in_path,
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-f",
                    "wav",
                    out_path,
                ],
                capture_output=True,
                timeout=10,
            )
            if proc.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) < 200:
                return ""

            recognizer = sr.Recognizer()
            with sr.AudioFile(out_path) as source:
                audio_data = recognizer.record(source)

            for try_lang in (language, "id-ID", "en-US"):
                try:
                    text = recognizer.recognize_google(audio_data, language=try_lang)
                    if text and str(text).strip():
                        return str(text).strip()
                except sr.UnknownValueError:
                    continue
                except Exception:
                    break
            return ""
        except Exception:
            return ""
        finally:
            for p in (in_path, out_path):
                if os.path.exists(p):
                    with contextlib.suppress(OSError):
                        os.remove(p)

    transcript = await asyncio.to_thread(_transcribe, raw_audio, lang)
    return JSONResponse(status_code=200, content={"text": transcript, "language": lang})
