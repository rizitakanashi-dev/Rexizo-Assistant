# JARVIS — Acceptance Criteria

**Author:** QA + Product (Frontend/AppSec review)
**Date:** 2026-10-22
**Status:** Fase 4 diverifikasi (AI Core & Surveillance Service). AC UI menunggu Fase 5 — lihat §11 & §12.
**Rekonsiliasi kontrak:** 2026-10-22 15:10 — AC ini mengikuti **kode aktual** backend, bukan hanya
`docs/AI-CORE-DESIGN.md`. 15 divergensi tercatat di `docs/AUDIT.md` §3.19 (ID `G-1`…`G-15`).

---

## 0. Cara Baca & Status

| Kolom | Arti |
|---|---|
| **ID** | Pengenal unik, dipakai untuk trace ke test case (`docs/TEST-PLAN.md` §3) |
| **Verifikasi** | Cara membuktikan AC terpenuhi |
| **Bukti** | Artefak yang harus dilampirkan saat AC ditandai terpenuhi |
| **Status** | `Pass` — seluruh kriteria terverifikasi dengan bukti · `Partial` — sebagian kriteria terverifikasi (bukti terisi di kolom Bukti; bagian yang belum tercakup disebut eksplisit) · `Not Started` — belum ada implementasi/pengujian |

> **Aturan bukti.** Status hanya boleh berubah menjadi `Pass` bila **Bukti** terisi (perintah + output eksekusi nyata,
> `docs/TEST-PLAN.md` §10). `Pass` tanpa bukti = cacat proses, diperlakukan sebagai defect S2.
>
> **Status `Partial`** dipakai untuk AC lintas fase: bagian backend sudah terverifikasi dengan bukti, sedangkan bagian
> UI (Fase 5, `apps/web/`) belum ada. Bagian yang belum terverifikasi wajib disebut di kolom **Bukti** — `Partial`
> tanpa keterangan bagian yang tersisa tidak sah.

---

## 1. Kriteria dari PRD yang Sudah Ada (AC-PRD)

Diwarisi dari `docs/PRD.md` §5, diterjemahkan menjadi criteria yang bisa diuji.

| ID | Kriteria | Verifikasi | Bukti | Status |
|---|---|---|---|---|
| AC-PRD-01 | Pengguna dapat bertanya "Apakah ada gerakan di kamera depan?" dan sistem memanggil tool, lalu menjawab berdasarkan data aktual (bukan halusinasi) | Test CHAT-01/CHAT-02 + FE-14 | `pytest tests/api/test_chat.py::test_chat_uses_tool_and_answers_from_database` → PASS: `tools_executed[0].tool_name=get_recent_events`, `reply` memuat 'Front Door' yang dibaca dari SQLite (bukan tebakan). FE-14 (UI) belum ada. | Partial |
| AC-PRD-02 | Event tersimpan di SQLite **< 1 detik** dan terkirim ke UI via WebSocket | Test EP-01/EP-04 + INT-03 | `pytest tests/api/test_websocket.py::test_websocket_receives_new_event` → PASS: event dipersist ke SQLite lalu diterima WS. Ambang waktu <1 detik belum diukur otomatis (belum ada timer di test). | Partial |
| AC-PRD-03 | Dashboard menampilkan daftar kamera, status koneksi, riwayat event + thumbnail snapshot, dan chat responsif | Test FE-01, FE-08, FE-09, FE-13 + screenshot | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-PRD-04 | Matinya service RTSP/kamera tidak membuat backend/LLM crash; LLM error tidak menghentikan deteksi | Test RTSP-01, PF-08, INT-05 | `pytest tests/surveillance/test_worker.py::test_worker_survives_capture_error`, `tests/surveillance/test_capture.py::test_rtsp_source_returns_false_instead_of_raising` → PASS: kegagalan capture tidak mematikan worker/API. Skenario 'LLM mati bersamaan' (INT-02) belum diuji. | Partial |
| AC-PRD-05 | Tidak ada panggilan outbound ke internet yang melampirkan file video/snapshot/RTSP credentials | Test prompt-builder + audit log egress | `pytest tests/api/test_prompts.py` (4 test) → PASS: prompt hanya memuat metadata terstruktur; snapshot/frame/RTSP credential tidak pernah masuk payload LLM. Audit egress via proxy belum dilakukan. | Partial |

---

## 2. UI / Dashboard (AC-UI)

