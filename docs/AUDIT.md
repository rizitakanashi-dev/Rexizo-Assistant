# JARVIS — Repository & UI Audit

**Author:** Frontend / QA / AppSec Engineer (gabungan)
**Date:** 2026-10-22
**Scope:** Audit awal repo `jarvis-assistant` sebelum implementasi dashboard.
**Status:** Selesai — dokumen ini adalah temuan, bukan perubahan kode.

---

## 1. Ringkasan Eksekutif

Repo ini masih **dokumen-saja**: belum ada satu pun file aplikasi (`apps/`, `packages/`, `package.json`, `pyproject.toml`).
Tidak ada commit di branch `master` (`fatal: your current branch 'master' does not have any commits yet`) — seluruh isi repo
masih *untracked*.

Temuan paling material:

1. **Ada dua stack produk yang berbeda bersebelahan di `docs/`** (§3.1). Empat sub-folder berasal dari proyek bernama
   *"Smart CCTV"* (NestJS + PostgreSQL + Socket.IO + Frigate/go2rtc + HLS + MQTT), sementara dokumen kanonik JARVIS
   memakai **FastAPI + SQLite + WebSocket native `/ws/events` + MJPEG + Dattio AI**. Keduanya tidak kompatibel.
2. **Kontrak API masih belum cukup untuk membangun UI end-to-end** (§4). Ada 10 celah kontrak yang harus ditutup Main Agent
   sebelum implementasi penuh — 4 sudah ada spesifikasi di `AI-CORE-DESIGN.md`, sisanya masih terbuka.
3. Dokumen `SECURITY.md` dan `TEST-PLAN.md` yang ada **sudah kanonik JARVIS** dan menjadi dasar perluasan, bukan
   digantikan.

**Perkembangan 2026-10-22 (siang → sore):** agent AI Core sudah menyerahkan `docs/AI-CORE-DESIGN.md` (1.188 baris)
beserta implementasi `apps/api/jarvis_api/` dan `services/surveillance/jarvis_surveillance/`. Backend kini **nyata
jalan**: ada `main.py`, CORS, auth API key, router `/api/v1/*`, WS `/ws/events`, dan test suite yang hijau
(**78 passed**, §3.20). Dua temuan awal saya (`F-1` env var, `F-3` ASGI entry point) **sudah diperbaiki** (§3.16, §3.18).

Masalah yang tersisa justru lebih halus: **implementasi dan kontrak `AI-CORE-DESIGN.md` tidak sama** (§3.19).
Tujuh bentuk payload/kosakata berbeda — yang paling berat:

- **G-1 Kode error**: kontrak pakai lowercase `llm_timeout` / `llm_quota_exceeded` / `llm_auth_failed`; kode aktual
  memakai UPPERCASE `AI_TIMEOUT` / `AI_RATE_LIMITED` / `AI_PROVIDER_ERROR`. Switch di UI tidak akan pernah cocok.
- **G-5/G-6 Bentuk history**: kontrak `{conversation_id, total, items[]}` + `items[].tools_executed[]`; kode aktual
  `{conversation_id, messages[]}` + `messages[].tool_name` (string tunggal). UI yang mengikuti kontrak akan error.
- **G-7 `ai.state`**: kontrak menyyaratkan enum `available|degraded|unavailable|not_configured|disabled`; kode aktual
  hanya punya `degraded: boolean` — badge AI tidak bisa membedakan "tidak dikonfigurasi" dari "gagal".
- **G-8 Kosakata `/health`**: kode aktual memakai `mock`, yang tidak ada di kosakata kontrak.

Selain itu `C-2` (status `reconnecting`), `C-5` (auth WS — **dikonfirmasi belum ada** di `api/routes/websocket.py`),
`C-9` (`is_mock` per kamera), dan `C-10` (catch-up `since` di WS) **masih terbuka**.

Rekomendasi: **Main Agent menetapkan satu sumber kebenaran** (kontrak atau implementasi), memerintahkan sinkronisasi
yang mana pun yang kalah, lalu **menyetujui delta `D-1`…`D-8`** — baru implementasi dashboard dimulai (Fase 5 ROADMAP).
Sampai itu, dokumen UI/test/security di repo ini ditulis terhadap **implementasi aktual** (dengan divergensi
dicatat eksplisit), bukan terhadap kontrak yang belum disetujui.

---

## 2. Isi Repo Saat Ini

```
jarvis-assistant/
├── README.md                            # ringkas: scope + planned stack
├── apps/api/jarvis_api/                 # implementasi AI Core (agent lain)
│   ├── main.py                          # entry point FastAPI + CORS + lifespan
│   ├── api/                             # deps.py, routes/ (health, cameras, events, chat, websocket)
│   ├── core/                            # config.py, errors.py, logging.py, sanitize.py
│   ├── db/                              # models, repository, session
│   ├── schemas/                         # Pydantic response models
│   └── services/                        # chat, llm, prompts, surveillance, broadcaster, tools/
├── services/surveillance/jarvis_surveillance/  # implementasi vision (agent lain)
│   └── capture, detectors, motion, pipeline, runtime, storage, worker
├── tests/                               # test suite backend + surveillance (agent lain)
│   ├── api/                             # test_chat, test_routes, test_tools, test_websocket, ...
│   └── surveillance/
├── .ai-team/tasks/board.md              # board tugas tim (agent lain)
├── pyproject.toml                       # tooling root
├── .env.example                         # konfigurasi placeholder (agent lain)
├── .gitignore
├── docs/
│   ├── PRD.md                           # kanonik JARVIS
│   ├── ARCHITECTURE.md                  # kanonik JARVIS
│   ├── API-CONTRACTS.md                 # kanonik JARVIS
│   ├── EVENT-SCHEMA.md                  # kanonik JARVIS
│   ├── SECURITY.md                      # kanonik JARVIS (diperluas)
│   ├── TEST-PLAN.md                     # kanonik JARVIS (diperluas)
│   ├── ROADMAP.md                       # kanonik JARVIS
│   ├── AI-CORE-DESIGN.md                # kontrak AI Core (agent lain) — delta D-1…D-8
│   ├── AUDIT.md                         # dokumen ini (baru)
│   ├── UI-DESIGN.md                     # baru (tahap awal)
│   ├── ACCEPTANCE-CRITERIA.md           # baru (tahap awal)
│   ├── DEPLOYMENT-LOCAL.md              # baru (tahap awal)
│   ├── backend/backend-api-design.md    # ⚠ lineage Smart CCTV
│   ├── frontend/frontend-scaffold-spec.md # ⚠ lineage Smart CCTV
│   ├── design/database-messaging-design.md # ⚠ lineage Smart CCTV
│   └── product/product-requirements.md  # ⚠ lineage Smart CCTV
└── .git/                                # belum ada commit
```

