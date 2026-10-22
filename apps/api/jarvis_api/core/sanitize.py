"""Sanitasi log: kredensial RTSP dan API key tidak boleh bocor ke log."""

from __future__ import annotations

import logging
import re

_CREDENTIAL_URL = re.compile(
    r"(?P<scheme>rtsp|rtmps|rtmp|http|https)://(?P<user>[^:/@\s]+):(?P<password>[^@/\s]+)@",
    re.IGNORECASE,
)
_BEARER_TOKEN = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._\-]{8,}")
_API_KEY_TOKEN = re.compile(r"\b(?:sk|dattio)-[A-Za-z0-9._\-]{8,}")


def sanitize_text(text: str) -> str:
    """Mengganti kredensial di dalam teks dengan placeholder."""
    if not text:
        return text
    sanitized = _CREDENTIAL_URL.sub(lambda match: f"{match.group('scheme')}://***:***@", text)
    sanitized = _BEARER_TOKEN.sub("Bearer ***", sanitized)
    return _API_KEY_TOKEN.sub("***", sanitized)


class SanitizingFilter(logging.Filter):
    """Filter logging yang menyanitasi pesan dan argumen record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = sanitize_text(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    key: sanitize_text(value) if isinstance(value, str) else value
                    for key, value in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    sanitize_text(value) if isinstance(value, str) else value
                    for value in record.args
                )
        return True