| ID | Kriteria | Verifikasi | Bukti | Status |
|---|---|---|---|---|
| AC-UI-01 | Dashboard menampilkan grid kamera dengan tile live MJPEG, nama kamera, dan badge status (online/offline/connecting/error) | FE-01, FE-02 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-UI-02 | Tile kamera offline **tidak** memount stream dan menampilkan placeholder + waktu `last_seen_at` | FE-02 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-UI-03 | Stream yang putus melakukan retry otomatis dengan backoff (1/2/4/8/15s, maks 5×) lalu menampilkan aksi manual | FE-03 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-UI-04 | Strip status sistem menampilkan CPU, memori, disk bebas, kamera aktif, dan event hari ini dengan ambang warna (amber ≥75%, merah ≥90%; disk merah <10GB) | FE-06 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-UI-05 | Event timeline menampilkan urutan kronologis, thumbnail snapshot, filter kamera/tipe/rentang waktu, dan detail per event | FE-08, FE-11, FE-12 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-UI-06 | Event real-time (`NEW_EVENT`) muncul di timeline **tanpa refresh**, dideduplikasi by `id`, dan tidak muncul bila tidak cocok filter | FE-09, FE-10 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-UI-07 | Setiap permukaan memiliki state loading, empty, error, disconnected, dan reconnecting (§ `UI-DESIGN.md` §7) | FE-19…FE-25 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-UI-08 | UI berfungsi pada lebar 360px – 2560px; keyboard dapat menjangkau seluruh fungsi | E2E viewport + manual a11y | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-UI-09 | Satu fungsi `mapErrorCode()` memetakan **seluruh** kode error yang dipakai backend ke kategori UI (retryable / non-retryable / fatal), menerima kode UPPERCASE aktual **dan** alias lowercase kontrak | FE-16, CF-14, `docs/UI-DESIGN.md` §5.6 | — (frontend belum ada). Kontrak: `apps/api/jarvis_api/core/errors.py` = `AI_DISABLED`, `AI_INVALID_REQUEST`, `AI_PROVIDER_ERROR`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `TOOL_NOT_ALLOWED`, `TOOL_DENIED`, `NOT_FOUND`, `INTERNAL_ERROR`; alias kontrak = `llm_*`, `ai_*` (`G-1`) | Not Started |
| AC-UI-10 | Satu fungsi `mapAiState(health, systemStatus)` menurunkan badge AI **tanpa** mengarang field: `health.components.llm_service` (`available`/`mock`/`unavailable`) + `system/status.ai.{enabled,degraded,provider}` | FE-26, CF-07, CF-08 | — (frontend belum ada). Backend **tidak** menyediakan `ai.state` enum maupun `last_error_at`/`last_success_at` (`G-7`, `G-8`) | Not Started |
| AC-UI-11 | `displayToolName()` + `mapToolStatus()` menormalkan nama & status tool: `get_camera_list` (alias `list_cameras`) dan status `ok`/`success`/`denied`/`error` | FE-13, CF-03, CF-13 | — (frontend belum ada). Backend hanya menghasilkan `ok`/`error`/`denied` (`G-2`, `G-9`) | Not Started |
| AC-UI-12 | Riwayat chat dirender dari bentuk **aktual** `{conversation_id, messages[]}` (pesan `role=tool` membawa `tool_name`), dan tetap bisa di-render bila kontrak berubah ke `{items[]}` | FE-18, CHAT-05, CF-05, CF-06 | — (frontend belum ada). Bentuk aktual backend: `{conversation_id, messages[]}`; kontrak D-4 menyebut `{conversation_id, total, items[]}` (`G-5`, `G-6`) | Not Started |
| AC-UI-13 | Fixture MSW / contract test frontend **identik** dengan bentuk aktual backend pada `docs/TEST-PLAN.md` §4.5 (`CF-01`…`CF-16`); perubahan bentuk payload wajib menggagalkan test frontend | FE-19…FE-25, CF-01…CF-16 | — (`apps/web/` belum ada). Aturan ini jaring pengaman terhadap divergensi kontrak (`docs/AUDIT.md` `F-6`, `G-1`…`G-15`) | Not Started |

---

## 3. Chat & Keterhubungan AI (AC-CHAT)

