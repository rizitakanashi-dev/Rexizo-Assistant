# JARVIS — Security & Privacy Architecture

**Author:** AppSec Engineer (with Backend/Frontend review)
**Date:** 2026-10-22
**Status:** Draft — menunggu persetujuan Main Agent atas bagian yang bergantung kontrak (`C-4`, `C-5`)

---

## 1. Local-First Privacy Directives

1. **Zero External Media Ingress/Egress**:
   - Frame video, snapshot gambar, dan RTSP stream **TIDAK PERNAH** dikirim ke model LLM eksternal (Dattio AI) atau
     server cloud pihak ketiga manapun secara default.
   - LLM hanya menerima metadata terstruktur (contoh: teks berupa label `"person"`, persentase keyakinan `0.89`,
     timestamp, dan nama kamera).
2. **Kerahasiaan RTSP & Kredensial**:
   - URL RTSP asli yang mengandung username dan password kamera (misal `rtsp://user:pass@192.168.1.10/...`) disimpan
     terisolasi di sisi server dalam file konfigurasi lokal (`.env` atau SQLite terenkripsi lokal).
   - Frontend tidak pernah menerima RTSP URL mentah. Frontend hanya mengakses endpoint proxy MJPEG internal
     (`/api/v1/cameras/{id}/stream`) atau snapshot (`/api/v1/cameras/{id}/snapshot`).

### 1.1 Batas Kepercayaan

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser (dashboard)          │ TIDAKenant broker tepercaya       │
│  - untrusted input           │  - tidak boleh diberi kredensial  │
│  - tidak memegang secret      │  - hanya akses media via proxy   │
└───────────────┬──────────────┴──────────────────────────────────┘
                │ same-origin (proxy dev / reverse proxy produksi)
                │  + header X-JARVIS-API-KEY disuntik oleh proxy
┌───────────────▼──────────────────────────────────────────────────┐
│ FastAPI (localhost:8000) — TRUST BOUNDARY #1                      │
│  validasi input, auth, CORS, rate limit, tool allowlist           │
└───────────────┬──────────────────────────────────────────────────┘
                │  tool terotorisasi saja; metadata terstruktur saja