---

## 3. Temuan Audit

### 3.1 [BLOKIR] Konflik stack dokumen — `docs/` memuat dua produk

| Aspek | Dokumen kanonik JARVIS | Sub-folder "Smart CCTV" |
|---|---|---|
| Backend | Python + FastAPI | Node + NestJS 12 |
| Database | SQLite (SQLAlchemy/aiosqlite) | PostgreSQL + Prisma 7 |
| Realtime | WebSocket native `/ws/events` | Socket.IO 4.8.4, namespace `/realtime` |
| Video | MJPEG `<img>` (`/api/v1/cameras/{id}/stream`) | HLS via hls.js, Frigate → go2rtc |
| Auth | Session lokal **atau** header `X-JARVIS-API-KEY` | JWT access + refresh cookie HttpOnly, RBAC `viewer/operator/admin` |
| AI | Dattio AI (OpenAI-compatible), Tool Registry | Tidak ada lapisan AI/chat |
| Vision | OpenCV MOG2 + YOLOv8n/MobileNet, worker background | Frigate (detector internal) + MQTT topics |
| Pesan | — | Kafka/RabbitMQ? (lihat `design/database-messaging-design.md`) |
| Root aplikasi | `apps/api/` + `apps/web/` | `apps/api/` + `apps/web/` + `packages/shared/` |

**Dampak.** Empat dokumen tersebut **tidak boleh dipakai sebagai sumber kebenaran** untuk implementasi JARVIS.
Konsekuensi konkret yang harus dihindari:

- `frontend-scaffold-spec.md` §6 (Socket.IO `io(\`${baseUrl}/realtime\`)`) — **tidak berlaku**; JARVIS memakai
  `new WebSocket(...)` ke `/ws/events`.
- `frontend-scaffold-spec.md` §8 (hls.js) — **tidak berlaku**; JARVIS memakai `<img src="/api/v1/cameras/{id}/stream">`.
- `frontend-scaffold-spec.md` §5.3–5.4 (login/refresh/logout, `RequireRole`) — **tidak berlaku**; tidak ada endpoint
  `/auth/*` di `API-CONTRACTS.md`.
- `backend-api-design.md` — **tidak berlaku**; daftar endpoint dan bentuk payload-nya berbeda total.
- `design/database-messaging-design.md` — **tidak berlaku**; skema tabel PostgreSQL berbeda dari `EVENT-SCHEMA.md`.

**Yang tetap bernilai dan boleh dipakai ulang** dari dokumen legacy: matriks versi paket yang sudah diverifikasi terhadap
registry npm pada 2026-10-21 (`frontend-scaffold-spec.md` §9) dan catatan *trap* upgrade TypeScript 7 / `react-router` v8 /
MUI 9. Versi ini.Netral terhadap stack backend.

**Rekomendasi (menunggu izin Main Agent — tidak saya eksekusi karena destruktif):**

- Opsi A *(disarankan)*: pindahkan `docs/backend/`, `docs/frontend/`, `docs/design/`, `docs/product/` ke
  `docs/legacy/smart-cctv/` dan tambahkan banner di tiap file: *"Berlaku untuk proyek Smart CCTV, bukan JARVIS."*
- Opsi B: hapus folder tersebut (permanen — butuh persetujuan eksplisit).
- Opsi C: biarkan di tempat, tambahkan banner saja.

### 3.2 [Tinggi] Inkonsistensi enum `event_type`

| Sumber | Nilai |
|---|---|
| `API-CONTRACTS.md` §2.3 (filter `event_type`) | `motion` \| `object_detected` \| `camera_offline` |
| `EVENT-SCHEMA.md` §2 (enum payload) | `motion` \| `object_detected` \| `camera_status` |

Satu nilai berbeda (`camera_offline` vs `camera_status`). UI akan membangun dropdown filter dari enum ini — bila backend
mengirim `camera_status` tetapi UI hanya mengenali `camera_offline`, event status kamera akan **tidak pernah muncul di
timeline**.

**Butuh keputusan:** satu enum kanonik. Saran: `motion | object_detected | camera_status` (lebih kaya, bisa membedakan
`disconnected` vs `reconnecting` via `metadata.reason`), dan `API-CONTRACTS.md` diperbarui.

### 3.3 [Tinggi] Inkonsistensi kosakata status kamera

| Sumber | Nilai status |
|---|---|
| `API-CONTRACTS.md` `GET /cameras` → `status` | `online` \| `offline` \| `connecting` \| `error` |
| `EVENT-SCHEMA.md` §1.3 (event `camera_status`) | `connected` \| `disconnected` \| `reconnecting` \| `fps_dropped` |
| `ARCHITECTURE.md` §2.3 | "online, offline, error" |

Tiga kosakata berbeda. `reconnecting` yang dibutuhkan untuk state UI "menghubungkan kembali" **tidak ada** di enum resmi
kamera. Perbaikan: enum kanonik `online | offline | connecting | reconnecting | error | unknown`, dengan
`connecting`/`reconnecting` dibedakan sebagai state transien.

### 3.4 [Tinggi] Bentuk respons `GET /api/v1/chat/history` tidak didefinisikan

`API-CONTRACTS.md` §2.4 menyebut param `conversation_id` dan `limit`, tetapi **tidak ada contoh payload**. UI butuh
mengetahui bentuk tiap pesan (role, timestamp, id, apakah menyertakan `tools_executed`) untuk merender riwayat sesi.

### 3.5 [Sedang] Tool mutating tidak punya endpoint

`SECURITY.md` §2 mendaftarkan `restart_camera_stream` (mutating, perlu konfirmasi UI) dan `delete_event_history`
(destructive, perlu konfirmasi eksplisit). **Tidak ada endpoint REST untuk keduanya di `API-CONTRACTS.md`.** UI tidak
boleh membuat tombol yang memanggil URL karangan.

### 3.6 [Sedang] Tidak ada error envelope

Tidak ada satu pun respons error (400/401/404/422/429/500) yang didefinisikan bentuknya di `API-CONTRACTS.md`. Tanpa itu,
UI tidak bisa membedakan "kamera tidak ditemukan" dari "server mati" dari "kuota LLM habis" — padahal tiga kondisi itu
butuh tampilan berbeda (§ `UI-DESIGN.md` §7).