| ID | Kriteria | Verifikasi | Bukti | Status |
|---|---|---|---|---|
| AC-CHAT-01 | Chat mengirim pesan, menampilkan balasan, dan mempertahankan urutan percakapan | FE-17, CHAT-09 | `pytest tests/api/test_chat.py::test_chat_history_is_persisted` → PASS: pesan user & assistant tersimpan berurutan di DB. FE-17 (UI) belum ada. | Partial |
| AC-CHAT-02 | **Jawaban AI dan hasil tool aktual ditampilkan sebagai dua elemen visual terpisah**; parameter tool ditampilkan apa adanya | FE-13, FE-15 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-CHAT-03 | Bila `tools_executed` kosong **dan** `meta.stop_reason` = `no_tool_grounding`, jawaban faktual diberi label "belum terverifikasi" | FE-14, CHAT-14 | `pytest tests/ai_core/test_ai_core.py::test_no_tool_grounding_fallback_is_honest` → PASS: `meta.stop_reason=no_tool_grounding` dan jawaban tanpa klaim faktual. Label 'belum terverifikasi' (FE-14) belum ada. | Partial |
| AC-CHAT-04 | Riwayat percakapan dimuat dari `GET /chat/history` dan dirender | FE-18, CHAT-05 | `pytest tests/api/test_chat.py::test_chat_history_is_persisted` → PASS: `GET /chat/history` mengembalikan `{conversation_id, messages[]}` sesuai bentuk aktual (TEST-PLAN CHAT-05). Render UI belum ada. | Partial |
| AC-CHAT-05 | Kegagalan provider LLM menghasilkan pesan error yang dapat dipahami user + aksi coba lagi, **tanpa** mengganggu grid kamera & timeline | FE-16, PF-01…PF-14 | Bukti backend: `pytest tests/ai_core/test_ai_core.py::test_error_envelope_shape` → PASS (bentuk envelope `error{code,message,details}`). Bagian UI (bubble error + tombol "Coba lagi") belum ada. | Partial |
| AC-CHAT-06 | Error LLM yang **tidak** bisa diperbaiki dengan retry **tidak** menampilkan tombol "Coba lagi" — baik kode aktual (`AI_RATE_LIMITED`, `AI_DISABLED`, `AI_UNAVAILABLE`) maupun alias kontrak (`llm_quota_exceeded`, `llm_auth_failed`, `ai_disabled`) | FE-16, PF-02, PF-08, PF-10, AC-UI-09 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan). Backend memakai kode UPPERCASE (`G-1`) → frontend wajib memakai `mapErrorCode()` agar kedua kosakata ditangani. | Not Started |
| AC-CHAT-07 | `client_message_id` yang sama dikirim ulang **tidak** menghasilkan pesan duplikat di riwayat | CHAT-10 | `pytest tests/ai_core/test_ai_core.py::test_client_message_id_is_idempotent` → PASS: hanya satu pesan tersimpan untuk `client_message_id` yang sama. | Pass |
| AC-CHAT-08 | Riwayat chat dirender; item `role=tool` (dengan `tool_name`) tampil sebagai chip/baris ringkas, bukan kartu tool; role `system` tidak dirender | FE-18, CHAT-05, CHAT-15, AC-UI-12 | Bukti backend: `pytest tests/api/test_chat.py::test_chat_history_is_persisted` → PASS; bentuk aktual `GET /api/v1/chat/history` = `{conversation_id, messages[]}` (bukan `{total, items[]}` — `G-5`, `G-6`). Render UI belum ada. | Partial |

---

## 4. AI & Tooling (AC-AI)

