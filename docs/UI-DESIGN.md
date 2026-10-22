# JARVIS — Dashboard UI Design Specification

**Author:** Frontend Engineer (QA & AppSec review)
**Date:** 2026-10-22
**Status:** Draft — menunggu persetujuan Main Agent atas kontrak API/event (`docs/AUDIT.md` §4)
**Scope:** React + TypeScript + MUI dashboard untuk JARVIS MVP.

> **Peringatan kontrak.** Dokumen ini **tidak mengarang endpoint**. Setiap path yang disebut berasal dari
> `docs/API-CONTRACTS.md` §2. Kebutuhan yang belum punya kontrak ditandai `⟨CONTRACT-REQUEST⟩` dengan ID `C-x`/`R-x`
> yang merujuk `docs/AUDIT.md` §4. Implementasi penuh **tidak dimulai** sebelum kontrak disetujui.

---

## 1. Prinsip Desain

1. **Kebenaran sebelum estetika.** Setiap angka di layar harus punya sumber yang bisa ditelusuri (endpoint atau event
   WebSocket). Tidak ada angka dekoratif.
2. **Jawaban AI ≠ data aktual.** Prose yang dihasilkan LLM dan hasil eksekusi tool ditampilkan sebagai dua entitas
   visual yang berbeda. Lihat §6.4 — ini adalah aturan paling penting di dokumen ini.
3. **Data sintetik harus terlihat.** Feed mock/synthetic wajib diberi badge eksplisit (`SECURITY.md` §4).
4. **Gagal terlihat, bukan didiamkan.** Status koneksi, streaming, dan LLM selalu punya representasi visual; tidak ada
   state yang "hilang diam-diam" (`UI-DESIGN.md` §7).
5. **Tidak ada secret di frontend.** Kredensial API tidak pernah menyentuh bundle browser (`SECURITY.md` §5).
6. **Operator non-teknis harus bisa memakainya.** Bahasa UI Bahasa Indonesia, istilah teknis (`fps`, `bbox`) selalu
   disertai konteks visual atau label ringkas.

---

## 2. Permukaan Kontrak yang Dipakai UI

Tanda ✅ = dipakai, ❌ = sengaja tidak dipakai UI, ⬜ = ada tapi belum dipakai UI.

**Status sumber:** diverifikasi ke **kode aktual** `apps/api/jarvis_api/api/routes/` pada 2026-10-22 14:00.
`docs/API-CONTRACTS.md` §2 masih menyebut bentuk lama (`camera_offline`, chat/history) — **belum** disinkronkan.

> ⚠️ **Dua sumber kebenaran masih hidup.** Tabel di bawah mengikuti **implementasi aktual** (yang sudah jalan dan
> ter-test), bukan `docs/AI-CORE-DESIGN.md` (yang belum disetujui Main Agent). Selisihnya tercatat di
> `docs/AUDIT.md` §3.19 (`G-1`…`G-15`). **Jangan membangun UI dari `AI-CORE-DESIGN.md` sebelum §3.19 diputuskan.**

### 2.1 REST

| Method | Path | Dipakai | Kebutuhan UI |
|---|---|---|---|
| GET | `/api/v1/health` | ✅ | Strip status komponen |
| GET | `/api/v1/system/status` | ✅ | Metrik CPU/RAM/disk/kamera/event hari ini + objek `ai` |
| GET | `/api/v1/cameras` | ✅ | Grid kamera + filter — **mengembalikan array langsung**, bukan `{total, items}` |
| POST | `/api/v1/cameras` | ✅ | Dialog "Tambah Kamera" |
| GET | `/api/v1/cameras/{id}/snapshot` | ✅ | Thumbnail tile (fallback saat stream mati) |
| GET | `/api/v1/cameras/{id}/stream` | ✅ | Live preview MJPEG (`<img>`) |
| GET | `/api/v1/events` | ✅ | Timeline + filter + paginasi — **`{total, limit, offset, items[]}`** |
| GET | `/api/v1/events/{id}/snapshot` | ✅ | Thumbnail & preview di detail event |
| POST | `/api/v1/chat/messages` | ✅ | Chat — path alias `POST /api/v1/chat` juga diterima backend |
| GET | `/api/v1/chat/history` | ✅ | Restore sesi — **`{conversation_id, messages[]}`** (lihat §6.4) |
| GET | `/api/v1/chat/conversations/{id}/history` | ⬜ | Bentuk per-percakapan; **belum dipakai UI** |
| DELETE | `/api/v1/chat/conversations/{id}` | ⬜ | Soft-delete riwayat; kandidat menu "Hapus riwayat" (§6.4) |
| GET | `/api/v1/events/{id}` | ❌ | Tidak ada di kode — detail event diambil dari `items[]` pada list payload |
| PATCH/PUT/DELETE | `/api/v1/cameras/{id}` | ❌ | Tidak ada di kode — UI **tidak** menyediakan edit/hapus kamera |
| POST | `/api/v1/cameras/{id}/restart` | ❌ | **Tidak ada** — tombol restart tidak dibuat (`C-7`) |

### 2.2 Realtime

| Path | Pesan masuk | Dipakai |
|---|---|---|
| `WS /ws/events` | `{ event: "NEW_EVENT", data: {…} }` | ✅ |
| | heartbeat: server mengirim `{"event":"PING"}` tiap 30 detik idle; klien balas `"ping"` → server balas `{"event":"PONG"}` | ✅ (deteksi socket mati) |

Field event realtime (`data`): `id`, `camera_id`, `camera_name`, `event_type`, `timestamp`, `metadata`,
`snapshot_url`, `is_mock`.

> **Perbedaan dari list event yang harus ditangani.** Di `GET /events` field bernama `snapshot_path`; di payload WS
> field bernama `snapshot_url`. Keduanya adalah path relatif ke API. UI harus menormalkan keduanya lewat satu fungsi
> `resolveMediaPath()`. Ini dicatat sebagai temuan tambahan (`C-8`, `docs/AUDIT.md` §4).
>
> ⚠️ **Autentikasi WS belum ada** (`C-5`). `api/routes/websocket.py` tidak memuat `require_api_key`, padahal
> endpoint REST memakainya. Untuk MVP lokal ini **dapat diterima** — asalkan backend hanya bind ke `127.0.0.1` — tapi
> UI **tidak** boleh mengirim API key lewat query string WS sebelum mekanismenya diputuskan.

### 2.3 Aturan keras URL media

- UI **tidak pernah** merakit URL dari ID kamera secara bebas; selalu memakai `stream_url_preview` / `snapshot_url` /
  `snapshot_path` dari server.
- RTSP URL mentah **tidak pernah** masuk ke state frontend. Bila field `rtsp_url` atau field serupa muncul di respons,
  UI **menolak** memakainya dan mencatat warning ke console (dev only) — bukan merender.
- Semua URL media di-resolve terhadap base URL API yang sama dengan fetch biasa (same-origin via proxy ⇒ relatif
  langsung dipakai).

---

## 3. Arsitektur Informasi & Navigasi

### 3.1 Peta Layar

```
┌──────────────────────────────────────────────────────────────────────┐
│ AppBar:  JARVIS ▸ [Status strip: ● System OK · 2/2 Kamera · 34 Event]│
│          [⏱ Terakhir sinkron 06:00:12]  [Chat ⌄] [Tema] [Menu]      │
├───────────────────────────────────────────────┬──────────────────────┤
│ ROUTE: /            (Dashboard)               │ CHAT PANEL           │
│  ┌──────────┬──────────┬──────────┐          │  (drawer / dock,     │
│  │ Kamera 1 │ Kamera 2 │ Kamera 3 │          │   persist / drawer)  │
│  │  ● LIVE  │  ● OFFLINE│ ◌ LOADING│          │                      │
│  └──────────┴──────────┴──────────┘          │  [user bubble]       │
│  ── Timeline ─────────────────────────────   │  [AI prose bubble]   │
│  [filter chips]                             │  [tool result card]  │
│  ● 06:00:12 person 89%  [cam front door]    │  [AI prose bubble]   │
│  ● 05:58:40 motion 8.2%  [cam backyard]      │                      │
│  …  (scroll)                                 │  [input + Kirim]     │
├───────────────────────────────────────────────┴──────────────────────┤
│ ROUTE: /events      Timeline penuh (tabel + filter lengkap)          │
│ ROUTE: /cameras     Manajemen kamera (daftar + tambah; **tanpa**     │
│                     edit/hapus — tidak ada endpoint)                  │
│ ROUTE: /settings    Informasi koneksi, zona waktu, mode mock,        │
│                     build info (non-fungsional, MVP minimal)         │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Navigasi

- Desktop ≥ 1200px: rail kiri 72px (ikon) + konten.
- Tablet 768–1199px: rail menyempit jadi ikon saja; grid kamera 2 kolom.
- Mobile < 768px: bottom bar 4 item (Dashboard, Kamera, Event, Chat); grid 1 kolom; chat jadi full-screen sheet.
- Chat dapat opened dari mana saja via ikon di AppBar; state "terbuka/tertutup" disimpan di Zustand, bukan di URL.
- Chat **tidak**`] menjadi route penuh (hilang konteks), tapi memiliki tombol "Perbesar" yang membuka `/chat` route
  full-screen untuk monitor kecil.

