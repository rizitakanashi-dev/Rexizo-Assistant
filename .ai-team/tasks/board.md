# JARVIS Task Board

## Status Overview
- **Fase Saat Ini**: Fase 5 — Dashboard & Integrasi (Fase 4 selesai & terverifikasi)
- **Persetujuan PO**: Disetujui (2026-10-22)
- **Ruling Kontrak**: `.ai-team/reports/2026-10-22-ruling-kontrak.md` — **kode aktual = kanonik**, semua perubahan aditif
- **Sumber Kebenaran**: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API-CONTRACTS.md`, `docs/EVENT-SCHEMA.md`, `docs/SECURITY.md`, `docs/TEST-PLAN.md`, `docs/ROADMAP.md`

---

## 1. Sub-Agent Task Tracking

### Agent 1: AI Core & Backend Engineer (`apps/api/`)
- [x] Briefing tugas diberikan oleh Product Owner
- [x] Desain AI Core + delta kontrak (`docs/AI-CORE-DESIGN.md`) — **Disetujui Main Agent** (D-1…D-8)
- [x] Implementasi AI Core di `apps/api/` (DattioProvider, FakeProvider, Orchestrator, Tool Registry, routes, unit test)
- [x] Endpoint REST API & WebSocket `/ws/events`
- [x] Review & Verifikasi oleh Lead Architect — 77 test pytest lulus, `ruff check`/`format` bersih, smoke test uvicorn OK
- [x] **Ronde nocturne kontrak 2026-10-22** — C-5 (auth WS), C-8 (`snapshot_url`), C-9 (`is_mock`/`mock_mode`), C-10 (catch-up `since`), G-2 (status tool), G-7 (`ai.state`), G-8 (kosakata `/health`), broadcast `CAMERA_STATUS`

### Agent 2: Surveillance & Computer Vision Engineer (`services/surveillance/`)
- [x] Briefing tugas diberikan oleh Product Owner
- [x] Scaffold service di `services/surveillance/`
- [x] Implementasi OpenCV RTSP Ingest & Reconnect Loop
- [x] Motion Detector (MOG2 / Frame Difference)
- [x] Adapter Deteksi Objek Lokal (YOLOv8n / MobileNet)
- [x] Event Debouncer & Local Snapshot Storage (`storage/snapshots/`)
- [x] Mock / Synthetic Camera Feed Generator untuk pengujian headless
- [x] Review & Verifikasi oleh Lead Architect — alur end-to-end smoke test: kamera synthetic → status `online` (~10 fps) → event `motion` tersimpan di SQLite + snapshot 200 OK
- [x] **Ronde nocturne kontrak 2026-10-22** — C-2 (status `reconnecting` pada worker)

### Agent 3: Frontend, QA & Security Engineer (`apps/web/`, `tests/`)
- [x] Briefing tugas diberikan oleh Product Owner
- [x] Scaffold React + Vite + TypeScript + MUI di `apps/web/`
- [x] Layout Dashboard & Status Monitor
- [x] Live Preview & MJPEG Stream Component
- [x] Real-time Event Feed (WebSocket listener) & Badge `[MOCK DATA]`
- [x] Chat Drawer / Widget untuk asisten JARVIS
- [x] Test Suite integrasi & Security checklist (vitest + testing-library)
- [x] **Ronde nocturne kontrak 2026-10-22** — tipe baru (`is_mock`, `snapshot_url`, `reconnecting`, `ai.state`, `mock_mode`), `mapCameraStatus`, `resolveEventSnapshot`, auth WS via vite proxy, handler `CAMERA_STATUS`
- [x] Review & Verifikasi oleh Lead Architect (ronde nocturne) — **LULUS (90 pytest pass, 33 vitest pass, build OK, lint OK)**

---

## 2. Celah Kontrak — Status

| Celah | Status | Penutup |
|---|---|---|
| C-1 enum `event_type` | TUTUP | `motion`/`object_detected`/`camera_status` |
| C-2 status `reconnecting` | TUTUP (ronde ini) | Agent 2 — vision worker |
| C-3 bentuk `/chat/history` | TUTUP | `{conversation_id, messages[]}` (kode = kanonik) |
| C-4 error envelope | TUTUP | `{"error":{code,message,details}}`, kode UPPERCASE |
| C-5 auth WS | TUTUP (ronde ini) | Agent 1 — header/query, close 1008 |
| C-6 respons chat saat provider gagal | TUTUP | `AI_PROVIDER_ERROR` 502 |
| C-7 tool mutating | TUTUP | di luar scope MVP; UI tidak membuat tombol mutasi |
| C-8 `snapshot_url` event | TUTUP (ronde ini) | Agent 1 — aditif |
| C-9 penanda mock | TUTUP (ronde ini) | Agent 1 — `is_mock` + `mock_mode` |
| C-10 catch-up `since` WS | TUTUP (ronde ini) | Agent 1 — aditif |

Divergensi `G-1`…`G-15`: **G-1/G-3/G-4/G-5/G-6/G-9/G-10/G-13/G-14/G-15 → dokumen saja** ·
**G-2/G-7/G-8 → kode + dokumen** (ronde ini).

---

## 3. Pedoman Koordinasi & Guardrails
1. **Arbitrasi Kepemilikan File (Ruling 2026-10-22 - Opsi A Ditetapkan)**:
   - **Agent 1 (AI Core & Backend)**: Pemilik `apps/api/jarvis_api/**` + `tests/api/**`.
   - **Agent 2 (Surveillance & CV)**: Pemilik `services/surveillance/**` + `tests/surveillance/**`.
   - **Agent 3 (Frontend & QA)**: Pemilik `apps/web/**` + `docs/**`.
   - **Main Agent**: `.ai-team/**`, integrasi, verifikasi akhir, commit.
2. **Kepatuhan Kontrak**: Semua model data wajib mengacu ke `docs/API-CONTRACTS.md` dan `docs/EVENT-SCHEMA.md`.
3. **Privasi**: Tidak ada transmisi video/gambar mentah ke LLM cloud.
4. **Aditivitas**: Semua perubahan kontrak bersifat aditif — field lama tidak boleh dihapus/diubah.
5. **Bukti, bukan klaim**: Tidak ada status "lulus" tanpa output test yang benar-benar dijalankan.

---

## 4. Riwayat Commit

| Commit | Isi |
|---|---|
| `0956155` | baseline — Fase 4 (AI Core + Surveillance) + draft Fase 5 (dashboard) + docs |