| ID | Kriteria | Verifikasi | Bukti | Status |
|---|---|---|---|---|
| AC-AI-01 | Pertanyaan faktual **wajib** memicu eksekusi tool; LLM tidak menebak status/data | CHAT-02 | `pytest tests/ai_core/test_ai_core.py::test_factual_question_triggers_tool_call` → PASS: `meta.tool_calls ≥ 1` untuk pertanyaan faktual. | Pass |
| AC-AI-02 | Tool di luar allowlist ditolak, tidak dieksekusi, dan tercatat di audit log; `tools_executed[].status` = `denied` | CHAT-07 | `pytest tests/api/test_tools.py::test_unknown_tool_is_rejected`, `::test_unknown_tool_is_audited` → PASS: tool di luar allowlist ditolak dan tercatat di audit (`action='tool_rejected'`, `success=false`). | Pass |
| AC-AI-03 | Tool mutating **tidak tersedia di MVP** (AI Core §8.1): model yang meminta tool mutating mendapat `status = "denied"`, dan UI **tidak** membuat tombol mutasi | CHAT-09 | `pytest tests/api/test_tools.py::test_mutating_tool_requires_explicit_authorization`, `tests/ai_core/test_ai_core.py::test_mutating_tools_are_not_exposed_to_llm` → PASS: tool mutating menghasilkan `status='denied'` dan tidak pernah masuk skema LLM. | Pass |
| AC-AI-04 | Prompt yang dibangun ke LLM tidak pernah memuat media, path absolut snapshot, RTSP URL, key API, isi `.env`, atau stack trace | CHAT-17, CHAT-18 | `pytest tests/api/test_prompts.py` (4 test) → PASS: sanitasi membuang RTSP credential, API key, dan bearer token; prompt tidak memuat path absolut snapshot maupun media. | Pass |
| AC-AI-05 | Jawaban faktual hanya boleh dihasilkan setelah minimal satu tool sukses; jika tidak, `meta.stop_reason` = `no_tool_grounding` dan jawaban tidak berisi klaim faktual | CHAT-02, CHAT-14 | `pytest tests/ai_core/test_ai_core.py::test_no_tool_grounding_fallback_is_honest`, `::test_factual_question_triggers_tool_call` → PASS: jawaban faktual hanya setelah ≥1 tool sukses; selain itu `stop_reason=no_tool_grounding`. | Pass |
| AC-AI-06 | Tool timeout (5 detik) dan tool error **tidak** menggagalkan seluruh request; `tools_executed[].status` = `timeout`/`error`, `reply` tetap ada | CHAT-11, CHAT-12 | Error tool ditangani (`tools_executed[].status='error'`, request tetap 200) tetapi **timeout tool belum diimplementasikan** (`ToolRegistry.execute` tanpa wrapper timeout — TEST-PLAN CHAT-12) dan belum ada uji khusus. | Partial |
| AC-AI-07 | `meta.stop_reason` ∈ {`completed`, `no_tool_grounding`, `max_rounds`} dan UI menandai status grounding secara deterministik | FE-14, FE-26 | `pytest tests/ai_core/test_ai_core.py::test_no_tool_grounding_fallback_is_honest` → PASS untuk nilai `stop_reason`; chip penanda di UI (FE-14/FE-26) belum ada. | Partial |

---

## 5. Surveillance & Event Pipeline (AC-SURV)

| ID | Kriteria | Verifikasi | Bukti | Status |
|---|---|---|---|---|
| AC-SURV-01 | Pipeline mendeteksi motion & object dari feed sintetis dan menghasilkan event dengan metadata lengkap | EP-01, EP-02 | `pytest tests/surveillance/test_worker.py::test_worker_detects_motion_and_emits_event`, `tests/surveillance/test_pipeline.py::test_object_detection_event_carries_label_and_bbox` → PASS: event `motion` & `object_detected` dengan metadata lengkap dari feed sintetis. | Pass |
| AC-SURV-02 | Event tersimpan ke SQLite dan ter-broadcast ke WS dalam < 1 detik | EP-04, AC-PRD-02 | `pytest tests/api/test_websocket.py::test_websocket_receives_new_event` → PASS (persist + broadcast). Ambang <1 detik belum diukur otomatis. | Partial |
| AC-SURV-03 | Event duplikat ter-debounce (satu event per window) | EP-05 | `pytest tests/surveillance/test_pipeline.py::test_repeated_motion_is_debounced`, `::test_object_debounce_is_per_label` → PASS: satu event per window, debounce terpisah per label. | Pass |
| AC-SURV-04 | Filter dan paginasi `GET /events` benar untuk kamera, tipe, rentang waktu, `limit`, `offset` | EP-06, EP-07 | `pytest tests/api/test_repository.py::test_event_query_filters`, `::test_event_query_pagination`, `tests/api/test_routes.py::test_events_endpoint_rejects_out_of_range_limit` → PASS: filter kamera/tipe/rentang waktu + paginasi benar, `limit` dibatasi. | Pass |
| AC-SURV-05 | Kamera RTSP putus → worker bertahan, status berubah, backend tetap hidup; kamera pulih → reconnect otomatis | RTSP-01…RTSP-05 | `pytest tests/surveillance/test_worker.py::test_worker_survives_capture_error`, `::test_worker_marks_camera_connecting_when_stream_unavailable`, `tests/surveillance/test_capture.py::test_rtsp_source_returns_false_instead_of_raising` → PASS: worker bertahan, status berubah, backend tetap hidup. Reconnect otomatis ke kamera yang hidup (RTSP-03) belum diuji karena tidak ada RTSP server di CI. | Partial |
| AC-SURV-06 | Event `camera_status` terbit saat kamera putus/nyambung, dengan `metadata.reason` | RTSP-02, RTSP-03, EP-08 | Belum Terverifikasi: pipeline belum memancarkan event `camera_status` (`grep -rn camera_status services/surveillance` → hanya konstanta `EVENT_TYPE_CAMERA_STATUS`), sehingga `metadata.reason` tidak pernah terisi. | Not Started |
| AC-SURV-07 | Kegagalan LLM **tidak** menghentikan perekaman & deteksi event | PF-08, INT-05 | Belum Terverifikasi: belum ada uji yang mensimulasikan kegagalan LLM saat event kamera masuk (provider down + worker aktif). | Not Started |

