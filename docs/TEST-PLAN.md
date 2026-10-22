# JARVIS — Test Plan & Verification Strategy

**Author:** QA Engineer (with Frontend & AppSec)
**Date:** 2026-10-22
**Status:** Draft — menunggu kontrak API/event disetujui (`docs/AUDIT.md` §4)

---

## 1. Filosofi & Standar Pengujian

- **Verifiable Truth**: Tidak boleh ada klaim bahwa build, test, akurasi, atau performa berhasil tanpa melampirkan log
  eksekusi nyata. Lihat §10 (Aturan Bukti).
- **Headless & Hardware-Independent**: Testing harus dapat berjalan di lingkungan CI atau development tanpa memerlukan
  kamera RTSP fisik yang terpasang. Semua skenario RTSP direplikasi dengan synthetic feed (`§2`).
- **Failure-first**: Setiap fitur wajib punya minimal satu test negatif (error/timeout/offline). happy-path saja
  dianggap belum diuji.
- **Contract-bound**: Test ditulis terhadap kontrak di `docs/API-CONTRACTS.md`. Bila kontrak berubah, test harus ikut
  berubah — dan perbedaannya tercatat.

---

## 2. Test Environments & Synthetic Video Ingest

### 2.1 Synthetic Camera Feed Generator (Mock RTSP)

Untuk menguji pipeline computer vision tanpa kamera fisik:
- Menyediakan fixture OpenCV yang memutar file video MP4 loop atau membuat frame sintetis berukuran 640x480 dengan objek
  bergerak geometris.
- Mode ini diaktifkan melalui flag `MOCK_CAMERA_FEED=true`.

### 2.2 Profil lingkungan

| Profil | LLM | Feed kamera | Kegunaan |
|---|---|---|---|
| `unit` | Fake lokal (deterministik) | Fixture statis | Test unit murni, cepat |
| `integration` | Fake LLM server (HTTP mock) | Synthetic RTSP via FFmpeg/`rtsp-simple-server` lokal | Test integrasi pipeline |
| `e2e` | Fake LLM server | Synthetic feed | Playwright |
| `manual` | Dattio AI sungguhan (opsional) | Kamera sungguhan (opsional) | Sanity check sebelum demo |

> **Aturan:** CI **tidak pernah** memanggil Dattio AI sungguhan. Butuh key, biaya, dan tidak deterministik. Semua test
> otomatis memakai LLM fake yang mengembalikan function-call fixture.

### 2.3 Determinisme

- Semua fixture video/foto berada di repo (`tests/fixtures/`) dengan checksum yang dikunci.
- Waktu di-inject lewat *clock* injectable, bukan `datetime.now()` langsung, agar event timestamp bisa diprediksi.
- Seed acak dikunci per test case.

---

## 3. Matriks Cakupan & Traceability

> **Sumber kontrak per area.** Chat & AI: `docs/AI-CORE-DESIGN.md` (delta `D-1`…`D-8`).
> Cameras/Events/Health: `docs/API-CONTRACTS.md` §2 + `docs/EVENT-SCHEMA.md`.
> Frontend: `docs/UI-DESIGN.md`. Keamanan: `docs/SECURITY.md`.
> Deltas `D-1`…`D-8` **belum disetujui Main Agent** — test yang mengandalkannya berstatus *pending approval*.

Setiap acceptance criterion (`docs/ACCEPTANCE-CRITERIA.md`) dipetakan ke minimal satu test case.

| Area AC | Test suite | Lokasi |
|---|---|---|
| AC-UI-01…08 | Frontend component | `apps/web/src/**/*.test.tsx` |
| AC-CHAT-01…05 | Chat API (backend) + Chat UI (frontend) | `apps/api/tests/test_chat.py`, `apps/web/src/features/chat/*.test.tsx` |
| AC-AI-01…04 | Tool registry + provider failure | `apps/api/tests/test_tools.py`, `test_provider_failure.py` |
| AC-SURV-01…06 | Event pipeline + RTSP reconnect | `apps/api/tests/test_event_pipeline.py`, `test_rtsp_lifecycle.py` |
| AC-SEC-01…07 | Security | `apps/api/tests/test_security.py`, `apps/web/src/test/security.test.ts` |
| AC-INT-01…05 | Integrasi end-to-end | `apps/api/tests/test_integration.py`, `tests/e2e/*.spec.ts` |
| AC-DOC-01…03 | Dokumentasi & deploy | Manual checklist, `docs/DEPLOYMENT-LOCAL.md` |