┌───────────────▼──────────────────────────────────────────────────┐
│ Dattio AI (eksternal) — TRUST BOUNDARY #2                         │
│  hanya menerima teks metadata; tidak pernah menerima media        │
└──────────────────────────────────────────────────────────────────┘
```

Aturan: **data yang melewati batas #1 ke #2 harus dapat dibuktikan tidak mengandung media.** Ini diverifikasi oleh test
`AI Core Prompt Builder` (§4.1 `TEST-PLAN.md`).

---

## 2. Tool Execution Security & Permission Boundaries

JARVIS mengadopsi model *Least Privilege Tooling*:

| Tool Name | Kategori | Izin / Tingkat Risiko | Konfirmasi Diperlukan? | Deskripsi |
|---|---|---|---|---|
| `get_system_status` | Read-only | Rendah (Safe) | Tidak | Membaca CPU, RAM, status worker |
| `list_cameras` | Read-only | Rendah (Safe) | Tidak | Membaca daftar nama & status kamera |
| `get_recent_events` | Read-only | Rendah (Safe) | Tidak | Membaca query log event dari SQLite |
| `search_events` | Read-only | Rendah (Safe) | Tidak | Pencarian event berbasis kata kunci (label objek, nama kamera, reason) |
| `restart_camera_stream` | Mutating | Sedang | Ya (via UI Action) | Merestart worker RTSP kamera tertentu |
| `delete_event_history` | Destructive | Tinggi | Ya (Konfirmasi Eksplisit) | Menghapus log event lama |

> **Nama kanonik tool** ditetapkan di `docs/AI-CORE-DESIGN.md` §8.2 + delta `D-8`: `list_cameras` (bukan
> `get_camera_list`). Tabel di atas memakai nama kanonik tersebut.
>
> **Status mutating:** `RiskLevel.MUTATING` dan `DESTRUCTIVE` ditandai **"di luar MVP"** pada AI Core
> (`AI-CORE-DESIGN.md` §8.1). Artinya tool `restart_camera_stream` dan `delete_event_history` **belum diimplementasikan**
> dan tidak punya endpoint (`C-7`). UI tidak membuat tombol untuk keduanya; tabel ini tetap menjadi spesifikasi
>wana untuk saat tool itu ditambahkan.
>
> **`search_events` adalah vektor prompt-injection tambahan.** Queryanya adalah teks bebas dari user (2–120 karakter)
> dan hasilnya masuk ke prompt LLM sebagai data. Aturan §7.1 & §2.1 berlaku: hasil tool diperlakukan sebagai data,
> bukan instruksi.

### Guardrails Penanganan Tool:
1. **Strict Allowlist**: Tool yang dieksekusi hanya yang terdaftar di `ToolRegistry`. Pemanggilan tool di luar allowlist
   ditolak dengan log audit keamanan.
2. **Schema Validation**: Parameter tool divalidasi ketat menggunakan Pydantic sebelum dieksekusi.
3. **No Dynamic Shell / Code Execution**: Asisten JARVIS dilarang memiliki tool yang mengeksekusi shell command (`eval`,
   `exec`, `subprocess`) pada mesin host.

### 2.1 Aturan tambahan

4. **Prompt injection dari sumber eksternal.** Event `metadata` (label objek, `reason`) dapat berisi teks arbitrer dari
   kamera/OCR. Teks tersebut diperlakukan sebagai **data**, bukan instruksi: di-escape sebelum masuk ke prompt, dan
   tidak pernah dieksekusi sebagai tool.
5. **Konfirmasi mutating di UI.** `restart_camera_stream` dan `delete_event_history` memerlukan dialog konfirmasi eksplisit
   di UI **dan** token otorisasi backend. Tombol UI saja tidak cukup (backend tetap menolak tanpa konfirmasi).
6. **Rate limit mutating.** Aksi mutating dibatasi per sesi (mis. maks 1 restart per kamera / 5 menit) untuk mencegah
   loop restart yang membebani worker.
7. **Audit trail.** Setiap eksekusi tool (read-only maupun mutating) mencatat: timestamp, tool, parameter (ter-sanitasi),
   hasil (ringkas), actor. Log tidak boleh memuat RTSP URL mentah.

> **Catatan kontrak:** sampai ada endpoint untuk tool mutating (`C-7`), UI **tidak** menampilkan tombolnya sama sekali.

---

## 3. Secret Management & Sanitization

- File `.env` wajib dimasukkan ke `.gitignore`.
- Dattio AI API Key disimpan pada variabel lingkungan `DATTIO_API_KEY`.
- Logger disanitasi: Regex masking otomatis untuk URL RTSP yang mengandung format kredensial `//.*:.*@`.

### 3.1 Inventaris secret

| Secret | Lokasi | Boleh di frontend? |
|---|---|---|
| `DATTIO_API_KEY` | `.env` backend | **Tidak** |
| RTSP URL (mengandung user:pass) | `.env` / config backend / SQLite lokal | **Tidak** |
| `X-JARVIS-API-KEY` | `.env` backend | **Tidak** (disuntik proxy) |
| Kredensial kamera (user/pass) | Backend saja | **Tidak** |
| Kredensial DB (jika ada) | `.env` backend | **Tidak** |
| `siteName`, `apiBaseUrl`, `siteTimezone` | `public/config.json` | Ya (bukan secret) |

### 3.2 Aturan pem Handling di frontend

1. **Tidak ada secret di bundle.** Variabel `VITE_*` hanya untuk konfigurasi non-rahasia: `VITE_APP_VERSION`,
   `VITE_ENABLE_MOCKS`. Aturan ini diverifikasi lewat secret scan (`gitleaks`) pada bundle hasil build.