### 3.3 Halaman

| Route | Tujuan | Sumber data |
|---|---|---|
| `/` | Ringkasan: status sistem + grid kamera + 10 event terbaru | `health`, `system/status`, `cameras`, `events?limit=10` |
| `/cameras` | Grid kamera penuh + status + tambah kamera | `cameras`, `POST /cameras` |
| `/events` | Timeline penuh + filter + detail | `events` (+ `events/{id}/snapshot`) |
| `/chat` | Chat full-screen | `chat/history`, `chat/messages` |
| `/settings` | Build info, mode mock, status koneksi | `health` |

---

## 4. Layout Dashboard (Rincian)

### 4.1 Grid Kamera

**Aturan kolom** (responsive, `Grid` API MUI v9 — `size={{ xs: 12, sm: 6, md: 4, lg: 3 }}`):

| Breakpoint | Lebar | Kolom | Rasio tile |
|---|---|---|---|
| `xs` < 600px | <600 | 1 | 16:9 |
| `sm` 600–959 | 600–959 | 2 | 16:9 |
| `md` 960–1279 | 960–1279 | 3 | 16:9 |
| `lg` ≥ 1280 | ≥1280 | 4 | 16:9 |
| `xl` ≥ 1536 | ≥1536 | 5 | 16:9 |

- **Kepadatan** (Zustand `gridDensity`): `comfortable` (default) = tile tinggi, gap 16px, caption 2 baris;
  `compact` = gap 8px, caption 1 baris, thumbnail lebih kecil. Toggle di AppBar.
- **Urutannya** mengikuti urutan respons `GET /cameras` (server yang menentukan urutan). Tidak ada sorting client-side
  yang menyembunyikan kamera bermasalah — kamera offline **tetap tampil** (operator perlu tahu).
- **Maksimal tile video aktif yang di-mount**: 6. Tile ke-7 dan seterusnya memakai snapshot statis
  (`GET /cameras/{id}/snapshot`) alih-alih stream MJPEG, untuk menekan bandwidth LAN dan beban CPU. Rincian di §8.4.

### 4.2 Anatomy of a Camera Tile

```
┌───────────────────────────────────────────┐
│  ┌─────────────────────────────────────┐  │
│  │                                     │  │
│  │      LIVE VIDEO (MJPEG <img>)       │  │  ← 16:9, object-fit: cover
│  │      atau SNAPSHOT / PLACEHOLDER    │  │
│  │                                     │  │
│  │  ╔═══════════════════════════════╗  │  │  ← overlay kiri-atas
│  │  ║ ● ONLINE          15.0 fps    ║  │  │
│  │  ╚═══════════════════════════════╝  │  │
│  │                    ┌──────────────┐  │  │  ← overlay kanan-atas
│  │                    │ [MOCK DATA]  │  │  │     badge bila is_mock
│  │                    └──────────────┘  │  │
│  │  ┌─────────────────────────────────┐│  │
│  │  │ ⚠ Kamera terputus — retry 3/5   ││  │  ← overlay bawah (state error)
│  │  └─────────────────────────────────┘│  │
│  └─────────────────────────────────────┘  │
│  Front Door                     cam_front  │  ← nama + id (monospace, kecil)
│  Terakhir terlihat 06:00:04                │  ← last_seen_at (relatif + absolut)
└───────────────────────────────────────────┘
```

**Badge status** (warna + ikon + teks — tidak pernah warna saja, untuk aksesibilitas):

| Status | Warna | Ikon | Label |
|---|---|---|---|
| `online` | success (hijau) | `●` / ikon wifi | ONLINE |
| `connecting` | warning (amber) | spinner | MENGHUBUNGKAN |
| `reconnecting` | warning (amber) | spinner | MENYAMBUNG ULANG |
| `offline` | error (merah) | ikon putus | OFFLINE |
| `error` | error (merah) | ikon alert | ERROR |
| `unknown` | default (abu) | ikon help | TIDAK DIKETAHUI |

> `connecting` dan `reconnecting` **hanya tampil bila enum final backend memisahkannya** (`C-2`). Untuk
> sekarang UI memakai satu enum kanonik yang sama persis dengan `API-CONTRACTS.md` §2.2
> (`online | offline | connecting | error`), dan menambahkan `reconnecting` sebagai nilai toleran: jika backend
> mengirimnya, UI menampilkannya; kalau tidak, tidak ada. Ini cocok untuk kedua kemungkinan enum.

### 4.3 Strip Status Sistem (AppBar)

Baris ringkas di AppBar disusun berjenjang agar tidak memenuhi layar:

```
● Sistem OK   ·   Kamera 2/2   ·   Event hari ini 34   ·   Disk bebas 128.5 GB   ·   ● AI siap   ·   Diperbarui 06:00:12
```

- Nilai diambil dari `GET /health` + `GET /system/status`.
- Setiap nilai punya tooltip berisi sumber dan waktu pengambilan.
- **Stale handling:** bila fetch terakhir lebih tua dari 60 detik, nilai menampilkan ikon "jam" amber + teks
  "Data mungkin basi". Ini penting saat WS putus atau backend mati.
- **`components` dari `/health`** (nilai string) dipetakan ke badge:
  `connected|running|available|healthy` → hijau "OK"; `degraded|warning` → amber; `disconnected|failed|error|down` →
  merah; `unknown|starting|not_configured|disabled` → abu.
- **Badge AI** memakai vocabulary hasil `mapAiState(health, systemStatus)` — bukan `ai.state` (field itu tidak ada di
  kode aktual, `G-7`). Sumber nyata: `health.components.llm_service` (`available|mock|unavailable`) +
  `system/status.ai.{enabled,degraded,provider}`. Lihat §6.3.

---

## 5. Design System (Baseline)

> **Status: baseline proposal, bukan final.** Belum ada token di repo. Section ini agar implementasi konsisten dan
> reviewable; pemilik UI bebas mengoverride.

### 5.1 Tema

- **Dark-first.** Dashboard dipakai di ruangpengawasa, sering gelap. Default = dark. Light mode sebagai toggle,
  disimpan di `localStorage` (`ui-prefs`, bukan data sensitif).
- MUI `createTheme` dengan `colorSchemes: { dark: true, light: true }` (MUI v9) agar keduanya dari satu sumber token.

### 5.2 Token Warna

| Token | Dark | Light | Dipakai untuk |
|---|---|---|---|
| `status.online` | `#3FB950` | `#1A7F37` | Badge online, indikator sehat |
| `status.offline` | `#F85149` | `#CF222E` | Badge offline/error |
| `status.degraded` | `#D29922` | `#9A6700` | Connecting, reconnecting, stale |
| `status.unknown` | `#6E7681` | `#57606A` | Tidak diketahui |
| `surface.base` | `#0D1117` | `#FFFFFF` | Background app |
| `surface.raised` | `#161B22` | `#F6F8FA` | Card, tile |
| `surface.overlay` | `#21262D` | `#EAEEF2` | Popover, drawer |
| `border.subtle` | `#30363D` | `#D0D7DE` | Divider |
| `text.primary` | `#E6EDF3` | `#1F2328` | Teks utama |
| `text.secondary` | `#8B949E` | `#59636E` | Metadata, caption |
| `accent` | `#2F81F7` | `#0969DA` | Fokus, link, aksi primer |

**Aturan:** merah/amber/hijau **tidak pernah** menjadi satu-satunya pembawa makna; selalu disertai ikon + teks.
Kontras minimum WCAG AA (4.5:1 untuk teks, 3:1 untuk teks besar & UI component).

### 5.3 Tipografi

| Peran | Family | Ukuran / Weight |
|---|---|---|
| Display (angka besar) | Inter / system UI | 32/700, tabular numerals |
| H1 halaman | sama | 20/600 |
| H2 section | sama | 16/600 |
| Body | sama | 14/400 |
| Caption / metadata | sama | 12/400, `text.secondary` |
| ID teknis (event id, camera id) | JetBrains Mono / ui-monospace | 12/400 |

Angka metrik memakai `font-variant-numeric: tabular-nums` supaya tidak bergeser saat update.

### 5.4 Spacing & Radius

- Spacing dasar 4px: `4, 8, 12, 16, 24, 32, 48`.
- Radius: `6px` (kontrol), `10px` (card/tile), `999px` (badge).
- Elevation: satu level saja (`boxShadow: 0 1px 3px rgba(0,0,0,.4)`). Tanpa "card di dalam card di dalam card".

### 5.5 Komponen MUI yang dipakai

`AppBar`, `Drawer`, `Dialog`, `Card`, `Chip`, `Badge`, `Tooltip`, `IconButton`, `Button`, `TextField`, `Select`,
`Skeleton`, `Alert`, `Snackbar`, `LinearProgress`, `CircularProgress`, `Table`, `Tabs`, `Divider`, `Stack`, `Grid` (v2 API).