### 3.7 [Sedang] Autentikasi WebSocket belum didefinisikan

`WS /ws/events` tidak menyebut mekanisme auth apa pun. Browser **tidak bisa** mengirim header `X-JARVIS-API-KEY` pada
WebSocket native; opsi yang tersedia: query string (risiko bocor di access log), cookie sesi (ideal), atau tanpa auth
(risiko, jika port WS ter-expose). Butuh keputusan sebelum UI membangun koneksi.

### 3.8 [Sedang] CORS tidak dispesifikasikan untuk FastAPI

Hanya dokumen legacy yang menyebut `CORS_ORIGINS`._fastAPI default-nya tidak mengizinkan CORS sama sekali — artinya
aplikasi web di `http://localhost:5173` **akan gagal** memanggil API di `http://localhost:8000` tanpa konfigurasi
eksplisit. Ini harus jadi checklist deploy (lihat `DEPLOYMENT-LOCAL.md`).

### 3.9 [Sedang] Tidak ada endpoint manajemen kamera selain daftar & tambah

`POST /api/v1/cameras` ada, tapi tidak ada `PATCH`/`PUT`/`DELETE`. Konsekuensi UI: **tidak ada** layar edit kamera,
hapus kamera, atau enable/disable kamera. Roadmap UI harus menyadarinya.

### 3.10 [Rendah] Tidak ada `AGENTS.md` / board `.ai-team/tasks/board.md`

Dokumen legacy merujuk `AGENTS.md` dan `.ai-team/tasks/board.md` sebagai sumber aturan dan board item; keduanya tidak ada
di repo. Boundary kepemilikan file antar sub-agent (Backend / Vision / Frontend) belum tertulis — padahal batas ini
eksplisit dalam brief saya.

### 3.11 [Rendah] `GET /health` tidak punya timestamp

`components` bernilai string (`connected` / `running` / `available`) tanpa waktu pengambilan. UI perlu menampilkan
"diperbarui 3 detik lalu" agar operator tahu seberapa segar status tersebut.

### 3.12 [Rendah] Batas `limit` event

`limit` default 50, maksimum 200; `offset` untuk paginasi. UI harus menyediakan infinite-scroll yang menyertakan
`offset` eksplisit dan menangani halaman kosong sebelum `total` tercapai.

### 3.13 [Sedang] Nama field snapshot tidak konsisten antar sumber

`GET /events` mengembalikan `snapshot_path`, sedangkan payload WebSocket `NEW_EVENT` mengembalikan `snapshot_url`
(`API-CONTRACTS.md` §2.3 vs §2.5). Keduanya bermakna sama — path relatif ke endpoint snapshot — tetapi berbeda nama.
UI harus menormalkan keduanya lewat satu fungsi; lebih baik, backend memakai satu nama. Lihat `C-8`.

### 3.14 [Sedang] Tidak ada penanda mock di level kamera / health

`is_mock` hanya ada pada event. Tile kamera dan `/health` tidak menandakan apakah feed yang ditampilkan sintetis.
Tanpa ini, UI tidak bisa memberi badge `[MOCK DATA]` pada tile kamera maupun banner global — hanya pada item event.
Lihat `C-9`.

### 3.15 [Rendah] Ringkasan

Temuan tingkat rendah yang tidak menghalangi implementasi: batas `limit` event (§3.12), field snapshot yang tidak
konsisten (§3.13), penanda mock yang belum ada (§3.14), dan `GET /health` tanpa timestamp (§3.11).

---

### 3.16 [TINGGI] ~~Nama environment variable AI Core tidak terbaca oleh `Settings`~~ — **SUDAH DIPERBAIKI**

**Status:** ditemukan 2026-10-22 13:4x → **diperbaiki agent backend pada 2026-10-22 13:47**
(`apps/api/jarvis_api/core/config.py`, mtime 13:47:50). Bukti: `dattio_api_key`, `dattio_base_url`,
`dattio_model`, `dattio_tool_mode`, `dattio_temperature` kini memakai
`validation_alias=AliasChoices("DATTIO_...", "JARVIS_DATTIO_...")`; `ai_enabled`, `ai_tools_enabled`,
`ai_mutating_tools_enabled`, `ai_tool_first`, `ai_max_message_chars`, `ai_chat_deadline_seconds` juga memakai
alias ganda. `extra="ignore"` tetap berlaku.

> Catatan: `AI_REQUEST_TIMEOUT_SECONDS` (60s) di AI Core diimplementasikan sebagai
> `AI_CHAT_DEADLINE_SECONDS` (nama berbeda, nilai sama). `AI_MAX_TOOL_ROUNDS` diimplementasikan sebagai
> `JARVIS_LLM_MAX_TOOL_ITERATIONS` (default 4). `LLM_MAX_TOKENS`, `LLM_TEMPERATURE` (ai_enabled dst.),
> `AI_MEMORY_MAX_EVENTS`, `AI_CHAT_RETENTION_DAYS`, `AI_SYSTEM_PROMPT`, `AI_MOCK_RESPONSE`,
> `AI_MOCK_TOOL_MODE`, `AI_EMIT_SYNTHETIC_EVENTS`, `AI_RATE_LIMIT_REQUESTS`/`_WINDOW_SECONDS`,
> `LLM_CIRCUIT_FAILURE_THRESHOLD`/`_RESET_SECONDS`/`_HALF_OPEN_MAX_CALLS` **masih tidak ada** di `Settings`.
> Tidak semua wajib ada untuk MVP, tapi AI Core §5.1 menyebutkannya sebagai kontrak env.

### 3.16b Riwayat temuan (arsip — sudah diperbaiki)

Temuan awal (13:4x), sebelum perbaikan:

`apps/api/jarvis_api/core/config.py` mendefinisikan:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="JARVIS_", env_file=".env", extra="ignore")
```

Akibatnya setiap field di kelas `Settings` hanya membaca env berawalan `JARVIS_`. Sementara itu
`docs/AI-CORE-DESIGN.md` §5.1 dan `.env.example` mendokumentasikan nama **tanpa** prefix itu:

| Nama di `.env.example` / AI Core | Yang dibaca `Settings` | Hasil |
|---|---|---|
| `DATTIO_API_KEY` | `JARVIS_DATTIO_API_KEY` | API key **tidak terbaca** → `llm_enabled=False` |
| `DATTIO_BASE_URL` | `JARVIS_DATTIO_BASE_URL` | Base URL **tidak terbaca** → default dipakai |
| `DATTIO_MODEL` | `JARVIS_DATTIO_MODEL` | Model **tidak terbaca** → default dipakai |

Dampak: dengan `.env` yang benar-benar terisi, backend tetap berjalan dalam test mode dan tidak pernah menghubungi
Dattio. Kegagalan ini **samar** — tidak ada error, hanya chat yang "tidak pernah jalan".

Selain itu, **20+ env var yang didokumentasikan di `AI-CORE-DESIGN.md` §5.1 tidak ada** di kelas `Settings`:

| Env var di AI Core | Field `Settings` yang tersedia | Nama aktual di kode |
|---|---|---|
| `AI_ENABLED` | `llm_enabled` | `JARVIS_LLM_ENABLED` |
| `AI_REQUEST_TIMEOUT_SECONDS` (60s) | `llm_timeout_seconds` (provider) | `JARVIS_LLM_TIMEOUT_SECONDS` |
| `LLM_TIMEOUT_SECONDS` | — (tidak ada field terpisah) | — |
| `LLM_MAX_RETRIES` | `llm_max_retries` | `JARVIS_LLM_MAX_RETRIES` |
| `LLM_MAX_TOKENS` | — | — |
| `LLM_TEMPERATURE` | — | — |
| `AI_MAX_TOOL_ROUNDS` | `llm_max_tool_iterations` | `JARVIS_LLM_MAX_TOOL_ITERATIONS` |
| `AI_TOOLS_ENABLED` | — | — |
| `AI_MUTATING_TOOLS_ENABLED` | — | — |
| `AI_MEMORY_MAX_EVENTS` | — | — |
| `AI_CHAT_RETENTION_DAYS` | — | — |
| `AI_SYSTEM_PROMPT` | — | — |
| `LLM_CIRCUIT_FAILURE_THRESHOLD` | — | — |
| `LLM_CIRCUIT_RESET_SECONDS` | — | — |
| `LLM_CIRCUIT_HALF_OPEN_MAX_CALLS` | — | — |
| `AI_MOCK_RESPONSE` | — | — |
| `AI_MOCK_TOOL_MODE` | — | — |
| `AI_EMIT_SYNTHETIC_EVENTS` | — | — |
| `AI_RATE_LIMIT_REQUESTS` / `_WINDOW_SECONDS` | — | — |
| `DATABASE_URL` | `database_url` | `JARVIS_DATABASE_URL` |
| `LOG_LEVEL` | `log_level` | `JARVIS_LOG_LEVEL` |

**Rekomendasi (sudah dijalankan agent backend):**
1. `validation_alias=AliasChoices("DATTIO_API_KEY", "JARVIS_DATTIO_API_KEY")` untuk ketiga variabel Dattio — **DONE**.
2. Sinkronkan `docs/AI-CORE-DESIGN.md` §5.1 + `.env.example` dengan nama field yang benar-benar ada — **TERBELUM**.

**Status AC:** `AC-DOC-05` (*env terpetakan*) → **sudah bisa dinyatakan lulus** setelah verifikasi berikut:
`DATTIO_API_KEY=x DATTIO_BASE_URL=https://y DATTIO_MODEL=z .venv/bin/python -c "from jarvis_api.core.config import Settings; print(Settings().llm_enabled)"` → harus `True`.

### 3.17 [Sedang] Dua nama kode error untuk timeout yang sama

**Status:** ditemukan 2026-10-22, **belum diperbaiki** (dokumen agent lain — tidak boleh diedit tanpa izin).

Di `docs/AI-CORE-DESIGN.md`:
- §6.5 (tabel mapping provider) → provider timeout = `llm_timeout`
- §7.3 & §7.5 (tabel error respons) → deadline total = `ai_timeout`
- §11.6 (tabel kode error resmi) → **hanya mendaftarkan `llm_timeout`** dengan deskripsi "Timeout total permintaan";
  `ai_timeout` **tidak ada** di tabel kode error resmi.

Jadi `ai_timeout` adalah kode yang dipakai di §7.5 tapi tidak terdaftar sebagai kode resmi. Risikonya: UI dan log
menghitung kode error yang tidak valid, dan developer menulis switch yang tidak pernah menolak kode itu.

**Rekomendasi:** tetapkan **satu** nama. Saran: `llm_timeout` untuk timeout provider, `ai_timeout` untuk deadline total
sesuai semantics §7.3, lalu **tambahkan `ai_timeout` ke tabel §11.6**. Sampai disepakati, UI harus menangani
**keduanya** (lihat `docs/TEST-PLAN.md` PF-01 & PF-11).

### 3.18 [Tinggi] ~~`apps/api` belum punya ASGI entry point, CORS, dan auth API key~~ — **SUDAH DIPERBAIKI**

**Status:** ditemukan 2026-10-22 13:4x → **sudah ada** (`apps/api/jarvis_api/main.py`, mtime 13:37:04).

Isi yang sudah memenuhi butir-butir di bawah:

| Butir | Status | Bukti |
|---|---|---|
| `FastAPI()` + `lifespan` | ✅ | `create_app()` di `main.py` |
| `CORSMiddleware` | ✅ | `allow_origins=settings.allowed_origins`, `allow_credentials=True` |
| Router `/api/v1/*` | ✅ | `app.include_router(api_router, prefix=settings.api_prefix)` (`api_prefix="/api/v1"`) |
| `GET /health` | ✅ | `api/routes/health.py` |
| `GET /api/v1/system/status` | ✅ | `api/routes/health.py` |
| Auth API key | ✅ | `require_api_key` di `api/deps.py` — header `X-JARVIS-API-KEY`; tanpa key → hanya loopback (`127.0.0.1`, `::1`, `localhost`, `testclient`) |
| WS `/ws/events` | ✅ ada | `api/routes/websocket.py` — **tanpa autentikasi** (lihat `C-5`) |

**Sisa yang perlu Declare:** `ALLOWED_ORIGINS` di `Settings` membaca `JARVIS_ALLOWED_ORIGINS` (default
`http://localhost:5173`), sedangkan `.env.example` tidak memuat variabel ini — perlu ditambah agar CORS bisa
dikonfigurasi tanpa edit kode.

**Status AC:** `AC-DOC-06` → **sudah bisa dinyatakan lulus** setelah `curl /health` mengembalikan 200 di loopback.

---