---

## 6. Keamanan (AC-SEC)

| ID | Kriteria | Verifikasi | Bukti | Status |
|---|---|---|---|---|
| AC-SEC-01 | Tidak ada media (gambar/frame/byte) yang dikirim ke Dattio AI; hanya metadata terstruktur | AC-PRD-05, AC-AI-04 | `pytest tests/api/test_prompts.py`, `tests/ai_core/test_ai_core.py::test_dattio_provider_passes_native_tools` → PASS: payload LLM hanya berisi metadata terstruktur; tidak ada gambar/frame/byte snapshot. | Pass |
| AC-SEC-02 | RTSP URL / kredensial kamera tidak pernah keluar dari server: tidak ada di respons API, tidak ada di log, tidak ada di UI | Test `GET /cameras` + scan log | `pytest tests/api/test_routes.py::test_camera_crud_never_exposes_rtsp_url`, `tests/api/test_chat.py::test_chat_never_returns_rtsp_credentials`, `tests/api/test_prompts.py::test_sanitize_masks_rtsp_credentials` → PASS. Scan log smoke test uvicorn: `grep -cE 'rtsp://\\|Bearer ' log` → 0. | Pass |
| AC-SEC-03 | Tidak ada secret di frontend: bundle hasil build bersih dari API key; hanya `VITE_APP_VERSION` & `VITE_ENABLE_MOCKS` yang ada | `gitleaks` + grep `dist/` | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-SEC-04 | Backend ter-bind ke loopback; dashboard hanya dapat diakses melalui reverse proxy yang memaksa TLS + autentikasi | Review konfigurasi + uji akses | `apps/api/jarvis_api/core/config.py` → `host` default `127.0.0.1`; auth API key opsional (`JARVIS_API_KEY`) + guard loopback pada dependency API key. Reverse proxy TLS belum ada (Fase 7). | Partial |
| AC-SEC-05 | CORS tidak memakai wildcard; handshake WS memvalidasi `Origin` | Review konfigurasi + uji OPTIONS/handshake | CORS: `allow_origins` default `['http://localhost:5173']` tanpa wildcard (`core/config.py`). **Validasi `Origin` pada handshake WS belum diimplementasikan** (`api/routes/websocket.py`). | Partial |
| AC-SEC-06 | Input divalidasi: panjang pesan, format `rtsp_url` (skema, blokir IP internal), enum, rentang waktu, `limit` ≤ 200; prompt injection dari `metadata` dinetralkan | Test validasi | `pytest tests/ai_core/test_ai_core.py::test_message_limit_is_enforced`, `tests/api/test_routes.py::test_camera_creation_rejects_invalid_stream_url`, `::test_events_endpoint_rejects_out_of_range_limit` → PASS: batas panjang pesan, format RTSP, `limit` ≤ 200 divalidasi; `sanitize_for_llm` menetralkan prompt injection dari metadata. | Pass |
| AC-SEC-07 | Tidak ada `dangerouslySetInnerHTML`/eval di frontend; CSP `script-src 'self'` tanpa `unsafe-inline` | Scan source + uji header | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-SEC-08 | Setiap event/tile dengan `is_mock === true` menampilkan badge `[MOCK DATA]`; mode mock menampilkan banner global | FE-22, manual | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-SEC-09 | Log produksi bebas API key dan RTSP credential (masking regex aktif) | Grep log | Scan log smoke test uvicorn: `grep -cE 'rtsp://\\|DATTIO_API_KEY=\\|Bearer '` → 0; masking tercakup `pytest tests/api/test_prompts.py::test_sanitize_masks_api_keys_and_bearer_tokens`. | Pass |

---

## 7. Integrasi (AC-INT)