**Hindari:** `Card` di dalam `Card`; `Paper` bertumpuk; excessive shadow; warna ungu/gradien dekoratif; ikon dekoratif
tanpa makna; animasi lebih dari 200ms pada transisi state.

---

### 5.6 Fungsi normalisasi kontrak (WAJIB)

Backend masih dalam 상태 "dua sumber kebenaran" (`docs/AUDIT.md` §3.19). Empat fungsi normalisasi berikut
**wajib** ada sebagai satu-satunya tempat interpretasi data backend:

| Fungsi | Input | Output | Kenapa wajib |
|---|---|---|---|
| `mapErrorCode(code)` | `error.code` apa pun | `{ kind, http, retryable, messageId }` | Kode aktual UPPERCASE ≠ kontrak lowercase (`G-1`) |
| `mapAiState(health, systemStatus)` | `/health` + `/system/status.ai` | `available\|degraded\|unavailable\|not_configured\|disabled` | `ai.state` tidak ada; hanya `degraded: boolean` (`G-7`) |
| `displayToolName(tool_name)` | nama tool dari backend | label UI | Backend kirim `get_camera_list`, kontrak bilang `list_cameras` (`G-9`) |
| `mapToolStatus(status)` | `tools_executed[].status` | `success\|error\|denied\|invalid_arguments\|timeout\|unknown` | Nilai aktual `ok` vs kontrak `success` (`G-2`) |

Aturan: **tidak ada komponen lain yang membaca string kode/field mentah** untuk membuat keputusan. Semua keputusan
melewati fungsi-fungsi ini, dan **setiap fungsi punya test unit** yang mengunci mapping-nya.

---

## 6. Spesifikasi Fitur

### 6.1 Kamera — Live View & Status

**Data.** `GET /api/v1/cameras` → array `Camera`.

**Rendering live view.** MJPEG via `<img src="/api/v1/cameras/{id}/stream">` (multipart/x-mixed-replace).
Konsekuensi yang harus ditangani:

- `<img>` MJPEG **tidak punya event error yang andal** di semua browser. Deteksi "gambar diam" diimplementasikan dengan
  *frame watchdog*: sebuah `requestAnimationFrame` loop memeriksa `img.naturalWidth`; jika 0 → stream gagal.
  Selain itu `onError` pada `<img>` ditangani sebagai indikasi tambahan.
- **Watchdog diam**: `img.complete && img.naturalWidth > 0` tetapi frame tidak berubah selama 10 detik → anggap
  stream beku (frozen), tampilkan overlay "Stream beku" + tombol retry. Implementasi: `canvas` kecil 1×1
  `drawImage(img)` → `toDataURL()` → bandingkan hash dengan sebelumnya.
- **Retry dengan backoff**: percobaan ulang 1s, 2s, 4s, 8s, 15s (maks 5x), lalu berhenti dan menampilkan aksi manual
  "Coba lagi" + tombol "Buka stream di tab baru" (membuka URL stream yang sama di tab baru — berguna untuk debug).
- **Hanya tile yang terlihat** (viewport) yang me-mount stream; tile di luar viewport di-unmount (bukan `display:none`)
  agar koneksi MJPEG dilepas dan bandwidth turun.

**Status.** Badge sesuai §4.2. `fps` ditampilkan sebagai angka dengan 1 desimal + label "fps"; `last_seen_at` ditampilkan
relatif ("12 detik lalu") dengan tooltip absolut ISO.

**Thumbnail fallback.** Saat status `offline`/`error` **atau** stream gagal, tile menampilkan
`GET /cameras/{id}/snapshot` (gambar JPEG terakhir). Bila snapshot juga gagal → placeholder boneka kamera dengan ikon.

**Kamera nonaktif.** `is_enabled: false` → tile ditampilkan dengan **overlay "Nonaktif"** dan tidak me-mount stream
(bisa di-toggle lewat filter "Tampilkan yang nonaktif", default off).

**Dialog Tambah Kamera.** Form: `id`, `name`, `rtsp_url`, `motion_detection_enabled`, `object_detection_enabled`
(sesuai body `POST /cameras`).

- **Peringatan visual wajib** di bawah field RTSP: *"URL RTSP akan disimpan di backend dan tidak pernah dikirim ke
  browser maupun LLM. Pastikan kredensial kamera kuat."* — educating operator, sekaligus mengimplementasikan
  `SECURITY.md` §1.2 di level UI.
- **Jangan pernah** menampilkan nilai RTSP yang sudah tersimpan di UI mana pun (backend memang tidak mengirimkannya,
  tapi UI harus aman kalau suatu saat nanti mengirimkannya — lihat §2.3).
- Submit error (409 id duplikat / 422 validasi) ditampilkan inline per-field bila error envelope menyertakan `details`
  (bergantung pada `C-4`).

### 6.2 Timeline Event

**Data.** `GET /api/v1/events?camera_id=&event_type=&start_time=&end_time=&limit=&offset=`.
Respons: `{ total, limit, offset, items[] }`.

**Tampilan timeline** (default di `/`): list vertikal, itens dikelompokkan per hari (`Hari ini` / `Kemarin` / tanggal).

```
● 06:00:12   OBJECT TERDETEKSI            person · keyakinan 89%      [cam front door]
│  ┌──────┐   bbox [120,80,240,360] · area gerak 14.5%
│  │ img  │   [MOCK DATA]
│  └──────┘
```

- Urutan: `timestamp` DESC (server sudah mengurutkan; UI tidak mengubah urutan).
- **Filter chips** aktif di atas list: `Kamera: Front Door ×`, `Tipe: Object ×`, `Rentang: … ×`. Klik `×` menghapus
  filter itu dan me-refetch.
- **Filter panel** (`/events`): kamera (multi-select), tipe event (multi-select), rentang waktu (date-time range),
  reset. Draft filter disimpan di Zustand; filter yang sudah diterapkan disimpan di URL search params agar bisa di-share
  dan di-back-button.
- **Paginasi**: infinite scroll dengan `limit=50` dan `offset` eksplisit. Tombol "Muat lebih banyak" sebagai fallback
  (accessibility: infinite scroll saja menyulitkan pengguna keyboard & screen reader). Halaman kosong sebelum `total`
  tercapai → tombol "Muat lebih banyak" tetap tampil.
- **Event realtime** (`NEW_EVENT` via WS): bila cocok dengan filter aktif → disisipkan di posisi teratas dengan animasi
  highlight singkat (300ms, non-interaktif) dan sebuah flash "1 event baru" yang memunculkan aksi "Tampilkan". Bila
  tidak cocok dengan filter → badge kecil pada filter "N event baru tidak sesuai filter" + tombol "Tampilkan semua".
  Event dengan `is_mock: true` diberi badge `[MOCK DATA]`.

**Detail event.** Drawer sisi kanan (bukan modal) — memuat:

- Snapshot besar (`GET /events/{id}/snapshot`), atau placeholder bila `snapshot_path` null.
- Semua field event: `id` (mono, copy-to-clipboard), `camera_id` / `camera_name`, `event_type` (chip berwarna per tipe),
  `timestamp` (absolut + relatif), `confidence` (persen + bar), `metadata` (tabel key-value; `bbox` dirender
  sebagai 4 angka + mini-overlay kotak pada snapshot bila koordinat tersedia), `is_mock` (badge).
- **Aksi**: "Buka kamera" → navigasi ke `/cameras` dengan kamera terpilih; "Tanyakan ke JARVIS" → menyalin ringkasan
  event ke chat sebagai konteks (implementasi §6.4.5).
- Tidak ada aksi mutating (acknowledge/hapus/restart) — **tidak ada endpoint-nya** (`C-7`). Tidak ada tombol yang
  menggantung.

### 6.3 Status Sistem

Dua sumber, digabung di satu strip (§4.3):

- `GET /health` → `status`, `version`, `uptime_seconds`, `components{...}`.
- `GET /system/status` → `cpu_usage_percent`, `memory_usage_percent`, `disk_free_gb`, `active_cameras`, `total_cameras`,
  `events_today`, **plus `ai`**.

**Render:**
- CPU & Memori: angka + progress bar thin; **amber di ≥ 75%**, **merah di ≥ 90%**.
- Disk bebas: angka GB; **merah di < 10 GB**, **amber di < 25 GB**.
- `active_cameras / total_cameras`: "2/2". Bila `active < total`, klik → filter timeline ke kamera yang offline.
- `events_today`: klik → navigasi `/events` dengan rentang waktu = hari ini.
- `uptime_seconds` → format human ("2j 14m").
- **version** → tampilkan di `/settings`, bukan di AppBar (rendah prioritas).

**Status AI** (`system/status` → `ai`) — **bentuk aktual** (kode `api/routes/health.py`, 2026-10-22):