### 3.19 [Tinggi] Implementasi AI Core **berbeda** dari kontrak `docs/AI-CORE-DESIGN.md`

**Status:** diverifikasi 2026-10-22 14:00 terhadap kode aktual (`apps/api/jarvis_api/`).
Implementasi berfungsi dan test suite hijau, tetapi **bentuk payload yang sampai ke frontend tidak sama** dengan
yang ditulis di kontrak. Kalau frontend dibangun mengikuti `AI-CORE-DESIGN.md`, 7 hal akan rusak.

| # | Aspek | Kontrak `AI-CORE-DESIGN.md` | Implementasi aktual | Dampak ke UI |
|---|---|---|---|---|
| G-1 | **Kode error** | lowercase: `llm_invalid_response`, `llm_request_rejected`, `llm_unavailable`, `llm_timeout`, `llm_quota_exceeded`, `llm_auth_failed`, `llm_circuit_open`, `ai_disabled`, `ai_timeout`, `internal_error` (§11.6) | **UPPERCASE, set berbeda**: `AI_DISABLED`, `AI_INVALID_REQUEST`, `AI_PROVIDER_ERROR`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `TOOL_NOT_ALLOWED`, `TOOL_DENIED`, `NOT_FOUND`, `INTERNAL_ERROR` (`core/errors.py`) | Switch error di UI tidak akan pernah cocok → semua error jatuh ke "generic error". **Bloker.** |
| G-2 | **`tools_executed[].status`** | `success` \| `error` \| `denied` \| `invalid_arguments` \| `timeout` (§9.2) | default `"ok"`, deskripsi `ok \| error \| denied` (`schemas/__init__.py`) | Chip status tool salah warna/teks. Kutub `invalid_arguments` & `timeout` tidak pernah dipakai. |
| G-3 | **`tools_executed[]`** | 7 field: `tool_name`, `parameters`, `status`, `duration_ms`, `result_summary`, `result` | 9 field: 7 di atas + `name` (duplikat `tool_name`) + `error` | Additive → aman, tapi UI harus baca `tool_name`, bukan `name`. |
| G-4 | **`meta`** | `provider`, `model`, `tool_mode`, `llm_calls`, `tool_calls`, `latency_ms`, `stop_reason`, `context_truncated` (§11.2) | `provider`, `model`, `latency_ms`, `rounds`, `tool_calls`, `stop_reason`, `degraded`, `usage` | `tool_mode` & `context_truncated` **hilang** → panel "tool mode" tidak bisa diisi. `llm_calls` → harus pakai `rounds`. |
| G-5 | **Bentuk history** | `{conversation_id, total, items[]}` (delta `D-4`) | `{conversation_id, messages[]}` (`ChatHistory`) | **Bloker**: UI yang membaca `items` dapat `undefined`. `total` tidak ada → paginasi riwayat mustahil. |
| G-6 | **Item history** | `{id, role, content, created_at, tools_executed[]}` | `{id, role, content, tool_name, created_at}` (`ChatHistoryItem`) | `tools_executed[]` (array) tidak ada — hanya `tool_name` (string). Riwayat tidak bisa menampilkan tool mana yang jalan. |
| G-7 | **`/system/status` → `ai`** | `{enabled, state, provider, tool_mode, last_error_at, last_success_at}` (delta `D-5`) | `{enabled, provider, model, degraded, tool_mode}` | `state` (enum) **hilang**, diganti `degraded: boolean` → badge "degraded vs unavailable vs not_configured" tidak bisa dibedakan. `last_error_at`/`last_success_at` tidak ada → UI tidak bisa menampilkan "terakhir gagal 2 menit lalu". |
| G-8 | **`/health` → `components.llm_service`** | `available` \| `degraded` \| `unavailable` \| `not_configured` \| `disabled` (delta `D-6`) | `available` \| `mock` \| `unavailable` | `mock` **di luar kosakata**; `not_configured` & `disabled` tidak pernah dipakai. UI dan backend tidak bisa bicara bahasa yang sama. |

**Tambahan (bukan bagian delta, tapi relevan untuk UI):**

| # | Aspek | Kondisi aktual | Catatan |
|---|---|---|---|
| G-9 | Nama tool kamera | Terdaftar sebagai `get_camera_list`, dengan **alias** `list_cameras` (`services/tools/builtin.py`) | Alias diterima saat eksekusi (`registry.canonical_name()`), tapi `tool_name` yang dikembalikan adalah `get_camera_list`. UI harus memetakan kedua nama ke satu label tampilan. |
| G-10 | Tool mutating | `restart_camera_stream` & `delete_event_history` **terdaftar** (`ToolRisk.MUTATING` / `DESTRUCTIVE`) | Kontrak AI Core §8.1 menyatakan mutating "di luar MVP". Implementasi: `registry.schemas()` default **tidak** mengirim tool mutating ke model, dan `execute()` menolak dengan `ToolPermissionError` bila `allow_mutating=False`. Artinya UI **tidak boleh** membuat tombol mutasi, dan tool tidak akan pernah muncul di `tools_executed[]` — kecuali flag diaktifkan backend. |
| G-11 | Autentikasi WS | `api/routes/websocket.py` **tidak memuat** `require_api_key` | `C-5` tetap terbuka — dikonfirmasi dengan inspeksi kode, bukan asumsi. |
| G-12 | Penanda mock | `EventItem.is_mock` **ada**; `CameraStatus` **tidak** punya `is_mock`; `/health` tidak punya `mock_mode` | `C-9` tertutup **sebagian**: badge mock per event bisa, badge mock per kamera tidak. |
| G-13 | Enum status kamera | Kode vision (`services/surveillance/jarvis_surveillance/worker.py`) memakai `online` \| `offline` \| `connecting` \| `error` | `reconnecting` **tidak ada** → `C-2` tetap terbuka; state UI "menghubungkan kembali" tidak punya sumber. |
| G-14 | Endpoint tambahan di luar `AI-CONTRACTS` | `GET /api/v1/chat/conversations/{id}/history`, `DELETE /api/v1/chat/conversations/{id}` (soft-delete) | Additive & berguna (privasi). UI belum memakai — oportunidad, bukan cacat. |
| G-15 | Endpoint list kamera | `GET /api/v1/cameras` mengembalikan **array langsung** (`list[CameraStatus]`), bukan objek `{total, items}` | Berbeda dari `GET /api/v1/events` yang memakai `EventPage`. UI harus tahu keduanya berbeda bentuk. |

**Rekomendasi (untuk Main Agent + agent backend):**