---

## 4. Test Matrix — Backend & Vision

### 4.1 Unit Tests (`pytest`)

**Tool Registry** (`docs/AI-CORE-DESIGN.md` §8)
- Validasi eksekusi tool terdaftar vs tool yang tidak dikenal (harus ditolak).
- Validasi schema input argumen Pydantic.
- Verifikasi tool mutasi memerlukan flag otorisasi (`AI_MUTATING_TOOLS_ENABLED`, default `false`).
- Tool di luar allowlist ditolak **dan** tercatat di audit log.
- Tool berbahaya (`exec`, `shell`, `http_fetch`) **tidak pernah** ada di registry.
- Skema JSON yang dikirim ke LLM = `params_model.json_schema()`, `additionalProperties: false`.

**Event Schema & Database Repository**
- Insert, query filter (waktu, jenis event, kamera ID), dan pagination pada SQLite.
- Verifikasi serialisasi/deserialisasi metadata JSON.
- `bbox` 4-elemen; `confidence` 0.0–1.0; `is_mock` default `false`.
- Event `camera_status` menyimpan `metadata.reason` (mis. "RTSP timeout").

**AI Core Prompt Builder**
- Verifikasi sanitasi teks dan perakitan pesan sistem.
- **Uji kebocoran media**: prompt yang dibangun tidak boleh memuat byte gambar, path absolut snapshot, atau RTSP URL.
  (Guardrail `SECURITY.md` §1.1.)

### 4.2 Integration Tests

**Surveillance Worker Lifecycle**
- Menguji inisialisasi worker kamera sintetis, deteksi gerakan, pembentukan event, dan penyimpanan snapshot lokal.
- Memastikan jika loop kamera melempar error, thread worker menangkap exception dan mengubah status kamera menjadi
  `error`/`reconnecting` tanpa mematikan proses utama FastAPI.

**WebSocket Event Broadcast**
- Menggunakan FastAPI `TestClient` WebSocket untuk memverifikasi client menerima payload `NEW_EVENT` saat event baru
  dimasukkan ke pipeline.
- Payload memuat `id`, `camera_id`, `camera_name`, `event_type`, `timestamp`, `metadata`, `snapshot_url`, `is_mock`.
- Event duplikat (id sama) tidak menyalin ke list client.

**Chat End-to-End dengan Mock LLM**
- Menguji alur: Pertanyaan user → LLM mengembalikan Function Call → Backend memanggil Tool → Respons dikembalikan.
- Response memuat `reply`, `tools_executed[]` (+`status`, `duration_ms`, `result`), `meta`, `conversation_id`, `created_at`.

### 4.3 Chat API Tests (Permintaan Eksplisit)

Kontrak: `docs/AI-CORE-DESIGN.md` §11.2 (request/response) dan §11.3 (riwayat). Delta `D-1`…`D-4`.