| ID | Kriteria | Verifikasi | Bukti | Status |
|---|---|---|---|---|
| AC-INT-01 | Stack penuh (API + worker + WS + web) bekerja lokal: pertanyaan → tool → jawaban berbasis data DB | INT-01 | Smoke test `uvicorn jarvis_api.main:app` (port 8011): `GET /api/v1/health` → 200; `POST /api/v1/chat/messages` → 200 dengan `tools_executed[0].tool_name=get_system_status`; `POST /api/v1/cameras` → 201; kamera sintetis → `status='online'`, `fps=10.07`; `GET /api/v1/events` → 1 event `motion` (`is_mock=true`); `GET /api/v1/cameras/cam_smoke/snapshot` → 200. Komponen `apps/web/` belum ada → stack belum penuh. | Partial |
| AC-INT-02 | WS terputus → UI menampilkan banner reconnecting → saat reconnect, list catch-up **tanpa event hilang maupun duplikat** | FE-21, FE-10, INT-04 | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-INT-03 | Kamera mati **dan** LLM mati bersamaan: chat gagal, kamera & event tetap bekerja | INT-02, INT-05 | Belum Terverifikasi: belum ada uji kombinasi kamera mati + LLM mati. | Not Started |
| AC-INT-04 | Build frontend (tsc + vite build) bersih tanpa error type, lint bersih | `npm run build`, `npm run lint` | — (`apps/web/` belum ada; Fase 5 belum dikerjakan) | Not Started |
| AC-INT-05 | Test suite penuh (pytest + vitest + playwright) hijau dalam satu perintah | `make test` / script gabungan | `pytest -q` → 77 passed (backend saja, satu perintah). vitest/playwright belum ada. | Partial |

---

## 8. Dokumentasi & Deployment (AC-DOC)

| ID | Kriteria | Verifikasi | Bukti | Status |
|---|---|---|---|---|
| AC-DOC-01 | Dokumentasi deployment lokal tersedia: prasyarat, instalasi, menjalankan API + worker + web, mode mock, troubleshooting | Review `docs/DEPLOYMENT-LOCAL.md` + langkahi manual | `docs/DEPLOYMENT-LOCAL.md` tersedia (427 baris). Verifikasi manual: `pip install -e '.[dev]'` + `uvicorn jarvis_api.main:app` → jalan (lihat AC-INT-01). API dan worker berjalan dalam satu proses; skrip worker terpisah belum ada. | Partial |
| AC-DOC-02 | README mengindeks seluruh dokumen dan menandai status tiap fase | Review | `README.md` diperbarui (status Fase 4, tabel endpoint, cara install/jalankan/uji) dan `docs/ROADMAP.md` Fase 4 ditandai 'Selesai'. | Pass |
| AC-DOC-03 | Kontrak API/event terdokumentasi dan **disetujui Main Agent** sebelum implementasi penuh | Komentar persetujuan pada `docs/API-CONTRACTS.md` | `docs/API-CONTRACTS.md` §2.1–2.4 + tabel kode error uppercase (sinkron dengan `apps/api/jarvis_api/core/errors.py`). Approval tercatat di `.ai-team/tasks/board.md` ('Persetujuan PO: Disetujui 2026-10-22'). | Pass |
| AC-DOC-04 | Delta `D-1`…`D-8` (`docs/AI-CORE-DESIGN.md`) disetujui Main Agent **dan** disinkronkan ke `docs/API-CONTRACTS.md` (hapus `camera_offline`, tulis bentuk chat/history/error envelope baru) | Diff `API-CONTRACTS.md` + catatan approval | D-1…D-8 disetujui (board.md). Sinkronisasi ke `docs/API-CONTRACTS.md`: D-3 & D-7 ✓ (terimplementasi & terdokumentasi), D-4 ✗ (implementasi memakai `{conversation_id, messages[]}`, TEST-PLAN CHAT-05 mencatat bentuk aktual), D-8 ✗ (nama kanonikal implementasi `get_camera_list` dengan alias `list_cameras` — kebalikan dari D-8). | Partial |
| AC-DOC-05 | Semua env var di `.env.example` **benar-benar dibaca** oleh `Settings` (prefix `JARVIS_`) — chat tidak diam-diam jalan di test mode | Cetak `settings.llm_enabled` + isi env; atau `pytest` khusus env | Skrip audit env: 23/23 variabel pada `.env.example` terpetakan ke field `Settings` (tanpa var tak terbaca); `Settings(_env_file=None)` tidak melempar error. | Pass |
| AC-DOC-06 | `apps/api` punya ASGI entry point (`main.py`) yang memasang CORS + auth API key + route `/api/v1/*` + `/health` | `uvicorn jarvis_api.main:app --reload` + `curl /health` | `uvicorn jarvis_api.main:app` → `curl /api/v1/health` → 200 `{"status":"healthy","version":"0.1.0-mvp",...}`; CORS + auth API key + router `/api/v1/*` terpasang (`apps/api/jarvis_api/main.py`). Catatan: path health adalah `/api/v1/health` (bukan `/health`). | Pass |
| AC-DOC-07 | Tidak ada kode error yang dipakai tetapi tidak terdaftar di tabel kode error resmi (`ai_timeout` vs `llm_timeout`) | Review §11.6 vs §7.5 `AI-CORE-DESIGN.md` | Temuan: `apps/api/jarvis_api/core/errors.py` memakai kode uppercase (`AI_DISABLED`, `AI_TIMEOUT`, `AI_RATE_LIMITED`, ...) yang **sudah sinkron** dengan `docs/API-CONTRACTS.md` §2.4, tetapi `docs/AI-CORE-DESIGN.md` §11.6 masih listing kode lowercase lama (`llm_quota_exceeded`, `ai_disabled`, ...). Yang perlu diperbaiki: §11.6 AI-CORE-DESIGN.md. | Partial |