| Field | Tipe aktual | Catatan |
|---|---|---|
| `ai.enabled` | boolean | `AI_ENABLED` / `JARVIS_AI_ENABLED` |
| `ai.provider` | string | `dattio` bila LLM aktif, `fake` bila test mode |
| `ai.model` | string \| null | `DATTIO_MODEL` — **ada di kode, tidak ada di kontrak D-5** |
| `ai.degraded` | boolean | `true` bila LLM tidak aktif. **Ini bukan enum** — lihat catatan di bawah |
| `ai.tool_mode` | `auto` \| `native` \| `prompt` | sesuai `DATTIO_TOOL_MODE` |

> ⚠️ **Kode aktual belum punya `ai.state`.** Kontrak `AI-CORE-DESIGN.md` delta `D-5` mensyaratkan enum
> `available \| degraded \| unavailable \| not_configured \| disabled`, plus `last_error_at` / `last_success_at` —
> **tidak ada satu pun** di kode aktual. Yang ada hanya `degraded: boolean`.
>
> **Konsekuensi untuk UI:** badge AI **tidak bisa** membedakan "provider gagal" dari "AI tidak dikonfigurasi" dari
> "AI dimatikan". Ketiganyacollapse ke `degraded: true`.
>
> **Keputusan sementara (sampai `G-7` ditutup):** UI derives status dari kombinasi dua sumber:
> `system/status.ai.{enabled,degraded,provider}` + `health.components.llm_service`. Fungsi tunggal
> `mapAiState()` (§5) menerima keduanya dan mengembalikan salah satu dari lima state kanonik di tabel bawah.
> Sumber kebenaran tunggaltetap `mapAiState()` — **jangan** bikin kamus kedua di komponen lain.

**Pemetaan ke badge** — dipakai oleh `mapAiState()`:

| State kanonik | Badge | Arti untuk operator | Diturunkan dari |
|---|---|---|---|
| `available` | hijau `● AI siap` | Normal | `ai.degraded === false` |
| `degraded` | amber `◐ AI menurun` | Berjalan tapi bermasalah (timeout berulang, tool error) | `ai.enabled && ai.degraded` |
| `unavailable` | merah `✕ AI mati` | Provider tidak bisa dihubungi | `ai.enabled && !ai.degraded` + `llm_service = "unavailable"` |
| `not_configured` | abu `○ AI belum diatur` | Key/base URL kosong — **bukan** error; sistem lain tetap normal | `llm_service = "mock"` (test mode) atau `!ai.enabled` |
| `disabled` | abu `○ AI dimatikan` | `AI_ENABLED=false` | `ai.enabled === false` |

> `health.components.llm_service` di kode aktual bernilai `available` \| `mock` \| `unavailable`.
> **`mock` tidak ada di kosakata kontrak `D-6`** — itu temuan `G-8`. `mapAiState()` harus memperlakukan `mock`
> sebagai `not_configured` (abu, netral), **bukan** error.

**Refresh:** polling 15 detik (`refetchInterval`), dijeda saat tab tidak terlihat (`refetchOnWindowFocus` handles
resume). Tidak ada polling agresif — status dan kesehatan bukan realtime.

### 6.4 Chat dengan JARVIS

#### 6.4.1 Anatomy

```
┌──────────────────────────────────────────────┐
│  JARVIS            ● terhubung · model siap  │  ← header: status koneksi + provider
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Anda                                  │  │  ← bubble user, kanan, netral
│  │ Apakah ada orang di depan pintu       │  │
│  │ dalam 15 menit terakhir?              │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Ya, pada pukul 05:58:12 terdeteksi 1  │  │  ← bubble AI, kiri, prose
│  │ orang di kamera Front Door dengan      │  │     ⚠ TIDAK diberi styling "terverifikasi"
│  │ keyakinan 89%.                         │  │
│  │ ───────────────────────────────────    │  │
│  │ 🔧 get_recent_events        ✓ dijalankan│  │  ← tool result card (terpisah)
│  │    camera_id: cam_front_door            │  │
│  │    event_type: object_detected          │  │
│  │    minutes_ago: 15                      │  │
│  │    → 1 event ditemukan (person, 0.89)  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 🔎 Tampilkan sumber ▾                   │  │  ← collapsible: event terkait
│  └────────────────────────────────────────┘  │
├──────────────────────────────────────────────┤
│  [ Ketik pertanyaan…            ] [ Kirim ] │
└──────────────────────────────────────────────┘
```

#### 6.4.2 Aturan pemisahan AI vs tool (WAJIB)

Bentuk aktual diverifikasi ke `apps/api/jarvis_api/schemas/__init__.py` (2026-10-22). Kontrak rujukan:
`docs/AI-CORE-DESIGN.md` §9.1–9.2 + §11.2 (delta `D-1`, `D-2`, `D-7`) — **berbeda di beberapa titik**, lihat catatan.
Tiga lapis yang **tidak boleh dicampur** di UI:

| Lapis | Isi | Sumber | Perlakuan visual |
|---|---|---|---|
| `reply` | Narasi bahasa alami dari LLM | LLM | Bubble kiri, teks normal, **tanpa** badge hijau/centang |
| `tools_executed[]` | Data terstruktur otoritatif | Backend (hasil tool) | **Card terpisah** di bawah bubble, border berbeda, ikon kunci |
| `meta` | Diagnostik runtime | Backend | Tidak ditampilkan di UI normal; hanya pada panel debug (`/settings`) |

| Elemen | Perlakuan visual | Src |
|---|---|---|
| `reply` | Bubble kiri, teks normal | `reply` |
| `tools_executed[].tool_name` | Mono; **nama yang dikirim backend adalah `get_camera_list`**, bukan `list_cameras`. Lihat catatan di bawah | `tools_executed[]` |
| `tools_executed[].name` | **Duplikat** `tool_name` di kode aktual (`G-3`). UI **wajib baca `tool_name`**, jangan `name` | idem |
| `tools_executed[].parameters` | Tabel key-value, nilai **raw** (mono) — jangan diterjemahkan/ditafsirkan | idem |
| `tools_executed[].status` | Chip status — **nilai aktual hanya `ok` / `error` / `denied`**; kontrak menyebut `success`/`invalid_arguments`/`timeout` (`G-2`). Lihat catatan | idem |
| `tools_executed[].duration_ms` | Angka kecil di kanan chip status | idem |
| `tools_executed[].result_summary` | Teks ringkasan, di bagian berlabel "Hasil tool" | idem |
| `tools_executed[].result` | Objek terstruktur — ditampilkan **di dalam** collapsible "Bukti / Sumber data" (kecil, default tertutup) | idem |
| `tools_executed[].error` | Pesan error tool (field opsional, kode aktual) — tampilkan di dalam kartu tool bila ada | idem |
| `meta.stop_reason` | Menentukan chip penanda grounding (§6.4.3) | `meta` |
| `created_at` | Timestamp kecil di bawah bubble | idem |

> **Catatan 1 — nama tool kamera.** Backend mendaftarkan tool dengan nama **`get_camera_list`** dan alias
> `list_cameras` (`services/tools/builtin.py`). `tool_name` yang dikembalikan adalah nama kanonik
> `get_camera_list`. Kontrak AI Core menyebut `list_cameras`. UI **tidak boleh** melakukan pencocokan nama mentah —
> gunakan satu fungsi `displayToolName(tool_name)` yang memetakan nama kanonik ke label tampilan yang stabil
> (mis. `get_camera_list` → "Daftar kamera"). Alias tetap diterima bila model memanggil `list_cameras`.
>
> **Catatan 2 — vocabulary `status` tool.** Kode aktual (`schemas/__init__.py`) menetapkan default `"ok"` dengan
> deskripsi `ok | error | denied`. Kontrak menetapkan `success | error | denied | invalid_arguments | timeout`.
> Saat ini `status` praktis selalu `"ok"` — karena `ToolNotFoundError` / `ToolValidationError` /
> `ToolPermissionError` dilempar sebagai **exception**, bukan dikembalikan sebagai status.
> **UI harus menoleransi keduanya**: renderer status memetakan `success` **dan** `ok` → hijau; `denied` → amber;
> `error` → merah; `invalid_arguments`/`timeout` → amber. Values yang tidak dikenal → abu "Tidak diketahui".
>
> **Catatan 3 — tool mutating.** `restart_camera_stream` dan `delete_event_history` **terdaftar** di backend dengan
> risiko `mutating`/`destructive`, tapi `registry.schemas()` **tidak mengirimnya** ke model dan `execute()` menolak
> tanpa `allow_mutating`. Akibatnya UI **tidak** membuat tombol mutasi dan tidak akan pernah menerima
> `tools_executed[]` untuk kedua tool tersebut pada MVP.

Aturan tambahan:

1. **Kartu tool tidak pernah dirender di dalam bubble prose.** Selalu elemen terpisah, agar pengguna bisa membedakan
   "ini yang AI bilang" dari "ini yang sistem baca".
2. **Parameter ditampilkan apa adanya.** Kalau backend mengirim `{"camera_id": "cam_front_door"}`, tampilkan persis
   begitu. UI tidak boleh "mempercantik" angka (mis. mengubah 0.89 → "89%") di dalam parameter — transformasi hanya
   berlaku untuk kolom `confidence` yang punya definisi eksplisit di schema.