2. **Header API key disuntik di server, bukan di browser.** Pendekatan: Vite dev proxy dan reverse proxy produksi
   menambahkan `X-JARVIS-API-KEY` ke request yang diteruskan ke FastAPI. Browser tidak pernah melihat maupun mengirim
   key tersebut. Konsekuensi: **dashboard hanya dapat diakses melalui proxy** — itulah yang dikehendaki, karena
   dashboard bukan aset publik.
3. **Tidak ada secret di `localStorage`/`sessionStorage`.** `localStorage` hanya untuk preferensi non-rahasia (tema,
   kepadatan grid, sidebar state).
4. **Tidak ada secret di query string.** URL WS tidak pernah membawa token.
5. **Redaksi di UI.** Bila backend(seharusnya) tidak pernah mengirim RTSP URL, UI tetap defensif: field yang menyerupai
   RTSP/kredensial **tidak dirender** dan dilaporkan sebagai warning di console dev.
6. **`.env.example` hanya berisi placeholder kosong**, tidak pernah nilai nyata.
7. **Rotasi.** `DATTIO_API_KEY` dapat dirotasi tanpa menyentuh frontend. `X-JARVIS-API-KEY` dapat diganti di `.env` +
   restart proxy.

---

## 4. UI Transparency (Labeling Mock Data)

- Demi kepatuhan pengujian dan integritas observasi, jika sistem dijalankan dengan feed sintetis atau data mock,
  frontend wajib menampilkan badge jelas: **`[MOCK DATA]`** atau **`[SYNTHETIC FEED]`**.
- Dilarang keras memalsukan hasil observasi kamera seolah-olah data live kamera riil.

### 4.1 Implementasi di UI

| Lokasi | Aturan |
|---|---|
| Event di list/timeline | Badge `[MOCK DATA]` amber pada setiap item dengan `is_mock === true` |
| Detail event | Badge yang sama, eksplisit |
| Notifikasi realtime | Badge yang sama |
| Tile kamera | Badge bila backend menandai feed kamera sebagai sintetis (`⟨C-9⟩` — belum ada di kontrak) |
| Banner global | Bila mode mock aktif, banner amber non-dismissible di AppBar: *"Mode data sintetis aktif — event di dashboard ini BUKAN observasi kamera sungguhan."* |
| Chat | Bila jawaban AI merujuk data mock,answer bubble menampilkan catatan "berdasarkan data sintetis" (`⟨R-1⟩`) |

**Larangan tambahan:** data mock tidak boleh memakai styling status "hijau/online" tanpa badge — status dan provenance
harus dibaca bersamaan.

### 4.2 Anti-pemalsuan

- Tidak ada kode di frontend yang mengarang nilai event, kamera, atau metrik.
- Mock hanya boleh berasal dari backend yang menandainya (`is_mock`), atau dari MSW handler di **mode dev** yang terlihat
  jelas di UI.
- Strawman: label "MOCK DATA" tidak boleh dapat disembunyikan lewat setting UI.

---

## 5. Authentication & Session Management

### 5.1 Model MVP

`API-CONTRACTS.md` §1 menetapkan: *"Untuk prototype lokal MVP, autentikasi berbasis session lokal atau Header API Key
sederhana (`X-JARVIS-API-KEY: <key>`), default allow untuk localhost."*

**Rekomendasi implementasi (AppSec):**

| Mekanisme | Endpoint | Verifikasi | Catatan |
|---|---|---|---|
| API key (header) | Semua REST | Header `X-JARVIS-API-KEY` cocok dengan nilai server | Disediakan oleh proxy; **tidak pernah** sampai ke browser |
| WS | `WS /ws/events` | Query `?api_key=` atau Header `X-JARVIS-API-KEY` (C-5 ditutup) | Loopback diizinkan jika API key kosong; gagal -> code 1008 |
| Dashboard (human) | Reverse proxy | Basic Auth / TLS client cert / akses jaringan lokal | Lapisan kedua di luar API |

### 5.2 Aturan untuk WebSocket (`C-5` — Ditutup)

