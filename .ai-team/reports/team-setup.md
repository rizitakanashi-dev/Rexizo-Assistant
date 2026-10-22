# Setup Report — JARVIS AI Team

**Tanggal:** 2026-10-22 · **Project:** JARVIS — Local Intelligent Assistant
**Repo kanonik:** `/home/Rizi/Projects/jarvis-assistant`

## 1. Provider & Model

| Item | Nilai |
|---|---|
| Provider | OpenRouter |
| Model family | MiniMax (model ID exact per akun OpenRouter tim) |
| Secret | `DATTIO_API_KEY` via env only — **tidak ada** key hardcoded di repo |

## 2. Agent & Role

| Agent | Role | Write scope kanonik |
|---|---|---|
| Agent A | AI Core & Backend Engineer | `apps/api/jarvis_api/**`, `tests/api/**` |
| Agent B | Surveillance & Computer Vision Engineer | `services/surveillance/**`, `tests/surveillance/**` |
| Agent C | Frontend, QA & Security Engineer | `apps/web/**`, `docs/**` |
| Main Agent | Tech Lead & DevOps Engineer | `.ai-team/**`, integrasi, verifikasi, commit |

Role description lengkap: `.ai-team/roles/`.

## 3. Artefak Koordinasi

| Artefak | Lokasi |
|---|---|
| Task board | `.ai-team/tasks/board.md` |
| Ruling kontrak | `.ai-team/reports/2026-10-22-ruling-kontrak.md` |
| Laporan verifikasi Fase 4 | `.ai-team/reports/2026-10-22-fase-4-verifikasi.md` |

## 4. Sumber Kebenaran Kontrak

**Kode aktual = kanonik.** Dokumen yang kalah disinkronkan ke kode.
Penbattle: `.ai-team/reports/2026-10-22-ruling-kontrak.md` §1.
Semua perubahan ke depan wajib **aditif** (tidak boleh menghapus/ubah field yang dipakai frontend).

## 5. Stack

- Backend: Python 3.11+ · FastAPI · SQLAlchemy 2.0 async · SQLite (aiosqlite) · uvicorn
- Vision: OpenCV (headless) · MOG2/frame-difference · adapter YOLOv8n/MobileNet
- LLM: Dattio AI (OpenAI-compatible) · `DattioClient` + `MockLLMClient` (offline test mode)
- Frontend: React 19 · Vite 6 · TypeScript 5.7 · MUI 6 · TanStack Query 5 · Zustand 5 · react-router 7
- Test: pytest (backend+vision) · vitest + @testing-library/react (frontend) · ruff (lint/format)

## 6. Environment

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env     # isi DATTIO_API_KEY / DATTIO_BASE_URL / DATTIO_MODEL
cd apps/web && npm install
```

## 7. Guardrails

- Tidak ada transmisi video/snapshot mentah atau kredensial RTSP ke LLM cloud.
- Tool mutating/destructive tidak pernah dikirim ke model kecuali `AI_MUTATING_TOOLS_ENABLED=true`.
- WS `/ws/events` wajib auth (`X-JARVIS-API-KEY` / `?api_key=`) — close code 1008 bila gagal.
- Tanpa API key → hanya host loopback yang diizinkan.
