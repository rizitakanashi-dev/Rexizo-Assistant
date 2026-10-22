# JARVIS Task Board

## Status Overview
- **Fase Saat Ini**: Fase 4 — Implementasi AI Core & Surveillance
- **Persetujuan PO**: Disetujui (2026-10-22)
- **Sumber Kebenaran**: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API-CONTRACTS.md`, `docs/EVENT-SCHEMA.md`, `docs/SECURITY.md`, `docs/TEST-PLAN.md`, `docs/ROADMAP.md`

---

## 1. Sub-Agent Task Tracking

### Agent 1: AI Core & Backend Engineer (`apps/api/`)
- [x] Briefing tugas diberikan oleh Product Owner
- [x] Desain AI Core + delta kontrak (`docs/AI-CORE-DESIGN.md`) — **Disetujui Main Agent** (D-1…D-8 approved, DattioProvider, FakeProvider, tool canonical+alias)
- [x] Implementasi AI Core di `apps/api/` (DattioProvider, FakeProvider, Orchestrator, Tool Registry, routes, unit test)
- [x] Endpoint REST API & WebSocket `/ws/events`
- [x] Review & Verifikasi oleh Lead Architect — 77 test pytest lulus, `ruff check`/`format` bersih, smoke test uvicorn OK

### Agent 2: Surveillance & Computer Vision Engineer (`services/surveillance/`)
- [x] Briefing tugas diberikan oleh Product Owner
- [x] Scaffold service di `services/surveillance/`
- [x] Implementasi OpenCV RTSP Ingest & Reconnect Loop
- [x] Motion Detector (MOG2 / Frame Difference)
- [x] Adapter Deteksi Objek Lokal (YOLOv8n / MobileNet)
- [x] Event Debouncer & Local Snapshot Storage (`storage/snapshots/`)
- [x] Mock / Synthetic Camera Feed Generator untuk pengujian headless
- [x] Review & Verifikasi oleh Lead Architect — alur end-to-end smoke test: kamera synthetic → status `online` (~10 fps) → event `motion` tersimpan di SQLite + snapshot 200 OK

### Agent 3: Frontend, QA & Security Engineer (`apps/web/`, `tests/`)
- [x] Briefing tugas diberikan oleh Product Owner
- [ ] Scaffold React + Vite + TypeScript + MUI di `apps/web/` — belum dimulai (`apps/web/` belum ada)
- [ ] Layout Dashboard & Status Monitor
- [ ] Live Preview & MJPEG Stream Component
- [ ] Real-time Event Feed (WebSocket listener) & Badge `[MOCK DATA]`
- [ ] Chat Drawer / Widget untuk asisten JARVIS
- [ ] Test Suite integrasi & Security checklist
- [ ] Review & Verifikasi oleh Lead Architect

---

## 2. Pedoman Koordinasi & Guardrails
1. **Arbitrasi Kepemilikan File (Ruling 2026-10-22 - Opsi A Ditetapkan)**:
   - **Agent 1 (AI Core & Backend)**: Pemilik tunggal AI Core di `apps/api/` (`services/llm.py`, `services/chat.py`, `services/prompts.py`, `services/tools/**`, `api/routes/chat.py`, `api/routes/websocket.py`, `core/config.py`, dan AI tests). Mengintegrasikan skeleton awal menjadi implementasi penuh `docs/AI-CORE-DESIGN.md`.
   - **Agent 2 (Surveillance & CV)**: Pemilik `services/surveillance/**` dan adapter surveillance di `apps/api/` (`services/surveillance.py`, `api/routes/cameras.py`, `api/routes/events.py`, `db/models.py`). Dilarang menulis/mengedit file AI Core.
   - **Agent 3 (Frontend & QA)**: Pemilik `apps/web/**` dan integrasi end-to-end tests di `tests/e2e/`.
2. **Kepatuhan Kontrak**: Semua model data wajib mengacu ke `docs/API-CONTRACTS.md` dan `docs/EVENT-SCHEMA.md`.
3. **Privasi**: Tidak ada transmisi video/gambar mentah ke LLM cloud.