3. **Kegagalan tool tidak menggagalkan percakapan.** Backend mengembalikan HTTP **200** dengan
   `tools_executed[].status` berisi status gagal (`AI-CORE-DESIGN.md` §7.5). UI wajib:
   - kartu tool menampilkan status merah/amber sesuai `status`;
   - `reply` diberi chip amber "Mengandung hasil tool yang gagal" **di dalam bubble prose**;
   - `result` (bila ada) ditampilkan apa adanya, tidak disembunyikan.
   Ini berbeda dari kegagalan provider, yang mengembalikan 503 (lihat §6.4.3).
4. **Keterhubungan ke sumber.** `tools_executed[].result.items[]` memuat event dengan `id` (`evt_98741`). Tampilkan link
   "Lihat event evt_98741" yang membuka drawer detail event. Bila `result` tidak memuat `items`, bagian "Bukti" tetap
   ditampilkan (dengan `result_summary` saja) — tidak pernah link karangan.
5. **`result` boleh memuat `snapshot_available: boolean`, bukan `snapshot_path`.** URL snapshot diambil dari
   `GET /events/{id}/snapshot`, bukan dari path yang dikembalikan tool.

#### 6.4.2b Chip penanda grounding

Backend sudah menyediakan sinyal deterministik lewat `meta.stop_reason` (`AI-CORE-DESIGN.md` §7.5). UI memakainya —
bukan menebak dari isi jawaban.

| `meta.stop_reason` | Arti | Chip pada bubble jawaban |
|---|---|---|
| `completed` | Selesai normal | **Tanpa chip** bila `tools_executed` berisi ≥ 1 tool sukses; bila `tools_executed` kosong → chip abu `Tanpa data pendukung` (mis. sapaan, obrolan non-faktual) |
| `no_tool_grounding` | Backend sudah memaksa tool call tetapi model tetap menjawab tanpa grounding; jawaban dijamin **tanpa klaim faktual** | Chip amber `Jawaban tanpa klaim faktual — tidak ada data yang dirujuk` |
| `max_rounds` | Batas 4 round tool-calling tercapai | Chip amber `Batas penalaran tool tercapai — jawaban mungkin belum lengkap` + link collapsible "Lihat tool yang dijalankan" |

Tambahan:

- **Jawaban yang memuat klaim faktual tanpa satu pun tool yang sukses** harus selalu menampilkan chip
  `Belum terverifikasi`. Ini kondisi yang tidak boleh dilewati, apa pun isi `reply`-nya.
- Chip ini **dari style bubble** (bukan dari warnanya), dan memakai ikon + teks — tidak pernah warna saja.
- `meta.latency_ms`, `meta.tool_calls`, `meta.rounds` tidak ditampilkan di UI normal; hanya pada panel debug
  (`/settings` → "Diagnostik AI") yang menulis `meta` sebagai JSON mentah.
  **Catatan:** kontrak menyebut `meta.llm_calls`, kode aktual menyebut `meta.rounds` (`G-4`) — panel debug menampilkan
  JSON mentah, jadi tidak masalah; tapi ** jangan** kode logika UI yang bergantung pada nama field itu.

#### 6.4.3 State & error chat

Error envelope (delta `D-7`): `{ "error": { "code", "message", "details" } }` — **envelope ini sudah benar di kode aktual**
(`apps/api/jarvis_api/core/errors.py`).

> ⚠️ **Kode error aktual ≠ kode error kontrak.** Kontrak `AI-CORE-DESIGN.md` §11.6 memakai **lowercase**
> (`llm_unavailable`, `llm_quota_exceeded`, `llm_auth_failed`, …). Kode aktual memakai **UPPERCASE dengan set berbeda**
> (`AI_UNAVAILABLE`, `AI_RATE_LIMITED`, `AI_PROVIDER_ERROR`, …). Ini temuan `G-1` dan **bloker UI** — kalau UI
> membangun switch dari kontrak, **tidak ada satu pun** yang akan cocok.
>
> **Solusi sementara yang dipakai UI** (sampai `G-1` ditutup): satu fungsi `mapErrorCode(code)` yang memetakan
> **kedua** kosakata ke enum internal UI. Daftar di bawah memakai **kode aktual** sebagai kolom utama, dengan kode
> kontrak sebagai alias yang dikenali.

| HTTP | `error.code` (aktual) | Alias kontrak | Tampilan di UI |
|---|---|---|---|
| 422 | `AI_INVALID_REQUEST` | validasi Pydantic | "Pesan tidak valid" + pesan per-field bila `details.errors` berisi detail |
| 400/422 | `TOOL_DENIED` | `denied` | "Tool itu tidak diizinkan untuk dipakai." (tanpa Coba lagi) |
| 400/422 | `TOOL_NOT_ALLOWED` | — | "Tool di luar daftar yang diizinkan." (tanpa Coba lagi) |
| 502 | `AI_PROVIDER_ERROR` | `llm_invalid_response`, `llm_request_rejected` | "Respons AI tidak valid — layanan sedang bermasalah." + Coba lagi |
| 503 | `AI_UNAVAILABLE` | `llm_unavailable` | "Layanan AI sedang tidak tersedia. **Sistem pemantauan kamera tetap berjalan normal.**" + Coba lagi |
| 503 | `AI_TIMEOUT` | `llm_timeout`, `ai_timeout` | "AI tidak menjawab dalam batas waktu." + Coba lagi |
| 503 | `AI_RATE_LIMITED` | `llm_quota_exceeded` | "Kuota AI habis. Sistem pemantauan tetap berjalan normal." (tanpa tombol coba lagi otomatis) |
| 503 | `AI_DISABLED` | `ai_disabled` | "Asisten AI dimatikan." (tanpa Coba lagi) |
| 404 | `NOT_FOUND` | — | "Data tidak ditemukan." |
| 500 | `INTERNAL_ERROR` | `internal_error` | "Terjadi kesalahan internal." (+ correlation id bila ada) |
| — | `llm_auth_failed` / `llm_circuit_open` | — | **Kode kontrak yang belum ada di implementasi.** `mapErrorCode()` tetap harus mengenali keduanya: auth → "Konfigurasi AI bermasalah" (tanpa Coba lagi); circuit → "Layanan AI dinonaktifkan sementara" (Coba lagi setelah jeda) |

Aturan tampilan:

- **Pesan error berasal dari `error.message` backend** (sudah aman untuk user). UI tidak menyusun kalimat sendiri
  selain menambahkan konteks "sistem kamera tetap jalan normal".
- **Tidak ada stack trace, tidak ada `details` mentah** ditampilkan. `details` hanya dipakai untuk pemetaan error
  (mis. `details.retryable`) atau validasi per-field.
- **Kegagalan chat tidak boleh memengaruhi grid kamera/event.** Ini tercermin di copy: "Sistem pemantauan kamera tetap
  berjalan normal."
- `error.code` menentukan apakah tombol "Coba lagi" ditampilkan. **Kode yang retry-berguna:** `AI_UNAVAILABLE`,
  `AI_TIMEOUT`, `AI_PROVIDER_ERROR`. **Kode yang retry tidak berguna:** `AI_RATE_LIMITED`, `AI_DISABLED`,
  `TOOL_DENIED`, `TOOL_NOT_ALLOWED`, `AI_INVALID_REQUEST`, `NOT_FOUND` — dan alias kontraknya
  (`llm_quota_exceeded`, `llm_auth_failed`, `ai_disabled`).
  `mapErrorCode()` mengembalikan enum `{RETRYABLE, NOT_RETRYABLE}` — UI **tidak** memeriksa string kode secara raw.

| Kondisi | Tampilan |
|---|---|
| Belum ada pesan | Empty state: ajakan + 3 contoh pertanyaan yang bisa diklik (mengisi input) |
| Mengirim | Bubble user langsung + bubble "thinking" (3-dot) di bawahnya |
| Sukses | Bubble AI + kartu tool |
| Gagal provider | Bubble **error** terpisah di sisi assistant + tombol "Coba lagi" (bila diizinkan) |
| Tool gagal | 200; kartu tool merah/amber + chip di bubble prose (§6.4.2 aturan 3) |
| Riwayat gagal dimuat | Kolom chat menampilkan "Riwayat tidak dapat dimuat" + tombol "Muat ulang"; percakapan baru tetap bisa dikirim |
| `GET /chat/history` 404 | Perlakukan sebagai sesi kosong (bukan error) |

**Debounce & enter:** kirim dengan `Enter`, baris baru dengan `Shift+Enter`. Disable tombol kirim saat request aktif.
Maksimum panjang input 2000 karakter (dibatasi di UI, divalidasi ulang di backend → 422).

#### 6.4.4 Riwayat percakapan

`GET /chat/history?conversation_id=&limit=` → **bentuk aktual** (kode `schemas/__init__.py::ChatHistory`):