1. **Tetapkan satu sumber kebenaran.** Pilih: kontrak `AI-CORE-DESIGN.md` yang jadi acuan, atau implementasi aktual
   yang jadi acuan. Setelah dipilih, yang satunya diperbarui — jangan biarkan keduanya hidup berdampingan.
2. **Prioritaskan G-1, G-5, G-6, G-7, G-8** — lima ini adalah blocker UI (bentuk payload & kosakata status).
3. **G-2** cukup diperbaiki dengan mengganti default `"ok"` → `"success"` dan menambah `invalid_arguments`/`timeout`
   ke enum deskripsi + memberi nilai berbeda saat tool gagal (saat ini `status` selalu `"ok"` bila tool tidak melempar
   exception; `ToolValidationError`/`ToolPermissionError`/path `ToolNotFoundError` dilempar sebagai exception, bukan
   dikembalikan sebagai status — jadi `denied`/`invalid_arguments` praktis tidak pernah muncul di respons).
4. **G-3, G-4, G-14, G-15** cukup diperbaiki dengan memperbarui dokumen, bukan kode.

### 3.20 [Informasi] Bukti eksekusi test suite backend

**Status:** dijalankan 2026-10-22 13:56, 13:59, dan 15:05, dengan `pytest` 9.1.1, Python 3.14.8.

```bash
.venv/bin/python -m pytest -q
# run ke-1 (13:56, sebelum agent backend selesai mengedit): 1 failed, 54 passed
# run ke-2 & ke-3 (13:59, setelah `services/chat.py` & `services/llm.py` diperbarui): 55 passed, 2 warnings
# run ke-4 (15:05, setelah test suite bertambah): 78 passed, 4 warnings in 7.55s
```

Catatan: pada run ke-1, `tests/api/test_chat.py::test_chat_uses_tool_and_answers_from_database` gagal karena
jawaban groundtruth dibuang oleh guard `_honest_fallback`. Agent backend kemudian memperbaiki
`apps/api/jarvis_api/services/chat.py` (mtime 13:58:06) dan `services/llm.py` (13:59:34) — run berikutnya hijau.

Lint/format (17:05 → lihat `docs/ACCEPTANCE-CRITERIA.md` §11): `ruff check .` → All checks passed;
`ruff format --check .` → 72 file bersih.

**Implikasi untuk dokumen ini:** backend adalah *moving target*. Semua temuan di §3.16–§3.19 diverifikasi terhadap
snapshot 2026-10-22 14:00 dan **wajib di-recheck** sebelum dipakai sebagai dasar implementasi frontend.
Tidak ada klaim "seluruh sistem lulus" di sini — yang lulus adalah **test suite backend milik agent backend**;
frontend belum ada, dan test suite belum dibuat.

---

## 4. Celah Kontrak yang Harus Ditutup Sebelum Implementasi Penuh

| # | Celah | Ganggu apa | Prioritas | Status per 2026-10-22 14:00 (diverifikasi ke kode aktual) |
|---|---|---|---|---|
| C-1 | Enum `event_type` kanonik | Filter timeline | Blocker | **Tertutup di kode** — `get_recent_events`/`search_events` memakai `motion`/`object_detected`/`camera_status`; `API-CONTRACTS.md` masih menyebut `camera_offline` → perlu disinkronkan |
| C-2 | Enum `status` kamera kanonik + state `reconnecting` | Badge kamera, state tile | Blocker | **Terbuka** — kode vision (`worker.py`) memakai `online`/`offline`/`connecting`/`error`; **`reconnecting` tidak ada** |
| C-3 | Bentuk payload `GET /chat/history` | Render riwayat chat | Blocker | **Tertutup, tapi BENTROK** — kode: `{conversation_id, messages[]}`; kontrak D-4: `{conversation_id, total, items[]}` → lihat `G-5` |
| C-4 | Error envelope standar (`{ error: { code, message, details } }`) | Semua state error | Blocker | **Tertutup, tapi KODE ERROR BEDA** — envelope sudah benar; kode aktual UPPERCASE ≠ kontrak lowercase → lihat `G-1` |
| C-5 | Mekanisme auth `WS /ws/events` | Koneksi realtime | Blocker | **Terbuka** — `api/routes/websocket.py` **tidak memuat** `require_api_key`; dikonfirmasi lewat inspeksi kode |
| C-6 | Bentuk respons `POST /chat/messages` saat provider LLM gagal | State error chat | Tinggi | **Tertutup, tapi kode error beda** → `G-1` |
| C-7 | Endpoint untuk tool mutating (`restart_camera_stream`, `delete_event_history`) | Aksi konfirmasi UI | Sedang | **Diusulkan buang dari scope** — tool terdaftar tapi `registry.schemas()` tidak mengirimnya ke model dan `execute()` menolak tanpa `allow_mutating`; UI **tidak** membuat tombol mutasi |
| C-8 | Konsistensi nama field snapshot | Resolve URL media | Sedang | **Terbuka** — kamera pakai `snapshot_url`, event pakai `snapshot_path` (isinya URL `/api/v1/events/{id}/snapshot`) |
| C-9 | Penanda mode mock: `is_mock` per kamera & `mock_mode` di `/health` | Badge mock per tile + banner global | Sedang | **Terbuka sebagian** — `EventItem.is_mock` **ada**; `CameraStatus.is_mock` **tidak ada**; `/health` tidak punya `mock_mode` |
| C-10 | Parameter `since` (timestamp) untuk catch-up event di WS | Recovery realtime tanpa event hilang/duplikat | Sedang | **Terbuka** — `websocket.py` hanya broadcast, tidak ada catch-up |

> **Semua baris di atas diverifikasi terhadap kode aktual** `apps/api/jarvis_api/` pada 2026-10-22 14:00.
> Backend sedang aktif dikembangkan, jadi **wajib di-recheck** sebelum implementasi frontend.
>
> `docs/API-CONTRACTS.md` **belum** ditulis ulang — file itu masih menyebut `camera_offline` dan bentuk chat/history
> lama. `G-1`…`G-15` (§3.19) adalah daftar lengkap tempat kontraknya berbeda dari kode.

Permintaan tambahan (sudah diprakarsai, hasil akhir menentukan apakah masih perlu):