- **Keputusan Ruling 2026-10-22 (C-5):**
  WebSocket `/ws/events` memvalidasi autentikasi sebelum koneksi diterima (`accept()`):
  1. Memeriksa `api_key` dari query string `?api_key=` atau header `X-JARVIS-API-KEY`.
  2. Bila `settings.api_key` terisi: wajib cocok via perbandingan waktu-konstan (`hmac.compare_digest`), selain itu ditutup dengan kode `1008` (Policy Violation).
  3. Bila `settings.api_key` kosong: hanya host loopback (`127.0.0.1`, `::1`, `localhost`, `testclient`) yang diizinkan; host eksternal ditutup dengan kode `1008`.
  4. Dev-proxy Vite menyuntikkan header di sisi proxy sehingga browser klien tidak perlu menyimpan secret di frontend.

### 5.2b Kosakata status layanan (harus sama antara `/health` dan UI)

Kontrak `docs/AI-CORE-DESIGN.md` delta `D-5`/`D-6` menetapkan vocabulary tunggal untuk status AI:
`available` | `degraded` | `unavailable` | `not_configured` | `disabled`.

**Kode aktual berbeda (`G-7`/`G-8`):**
- `health.components.llm_service`: `available` | `mock` | `unavailable` — **`mock` di luar kosakata kontrak**
- `system/status.ai`: `{enabled, provider, model, degraded, tool_mode}` — **tidak ada `ai.state`**, hanya `degraded: boolean`

UI **wajib** memakai `mapAiState(health, systemStatus)` (§ `docs/UI-DESIGN.md` §5.6) sebagai satu-satunya sumber
pemetaan. `mapAiState()` harus memperlakukan `mock` sebagai `not_configured` (abu, netral), bukan error.
`not_configured` dan `disabled` **bukan** error — keduanya harus tampil netral (abu), bukan merah, karena sistem
pemantauan kamera tetap berfungsi normal saat AI tidak dikonfigurasi.

### 5.3 Akses Dashboard

Dashboard memuat data surveillance — **bukan aset publik**. Lapisan wajib:

1. **Bind ke loopback.** FastAPI dijalankan pada `127.0.0.1`, bukan `0.0.0.0`, selama tidak ada reverse proxy.
2. **Reverse proxy sebagai satu-satunya pintu masuk** untuk akses dari jaringan lain:
   - TLS termination (HTTPS/WSS) — cookie `Secure` & `wss://` butuh ini;
   - autentikasi manusia (Basic Auth minimal, atau form login dengan session cookie);
   - **tidak** mengekspos port 8000 langsung ke LAN.
3. **Tidak ada CDN, tidak ada telemetry pihak ketiga, tidak ada font/asset eksternal** yang memuat origin Anda. Halaman
   dimuat seluruhnya dari origin sendiri (privasi: IP & pola akses tidak bocor ke pihak ketiga).
4. **Akses dari perangkat lain di LAN** harus Dying-kan expiry session dan logout server-side.

---

## 6. CORS Policy

FastAPI **tidak** mengizinkan CORS secara default (`CORSMiddleware` harus diaktifkan eksplisit). Jika tidak dikonfigurasi,
request dari `http://localhost:5173` ke `http://localhost:8000` **akan ditolak** — ini gejala konfigurasi yang harus
diantisipasi (lihat `DEPLOYMENT-LOCAL.md` §6).

| Environment | `allow_origins` | `allow_credentials` | Catatan |
|---|---|---|---|
| Dev (proxy Vite) | `["http://localhost:5173"]` | `true` | Hanya bila dev tanpa proxy |
| Dev (proxy aktif) | `[]` / tidak aktif | — | Same-origin, CORS tidak diperlukan |
| Produksi lokal | `[]` / tidak aktif | — | Same-origin lewat reverse proxy |
| Akses LAN via IP | **Tidak recommends** | — | Gunakan hostname + TLS + auth, jangan `allow_origins=["*"]` |

Aturan:

1. **Tidak pernah `allow_origins=["*"]` bersamaan dengan `allow_credentials=True`** — FastAPI/Merkedua middlewares
   membuat kombinasi ini berbahaya (browser mengabaikannya, tetapi konfigurasi tetap salah dan sering di-copy-paste).
2. **Tidak ada wildcard subdomain** (`*.local`) tanpa daftar eksplisit. Origins harus persis, tanpa trailing slash, dengan
   port eksplisit.
3. `allow_methods` dibatasi: `GET`, `POST`, `OPTIONS`. `allow_headers`: `Content-Type`, `X-JARVIS-API-KEY` (hanya bila
   key benar-benar sampai ke browser — pada model proxy-disuntik, header ini tidak perlu diizinkan).
4. **WS handshake** dikendalikan oleh header `Origin` (§5.2), bukan oleh CORS.

---

## 7. Input Validation & Review

### 7.1 Validasi di backend (wajib)

| Input | Aturan |
|---|---|
| Chat `message` | Wajib ada; `1 ≤ len ≤ 2000`; tanpa karakter kontrol; disanitasi |
| `conversation_id` | Panjang ≤ 64; karakter `[A-Za-z0-9_-]` |
| Camera `id` | Panjang ≤ 64; `^[a-z0-9_]+$` (dipakai sebagai path segment) |
| Camera `name` | `1 ≤ len ≤ 100`; teks bebas, di-escape saat dirender |
| Camera `rtsp_url` | Wajib `rtsp://`; host tidak boleh `localhost`/loopback/link-local **kecuali** mode devziekten; **dilarang** `file://`, `gopher://`, `dict://`; **dilarang**characters redirect; opsi query `?` নিষিদ্ধ untuk mencegah SSRF ke service internal |
| `event_type` | Harus salah satu dari enum kanonik (`C-1`) |
| `start_time` / `end_time` | ISO 8601 valid; `start ≤ end`; rentang maksimum 31 hari |
| `limit` | Default 50; min 1; **maks 200** |
| `offset` | ≥ 0 |

### 7.2 SSRF & path traversal

- `rtsp_url` adalah vektor SSRF klasik: backend Potassium menghubungi host yang ditentukan user. Mitigasi:
  allowlist skema `rtsp`; blokir IP privat/link-local/loopback pada mode produksi; **allowlist kamera** bila memungkinkan
  (kamera terdaftar lebih baik daripada URL bebas).
- Path `snapshot_path` **tidak boleh** pernah dipakai untuk membentuk path filesystem di frontend. Frontend memakai
  URL API (`GET /events/{id}/snapshot`), bukan path disk.
- Backend: jangan pernah membangun path filesystem dari input user tanpa normalisasi dan validasi prefix
  (`storage/snapshots/`).

### 7.3 Review di frontend

| Input | Tindakan |
|---|---|
| `camera_name`, `event_type`, `metadata.label`, `metadata.reason` | Render sebagai **teks React** (auto-escape). Tidak pernah `dangerouslySetInnerHTML` |
| `id` event/kamera | Render mono; disalin lewat clipboard API, bukan ditafsirkan |
| `result_summary` tool | Render sebagai teks; **jangan** dieksekusi sebagai markup atau link |
| URL dari server (`snapshot_url`, `stream_url_preview`) | Hanya dari server; tetap disanitasi: hanya izinkan path relatif atau origin yang sama |
| Sumber daya dari user | Hanya teks — tidak ada upload file di MVP |

### 7.4 Content Security Policy (header, di reverse proxy)

```
Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

Catatan: MUI/Emotion menyuntikkan `<style>` → butuh `'unsafe-inline'` pada `style-src`. Alternatif yang lebih ketat
(hash nonce) di luar scope MVP. `script-src 'self'` **tanpa** `unsafe-inline`/`unsafe-eval` — wajib.

Header lain: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`.

---

## 8. WebSocket & Realtime Security

