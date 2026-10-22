# Ruling Kontrak JARVIS — 2026-10-22

**Pelopor:** Main Agent (Morphy) · **Status:** FINAL · **Cakupan:** seluruh repo `jarvis-assistant`

## 1. Keputusan Ruling

**Kode aktual = sumber kebenaran. Dokumen `docs/AI-CORE-DESIGN.md` yang kalah akan disinkronkan ke kode.**

Alasan:
- Frontend Fase 5 (`apps/web/`) sudah dibangun terhadap bentuk **kode aktual**: `ErrorCode` UPPERCASE
  (`AI_TIMEOUT`, `TOOL_DENIED`, …), `ChatHistory {conversation_id, messages[]}`, `EventItem.snapshot_path`,
  `GET /cameras` → array langsung, `ToolExecution.status = "ok"`.
- `apps/web/src/utils/contract.ts` sudah punya **dual-map** normalizer (UPPERCASE + lowercase) — pola
  "kompatibel ke dua arah" yang persis kita butuhkan selama transisi.
- 78 test pytest + 4 test vitest sudah hijau terhadap kode aktual. Mengubah bentuk payload = rewrite besar.

**Konsekuensi:** semua perubahan ke depan harus **aditif** (menambah field/endpoint), tidak boleh
mengubah atau menghapus field yang sudah dipakai frontend.

## 2. Aturan Aditivitas (WAJIB dipatuhi semua agent)

1. Field baru → default/tetap, tidak boleh membuat field lama hilang atau berubah tipe.
2. Enum baru → tambahkan nilai baru, jangan ganti nama nilai lama.
3. Endpoint baru → path baru, jangan ubah bentuk response endpoint lama.
4. Perubahan breaking hanya sah bila accompanied migrasi frontend di commit yang sama + update `docs/`.
5. Perubahan backend **wajib** disertai test. Perubahan frontend **wajib** disertai test bila ada logika baru.

## 3. Penutupan Celah Kontrak (P1 — wajib)

| Celah | Ruling | Peranetapan konkret |
|---|---|---|
| **C-2** | TUTUP — aditif | Tambah status `reconnecting` ke enum kamera. `worker.py`Plateu `STATUS_CONNECTING` saat stream putus → `reconnecting`. State DB `status` kolom sudah `String(16)` — cukup. |
| **C-5** | TUTUP | `WS /ws/events` WAJIB pakai auth yang sama dengan REST: `X-JARVIS-API-KEY` via query param `?api_key=` atau header. Tanpa key → hanya loopback (mengikuti `require_api_key`). |
| **C-8** | TUTUP — aditif | `EventItem` tambah field `snapshot_url` (alias dari `snapshot_path`, isi identik). `snapshot_path` TETAP ada. Frontend pakai `snapshot_url` ke depan. |
| **C-9** | TUTUP — aditif | `CameraStatus` tambah `is_mock: bool`. `/health` tambah `components.mock_mode` atau top-level `mock_mode: bool`. `EventItem.is_mock` sudah ada. |
| **C-10** | TUTUP — aditif | `WS /ws/events` dukung query `?since=<ISO8601>` → kirim event yang terjadi setelah `since` (catch-up) sebelum masuk mode live. Tanpa `since` = hanya live. |

## 4. Divergensi G-1…G-15 — Zarip

**Perbaikan kode (P1):**
- **G-1** — biarkan kode UPPERCASE. `contract.ts` sudah handle dua arah. **T-API-CONTRACTS.md** saja.
- **G-2** — `ToolExecution.status`: tambah `invalid_arguments` + `timeout` ke enum deskripsi, dan **perbaiki mapping error→status** di `chat.py` (`ToolValidationError` → `invalid_arguments`, bukan `error`).
- **G-5/G-6** — biarkan `messages[]` + `tool_name`. **T-API-CONTRACTS.md** saja.
- **G-7** — `SystemStatus.ai` **tambah** `state: str` (enum: `available|degraded|unavailable|not_configured|disabled`). `degraded: bool` TETAP ada.
- **G-8** — `/health` `components.llm_service` — **tambah** nilai enum kanonik. `mock` tetap ada, tapi tambahkan `not_configured`/`disabled` sebagai nilai yang lebih presisi.
- **G-9/G-10/G-13/G-14/G-15** — cukup update dokumen (G-13 berubah jadi C-2 di atas).

**Semua G-1…G-15 harus DIDOKUMENTASIKAN di `docs/API-CONTRACTS.md` sebagai "kanonik = kode aktual".**

## 5. Pembagian Write Scope (mutual exclusive — DILARANG menulis file milik agent lain)

| Agent | File yang BOLEH ditulis | File yang DILARANG |
|---|---|---|
| **A — Backend Contract** | `apps/api/jarvis_api/api/routes/websocket.py`, `api/routes/cameras.py`, `api/routes/health.py`, `api/routes/events.py`, `api/routes/chat.py`, `api/deps.py`, `schemas/__init__.py`, `services/surveillance.py`, `services/chat.py`, `core/config.py`, `services/broadcaster.py`, `tests/api/**`, `tests/surveillance/**` | `apps/web/**`, `docs/**`, `services/surveillance/**` |
| **B — Vision/Reconnect** | `services/surveillance/jarvis_surveillance/**`, `tests/surveillance/**` | `apps/api/**`, `apps/web/**`, `docs/**` |
| **C — Frontend & Docs** | `apps/web/**`, `docs/**`, `.ai-team/**` | `apps/api/**`, `services/**`, `tests/**` |

> **PENTING:** `tests/surveillance/**` dipakai A dan B → A **dilarang** menulis di sana;所有 test A di `tests/api/**`.