- **R-1** Grounding deterministik pada respons chat → **TERPENUHI di kode**. `meta.stop_reason` ada dan berisi
  `completed` | `no_tool_grounding` | `max_rounds` (diverifikasi di `services/chat.py`). UI memakai `stop_reason`,
  bukan heuristic. *Catatan: `grounded: boolean` eksplisit tidak dipakai — `stop_reason` dianggap cukup, tapi ini
  keputusan Main Agent yang perlu dikonfirmasi.*
- **R-2** Deep-link dari jawaban AI ke event timeline → **TERPENUHI di kode**. `tools_executed[].result` memuat
  payload event yang berisi `id` (`services/tools/builtin.py::_event_payload`). UI menampilkan link "Lihat event evt_…".
- **R-3** Header correlation id → **TERPENUHI sebagian**. `meta` memuat `provider`/`model`/`latency_ms`/`rounds`/
  `tool_calls`/`stop_reason`/`degraded`/`usage`, **tanpa** `request_id`; dan **format header HTTP belum disepakati**
  (`X-Request-Id`? `X-Correlation-Id`?). → Status: **sebagian**, tetap terbuka.

Temuan baru yang harus ditutup (bukan bagian dari 9 celah kontrak awal, lihat §3.16–§3.18):

> **Catatan namespace (3 tabung terpisah).**
> - `F-1`…`F-8` di dokumen ini = temuan **audit repo/kontrak**.
> - `AF-1`…`AF-12` di `docs/ACCEPTANCE-CRITERIA.md` §12 = temuan **verifikasi fase** (dipakai prefix `AF-` agar tidak bentrok).
> - `R-1`…`R-13` di `docs/AI-CORE-DESIGN.md` §14 = **risiko** versi agent AI Core; `R-1`…`R-3` di dokumen ini =
>   **permintaan/requirement**. Dua tabel berbeda, jangan dicampur.
> - `C-1`…`C-10` = celah kontrak · `G-1`…`G-15` = divergensi kontrak↔kode.

- **F-1** [Tinggi] Env var AI Core tidak terbaca `Settings` (`env_prefix="JARVIS_"`) → **SUDAH DIPERBAIKI** (§3.16).
- **F-2** [Sedang] `llm_timeout` vs `ai_timeout` — dua nama untuk satu kondisi. *Status 2026-10-22 14:00: kode aktual
  memakai `AI_TIMEOUT` — jadi **tiga** nama untuk satu kondisi (§3.17 + `G-1`).*
- **F-3** [Tinggi] `apps/api` belum punya `main.py` / CORS / auth dependency → **SUDAH DIPERBAIKI** (§3.18).
- **F-4** [Sedang] `AI-CORE-DESIGN.md` §7.1 (halaman 2 dari 2) masih menyebut `camera_offline` — inkonsisten dengan
  enum §3.2 (`camera_status` dengan `status` = `online`/`offline`/`error`). Minor, tapi membuat pembaca ragu.


- **F-5** [Rendah] `AI-CORE-DESIGN.md` masih ada artefak penulisan: kalimat terpotong (§7.1 "mentioning URL RTSP",
  §7.6 "opini window", §10.1 "menentukan_semantik"), satu kata dengan karakter Cyrillic tak sengaja di §10.x
  (semestinya "dampak keamanan"), satu baris tabel dengan jumlah sel tidak konsisten (baris tabel E2E di §11.x), dan
  `camera_offline` yang masih muncul di §7.1 padahal enum §3.2 memakai `camera_status`. Tidak memengaruhi kontrak,
  tapi menurunkan kualitas dokumen. **Berkas milik agent lain - tidak saya perbaiki tanpa izin.**
- **F-6** [Tinggi] **15 divergensi** bentuk payload/kosakata antara `AI-CORE-DESIGN.md` dan implementasi aktual
  (`G-1`…`G-15`, §3.19). Blocker UI: `G-1` (kode error), `G-5`/`G-6` (bentuk history), `G-7` (`ai.state`), `G-8`
  (kosakata `/health`).
- **F-7** [Tinggi] Belum ada fungsi normalisasi di frontend (`mapErrorCode`, `mapAiState`, `displayToolName`,
  `mapToolStatus`) — harus ditulis di P1/P6, dan tiap fungsi wajib punya test.
- **F-8** [Sedang] `docs/API-CONTRACTS.md` belum disinkronkan ke kode aktual (masih `camera_offline` dan bentuk chat
  lama).
---

## 5. Temuan UI (terhadap dokumen, belum terhadap kode)

Karena belum ada satu pun file frontend, audit UI di sini bersifat **audit terhadap kontrak & dokumen**, bukan terhadap
rendering nyata. Yang bisa diverifikasi:

1. **Belum ada design token.** Semua dokumen menyebut "MUI" tanpa satu pun token warna, tipografi, spacing, atau radius.
   `UI-DESIGN.md` (§5) menyediakan baseline token yang bisa dipakai sebagai titik awal — perlu di-review/desain ulang oleh
   pemilik UI.
2. **Belum ada keputusan light/dark.** Dashboard poultry surveillance biasanya dipakai di ruang gelap. Saya rekomendasikan
   **dark-first** dengan light mode sebagai tambahan, dan menyatakan ini sebagai keputusan yang perlu dikonfirmasi.
3. **Kamera grid & event timeline belum didefinisikan interaksinya** (jumlah kolom, BREAKPOINT, perilaku kartu, filter
   apa yang mandatory). `UI-DESIGN.md` (§4, §6) menetapkan default yang masuk akal dan ditandai untuk review.
4. **Belum ada-states yang failure**. Tidak ada satu pun dokumen menyebut apa yang tampil saat kamera offline, WS putus,
   LLM timeout, atau daftar kosong. `UI-DESIGN.md` §7 menyediakan matriks state lengkap.
5. **Belum ada specimen visual.** Karena belum ada aset dan belum ada implementasi, tidak ada screenshot atau design
   specimen yang bisa diaudit. Audit visual baru bisa dilakukan setelah Phase 1 frontend menghasilkan render pertama.

---

## 6. Batas Kepemilikan yang Saya Hormati

Per brief: **tidak mengubah backend/vision milik agent lain, tidak mengarang endpoint, tidak menaruh secret di frontend,
tidak mengklaim tes lulus tanpa bukti, tidak melakukan perubahan destruktif tanpa izin.**

Akibatnya:

- Tidak ada file di `apps/api/`, `services/surveillance/`, atau `docs/AI-CORE-DESIGN.md` yang saya sentuh.
  Temuan yang menyangkut berkas milik agent lain (F-1…F-5) **hanya dicatat** di dokumen ini, tidak diperbaiki.