```jsonc
{
  "conversation_id": "conv_default",
  "messages": [
    {"id": "msg_1", "role": "user",      "content": "...", "tool_name": null, "created_at": "2026-10-22T05:59:00Z"},
    {"id": "msg_2", "role": "assistant", "content": "...", "tool_name": null, "created_at": "2026-10-22T05:59:03Z"},
    {"id": "msg_3", "role": "tool",      "content": "...", "tool_name": "get_recent_events", "created_at": "2026-10-22T05:59:02Z"}
  ]
}
```

> ⚠️ **Bentuk ini BEDA dari kontrak delta `D-4`.** Kontrak: `{conversation_id, total, items[]}` dengan
> `items[].tools_executed[]` (array nama tool). Kode aktual: `{conversation_id, messages[]}` dengan
> `messages[].tool_name` (string tunggal, `null` bila bukan pesan tool). Tidak ada `total`.
> Temuan `G-5` & `G-6` di `docs/AUDIT.md` §3.19. **UI dibangun mengikuti kode aktual** sampai Main Agent memutuskan.
>
> **Konsekuensi:**
> - **Tidak ada `total`** → tidak ada jumlah total pesan; pagination riwayat tidak bisa menampilkan "halaman 1 dari N".
>   Hitungan ditampilkan dari `messages.length` ("24 pesan dimuat").
> - **`tool_name` tunggal, bukan array** → sebuah pesan assistant yang memanggil 2 tool tidak bisa menampilkan
>   keduanya. practically: chip "· get_recent_events" per baris role `tool`.
> - **Path `before` tidak ada** di kode aktual — hanya `conversation_id` dan `limit` (default 30, maks 200).
>   Riwayat tua dimuat dengan menaikkan `limit`, bukan dengan kursor.

Catatan penting untuk UI:

- `role` ∈ `system` | `user` | `assistant` | `tool`. Role `system` **tidak pernah** dirender sebagai bubble pesan
  (system prompt bukan percakapan pengguna). Role `tool` dirender sebagai baris ringkas "· <tool_name>".
- `conversation_id` default `conv_default` (backend memakai `conv_default` bila tidak dikirim).
- Riwayat dimuat saat chat dibuka pertama kali; pesan baru langsung di-append ke cache lokal, bukan di-refetch.
- `DELETE /api/v1/chat/conversations/{id}` tersedia (soft-delete) — kandidat menu "Hapus riwayat" (§2.1).

#### 6.4.4b Idempotensi & retry

Request chat menyertakan `client_message_id` opsional (delta `D-3`):
- UI membuat UUID baru untuk setiap pesan dan **menyimpannya** bersama pesan yang sedang dikirim.
- Tombol "Coba lagi" mengirim ulang **UUID yang sama** → backend mengabaikan duplikat (`AI-CORE-DESIGN.md` §10.3).
- Pesan baru (input baru) selalu mendapat UUID baru.

#### 6.4.5 Integrasi chat ↔ event

Aksi "Tanyakan ke JARVIS" pada detail event menyisipkan konteks terstruktur ke input chat (bukan langsung mengirim):
`"Jelaskan event evt_98741 (person, confidence 0.89, kamera Front Door, 05:58:12)."` — pengguna tetap menekan Kirim.
Menghormati kontrol pengguna; tidak ada prompt otomatis yang bocor ke LLM tanpa sepengetahuan.

> Tool `search_events` (`AI-CORE-DESIGN.md` §8.2) adalah pasangan alami untuk aksi ini: UI dapat menawarkan quick-action
> "Cari semua event 'person'" yang mengisi input dengan klausa yang cocok dengan parameter `search_events`.

---

### 6.5 Mock Data & Integritas Data

- Badge `[MOCK DATA]` (amber, ikon flask/warning) pada:
  - setiap event dengan `is_mock === true` (list, timeline, drawer detail, notifikasi realtime);
  - setiap tile kamera yang stream-nya berasal dari feed sintetis — **backend belum mengirim penanda per kamera**
    (`C-9`: `CameraStatus` **tidak** punya `is_mock`, meski tabel DB sudah punya kolomnya — dikonfirmasi
    2026-10-22 di `schemas/__init__.py` vs `db/models.py`);
  - **banner global** di AppBar bila `/health` menunjukkan mode mock — `components.llm_service` bernilai `"mock"`
    saat test mode, **tapi** `/health` tidak punya `mock_mode` terpisah, jadi banner hanya bisa diturunkan dari
    `llm_service === "mock"` (`⟨C-9⟩` — dan nilai `mock` sendiri di luar kosakata kontrak, temuan `G-8`).
- Banner global berbunyi: *"Mode data sintetis aktif — event di dashboard ini BUKAN observasi kamera sungguhan."*
  Warna amber, `role="status"`, tidak bisa ditutup (bisa diperkecil).
- Dilarang: menampilkan data sintetis dengan label yang menyerupai data live (mis. warna status hijau penuh tanpa
  badge). `SECURITY.md` §4.

---

## 7. Matriks State (Lengkap)

Legenda: **L** Loading, **E** Empty, **X** Error, **D** Disconnected, **R** Reconnecting.

| Permukaan | Loading | Empty | Error | Disconnected / Reconnecting |
|---|---|---|---|---|
| AppBar — status sistem | Skeleton pada angka | — | Nilai lama + ikon amber "tidak dapat diperbarui" | WS down: chip "Live updates paused" (amber) |
| Grid kamera | Skeleton tile (aspect 16:9) shimmer | "Belum ada kamera terdaftar" + tombol "Tambah Kamera" | Kartu error + "Coba lagi" | WS down: banner, data kamera tetap tampil (REST) |
| Tile kamera | Placeholder shimmer di atas snapshot terakhir | — | Placeholder + "Retry" | Kamera `reconnecting` → overlay amber "Menyambung ulang… (percobaan ke-N)" |
| Tile kamera — stream | Gambar terakhir + spinner kecil | — | Placeholder "Stream tidak tersedia" + tombol retry | Backoff retry otomatis, tampilkan percobaan ke-N |
| Timeline event | 5 skeleton bar | "Belum ada event" + penjelasan filter aktif | "Gagal memuat event" + "Coba lagi" | Badge "Live updates paused" + tombol "Perbarui" |
| Realtime badge | — | — | — | "Terputus · mencoba lagi dalam N dtk" (R) |
| Chat | Bubble "thinking" | "Mulai percakapan" + 3 contoh | Bubble error + "Coba lagi" | WS down **tidak**teks kosong |
| Detail event | Skeleton | "Event tidak ditemukan" | "Gagal memuat" | — |

**Aturan lintas:**

1. **Error vs Empty tidak tertukar.** 200 dengan `items: []` → Empty. Non-2xx → Error. Keduanya punya copy dan CTA
   berbeda.
2. **Data lama tidak dibuang saat error.** Error pada refresh mempertahankan data terakhir dengan penanda
   "terakhir diperbarui HH:MM:SS" — lebih berguna daripada layar kosong.
3. **4xx tidak auto-retry** (permintaan tidak akan pernah berhasil); 5xx & error jaringan di-retry dengan backoff
   (maks 3x). Setelah itu tampilkan tombol manual.
4. **Tidak ada spinner full-screen.** Placeholder lokal per komponen; halaman tetap interaktif.
5. **Semua state punya `aria-live` yang sesuai** (polite untuk data, assertive untuk error).

---

## 8. Perilaku Realtime (WebSocket `/ws/events`)

### 8.1 Koneksi

- Native `WebSocket` ke URL yang diturunkan dari base URL API + `/ws/events`.
- `ws://` untuk dev (`localhost`), `wss://` untuk non-localhost — dictated by page protocol, tidak di-hardcode.
- **Auth:** belum ada kontrak (`C-5`). implementasi dibuka lewat satu fungsi `buildSocketUrl()` sehingga hanya satu
  tempat yang perlu diubah saat auth diputuskan. Selagi `C-5` belum diputuskan, UI **tetap** memakai URL relatif
  (same-origin via proxy) sehingga tidak ada token di URL.
- **Heartbeat:** backend ping tiap 30 detik. Client memakai `pong` bawaan browser; selain itu client punya watchdog
  90 detik: tidak ada frame masuk → anggap koneksi mati → reconnect.

### 8.2 State koneksi

`connecting` | `open` | `reconnecting` | `offline`.

- `reconnecting` → banner amber sticky di bawah AppBar: *"Live updates terputus — mencoba menyambung ulang (percobaan
  ke-N, jeda M dtk)."* + tombol "Coba sekarang".
- `open` → banner hilang; event yang terlewat saat terputus **ditangkap** dengan refetch `GET /events` (catch-up),
  memakai `since` = timestamp disconnect terakhir bila didukung (`⟨C-10⟩` — kalau tidak, refetch 50 event terbaru
  dan dedupe by `id`).
- Backoff reconnect: 1s, 2s, 4s, 8s, 15s, 30s (maks), + jitter ±20%.
- Halaman saat offline total (`navigator.onLine === false`) menampilkan chip "Perangkat offline".

### 8.3 Deduplikasi

Backend menjamin at-least-once delivery. Client dedupe by `event.id` sebelum menyisipkan ke list; jika id sudah ada,
event diabaikan (bukan diganti) dan counter "event duplikat diabaikan" quietly incremented.

