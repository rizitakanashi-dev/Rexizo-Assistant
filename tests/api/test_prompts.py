"""Unit test prompt builder dan sanitasi data sensitif."""

from __future__ import annotations

from jarvis_api.core.sanitize import sanitize_text
from jarvis_api.services.prompts import build_system_prompt, sanitize_for_llm


def test_system_prompt_contains_ground_truth_rules() -> None:
    prompt = build_system_prompt()
    assert "TIDAK BOLEH menebak" in prompt
    assert "WAJIB memanggil tool" in prompt
    assert "Waktu server saat ini" in prompt


def test_system_prompt_accepts_extra_context() -> None:
    prompt = build_system_prompt("Kamera aktif: 2")
    assert "Kamera aktif: 2" in prompt


def test_sanitize_masks_rtsp_credentials() -> None:
    text = "Stream gagal: rtsp://admin:rahasia123@192.168.1.10:554/stream1"
    sanitized = sanitize_text(text)
    assert "rahasia123" not in sanitized
    assert "admin" not in sanitized
    assert "192.168.1.10" in sanitized


def test_sanitize_masks_api_keys_and_bearer_tokens() -> None:
    assert "sk-abcdefgh12345" not in sanitize_text("key=sk-abcdefgh12345")
    assert "supersecrettoken" not in sanitize_text("Authorization: Bearer supersecrettoken")


def test_sanitize_for_llm_removes_credentials() -> None:
    payload = "rtsp://user:pass@host/stream"
    assert "pass" not in sanitize_for_llm(payload)


def test_sanitize_handles_empty_input() -> None:
    assert sanitize_text("") == ""