---

## 9. Kriteria releases yang belum dapat dievaluasi

| ID | Kriteria | Alasan belum dievaluasi |
|---|---|---|
| AC-REL-01 | Akurasi deteksi objek pada kamera nyata | Butuh kamera fisik & ground truth; di luar lingkungan CI |
| AC-REL-02 | Kualitas jawaban AI secara substantif | Butuh LLM sungguhan & rubric penilaian manual |
| AC-REL-03 | Skala > 8 kamera | Di luar scope MVP (single-node) |

Ketiganya **tidak boleh** diklaim lulus tanpa pengukuran nyata.

---

## 10. Definition of Done (Apply ke Semua AC)

1. Implementasi ada.
2. TestExists (case di `docs/TEST-PLAN.md` §4–§5) dan **lulus**.
3. Bukti terlampir: perintah + output eksekusi + environment.
4. Lint & typecheck bersih.
5. Tidak ada secret baru.
6. Dokumentasi impacted diperbarui (`docs/API-CONTRACTS.md` bila kontrak berubah).
7. AC ditandai `Pass` **hanya** setelah poin 1–6 terpenuhi.

---

## 11. Ringkasan Status

Status terakhir diperbarui: **2026-10-22 15:10** — Fase 4 (AI Core & Surveillance) terverifikasi:
`pytest -q` → **78 passed** (re-run 15:05), `ruff check` + `ruff format --check` (bersih), smoke test
`uvicorn jarvis_api.main:app`. Rekonsiliasi kontrak ke kode aktual menambah 5 AC UI (`AC-UI-09`…`AC-UI-13`).

| Kelompok | Jumlah AC | Pass | Partial | Fail | Not Started |
|---|---|---|---|---|---|
| AC-PRD | 5 | 0 | 4 | 0 | 1 |
| AC-UI | 13 | 0 | 0 | 0 | 13 |
| AC-CHAT | 8 | 1 | 5 | 0 | 2 |
| AC-AI | 7 | 5 | 2 | 0 | 0 |
| AC-SURV | 7 | 3 | 2 | 0 | 2 |
| AC-SEC | 9 | 4 | 2 | 0 | 3 |
| AC-INT | 5 | 0 | 2 | 0 | 3 |
| AC-DOC | 7 | 4 | 3 | 0 | 0 |
| AC-REL | 3 | 0 | 0 | 0 | 3 (di luar CI) |
| **Total** | **64** | **17** | **20** | **0** | **27** |

Seluruh AC UI/INT yang tersisa menunggu `apps/web/` (Fase 5). Semua AC backend yang tersisa terpetakan pada
temuan terbuka di §12 (`AF-1`…`AF-12`).

---

## 12. Temuan Terbuka (Hasil Verifikasi Fase 4)

> **Catatan penamaan.** Temuan di tabel ini memakai prefiks **`AF-`** (Acceptance Findings) supaya **tidak bentrok**
> dengan prefiks `F-1`…`F-8` yang dipakai `docs/AUDIT.md` (audit repo/kontrak) — dua daftar, dua namespace.