### 8.4 Beban browser

- Satu koneksi WS untuk seluruh aplikasi.
- Event baru **tidak** memaksa refetch; hanya update cache list (§2.2) bila filter cocok.
- Tile video dibatasi 6 stream aktif (§4.1).

---

## 9. Struktur Frontend yang Diusulkan

```
apps/web/
├── package.json
├── vite.config.ts                 # proxy /api + /ws  → http://localhost:8000
├── index.html
├── public/config.json             # runtime config, TANPA secret
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── app/
    │   ├── providers.tsx          # QueryClientProvider, ThemeProvider, RealtimeProvider
    │   ├── router.tsx
    │   └── queryClient.ts
    ├── theme/
    │   ├── index.ts               # createTheme (MUI v9 colorSchemes)
    │   └── tokens.ts              # §5.2
    ├── config.ts                  # loadRuntimeConfig()
    ├── api/
    │   ├── client.ts              # fetch wrapper + ApiError
    │   ├── endpoints.ts           # path builder dari API-CONTRACTS §2
    │   ├── media.ts               # resolveMediaPath() — normalisasi snapshot_path vs snapshot_url
    │   ├── errorCodes.ts          # mapErrorCode() — kosakata UPPERCASE + alias lowercase (§6.4.3)
    │   ├── aiState.ts             # mapAiState() — health + system/status.ai → 5 state kanonik (§6.3)
    │   ├── toolNames.ts           # displayToolName() — get_camera_list → label stabil (§6.4.2)
    │   └── queries/               # cameras.ts, events.ts, chat.ts, system.ts
    ├── realtime/
    │   ├── socket.ts              # WS factory + watchdog + backoff
    │   ├── useRealtime.ts
    │   └── handlers.ts            # NEW_EVENT → cache
    ├── state/
    │   └── uiStore.ts             # Zustand: chatOpen, gridDensity, selectedCameraId, filters, theme
    ├── features/
    │   ├── dashboard/             # DashboardPage, CameraGrid, CameraTile, CameraStatusBadge, SystemStatusBar
    │   ├── events/                # EventsPage, EventTimeline, EventList, EventDetail, EventFilters
    │   ├── chat/                  # ChatPanel, MessageBubble, ToolResultCard, ChatInput, ChatEmptyState
    │   ├── player/                # MjpegStream (img + watchdog), SnapshotImage
    │   └── cameras/               # CameraGridPage, AddCameraDialog
    ├── components/                # AppShell, ErrorBoundary, StateBlock (loading/empty/error), MockBadge, StaleIndicator
    └── test/
        ├── setup.ts
        └── fixtures/              # factory fixtures, semua is_mock: true
```

### 9.1 Keputusan library

| Concern | Pilihan | Alasan |
|---|---|---|
| Build | Vite + React 19 + TS 6.0.3 | Terverifikasi di `frontend-scaffold-spec.md` §9 (2026-10-21) |
| UI | MUI 9 + Emotion | Diminta brief; **pakai API Grid v2** (`GridLegacy` sudah dihapus di v9) |
| Server state | TanStack Query 5 | Cache, retry selektif, invalidasi |
| UI state | Zustand 5 | Ringan, serialisable |
| Routing | `react-router` 8.5.0 | Import dari `react-router` **saja** — `react-router-dom` v8 tidak ada |
| Realtime | Native `WebSocket` | Backend JARVIS memakai WS native, bukan Socket.IO |
| Video | `<img>` MJPEG | Backend JARVIS MJPEG, bukan HLS |
| Test | Vitest + Testing Library + MSW + Playwright | Sesuai § `TEST-PLAN.md` |
| Date | `dayjs` | Ringan, konsisten dengan MUI |

> **Reuse yang sah** dari `frontend-scaffold-spec.md`: matriks versi paket (§9) dan catatan trap TypeScript 7 /
> `react-router` v8 / MUI 9. **Tidak** berlaku: Socket.IO (§6), hls.js (§8), `/auth/*` + RBAC (§5.3–5.4), karena
> kontrak backend JARVIS berbeda total.

### 9.2 Konfigurasi runtime & tanpa secret

`public/config.json`:

```jsonc
{
  "apiBaseUrl": "/api/v1",   // relatif; proxy dev → http://localhost:8000
  "wsPath": "/ws/events",
  "siteName": "JARVIS",
  "siteTimezone": "Asia/Jakarta"
}
```

**Tidak ada secret di file ini.** `apiBaseUrl` relatif = same-origin; header `X-JARVIS-API-KEY` disuntikkan oleh
proxy dev (Vite) atau reverse proxy produksi — **tidak pernah** oleh kode browser. Lihat `SECURITY.md` §5.

Variabel `VITE_` yang diizinkan: `VITE_APP_VERSION`, `VITE_ENABLE_MOCKS`. Tidak ada yang lain. Tidak ada `VITE_*`
yang menyimpan kredensial.

### 9.3 Konkurensi & pembatalan

- Semua query TanStack Query menerima `signal`; filter yang berubah membatalkan request sebelumnya.
- Chat message mutation dibatalkan bila pengguna navigasiAway? **Tidak** — chat(request) dibiarkan selesai supaya
  jawabannya tidak hilang.
- `staleTime` default 15 detik untuk status sistem, 30 detik untuk kamera, 10 detik untuk events.

---

## 10. Aksesibilitas

| Aspek | Ketentuan |
|---|---|
| Kontras | AA: teks ≥ 4.5:1, UI component ≥ 3:1, dicek terhadap token §5.2 |
| Status | Tidak pernah warna saja; selalu ikon + teks (lihat §4.2) |
| Keyboard | Seluruh alur dapat dioperasikan dengan keyboard. Drawer event: focus di dalam saat terbuka, focus dikembalikan ke pemicunya saat ditutup, `Esc` menutup. Dialog: focus trap MUI default |
| Live region | Perubahan status koneksi & data baru diumumkan lewat `aria-live="polite"`; error `assertive` |
| Motion | `prefers-reduced-motion` → disable animasi highlight event & transisi skeleton |
| Screen reader | Timeline event adalah `<ol>` dengan `<li>`; tiap item punya teks aksesibel yang memuat label event (bukan hanya ikon) |
| Form | Label eksplisit, pesan error terhubung via `aria-describedby`, fokus ke field pertama yang error |
| Zoom | Layout tetap utuh pada zoom 200% |
| `<img>` MJPEG | `alt` deskriptif ("Live feed kamera Front Door") — MJPEG dianggap dekoratif bila statusicamerekamera sudah tertulis; tetap diberi alt ringkas |

---

## 11. Mock & Review Checklist (untuk reviewer)

- [ ] Tidak ada URL endpoint yang tidak ada di kode aktual `apps/api/jarvis_api/api/routes/`.
- [ ] Tidak ada secret / API key di kode frontend atau `config.json`.
- [ ] Badge `[MOCK DATA]` muncul di event `is_mock === true` dan di banner global bila mode mock aktif.
- [ ] Prose AI dan kartu tool terpisah secara visual.
- [ ] Chip grounding mengikuti `meta.stop_reason` (`completed` / `no_tool_grounding` / `max_rounds`) — bukan heuristic.
- [ ] Chip "belum terverifikasi" muncul bila jawaban memuat klaim faktual tanpa tool yang sukses.
- [ ] Semua 7+ state (L/E/X/D/R) terimplementasi per §7.
- [ ] Kamera offline tidak me-mount stream.
- [ ] Tidak ada tombol mutating yang memanggil endpoint karangan.
- [ ] Tidak ada klaim "test lulus" tanpa log eksekusi.
- [ ] **Empat fungsi normalisasi ada dan punya test**: `mapErrorCode()`, `mapAiState()`, `displayToolName()`,
      `mapToolStatus()` (§5.6).
- [ ] Tidak ada komponen yang membaca `error.code` / `ai.degraded` / `tool_name` mentah di luar fungsi-fungsi itu.
- [ ] Riwayat chat dirender dari `messages[]` **dan** tetap toleran terhadap `items[]` (kalau kontrak `D-4` akhirnya dipakai).

---

## 12. Rencana Implementasi (Fase 5 ROADMAP)