| ID | Skenario | Ekspektasi |
|---|---|---|
| CHAT-01 | Pesan normal → LLM tool-call `get_recent_events` | 200; `reply` terisi; `tools_executed` berisi 1 entri dengan `tool_name`, `parameters`, `status`, `duration_ms`, `result_summary`, `result` |
| CHAT-02 | Pertanyaan faktual ("ada orang?") | Minimal satu tool dijalankan — **grounding check** (AC-AI-01); `meta.tool_calls ≥ 1` |
| CHAT-03 | Pertanyaan non-faktual ("halo") | 200; `tools_executed` boleh kosong; `meta.stop_reason = "completed"` |
| CHAT-04 | `conversation_id` tidak dikenal | 200 dengan riwayat kosong (`messages: []`) |
| CHAT-05 | `GET /chat/history?conversation_id=&limit=` | **Bentuk aktual**: `{conversation_id, messages[]}`; tiap item punya `id`, `role`, `content`, `tool_name`, `created_at`; `limit` dihormati (default 30, maks 200); **tidak ada** `total` maupun parameter `before` |
| CHAT-06 | Pesan kosong / >2000 karakter | 422 (validasi DTO), `reply` null |
| CHAT-07 | Model meminta tool di luar allowlist | Tool **tidak** dieksekusi; audit log `action="tool_rejected"`, `success=false`; **status di respons** — perlu konfirmasi apa yang dikembalikan backend (§4.5 `G-2`) |
| CHAT-08 | Argumen tool tidak valid | Audit log `action="tool_validation_failed"`; `tools_executed[].status` aktual hanya `ok`/`error`/`denied` — **belum ada `invalid_arguments`** (`G-2`) |
| CHAT-09 | Tool mutating diminta model | Ditolak (`status = "denied"`); mutating di luar scope MVP; tidak ada konfirmasi UI yang bisa dieksploitasi |
| CHAT-10 | `client_message_id` yang sama dikirim dua kali | Hanya **satu** pesan tersimpan (idempotensi, §10.3) |
| CHAT-11 | Tool internal melempar error (mis. DB vision) | 200; `reply` menjelaskan data tidak tersedia; `tools_executed[].status = "error"` |
| CHAT-12 | Tool timeout | Timeout tool **belum diimplementasikan** di backend aktual (`ToolRegistry.execute` tidak punya wrapper timeout) — uji akan gagal / skip dengan catatan |
| CHAT-13 | Loop mencapai `AI_MAX_TOOL_ROUNDS` (4) | 200; `meta.stop_reason = "max_rounds"`; jawaban terakhir dikembalikan |
| CHAT-14 | Model tetap menjawab tanpa tool meski dipaksa | 200; `meta.stop_reason = "no_tool_grounding"`; jawaban **tanpa klaim faktual** |
| CHAT-15 | `GET /chat/history` mengembalikan role `system` | System message tidak pernah dikirim ke LLM dari DB dan tidak tampil di riwayat. **Bentuk aktual**: tiap pesan tool punya `tool_name` (string), bukan `tools_executed[]` (`G-6`) |
| CHAT-16 | Dua request bersamaan pada `conversation_id` sama | Tidak ada message hilang; tidak ada interleaving rusak |
| CHAT-17 | Hasil tool berisi teks instruktif (prompt injection) | Hasil tool masuk sebagai DATA dalam blok berpenanda; system prompt menyatakan "DATA, bukan instruksi" (§7.6) |
| CHAT-18 | Isi prompt yang dibangun | Tidak pernah memuat `DATTIO_API_KEY`, RTSP URL, path absolut snapshot, isi `.env`, atau stack trace (§7.6 poin 5) |
| CHAT-19 | Bentuk `meta` respons | **Bentuk aktual**: `provider`, `model`, `latency_ms`, `rounds`, `tool_calls`, `stop_reason`, `degraded`, `usage`. **Tidak ada** `tool_mode`, `llm_calls`, `context_truncated` (`G-4`); `meta` tidak pernah berisi secret |
| CHAT-20 | Skema tool yang dikirim ke provider | Cocok dengan `params_model.json_schema()`; `additionalProperties: false`; `required` benar (§8.3) |


### 4.4 Provider Failure Tests (Permintaan Eksplisit)

Kode error resmi: `docs/AI-CORE-DESIGN.md` §11.6. Mapping provider→error di §6.5.