## 6. Definisi Selesai (DoD) — wajib diverifikasi

- `cd apps/web && npx vitest run` → semua pass
- `cd apps/web && npm run build` → sukses tanpa error TS
- `.venv/bin/python -m pytest -q` → semua pass, tidak boleh turun dari 78
- `.venv/bin/ruff check .` → All checks passed
- `.venv/bin/ruff format --check .` → bersih
- Tidak ada API key/secret hardcoded

## 7. Urutan Eksekusi

1. Baseline commit (selesai — `0956155`)
2. Agent B (Vision) + Agent A (Backend) paralel → Agent C (Frontend) setelah kontrak A selesai
3. Verifikasi menyeluruh oleh Main Agent
4. Update `docs/AUDIT.md` + `docs/ACCEPTANCE-CRITERIA.md` + task board
5. Commit akhir


---

## 8. Spesifikasi Konkreto per Celah (WAJIB persis — ini yang dikerjakankan)

### C-2 — status `reconnecting` (Agent B: vision · Agent A: schema + broadcast)
- `services/surveillance/jarvis_surveillance/worker.py`: tambah `STATUS_RECONNECTING = "reconnecting"`.
  Saat `self._source.read()` gagal → `reconnecting` bila sebelumnya pernah `online`, selain itu `connecting`.
- `apps/api/jarvis_api/schemas/__init__.py`: `CameraStatus.status` deskripsi → `online | offline | connecting | reconnecting | error`.
- Backend **broadcast** perubahan status kamera lewat WS (tambahan aditif): event `CAMERA_STATUS`,
  payload `{"event":"CAMERA_STATUS","data":{"camera_id","name","status","fps","last_seen_at","is_mock"}}`.

### C-5 — auth WebSocket (Agent A)
- `apps/api/jarvis_api/api/routes/websocket.py`: sebelum `broadcaster.connect()`, validasi:
  - key dari query param `?api_key=` ATAU header `x-jarvis-api-key`;
  - bila `settings.api_key` terisi → wajib cocok (`hmac.compare_digest`), bila tidak → `await websocket.close(code=1008)`;
  - bila `settings.api_key` kosong → hanya host loopback (`127.0.0.1`, `::1`, `localhost`, `testclient`), selain itu `close(code=1008)`.
- WebSocket **tidak** boleh memakai `HTTPException` (tidak bisa jadi HTTP error envelope). Gunakan `close(code=1008)`.
- `docs/SECURITY.md` diperbarui oleh Agent C (Main).

### C-8 — `snapshot_url` pada event (Agent A) — aditif
- `EventItem` tambah `snapshot_url: str | None = None`. Isi **identik** dengan `snapshot_path`.
  `snapshot_path` TETAP ada (tidak dihapus).

### C-9 — penanda mock (Agent A) — aditif
- `CameraStatus` tambah `is_mock: bool = False`; `_to_schema()` isi dari `camera.is_mock`.
- `HealthResponse` tambah `mock_mode: bool = False` (top-level). `is_mock` per event sudah ada.

### C-10 — catch-up `since` di WS (Agent A) — aditif
- `GET /ws/events?since=<ISO8601>`: saat connect, kirim event dengan `timestamp > since` (urutan **naik/asc**),
  payload **identik** dengan broadcast live (`{"event":"NEW_EVENT","data":{...}}`), lalu masuk mode live.
- Tanpa `since` → hanya live (perilaku saat ini, tidak berubah).
- Query DB via `app.state.database.session()` + `EventRepository.query(start_time=since, ...)`.

### G-2 — status tool (Agent A)
- `ToolExecution.status` deskripsi → `success | error | denied | invalid_arguments | timeout`.
- `registry.execute()` sukses → `status="success"` (bukan `"ok"`).
- `chat.py::_run_tool` pemetaan: `ToolValidationError` → `invalid_arguments`; `ToolNotFoundError`/`ToolPermissionError` → `denied`; error lain → `error`.

### G-7 — `ai.state` (Agent A)
- `SystemStatus.ai` (dict) **tambah** key `"state"` dengan enum `available | degraded | unavailable | not_configured | disabled`.
  Logika: `ai_enabled` false → `disabled`; `llm_enabled` true → `available`; `test_mode` → `not_configured`; selain itu → `unavailable`.
  Key `degraded` (bool) **TETAP** ada.

### G-8 — kosakata `/health` (Agent A)
- `components.llm_service` memakai enum kanonik: `available | degraded | unavailable | not_configured | disabled`.
  Logika sama dengan G-7. Nilai lama `mock` **tidak lagi** dipakai sebagai nilai utama.
- `docs/API-CONTRACTS.md` (Agent C) menyinkronkan ke bentuk final ini.

### Kontrak frontend yangWAJIB diasumsikan Agent C (deterministik, dari ruling ini)
- `EventItem` punya `snapshot_url` (string|null) **dan** `snapshot_path` (string|null).
- `Camera` punya `is_mock: boolean`.
- `CameraStatus` enum: `online | offline | connecting | reconnecting | error`.
- `HealthResponse` punya `mock_mode: boolean`; `components.llm_service` ∈ enum kanonik G-8.
- `SystemStatus.ai` punya `state: 'available'|'degraded'|'unavailable'|'not_configured'|'disabled'` **dan** `degraded: boolean`.
- `ToolExecution.status` ∈ `success|error|denied|invalid_arguments|timeout` (toleran `ok` tetap diterima).
- WS menerima event `NEW_EVENT` dan `CAMERA_STATUS`; WS URL tetap `ws://<host>/ws/events`.
- WS auth: backend menerima key via header **atau** query `?api_key=`. Dev proxy (vite) menyuntik header.

