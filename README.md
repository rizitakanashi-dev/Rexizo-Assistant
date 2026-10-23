# Rexizo — Local Intelligent Assistant

A local-first AI assistant with surveillance capabilities.

## Initial scope
- Text & voice-based AI assistant (Movie Persona)
- Camera monitoring through local webcam & RTSP
- Motion detection
- Event log and notifications
- Local web dashboard
- Conversation and event history

## Stack
- React + TypeScript + MUI (Graphite on warm paper design)
- Python + FastAPI
- OpenCV
- SQLite
- OpenRouter / Dattio AI for LLM inference

---

## Status

Stack backend FastAPI, AI Core (tool registry + OpenRouter LLM client), surveillance service, dan dashboard React/MUI sudah terimplementasi serta lolos **90 backend pytest tests** dan **33 frontend vitest tests**.

## Menjalankan stack secara lokal

```bash
# 1. Backend FastAPI
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cp .env.example .env          # isi OPENROUTER_API_KEY
.venv/bin/uvicorn jarvis_api.main:app --reload --host 127.0.0.1 --port 8000

# 2. Frontend React
cd apps/web
npm install
npm run dev
```

- Kamera fisik lokal (`/dev/video0`) otomatis dideteksi dan dapat distream secara langsung.
- Tanpa API Key, backend berjalan dalam **TEST MODE** (provider LLM offline, tanpa traffic keluar).
- Auth opsional: isi `REXIZO_API_KEY` untuk header `X-REXIZO-API-KEY`; bila kosong, hanya host loopback yang diizinkan.
- Dokumentasi OpenAPI interaktif: <http://127.0.0.1:8000/docs>.

## Endpoint utama

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/v1/health` | Health check aplikasi |
| GET | `/api/v1/system/status` | Status CPU/RAM/disk, jumlah kamera & event |
| GET/POST | `/api/v1/cameras` | Daftar & registrasi kamera (tanpa mengekspos `rtsp_url`) |
| GET | `/api/v1/cameras/{id}/snapshot` | Snapshot terakhir kamera |
| GET | `/api/v1/cameras/{id}/stream` | Aliran MJPEG kamera |
| GET | `/api/v1/events` | Halaman event dengan filter/paginasi |
| GET | `/api/v1/events/{id}/snapshot` | Snapshot event |
| POST | `/api/v1/chat/messages` | Chat Rexizo (tool-first, jawaban berbasis data lokal) |
| GET | `/api/v1/chat/history` | Riwayat percakapan |
| WS | `/ws/events` | Broadcast event & perubahan status kamera |

## Uji

```bash
# Backend tests
.venv/bin/pytest tests/

# Frontend tests
cd apps/web && npm run test
```

## Documentation

### Kanonik — sumber kebenaran
| Dokumen | Isi |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Visi, scope MVP, non-goals, acceptance criteria |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arsitektur sistem, batas layanan, data flow |
| [`docs/API-CONTRACTS.md`](docs/API-CONTRACTS.md) | Kontrak REST & WebSocket |
| [`docs/EVENT-SCHEMA.md`](docs/EVENT-SCHEMA.md) | Skema event & tabel SQLite |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Tahapan pengerjaan |

### Frontend · QA · Security (tahap audit awal)
| Dokumen | Isi |
|---|---|
| [`docs/AUDIT.md`](docs/AUDIT.md) | Audit repo, temuan, celah kontrak yang harus ditutup |
| [`docs/UI-DESIGN.md`](docs/UI-DESIGN.md) | Desain dashboard: chat, status sistem, camera grid, timeline event, matriks state |
| [`docs/TEST-PLAN.md`](docs/TEST-PLAN.md) | Matriks test: chat API, provider failure, event pipeline, RTSP reconnect, integrasi |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model, secret management, CORS, akses dashboard, validasi input |
| [`docs/ACCEPTANCE-CRITERIA.md`](docs/ACCEPTANCE-CRITERIA.md) | 64 acceptance criteria + status + cara verifikasi |
| [`docs/DEPLOYMENT-LOCAL.md`](docs/DEPLOYMENT-LOCAL.md) | Panduan instalasi & menjalankan stack lokal |

### ⚠️ Docs legacy (lineage proyek lain — bukan JARVIS)
`docs/backend/`, `docs/frontend/`, `docs/design/`, `docs/product/` berisi spesifikasi **"Smart CCTV"**
(NestJS + PostgreSQL + Socket.IO + Frigate/go2rtc + HLS). Dokumen tersebut **tidak kompatibel** dengan stack JARVIS
dan **tidak boleh** dipakai sebagai sumber kebenaran. Lihat [`docs/AUDIT.md` §3.1](docs/AUDIT.md) untuk detail dan
rekomendasi penanganannya (menunggu keputusan Main Agent).