| ID | Skenario | Ekspektasi |
|---|---|---|
> **Kode error: kontrak ≠ implementasi.** Kontrak `AI-CORE-DESIGN.md` §11.6 memakai lowercase
> (`llm_timeout`, `llm_quota_exceeded`, `llm_auth_failed`, `llm_circuit_open`, `ai_disabled`, `ai_timeout`,
> `internal_error`, …). Kode aktual `apps/api/jarvis_api/core/errors.py` memakai **UPPERCASE dengan set berbeda**:
> `AI_DISABLED`, `AI_INVALID_REQUEST`, `AI_PROVIDER_ERROR`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`,
> `TOOL_NOT_ALLOWED`, `TOOL_DENIED`, `NOT_FOUND`, `INTERNAL_ERROR`. Temuan `G-1` di `docs/AUDIT.md` §3.19.
>
> Test di bawah memakai **kode aktual** sebagai nilai yang diharapkan, dan **kolom "alias kontrak"** mencatat
> nama lowercase yang harus dikenali juga oleh UI (`mapErrorCode()`).

| ID | Skenario | Ekspektasi | Alias kontrak |
|---|---|---|---|
| PF-01 | Dattio AI timeout (30 detik) | 503 `AI_TIMEOUT`; `reply` null; pesan aman untuk user; **tidak ada stack trace** | `llm_timeout`, `ai_timeout` |
| PF-02 | Dattio AI 429 (rate limit / kuota habis) | 503 `AI_RATE_LIMITED`; UI menampilkan "Kuota AI habis" — bukan "error server"; **tanpa** tombol coba lagi | `llm_quota_exceeded` |
| PF-03 | Dattio AI 5xx | 503 `AI_UNAVAILABLE` setelah retry; chat gagal **tetapi** kamera & event pipeline tetap jalan (AC-SURV-07) | `llm_unavailable` |
| PF-04 | Dattio AI mengembalikan body tidak valid / JSON rusak | 502 `AI_PROVIDER_ERROR`; tidak ada exception yang merembet keluar | `llm_invalid_response` |
| PF-05 | Dattio AI menolak request (400) | 502 `AI_PROVIDER_ERROR` | `llm_request_rejected` |
| PF-06 | Dattio AI tidak dapat dihubungi (DNS/offline) | 503 `AI_UNAVAILABLE`; pesan timeout jelas | `llm_unavailable` |
| PF-07 | Dattio AI lambat (di bawah timeout) | Request tetap sukses; UI menampilkan indikator "memproses" | — |
| PF-08 | API key Dattio hilang / ditolak (401) | 503 `AI_PROVIDER_ERROR`; **log tidak membocorkan key** (masking, `SECURITY.md` §3); **tidak ada retry** pada 401 | `llm_auth_failed` |
| PF-09 | Circuit breaker terbuka | 503 `AI_UNAVAILABLE` (fail-fast); tidak ada timeout panjang | `llm_circuit_open` |
| PF-10 | `AI_ENABLED=false` / env kosong | 503 `AI_DISABLED` | `ai_disabled` |
| PF-11 | Deadline total 60 detik habis | 503 `AI_TIMEOUT`; tool yang sudah selesai tetap dipersist | `ai_timeout` |
| PF-12 | Provider down **saat** ada event kamera masuk | Event tetap ter-broadcast ke WS; badge status AI berubah ke merah (`ai.degraded = true` → state `degraded`) | — |
| PF-13 | Retry/backoff LLM | Percobaan ulang terbatas (`llm_max_retries`, default 2) pada 429/5xx/timeout; `Retry-After` dihormati; tidak meledak jumlah request | — |
| PF-14 | Error envelope | Semua error memakai `{error:{code,message,details}}` — **sudah benar di kode aktual**; `details` tidak pernah memuat secret | — |
| PF-15 | Auth API key salah / hilang dari client non-loopback | 401 (`X-JARVIS-API-KEY` tidak cocok) atau 403 (tanpa key, host bukan loopback) — dependency `require_api_key` | — |


### 4.5 Contract Conformance Tests (kontra kode aktual)

**Tujuan:** mengunci **bentuk payload yang benar-benar dikirim backend**, supaya perubahan kode backend tidak
merusak frontend diam-diam. Test ini adalah "kontrak executable" — dibuat bersama agent backend.

Snapshot kontrak (2026-10-22 14:00) — **berlawanan dengan** `docs/AI-CORE-DESIGN.md` di 15 titik
(`docs/AUDIT.md` §3.19). Test di bawah mengunci **kode aktual**, dan akan gagal bila Main Agent memutuskan
kontrak `AI-CORE-DESIGN.md` yang jadi acuan → **itu justru tanda yang benar**: test perlu diperbarui saat
keputusan diambil.

| ID | Skenario | Ekspektasi |
|---|---|---|
| CF-01 | `POST /api/v1/chat/messages` sukses | Body punya `conversation_id`, `message_id`, `reply`, `tools_executed[]`, `meta`, `created_at` — **dan** `message_id` (tidak ada di kontrak §11.2) |
| CF-02 | `tools_executed[]` berisi 1 entri | Punya `name`, `tool_name`, `status`, `duration_ms`, `parameters`, `result`, `result_summary`, `error` |
| CF-03 | `tools_executed[].status` pada tool sukses | `"ok"` (bukan `"success"`) — `G-2` |
| CF-04 | `meta` | Punya `provider`, `model`, `latency_ms`, `rounds`, `tool_calls`, `stop_reason`, `degraded`, `usage` — **tanpa** `tool_mode`, `llm_calls`, `context_truncated` — `G-4` |
| CF-05 | `GET /api/v1/chat/history` | Body `{conversation_id, messages[]}` — **tanpa** `total`, **tanpa** `items` — `G-5` |
| CF-06 | Item history role `tool` | Punya `tool_name` (string) — **tanpa** `tools_executed[]` — `G-6` |
| CF-07 | `GET /api/v1/system/status` → `ai` | Punya `enabled`, `provider`, `model`, `degraded`, `tool_mode` — **tanpa** `state`, `last_error_at`, `last_success_at` — `G-7` |
| CF-08 | `GET /api/v1/health` → `components.llm_service` | Salah satu dari `available` / `mock` / `unavailable` — `mock` **di luar** kosakata kontrak — `G-8` |
| CF-09 | `GET /api/v1/cameras` | **Array langsung** `[CameraStatus, …]`, bukan `{total, items}` — `G-15` |
| CF-10 | `GET /api/v1/events` | `{total, limit, offset, items[]}` (`EventPage`) |
| CF-11 | `CameraStatus` | Punya `id`, `name`, `is_enabled`, `status`, `fps`, `last_seen_at`, `stream_url_preview`, `snapshot_url` — **tanpa** `is_mock` — `C-9` |
| CF-12 | `EventItem` | Punya `id`, `camera_id`, `camera_name`, `event_type`, `timestamp`, `confidence`, `metadata`, `snapshot_path`, `is_mock` |
| CF-13 | `tools_executed[].tool_name` untuk daftar kamera | `"get_camera_list"` (bukan `list_cameras`) — `G-9` |
| CF-14 | Semua error (4xx/5xx) | Body `{error:{code,message,details}}`; `code` **UPPERCASE** dari set `ErrorCode` — `G-1` |
| CF-15 | `GET /api/v1/chat/conversations/{id}/history` | 200 dengan bentuk yang **sama** dengan `/chat/history` |
| CF-16 | `DELETE /api/v1/chat/conversations/{id}` | 200 `{conversation_id, archived: true}`; 404 `NOT_FOUND` bila tidak ada |

> **Setiap test CF harus punya counterpart di frontend**: fixture MSW dengan bentuk **persis** seperti di atas.
> Kalau bentuk berubah, test MSW ikut diperbarui — bukan diam-diam lolos karena MSW masih memakai bentuk lama.

### 4.6 Event Pipeline Tests (Permintaan Eksplisit)

| ID | Skenario | Ekspektasi |
|---|---|---|
| EP-01 | Frame contain motion → event `motion` | Event tersimpan di SQLite **< 1 detik** (AC-SURV-02) |
| EP-02 | Motion → object detector → event `object_detected` | Label + confidence + bbox terisi; `bbox` 4 int |
| EP-03 | Snapshot tersimpan | Berkas JPEG ada di `storage/snapshots/`, dapat diambil via `GET /events/{id}/snapshot` |
| EP-04 | Event di-broadcast ke WS | Client WS menerima `NEW_EVENT` < 1 detik setelah insert |
| EP-05 | Debounce | Gerakan CONTINUOUS menghasilkan **satu** event dalam window debounce, bukan puluhan |
| EP-06 | Filter `GET /events` | `camera_id`, `event_type`, `start_time`, `end_time`, `limit`, `offset` semuanya memfilter benar |
| EP-07 | Paginasi | `total`, `limit`, `offset` konsisten dengan isi `items`; `limit>200` di-clamp/reject |
| EP-08 | Event `camera_status` | Tercatat saat kamera putus/nyambung lagi; `metadata.reason` terisi |
| EP-09 | `is_mock` | Feed sintetik menghasilkan event dengan `is_mock=true`; feed nyata `false` |
| EP-10 | Beban tinggi | 100 event/menit tanpa SQLite lock error; `SELECT` tidak memblokir insert |
| EP-11 | Metadata JSON | Round-trip ke SQLite dan kembali utuh (termasuk unicode pada `label`) |
| EP-12 | Kamera dihapus/dinonaktifkan | Event lama tetap dapat dibaca; snapshot lama tidak dihapus |

### 4.7 RTSP Disconnect / Reconnect Tests (Permintaan Eksplisit)

| ID | Skenario | Ekspektasi |
|---|---|---|
| RTSP-01 | Koneksi RTSP refused (kamera mati) | Worker menangkap exception; status kamera → `error`/`offline`; **proses FastAPI tetap hidup** |
| RTSP-02 | Koneksi putus di tengah streaming | Event `camera_status` terbit; UI WS menerima perubahan status |
| RTSP-03 | Kamera hidup kembali | Worker reconnect otomatis; status kembali `online`; event `camera_status` terbit |
| RTSP-04 | Backoff reconnect | Interval Increasing (tidak spin); tidak membanjiri log |
| RTSP-05 | RTSP timeout (blackhole) | Timeout terdeteksi dalam batas waktu yang disepakati; bukan menggantung selamanya |
| RTSP-06 | Kamera streaming tapi frozen (frame identik) | Terdeteksi sebagai frozen, bukan "online normal" |
| RTSP-07 | RTSP URL salah format / butuh auth | Ditolak dengan pesan aman; kredensial tidak bocor ke log |
| RTSP-08 | 2 kamera, 1 putus | Kamera lain tidak terganggu; pipeline event tetap jalan |
| RTSP-09 | Restart worker surveillance | Event & snapshot sebelumnya tetap utuh di SQLite |
| RTSP-10 | MJPEG endpoint saat kamera mati | `GET /cameras/{id}/stream` tidak hang; klien menerima placeholder/error dalam batas waktu |
| RTSP-11 | Snapshot endpoint saat kamera mati | Mengembalikan 404/204 terstruktur, bukan 500 |
| RTSP-12 | 24 jam soak (opsional, manual) | Tidak ada kebocoran memory/thread/file descriptor |

### 4.8 Frontend Component & Integration Tests (`vitest` / `react-testing-library`)

- Render dashboard dengan mock event list.
- Verifikasi tampilan label badge `[MOCK DATA]` ketika `is_mock=true`.
- Uji koneksi WebSocket reconnect handling pada React client.

**Rincian per permukaan UI (mengikuti `docs/UI-DESIGN.md` §7):**

| ID | Komponen | Yang diuji |
|---|---|---|
| FE-01 | `CameraTile` | Status online/offline/connecting/error/reconnecting → badge & warna benar |
| FE-02 | `CameraTile` | Kamera offline **tidak** me-mount elemen `<img>` stream |
| FE-03 | `MjpegStream` | Retry backoff 1/2/4/8/15s; berhenti setelah 5 percobaan; tombol manual tersedia |
| FE-04 | `MjpegStream` | Watchdog "frame beku" menyalakan overlay setelah 10s tanpa perubahan frame |
| FE-05 | `MjpegStream` | Unmount melepas koneksi (tidak ada `<img>` yang tertinggal) |
| FE-06 | `SystemStatusBar` | CPU ≥90% → merah; ≥75% → amber; disk <10GB → merah |
| FE-07 | `SystemStatusBar` | Data basi >60s → indikator "Data mungkin basi" |
| FE-08 | `EventTimeline` | Cursor/offset pagination **menambah**, bukan mengganti, item |
| FE-09 | `EventTimeline` | Event realtime di-prepend bila cocok filter; **tidak** di-prepend bila tidak cocok |
| FE-10 | `EventTimeline` | Dedupe by `event.id` — event duplikat diabaikan |
| FE-11 | `EventFilters` | Mengubah filter mengubah query key & request; filter tersimpan di URL |
| FE-12 | `EventDetail` | Drawer: fokus masuk saat dibuka, kembali ke pemicu saat ditutup, `Esc` menutup |
| FE-13 | `ChatPanel` | **Kartu tool terpisah dari bubble prose**; status lewat `mapToolStatus()` (`ok`/`success`→hijau, `denied`→amber, `error`→merah); `result` di collapsible "Bukti"; nama tool lewat `displayToolName()` (`get_camera_list` ditampilkan stabil) |
| FE-14 | `ChatPanel` | Chip grounding mengikuti `meta.stop_reason`: `completed` / `no_tool_grounding` / `max_rounds`; jawaban faktual tanpa tool sukses → chip "Belum terverifikasi" |
| FE-15 | `ChatPanel` | Parameter tool ditampilkan apa adanya (tidak ditafsirkan ulang) |
| FE-16 | `ChatPanel` | Error LLM (503) → bubble error dari `error.message` + "Coba lagi" **kecuali** `AI_RATE_LIMITED`/`AI_DISABLED` (dan alias `llm_quota_exceeded`/`llm_auth_failed`/`ai_disabled`); **grid kamera tetap berfungsi**; semua lewat `mapErrorCode()` |
| FE-17 | `ChatPanel` | Kirim via `Enter`; `Shift+Enter` = baris baru; tombol nonaktif saat request aktif; `client_message_id` dikirim & **dipertahankan** saat retry |
| FE-18 | `ChatHistory` | **Bentuk aktual**: riwayat `{conversation_id, messages[]}` dirender; pesan `role=tool` dengan `tool_name` → chip/baris ringkas; role `system` tidak dirender; **toleran** terhadap `{items[]}` bila kontrak `D-4` akhirnya dipakai |
| FE-19 | `ApiError` | 4xx **tidak** di-retry; 5xx di-retry maks 3x |
| FE-20 | `RealtimeBanner` | Menampilkan state connecting/reconnecting dengan percobaan ke-N & jeda |
| FE-21 | `Realtime` | Saat WS putus, `GET /events` di-refetch saat reconnect (catch-up) |
| FE-22 | `MockBadge` | Event `is_mock=true` memunculkan badge di list, timeline, drawer, dan notifikasi realtime |
| FE-23 | `AddCameraDialog` | Body request persis sesuai kontrak; RTSP URL tidak pernah ditampilkan kembali di UI |
| FE-24 | `resolveMediaPath` | Menormalkan `snapshot_path` (list) dan `snapshot_url` (WS) ke URL yang sama |
| FE-25 | `ErrorBoundary` | Route error → tampilan fallback, bukan white screen |
| FE-26 | `SystemStatusBar` | Badge AI memakai vocabulary `ai.state` derivasi dari `mapAiState(health, systemStatus)`; sumber aktual: `health.components.llm_service` (`available`/`mock`/`unavailable`) + `system/status.ai.{enabled,degraded,provider}` (`G-7`,`G-8`) |
| FE-27 | `ChatPanel` | `meta` tidak dirender di UI normal; hanya tersedia di panel debug |
| FE-28 | `ChatPanel` | `tools_executed[].result.items[]` memuat `id` event → link "Lihat event evt_…" membuka drawer detail |

**Mocking strategy:** MSW 3 untuk HTTP (network-level realism, client wrapper asli yang diuji) + WebSocket server lokal
untuk realtime, digerakkan dari test harness. `MjpegStream` dimock di batas modul; test menguji *perilaku*, bukan
decoding video.

### 4.9 E2E Tests (Playwright)

| Spec | Skenario |
|---|---|
| `chat.spec.ts` | Tanya status kamera → jawaban + kartu tool tampil; jaringan dimatikan → bubble error + retry |
| `dashboard.spec.ts` | Grid kamera render tile; kameraGoing offline → tile berubah ke placeholder tanpa reload |
| `events.spec.ts` | Filter kamera → timeline terupdate; realtime push muncul tanpa refresh |
| `realtime.spec.ts` | WS drop → banner reconnecting; setelah reconnect list catch-up tanpa duplikat |
| `mock-mode.spec.ts` | Mode mock aktif → banner global + badge `[MOCK DATA]` terlihat |
| `a11y.spec.ts` | Axe scan pada `/`, `/events`, `/chat` — 0 violation serious |

---

## 5. Test Integrasi (Permintaan Eksplisit)

| ID | Skenario | Komponen yang dirangkai | Ekspektasi |
|---|---|---|---|
| INT-01 | Alur lengkap: pertanyaan → tool → jawaban | LLM fake → ToolRegistry → SQLite → HTTP → UI | Jawaban memuat data aktual dari DB; `tools_executed` terisi |
| INT-02 | Chat + kamera mati bersamaan | LLM fake + kamera synthetic mati | Chat tetap berfungsi; kamera dilaporkan `offline` oleh tool `get_camera_list` |
| INT-03 | Pipeline event + WS + UI | Synthetic feed → worker → SQLite → WS → React | Event tampil di timeline < 1 detik, badge mock sesuai |
| INT-04 | Restart backend saat WS terhubung | WS | Client detecting drop → banner → reconnect → catch-up tanpa event hilang/duplikat |
| INT-05 | Provider LLM mati saat event mengalir | LLM fake down + synthetic feed | Event tetap tercatat & ter-broadcast; hanya chat yang gagal |
| INT-06 | SQLite lock saat insert event bersamaan | Worker + query API | Tidak ada 500; query tetap responsif |
| INT-07 | Full stack lokal | FastAPI + Vite dev | Frontend_dev_fixture talks to real API; CORS & proxy benar |

---

## 6. Non-Functional Tests

| Kategori | Target | Cara ukur |
|---|---|---|
| Performa | `GET /events?limit=50` < 200 ms (lokal, 10k event) | `pytest-benchmark` / timing manual + log |
| Performa | Update UI event baru terlihat < 1 detik | Timestamp pada event vs. render (E2E) |
| Performa | 6 stream MJPEG aktif + timeline tetap interaktif | Manual + FPS counter browser |
| Resource | Memory backend < 512 MB setelah 1 jam | `ps` / `docker stats` |
| Browser | Chrome, Firefox, Edge terbaru (2 versi terakhir) | Manual checklist + Playwright (Chromium) |
| Aksesibilitas | WCAG 2.1 AA | Axe otomatis + review manual keyboard |
| Resolusi | 360px – 2560px | Manual + Playwright viewport |

---

## 7. Quality Gates

Setiap Pull Request / Fase Integrasi wajib memenuhi:

1. `pytest` unit & integration tests lulus 100%.
2. Linter & Type Check (Python `flake8`/`ruff`, TypeScript `tsc --noEmit`).
3. Verifikasi ketiadaan hardcoded API key atau secret di git history.

Ditambahkan:

4. `vitest` frontend hijau; coverage floor **80% statement / 75% branch** pada `apps/web/src` (excluding `main.tsx`).
   Branch threshold yang lebih penting — bug menarik ada di cabang error/reconnect.
5. Tidak ada `console.error` di browser saat alur normal.
6. Tidak ada dependensi baru yang belum dicek resolution-nya (`npm install --package-lock-only` bersih).
7. Secret scan: `gitleaks`/`trufflehog` bersih untuk working tree **dan** history.

---

## 8. Severity & Defect Management

| Severity | Definisi | Contoh |
|---|---|---|
| **S1 Blocker** | Data surveillance salah / bocor, sistem crash, keamanan tembus | Event salah dibaca AI sebagai fakta; secret bocor ke log; kamera offline ditampilkan sebagai online |
| **S2 Critical** | Fungsi inti Rusak, ada workaround | Chat tidak bisa pakai; timeline tidak menampilkan event |
| **S3 Major** | Fungsi terganggu, ada workaround | Filter event tidak bisa reset; badge status salah warna |
| **S4 Minor** | Gangguan kosmetik / copy | Label typo; spacing |

- S1/S2 **blokir** release. S3 masuk backlog sprint berjalan.
- Semua defect S1/S2 wajib punya test regresi yang gagal sebelum fix dan lulus sesudahnya.

---

## 9. Environment Matrix & Data Cleanup

| Item | Nilai dev lokal | Nilai CI |
|---|---|---|
| DB | `storage/jarvis.db` | `storage/test-<uuid>.db` per run |
| Snapshots | `storage/snapshots/` | wiped setelah tiap run |
| API key | `.env` lokal | **tidak ada** — LLM fake |
| Feed kamera | Synthetic | Synthetic |
| Port | 8000 (API), 5173 (web) | random |

- `.env` tidak pernah di-commit; `.env.example` hanya berisi placeholder kosong.
- Test tidak boleh bergantung pada urutan eksekusi (isolation per test).

---

## 10. Aturan Bukti (Anti-Klaim Palsu)

**Dilarang** menulis "test lulus", "build sukses", "sudah diverifikasi" tanpa:

1. Perintah yang dijalankan (persis, termasuk flag).
2. Output eksekusi mentah (ringkas tapi jujur: jumlah test, pass/fail, durasi).
3. Environment (versi Python/Node, OS).
4. Untuk klaim performa: angka Environment yang terukur + metode.

**Contoh bukti yang sah:**

```
$ python -m pytest apps/api/tests -q
47 passed in 6.21s
```

**Contoh klaim yang DILARANG:**

> "Semua test lulus." — tanpa output, tanpa environment, tidak bisa diverifikasi.

Bila test **tidak** dijalankan (mis. karena environment belum siap), tulis eksplisit:

> "Test belum dijalankan — environment belum ada implementasinya. Test case didefinisikan di `docs/TEST-PLAN.md` §4.3–4.7
> dengan status `not run`."

**Status test case di dokumen ini saat ini: `not run`** untuk semua — belum ada implementasi untuk diuji.

---

## 11. Alur Kerja Defect & Retest

1. Reproduksi minimal (seed, env, langkah).
2. Test regresi gagal (evidence).
3. Fix.
4. Test regresi lulus + suite penuh hijau.
5. Update dokumen terkait bila kontraknya berubah.

---

*Test plan. Belum ada test yang dijalankan — belum ada implementasi. Lihat `docs/ACCEPTANCE-CRITERIA.md` untuk
peta kriteria penerimaan.*