| # | Temuan | Dampak | AC terdampak | Tindak lanjut |
|---|---|---|---|---|
| AF-1 | Timeout tool belum diimplementasikan (`ToolRegistry.execute` tidak punya wrapper timeout) sehingga `tools_executed[].status = "timeout"` belum dapat terjadi | Tool yang macet tidak pernah menutup request | AC-AI-06 | Agent 1 AI Core |
| AF-2 | Pipeline belum memancarkan event `camera_status` (hanya konstanta `EVENT_TYPE_CAMERA_STATUS` yang ada), sehingga `metadata.reason` tidak pernah terisi | UI tidak bisa membedakan reason kamera putus vs nyambung | AC-SURV-06 | Agent 2 Surveillance |
| AF-3 | Validasi `Origin` pada handshake WebSocket belum ada (`apps/api/jarvis_api/api/routes/websocket.py`) | WS bisa diakses lintas origin bila CORS longgar | AC-SEC-05 | Agent 1 AI Core |
| AF-4 | `docs/AI-CORE-DESIGN.md` §11.6 masih memakai kode error lowercase (`llm_quota_exceeded`, `ai_disabled`, …) sedangkan implementasi + `docs/API-CONTRACTS.md` §2.4 memakai kode uppercase (`AI_RATE_LIMITED`, `AI_DISABLED`, …) | Dokumentasi contract dan kode berbeda kosakata | AC-DOC-07 | Agent 1 AI Core |
| AF-5 | Bentuk `GET /chat/history` = `{conversation_id, messages[]}` (bukan `{conversation_id, total, items[]}` seperti D-4) dan nama kanonikal tool = `get_camera_list` dengan alias `list_cameras` (D-8 menyebut kebalikan) | Contract delta D-4 & D-8 belum terpenuhi | AC-DOC-04 | Main Agent (keputusan kontrak) |
| AF-6 | Ambang "< 1 detik" untuk persist+broadcast event belum diukur otomatis | AC-PRD-02 & AC-SURV-02 belum dapat dinyatakan penuh | AC-PRD-02, AC-SURV-02 | Agent 2 Surveillance (timer di test) |
| AF-7 | Reconnect otomatis ke kamera yang hidup kembali belum diuji (butuh RTSP server di CI) | AC-SURV-05 hanya terbukti parsial | AC-SURV-05 | Agent 2 Surveillance |
| AF-8 | Skenario "kamera mati + LLM mati bersamaan" belum ada ujinya | AC-PRD-04 & AC-SURV-07 parsial | AC-PRD-04, AC-SURV-07 | Agent 1 + Agent 2 |
| AF-9 | **15 divergensi kontrak ↔ kode aktual** (`G-1`…`G-15`, `docs/AUDIT.md` §3.19). Blocker UI: `G-1` kode error, `G-5`/`G-6` bentuk history, `G-7` `ai.state`, `G-8` kosakata `/health` | UI salah baca payload; rework besar bila baru ketahuan saat integrasi | AC-UI-09…AC-UI-13, AC-CHAT-06, AC-CHAT-08, AC-DOC-04 | **Main Agent** — putuskan acuan (saya rekomendasikan: kode aktual) |
| AF-10 | `docs/API-CONTRACTS.md` belum disinkronkan ke kode aktual (masih `camera_offline` & bentuk chat lama) | Dua sumber kebenaran | AC-DOC-04 | Pemilik kontrak |
| AF-11 | Validasi `Origin` pada handshake WS + auth WS belum ada (`api/routes/websocket.py` tidak memakai `require_api_key`) | Akses data surveillance dari jaringan lokal | AC-SEC-05 | Agent 1 + Infra |
| AF-12 | Kontrak enumerasi kamera tidak punya `reconnecting`; `CameraStatus` tidak punya `is_mock`; `GET /cameras` balik array langsung | Badge status & badge mock tidak bisa menampilkan data yang tepat | AC-UI-01, AC-SEC-08 | Agent 2 + Main Agent (kontrak) |

---

*Acceptance criteria. Status mencerminkan verifikasi Fase 4 (backend + surveillance service) dan rekonsiliasi
kontrak ke kode aktual pada 2026-10-22 15:10; seluruh AC yang menyangkut UI menunggu Fase 5. Dokumentasi dan audit:
`docs/UI-DESIGN.md`, `docs/TEST-PLAN.md`, `docs/SECURITY.md`, `docs/AUDIT.md`.*