- Tidak ada endpoint baru yang saya karang. Semua path yang disebut di dokumen saya berasal dari `API-CONTRACTS.md`
  §2, dan kebutuhan yang belum ada kontrak ditandai eksplisit sebagai *contract request* (§4 di atas), bukan endpoint
  baru.
- Tidak ada perubahan destruktif. Dokumen legacy **tidak** saya hapus atau pindahkan — hanya direkomendasikan (§3.1).
- Tidak ada klaim "tes lulus". Semua test case yang ditulis berstatus *belum dijalankan* karena belum ada implementasi.

---

## 7. Rekomendasi Langkah Berikut (urutan)

1. **Main Agent menyetujui delta `D-1`…`D-8`** di `docs/AI-CORE-DESIGN.md` — ini menutup `C-1`, `C-3`, `C-4`, `C-6`
   dan `R-1`, `R-2` sekaligus. **Yang masih terbuka: `C-2`, `C-5`, `C-8`, `C-9`, `C-10`** — semuanya butuh
   keputusan kontrak, bukan sekadar kode.
2. ~~**Agent backend memperbaiki `F-1`**~~ — **SELESAI** (§3.16, `AliasChoices`).
3. ~~**Agent backend membuat `main.py` + CORS + auth**~~ — **SELESAI** (§3.18, `main.py` + `require_api_key`).
4. **Main Agent memutuskan linimasa dokumen Smart CCTV** (§3.1) — Opsi A/B/C.
5. **Pemilik kontrak menyinkronkan `docs/API-CONTRACTS.md`** dengan delta yang disetujui (hapus `camera_offline`, tulis
   bentuk chat/history/error envelope baru) — `F-8`.
6. **Putuskan 15 divergensi `G-1`…`G-15`** (§3.19): adopsi kode aktual sebagai acuan (rekomendasi saya), atau ubah
   kode agar sesuai kontrak. Pemblokirnya UI P1/P6.
7. Review `UI-DESIGN.md`, `TEST-PLAN.md`, `SECURITY.md`, `ACCEPTANCE-CRITERIA.md` oleh Product Owner / Tech Lead.
8. Setelah kontrak disetujui: implementasi Fase 5 (dashboard) dengan urutan Phase 0 → 1 → 2 → 3 → 4 (lihat
   `UI-DESIGN.md` §12).
9. Paralel: penulisan test backend/vision oleh QA + backend agent mengikuti matriks di `TEST-PLAN.md` §4–§5, dan
   menjalankan test kontrak `CF-01`…`CF-16` (§4.5) agar divergensi tidak bisa lolos diam-diam.

---

## 8. Ringkasan Risiko

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | UI dibangun terhadap enum/endpoint yang nanti berubah | Rework besar | Tutup C-1…C-5 dulu |
| R2 | Dokumen legacy dipakai sebagai sumber kebenaran | Arsitektur salah total | Banner + pemisahan folder (§3.1) |
| R3 | UI menampilkan jawaban AI tanpa penanda groundedness | Persepsi data palsu | Chip verifikasi + R-1 dari backend |
| R4 | Secret API key masuk ke bundle browser | Kebocoran kredensial | Header disuntik proxy, bukan di frontend (§ `SECURITY.md` §5) |
| R5 | WS/RSP tanpa auth | Akses data surveillance | C-5 + bind loopback |
| R6 | Klaim "lulus" tanpa bukti | Kepercayaan palsu | `TEST-PLAN.md` §9: bukti wajib |
| R7 | ~~Env var AI Core tidak terbaca~~ | ~~Demo selalu "AI mati"~~ | **CLOSED** — `AliasChoices` ditambahkan (§3.16) |
| R8 | ~~`apps/api` tanpa `main.py`/CORS/auth~~ | ~~Backend tidak bisa dijalankan~~ | **CLOSED** — `main.py` + `require_api_key` ada (§3.18) |
| R9 | Tiga nama kode timeout (`llm_timeout` vs `ai_timeout` vs `AI_TIMEOUT`) | UI switch salah, log tak teragregasi | `F-2` + `G-1`: tetapkan satu nama di satu sumber kebenaran |
| R10 | Kontrak disetujui di `AI-CORE-DESIGN.md` tapi tidak disalin ke `API-CONTRACTS.md` | Dua sumber kebenaran, implementasi meleset | `AC-DOC-04`: diff + approval Main Agent |
| R11 | **Frontend dibangun dari kontrak yang ≠ kode** | UI error saat integrasi; rework | `F-6`: tetapkan satu sumber kebenaran dulu; ulangi audit kontrak sebelum coding frontend |
| R12 | Backend masih aktif berubah saat frontend mulai dibangun | Race kondisi kontrak; UI rusak diam-diam | Pin commit/tag sebelum mulai Phase 1; recheck §3.19 |
| R13 | WS tanpa auth | Akses data surveillance dari jaringan lokal | `C-5`: `require_api_key` untuk WS + bind loopback |

---

## 9. Status Dokumen Ini

| Item | Status |
|---|---|
| Audit awal repo/UI | **Selesai** (§1–§3) |
| Rekonsiliasi dengan `docs/AI-CORE-DESIGN.md` | **Selesai** — §3.16–§3.19, §4, §7 |
| Verifikasi ke **kode aktual** backend | **Selesai** — 2026-10-22 14:00; 15 divergensi terpetakan (`G-1`…`G-15`) |
| Bukti eksekusi test suite backend | **78 passed** pada run terakhir 15:05 (§3.20) — milik agent backend, bukan klaim kelulusan frontend |
| Verifikasi dokumen (link, secret, endpoint, tabel, cross-ref, glyph) | **Lulus** — 0 isu pada dokumen milik tim ini (2026-10-22) |
| Rekonsiliasi dokumen tim dengan **kode aktual** | **Selesai** — `TEST-PLAN.md` §4.5 (`CF-01`…`CF-16`), `SECURITY.md` §5.2b, `ACCEPTANCE-CRITERIA.md` (`AC-DOC-08`…`AC-DOC-12`), `DEPLOYMENT-LOCAL.md` diperbarui ke bentuk aktual |
| Implementasi frontend | **Belum dimulai** — menunggu keputusan "satu sumber kebenaran" atas kontrak |

---

*Dokumen ini dibuat pada tahap audit awal (Fase 2/3 ROADMAP) dan direkonsiliasi pada 2026-10-22 setelah
`docs/AI-CORE-DESIGN.md` masuk. Tidak ada kode aplikasi milik agent lain yang diubah.*