| Phase | Isi | Exit criteria |
|---|---|---|
| **P0** Toolchain | npm workspace root, `apps/web` Vite+React+TS, MUI 9 theme (§5), ESLint 10, Prettier, Vitest+Playwright, `config.json`, `public/config.json` | `npm install` tanpa peer warning; dev server menyaji shell kosong; lint/typecheck/test/build hijau |
| **P1** Kontrak & client | `api/client.ts`, `ApiError`, `endpoints.ts`, `media.ts`, query hooks, MSW handlers | Error envelope ter-map; 4xx tidak diretry; contract test MSW hijau |
| **P2** Realtime | WS factory, watchdog, backoff, dedupe, catch-up refetch, banner koneksi | Event fake memperbarui list tanpa refresh; reconnect men-caught-up; dedupe by id |
| **P3** Dashboard | `AppShell`, `SystemStatusBar`, `CameraGrid`, `CameraTile`, badge, add-camera dialog | Semua state §7 ada; kamera offline tidak mount stream; density toggle bekerja |
| **P4** Player MJPEG | `MjpegStream` + watchdog beku + retry backoff + snapshot fallback | Retry & backoff terbukti via test; teardown melepas koneksi |
| **P5** Events | Timeline, filters (URL-param), detail drawer, paginasi offset, realtime prepend | Filter mengubah query & list; realtime prepend saat cocok; drawer fokus-managed |
| **P6** Chat | Panel, bubble, `ToolResultCard` (status + result collapsible), grounding chip dari `meta.stop_reason`, error per `error.code`, `client_message_id` idempotensi, history restore (D-4) | Pisahan AI/tool terbukti; tool `status=error` → kartu merah & chip di bubble; 503 provider → bubble error tanpa merusak grid; history `items[].tools_executed` (nama saja) dirender sebagai chip |
| **P7** Hardening | Error boundary per route, a11y pass, responsive, bundle budget, E2E | Suite hijau; 0 console error; WCAG AA spot-check |

Cross-cutting (setiap phase): TDD, tidak ada secret baru, tidak ada dependency tanpa resolusi registry bersih, tidak ada
deploy tanpa persetujuan.

> **Status blokir (per 2026-10-22 14:00, diverifikasi ke kode aktual `apps/api/jarvis_api/`):**
>
> | Celah | Status | Dampak ke phase |
> |---|---|---|
> | `C-1` enum `event_type` | **Tertutup di kode** — `motion`/`object_detected`/`camera_status`; `API-CONTRACTS.md` §2.3 masih menyebut `camera_offline` | P5 bisa jalan; kontrak kanonik perlu disinkronkan |
> | `C-2` enum status kamera | **Terbuka** — kode vision (`worker.py`) hanya `online`/`offline`/`connecting`/`error`; **`reconnecting` tidak ada** | P3 terblokir untuk state "menyambung kembali" |
> | `C-3` bentuk `GET /chat/history` | **Tertutup di kode, tapi ≠ kontrak D-4** (`messages[]` vs `items[]`) → `G-5`/`G-6` | P6 harus tolerant / pakai bentuk aktual |
> | `C-4` error envelope | **Tertutup di kode, tapi kode error ≠ kontrak** (UPPERCASE vs lowercase) → `G-1` | **P1 terblokir** sampai `mapErrorCode()` ditulis |
> | `C-5` auth `WS /ws/events` | **Terbuka** — `websocket.py` tidak memuat `require_api_key` | P2 hanya aman di loopback |
> | `C-6` error chat saat provider gagal | **Tertutup di kode** (bersama `C-4`) | — |
> | `C-7` endpoint tool mutating | **Diusulkan ditutup** — tool terdaftar tapi tidak diekspos ke model & ditolak tanpa `allow_mutating`; UI tidak membuat tombol mutasi | Tidak memblokir |
> | `C-8` nama field snapshot | **Terbuka** — kamera `snapshot_url`, event `snapshot_path` (isi URL) | P3/P5 perlu `resolveMediaPath()` (rencana sudah ada) |
> | `C-9` flag mock per kamera / di health | **Terbuka sebagian** — `EventItem.is_mock` ada; `CameraStatus.is_mock` & `mock_mode` tidak | P3 badge mock per tile tidak bisa |
> | `C-10` catch-up `since` di WS | **Terbuka** | P2 pakai fallback refetch 50 terakhir |
> | `R-1` grounding | **Tertutup** — `meta.stop_reason` | — |
> | `R-2` status per tool | **Tertutup sebagian** — `status` ada tapi hanya `ok`/`error`/`denied` (`G-2`) | P6 perlu renderer status yang memetakan `ok` **dan** `success` |
> | `G-1`…`G-15` | **Terbuka** — 15 divergensi kontrak↔kode (`docs/AUDIT.md` §3.19) | P1 & P6 terblokir sebagian |
>
> **P1 dan P6 bisa mulai** dengan satu syarat: `mapErrorCode()` dan `mapAiState()` ditulis mengikuti **kode aktual**,
> bukan kontrak — dan diberi satu test yang mengunci mapping itu.
> **P2 (realtime) terblokir `C-5`** — selama itu, realtime hanya aman di loopback.
> **P3 terblokir `C-2` & `C-9`.****

---

## 13. Permintaan Kontrak ke Main Agent (ringkas)

Status per 2026-10-22 14:00, **diverifikasi ke kode aktual** (bukan hanya ke dokumen).
**"Tertutup" = sudah ada di kode.** Detail lengkap di `docs/AUDIT.md` §3.19 & §4.

| ID | Permintaan | Status | Dampak kalau tidak turun |
|---|---|---|---|
| C-1 | Enum `event_type` kanonik (`camera_status`, bukan `camera_offline`) | **Tertutup di kode**; `API-CONTRACTS.md` perlu disinkronkan | Filter timeline salah |
| C-2 | Enum `status` kamera kanonik (+ `connecting` / `reconnecting`) | **Terbuka** — `reconnecting` tidak ada di kode vision | Badge "menyambung ulang" tidak bisa |
| C-3 | Bentuk payload `GET /chat/history` | **Tertutup di kode, tapi ≠ `D-4`** (`messages[]`, bukan `items[]`/`total`) → `G-5`/`G-6` | Riwayat chat tidak bisa direstore sesuai kontrak |
| C-4 | Error envelope standar `{error:{code,message,details}}` | **Tertutup di kode, tapi kode ≠ `D-7`/`§11.6`** (UPPERCASE, set berbeda) → `G-1` | Semua state error jadi generik |
| C-5 | Mekanisme auth `WS /ws/events` | **Terbuka** — dikonfirmasi `websocket.py` tidak memuat `require_api_key` | Realtime belum bisa di-hardening |
| C-6 | Bentuk error `POST /chat/messages` saat provider gagal | **Tertutup di kode** (bersama `C-4`) | Error chat tidak informatif |
| C-7 | Endpoint tool mutating | **Diusulkan ditutup** — mutating tidak diekspos ke model; UI tidak membuat tombol | Tombol mutating tidak dibuat |
| C-8 | Konsistensi nama field snapshot (`snapshot_path` vs `snapshot_url`) | **Terbuka** | Resolve URL media berantakan |
| C-9 | Penanda mode mock di `/health` & per kamera | **Terbuka sebagian** — `EventItem.is_mock` ada, `CameraStatus.is_mock` tidak | Banner global tidak bisa jujur |
| C-10 | Parameter `since` (timestamp) untuk catch-up event di WS setelah reconnect | **Terbuka** | Event bisa hilang saat reconnect |
| R-1 | Sinyal grounding deterministik | **Tertutup** — `meta.stop_reason` | Penandaan jadi heuristic |
| R-2 | `status` per `tools_executed[]` | **Tertutup sebagian** — hanya `ok`/`error`/`denied` yang terpakai (`G-2`) | Kartu tool tidak bisa menandai `invalid_arguments`/`timeout` |
| R-3 | Header correlation id di respons | **Terbuka** — `meta` aktual tidak punya `request_id`; format header belum disepakati | Error di UI tidak bisa dikorelasikan ke log |
| **G-1** | Satu kosakata kode error (UPPERCASE vs lowercase) | **Terbuka** | Switch error UI tidak pernah cocok |
| **G-7** | `ai.state` enum + `last_error_at`/`last_success_at` | **Terbuka** — hanya ada `degraded: boolean` | Badge AI tidak bisa membedakan gagal vs belum diatur |
| **G-8** | Kosakata `components.llm_service` (`mock` di luar daftar) | **Terbuka** | Health & status bicara bahasa berbeda |

### 13.1 Permintaan tambahan yang muncul dari `AI-CORE-DESIGN.md`

| ID | Permintaan | Asal | Status di kode aktual |
|---|---|---|---|
| N-1 | `GET /api/v1/chat/conversations` — daftar percakapan | `AI-CORE-DESIGN.md` §12.2 N-1 | **Belum ada** di kode |
| N-2 | `DELETE /api/v1/chat/conversations/{id}` — hapus riwayat (kebutuhan privasi) | §12.2 N-2 | **Sudah ada** (`soft-delete`, returns `{conversation_id, archived: true}`) |
| N-3 | `GET /api/v1/ai/status` — diagnostik provider tanpa log scraping | §12.2 N-3 | **Belum ada** — `/system/status.ai` masih minim |
| N-4 | Keputusan: satu percakapan global (`conv_default`) atau satu per sesi/tab? | §12.3 poin 2 | **Terbuka** — backend default `conv_default`; UI harus mengirim `conversation_id` eksplisit |

---

*Dokumen desain. Tidak ada kode frontend yang dibuat; implementasi menunggu keputusan "satu sumber kebenaran" atas
kontrak API (`docs/AUDIT.md` §3.19) dan persetujuan Main Agent atas delta `D-1`…`D-8` (Fase 3 ROADMAP).
Verifikasi terhadap kode aktual: 2026-10-22 14:00.*