1. **Handshake terautentikasi** (menunggu `C-5`).
2. **Validasi `Origin`** pada handshake.
3. **Rate limit**: jumlah event yang dikirim ke satu klien dibatasi (mis. maks 20/detik) agar klien tidak kewalahan saat
   camera recovery burst.
4. **Backpressure**: bila buffer klien penuh, backend menutup koneksi (client akan reconnect & catch-up) alih-alih
   menumpuk memori.
5. **Payload minimal**: event yang disiarkan tidak boleh memuat `metadata` berisi data sensitif yang tidak perlu
   (prinsip minimum data).
6. **Heartbeat 30 detik**; koneksi yang tidak merespons di-drop.

---

## 9. Log & Audit

### 9.1 Yang boleh masuk log

- Waktu, level, pesan, `request_id`, nama endpoint, status HTTP, durasi.
- Nama tool yang dieksekusi + parameter **ter-sanitasi** + ringkasan hasil.
- Status kamera & transisi status.

### 9.2 Yang **dilarang** masuk log

- `DATTIO_API_KEY`, `X-JARVIS-API-KEY`, nilai API key apa pun.
- RTSP URL mentah (masking otomatis pola `//.*:.*@`).
- Password kamera, token, cookie sesi, header `Authorization`.
- Isi snapshot/gambar (path file pun sebaiknya tidak bocor keluar LAN).
- Pesan chat lengkap dari pengguna (opsional: log hanya panjangnya & intent).

### 9.3 Audit log tool

Tabel/collection khusus (bukan log aplikasi) untuk: `ts`, `conversation_id`, `tool_name`, `parameters` (sanitasi),
`result_summary`, `outcome` (`ok` | `rejected` | `failed`), `reason`. Ditulis saat tool dieksekusi **dan** saat ditolak
karena tidak ada di allowlist.

---

## 10. Threat Model (ringkas)

| # | Ancaman | Vektor | Dampak | Mitigasi | Verifikasi |
|---|---|---|---|---|---|
| T1 | Peng-discipline data surveillance | Dashboard diakses pihak tak berwenang | Data privat영상 terekspos | Loopback bind + reverse proxy auth + TLS | `AC-SEC-04`, `AC-SEC-05` |
| T2 | Kredensial kamera bocor | RTSP URL di log/response | Kontrol kamera diambil | Server-only storage, masking log, UI defensif | `AC-SEC-02` |
| T3 | Secret bocor ke bundle | `VITE_*` berisi key | Kredensial LLM dicuri | Aturan §3; gitleaks scan build output | `AC-SEC-03` |
| T4 | Media terkirim ke LLM | Prompt berisi gambar/base64 | Pelanggaran privasi | Zero-media invariant + test prompt builder | `AC-SEC-01` |
| T5 | Prompt injection via metadata | `metadata.reason` berisi instruksi | Tool tak terotorisasi dieksekusi | Allowlist + escaping + validasi | `AC-SEC-06` |
| T6 | SSRF via `rtsp_url` | User mendaftarkan `rtsp://169.254.169.254/...` | Akses metadata service | Skema allowlist + blokir IP internal | `AC-SEC-06` |
| T7 | CSWSH | Halaman pihak ketiga buka WS ke localhost | Stream event dicuri | Validasi `Origin` pada handshake | `AC-SEC-05` |
| T8 | XSS → curi sesi | `dangerouslySetInnerHTML` | Token/session dicuri | React text rendering + CSP `script-src 'self'` | `AC-SEC-07` |
| T9 | Prompt/data poisoning tampilan | Data mock ditampilkan seolah live | Operator salah tindakan | Badge mock mandatory (§4) | `AC-SEC-06` |
| T10 | DoS oleh klien | Chat spam / WS flood | Kuota LLM habis, resource habis | Rate limit + panjang pesan dibatasi | `AC-SEC-06` |
| T11 | Path traversal | `snapshot_path` dari server dipakai sebagai path | Baca file arbitrary | Frontend pakai URL API; backend normalisasi prefix | `AC-SEC-06` |
| T12 | UI menampilkan nilai palsu | Data hardcoded di frontend | Operator tertipu | Tidak ada mock di production build; `VITE_ENABLE_MOCKS` off | `AC-SEC-07` |

---

## 11. Checklist Audit Keamanan (Wajib, tiap rilis)

- [ ] `gitleaks detect --no-git` bersih (working tree) dan `gitleaks detect` bersih (history).
- [ ] `grep -r "VITE_.*KEY\|SECRET\|TOKEN\|PASSWORD" apps/web/src public/` → kosong.
- [ ] Bundle hasil `npm run build` tidak mengandung string API key (grep pada `dist/`).
- [ ] `.env` masuk `.gitignore`; repo tidak mengandung `.env`.
- [ ] RTSP URL tidak muncul di respons API mana pun (tes: `GET /cameras` tidak mengandung `rtsp://`).
- [ ] Tidak ada panggilan outbound ke internet yang membawa media — diverifikasi lewat log egress/proxy.
- [ ] CORS tidak memakai `*` + credentials.
- [ ] WS memvalidasi `Origin`.
- [ ] CSP header terkirim dan `script-src` tidak memuat `unsafe-inline`.
- [ ] Log produksi bebas dari pola `//.*:.*@` (masking aktif) dan bebas API key.
- [ ] Tool mutating butuh konfirmasi backend (bukan hanya UI).
- [ ] Badge mock tampil pada semua event `is_mock=true` (screenshot sebagai bukti).

---

## 11b. Checklist Tambahan Khusus Kontrak AI Core

- [ ] `tools_executed[].status` dirender apa adanya di UI — `success` | `error` | `denied` | `invalid_arguments` | `timeout` (`AI-CORE-DESIGN.md` §9.2).
- [ ] `meta` (provider, model, tool_mode, latency) **tidak** ditampilkan di UI normal; hanya di panel debug.
- [ ] `meta.model` bukan secret, tetapi tetap tidak ditampilkan — tidak ada kebutuhan operator (§11.2 catatan).
- [ ] `client_message_id` (delta `D-3`) dikirim ulang **sama** saat retry → tidak ada duplikasi pesan.
- [ ] `error.message` dari backend ditampilkan apa adanya; `error.details` tidak ditampilkan mentah.
- [ ] `error.code` `llm_auth_failed` / `llm_quota_exceeded` / `ai_disabled` → **tanpa** tombol "Coba lagi"
      (percobaan ulang tidak akan berhasil).
- [ ] `search_events` dengan `query` bebas: hasil diperlakukan sebagai data, bukan instruksi (prompt-injection).
- [ ] `tools_executed[].result` tidak pernah dimasukkan ke `innerHTML` — selalu teks React.

---

## 12. Pelaporan & Respons

- Ditemukan masalah **S1** (T1–T4, T7): laporkan ke Tech Lead & Main Agent **hari ini**; mitigasi sementara: matikan
  endpoint yang relevan / batasi akses jaringan.
- **S2**: perbaiki sebelum rilis berikutnya.
- **S3/S4**: backlog.

Tidak ada detail kredensial dalam laporan — hanya referensinya (file:line, nama variabel).

---

## 13. Hal yang Belum Bisa Ditutup di Dokumen Ini

| Item | Alasan | Tunggu |
|---|---|---|
| Mekanisme auth WS | Kontrak belum ada | `C-5` |
| Bentuk error envelope | **Tertutup** — delta `D-7` + kode di `AI-CORE-DESIGN.md` §11.6 | Persetujuan Main Agent |
| Penanda mock per kamera | Kontrak belum ada | `C-9` |
| Rate limit — angka spesifik | Tergantung model deployment (jumlah operator, kamera) | Keputusan Main Agent |
| Retensi log audit |Butuh kebijakan privasi | Keputusan Main Agent |
| Enkripsi SQLite (opsional) | Butuh manajemen kunci | Keputusan Main Agent |

---

*Dokumen keamanan. Tidak ada kode aplikasi yang dibuat atau diubah.*
