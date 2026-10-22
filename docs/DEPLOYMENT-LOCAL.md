# JARVIS — Deployment Lokal

**Author:** Frontend / DevOps-lite
**Date:** 2026-10-22
**Status:** Backend **terverifikasi** (2026-10-22, `pytest -q` → 78 passed; smoke test `uvicorn` OK).
Frontend `apps/web/` **belum ada** — perintah di §5.4/§5.6 masih anticipating struktur final (`docs/UI-DESIGN.md` §9).
Status tiap perintah: lihat §11 (Status Perintah).

---

## 1. Prinsip

1. **Semua berjalan di localhost.** Tidak ada deployment cloud. Tidak ada container yang memanggil internet kecuali
   LLM provider (Dattio AI) — dan itu hanya teks metadata.
2. **Tidak ada secret di repo maupun di browser.** `.env` lokal, header API key disuntik proxy.
3. **Mode mock selalu tersedia.** Demo & CI tidak boleh bergantung pada kamera fisik.
4. **Perintah harus dapat diulang.** Setiap langkah di bawah punya bagian "verifikasi" — tidak ada "k mysteriously
   bekerja".

---

## 2. Prasyarat

| Kebutuhan | Versi minimum | Cara cek |
|---|---|---|
| Python | 3.11+ | `python3 --version` |
| Node.js | 20.19+ / 22.12+ (Vite 8) | `node -v` |
| npm | 10+ | `npm -v` |
| FFmpeg | 5+ (untuk feed RTSP sintetis) | `ffmpeg -version` |
| Kamera RTSP | opsional | — |

> Di environment penyusunan dokumen ini: Python 3.14.8, Node v26.11.1, npm 12.2.1. Perhatikan Node 26 sudah di luar
> rentang yang diuji Vite 8 (`^20.19 || >=22.12`) —_node_ memenuhi, tetapi perlu verifikasi build.

---

## 3. Struktur yang Diharapkan

```
jarvis-assistant/
├── apps/
│   ├── api/jarvis_api/     # FastAPI + AI Core + integrasi surveillance
│   └── web/                # React + TS + MUI dashboard  ← BELUM ADA (Fase 5)
├── services/
│   └── surveillance/jarvis_surveillance/   # ingest RTSP, deteksi, snapshot
├── tests/                  # pytest (backend + surveillance + ai_core)
├── pyproject.toml          # satu project; paket: jarvis_api, jarvis_surveillance
├── storage/                # SQLite + snapshots  ← gitignored
├── .env                    # ← gitignored, TIDAK pernah di-commit
└── .env.example            # ← committed, placeholder kosong
```

> Struktur di atas **sudah ada** (kecuali `apps/web/`). Perintah backend sudah dijalankan dan lulus — §11.

---

## 4. Setup Backend (FastAPI)

```bash
# 1. Virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. Dependencies — SATU pyproject.toml di root repo
pip install -e ".[dev]"          # extra "dev" = pytest, pytest-asyncio, ruff

# 3. Environment variables
cp .env.example .env
$EDITOR .env
```

> **Tidak ada `apps/api/requirements.txt` dan tidak ada `apps/api/pyproject.toml`.** Satu `pyproject.toml` di root
> mendeklarasikan paket `jarvis_api` (dari `apps/api`) dan `jarvis_surveillance` (dari `services/surveillance`).

`.env.example` **sudah ada** di repo (`/home/Rizi/Projects/jarvis-assistant/.env.example`). Isinya:

```dotenv
# --- Server ---
JARVIS_HOST=127.0.0.1
JARVIS_PORT=8000
# API key opsional. Kosongkan untuk mengizinkan akses dari localhost saja.
JARVIS_API_KEY=

# --- Storage ---
JARVIS_DATABASE_URL=sqlite+aiosqlite:///./storage/jarvis.db
JARVIS_STORAGE_DIR=./storage

# --- LLM (Dattio AI, API kompatibel OpenAI) ---
# Bila API key / base URL / model kosong, backend berjalan dalam TEST MODE
# (FakeProvider offline, tidak ada traffic keluar).
DATTIO_API_KEY=
DATTIO_BASE_URL=
DATTIO_MODEL=
# Mode tool-calling: native (function-calling), prompt (JSON di teks), auto.
DATTIO_TOOL_MODE=auto
DATTIO_TEMPERATURE=0.2
JARVIS_TEST_MODE=false

# --- Guardrail AI Core ---
AI_ENABLED=true
AI_TOOLS_ENABLED=true
AI_MUTATING_TOOLS_ENABLED=false
AI_TOOL_FIRST=auto
AI_MAX_MESSAGE_CHARS=2000
AI_CHAT_DEADLINE_SECONDS=60

# --- Surveillance ---
# true = gunakan feed kamera sintetis (tanpa perangkat RTSP fisik).
JARVIS_MOCK_CAMERA_FEED=true
JARVIS_MOTION_AREA_THRESHOLD_PERCENT=1.0
JARVIS_EVENT_DEBOUNCE_SECONDS=10.0
JARVIS_OBJECT_DETECTION_MODEL_PATH=
JARVIS_OBJECT_DETECTION_LABELS_PATH=
JARVIS_OBJECT_DETECTION_CONFIDENCE=0.5
```

**Prefiks env: hanya `JARVIS_` yang universal.** `Settings` memakai `env_prefix="JARVIS_"`, tetapi field Dattio &
AI Core punya `validation_alias=AliasChoices(...)` sehingga nama **tanpa prefiks** juga diterima:

| Field | Diterima | Catatan |
|---|---|---|
| `dattio_api_key` | `DATTIO_API_KEY` **atau** `JARVIS_DATTIO_API_KEY` | Alias ditambahkan 2026-10-22 (`docs/AUDIT.md` §3.16) |
| `dattio_base_url` | `DATTIO_BASE_URL` atau `JARVIS_DATTIO_BASE_URL` | idem |
| `dattio_model` | `DATTIO_MODEL` atau `JARVIS_DATTIO_MODEL` | idem |
| `dattio_tool_mode` | `DATTIO_TOOL_MODE` atau `JARVIS_DATTIO_TOOL_MODE` | idem |
| `dattio_temperature` | `DATTIO_TEMPERATURE` atau `JARVIS_DATTIO_TEMPERATURE` | idem |
| `ai_enabled`, `ai_tools_enabled`, `ai_mutating_tools_enabled`, `ai_tool_first`, `ai_max_message_chars`, `ai_chat_deadline_seconds` | `AI_*` atau `JARVIS_AI_*` | idem |
| `api_key`, `allowed_origins`, `host`, `port`, `database_url`, `storage_dir`, `mock_camera_feed`, `surveillance_enabled`, `test_mode`, `llm_*` | `JARVIS_*` saja | Tidak punya alias |

> **Lacak pemetaan env → field:** `apps/api/jarvis_api/core/config.py`.
>
> **`JARVIS_ALLOWED_ORIGINS` belum ada di `.env.example`** (gap dokumentasi, bukan bug — default `http://localhost:5173`
> sudah aman untuk dev). Tambahkan bila butuh origin tambahan, mis. `JARVIS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`
> (dipisah koma).

**Verifikasi:**

```bash
python -c "import fastapi, uvicorn, cv2, sqlalchemy; print('deps ok')"
mkdir -p storage/snapshots
```

> ✅ **Temuan `F-1` (`docs/AUDIT.md` §3.16) — SUDAH DIPERBAIKI.** `Settings` tetap memakai
> `env_prefix="JARVIS_"`, tetapi field Dattio kini punya
> `validation_alias=AliasChoices("DATTIO_API_KEY", "JARVIS_DATTIO_API_KEY")` (dan seterusnya untuk
> `BASE_URL`, `MODEL`, `TOOL_MODE`, `TEMPERATURE`). **Nama `DATTIO_*` dari `.env.example` sekarang terbaca.**
>
> **Verifikasi cepat** (tanpa memanggil provider):
>
> ```bash
> python -c "from jarvis_api.core.config import Settings; s=Settings(); print(s.llm_enabled, s.llm_provider_name)"
> # (True, 'dattio')  -> konfigurasi live
> # (False, 'fake')  -> TEST MODE: cek DATTIO_API_KEY / DATTIO_BASE_URL / DATTIO_MODEL
> ```
>
> `llm_enabled` = False bila `JARVIS_TEST_MODE=true`, atau `AI_ENABLED=false`, atau salah satu dari key/base-URL/model kosong.
>
> **Catatan privasi:** `JARVIS_MOCK_CAMERA_FEED=true` **wajib** aktif saat `JARVIS_TEST_MODE=true`. Kombinasi LLM live +
> feed sintetik diperbolehkan (untuk demo), tetapi hasilnya harus diberi badge mock — lihat `docs/SECURITY.md` §4.

---

## 5. Menjalankan Stack

### 5.1 Backend

```bash
source .venv/bin/activate
uvicorn jarvis_api.main:app --host 127.0.0.1 --port 8000 --reload
```

> Nama modul ASGI (`jarvis_api.main:app`) mengikuti struktur aktual `apps/api/jarvis_api/`.
> `main.py` **sudah ada** (`apps/api/jarvis_api/main.py`) — memasang CORS, dependency auth API key, router
> `/api/v1/*`, dan router WebSocket `/ws/events`. Perintah di atas **sudah dijalankan dan lulus** (§11).

Verifikasi:

```bash
curl -s http://127.0.0.1:8000/api/v1/health
# {"status":"healthy","version":"0.1.0-mvp",...}

curl -s http://127.0.0.1:8000/api/v1/cameras
curl -s http://127.0.0.1:8000/api/v1/events?limit=5
```

### 5.2 Worker surveillance

**Kondisi aktual: worker berjalan DI DALAM proses API.** `apps/api/jarvis_api/main.py` (fungsi `lifespan`)
memanggil `SurveillanceService.start()` saat startup — jadi **tidak ada perintah tambahan**; worker ikut hidup
begitu uvicorn berjalan.

```bash
# Yang perlu dijalankan (cukup satu):
uvicorn jarvis_api.main:app --host 127.0.0.1 --port 8000 --reload
```

> `services/surveillance/jarvis_surveillance/worker.py` **tidak** punya blok `if __name__ == "__main__":`, jadi
> `python -m jarvis_surveillance.worker` **tidak** bisa dipakai sebagai entry point terpisah. Itu keputusan sadar
> (satu proses = satu sumber event), bukan kekosongan yang belum diisi.
>
> Worker bisa dimatikan tanpa menyentuh API: `JARVIS_SURVEILLANCE_ENABLED=false` (default `true`).
> Dengan `JARVIS_MOCK_CAMERA_FEED=true` worker memakai generator OpenCV (tanpa perangkat RTSP).

### 5.3 Feed RTSP sintetis (opsional, untuk menguji pipeline tanpa kamera)

```bash
# Loop video MP4 melalui RTSP (butuh ffmpeg + server RTSP lokal)
ffmpeg -re -loop 1 -i fixtures/sample.mp4 -c:v copy -f rtsp rtsp://127.0.0.1:8554/live
```

Alternatif yang lebih sederhana dan **tidak butuh jaringan**: pakai generator OpenCV bawaan
(`MOCK_CAMERA_FEED=true`) yang membuat frame bergerak geometris 640x480.

### 5.4 Frontend

```bash
# dari root repo
npm install          # workspace root (npm workspaces)

cd apps/web
npm run dev          # http://localhost:5173
```

`vite.config.ts` (**harus menyuntikkan API key di sisi server**, bukan di browser):

```ts
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const API_KEY = env.JARVIS_API_KEY ?? '';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (API_KEY) proxyReq.setHeader('X-JARVIS-API-KEY', API_KEY);
            });
          },
        },
        '/ws': { target: 'ws://127.0.0.1:8000', ws: true, changeOrigin: true },
      },
    },
  };
});
```

> **Why the proxy injects the header.** Browser tidak boleh memegang secret. Dengan cara ini, `JARVIS_API_KEY` hanya
> dibaca oleh proses Vite (server-side) dan tidak pernah masuk bundle. Lihat `docs/SECURITY.md` §3.2.

**Verifikasi:** buka `http://localhost:5173` → dashboard tampil; DevTools Network → request `/api/v1/health` →
response 200 dan **tidak ada** header `X-JARVIS-API-KEY` di request browser.

### 5.5 CORS

Bila memakai proxy di atas, request menjadi **same-origin** → CORS tidak diperlukan.

Bila memakai dev server tanpa proxy (mis. mengetes API langsung dari browser), backend **wajib** mengizinkan origin
khusus:

```python
# apps/api/jarvis_api/main.py — sudah terpasang di kode
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,  # default ["http://localhost:5173"], JANGAN "*"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

> Override lewat env: `JARVIS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` (dipisah koma).
> `allow_credentials=True` berarti **wildcard `*` pada origin akan ditolak oleh Starlette** — itu perilaku yang
>Desired: backend menolak `allow_origins=["*"]` + credentials.

> Gejala CORS salah konfigurasi: request **ditolak** di browser dengan pesan CORS di console, padahal `curl` berhasil.
> Lihat `docs/SECURITY.md` §6.

---

## 6. Menjalankan Everything Sekaligus

**Opsi A — dua terminal (paling jelas untuk debugging)**

```bash
# Terminal 1
source .venv/bin/activate && uvicorn jarvis_api.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2
npm run dev
```

**Opsi B — Makefile**

```makefile
.PHONY: dev api web test lint mock

dev:
	@echo "Jalankan 'make api' dan 'make web' di dua terminal."

api:
	source .venv/bin/activate && uvicorn jarvis_api.main:app --host 127.0.0.1 --port 8000 --reload

web:
	npm run dev

mock:
	JARVIS_MOCK_CAMERA_FEED=true JARVIS_TEST_MODE=true make api

test:
	pytest -q && npm --workspace apps/web run test

lint:
	ruff check . && npm --workspace apps/web run lint
```

> `make` file **belum dibuat** — ini usulan.
>
> Catatan nama env di blok Makefile: `MOCK_CAMERA_FEED` → `JARVIS_MOCK_CAMERA_FEED`, `LLM_TEST_MODE` → `JARVIS_TEST_MODE`
> (prefix `JARVIS_` wajib untuk field tanpa alias).

---

## 7. Build Produksi Lokal (opsional)

```bash
cd apps/web
npm run build       # → apps/web/dist/
```

`dist/` served oleh reverse proxy yang juga mem-proxy `/api` dan `/ws`:

```nginx
server {
    listen 443 ssl;
    server_name jarvis.local;

    ssl_certificate     /etc/nginx/certs/jarvis.crt;
    ssl_certificate_key /etc/nginx/certs/jarvis.key;

    root /opt/jarvis/apps/web/dist;
    index index.html;

    # --- API ---
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-JARVIS-API-KEY "...";   # secret, hanya di file konfigurasi nginx (chmod 600)
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- WebSocket ---
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # --- SPA ---
    location / {
        try_files $uri $uri/ /index.html;
    }

    # --- Security headers ---
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' blob: data:; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" always;
}
```

> **Catatan `Content-Security-Policy`:** `'unsafe-inline'` pada `style-src` diperlukan oleh Emotion/MUI. `script-src`
> **tidak** boleh memuat `unsafe-inline`/`unsafe-eval`.

**Akses LAN.** Tambahkan `auth_basic` atau client cert pada blok `server`. **Jangan** mengekspos port 8000
langsung — bind ke `127.0.0.1` saja.

---

## 8. Verifikasi End-to-End (Checklist)

| # | Langkah | Ekspektasi |
|---|---|---|
| 1 | `curl /api/v1/health` | 200, `status: healthy` |
| 2 | Buka `http://localhost:5173` | Dashboard tampil, grid kamera terisi |
| 3 | Tile kamera | Live MJPEG atau placeholder + badge status |
| 4 | `MOCK_CAMERA_FEED=true` | Event muncul di timeline **dengan badge `[MOCK DATA]`** |
| 5 | Tanya chat: "Ada orang di kamera depan?" | Balasan + **kartu tool terpisah** (`get_recent_events`) |
| 6 | Matikan API (`Ctrl+C`) | Banner "Live updates paused" / error state; UI tidak crash |
| 7 | Nyalakan lagi API | Reconnect + catch-up, tanpa event duplikat |
| 8 | Matikan kamera (hentikan feed) | Status kamera → offline; event `camera_status` muncul |
| 9 | DevTools → Application → Local Storage | Hanya preferensi UI (tema/density). **Tidak ada** token/key |
| 10 | DevTools → Network → request `/api/v1/*` | Tidak ada header API key yang dikirim browser |
| 11 | `grep -r "X-JARVIS-API-KEY" apps/web/dist/` | Kosong |

---

## 9. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Browser: "CORS error", `curl` berhasil | `CORSMiddleware` tidak dikonfigurasi | Tambahkan origin dev (ATAU pakai proxy) — §5.5 |
| 401/403 dari API | `X-JARVIS-API-KEY` tidak diteruskan | Periksa header pada proxy Vite / nginx |
| Dashboard: "Live updates paused" | WS gagal handshake | Periksa path `/ws/events`, proxy `ws: true`, header auth |
| WS connect lalu langsung disconnect | Namespace/path salah | JARVIS memakai `/ws/events` (bukan `/realtime` seperti Socket.IO) |
| Tile kamera "Stream tidak tersedia" | Worker RTSP belum start / feed mati | Cek log worker; `MOCK_CAMERA_FEED=true` untuk uji |
| Event tidak muncul | Worker tidak menulis ke DB / WS | Cek `storage/jarvis.db`, log worker |
| Chat: "Asisten tidak tersedia" | LLM provider gagal / key kosong | Cek `JARVIS_TEST_MODE`, `DATTIO_API_KEY`, log (key jangan dicetak) |
| Chat selalu "test mode" padahal key diisi | `llm_enabled` = False | `python -c "from jarvis_api.core.config import Settings; print(Settings().llm_enabled, Settings().llm_provider_name)"` — bila `False`, cek `DATTIO_API_KEY`/`DATTIO_BASE_URL`/`DATTIO_MODEL`, `AI_ENABLED`, `JARVIS_TEST_MODE` (§4) |
| Chat: jawaban tanpa kartu tool | Model tidak memanggil tool | Uji dengan LLM fake; cek prompt builder; `AI_TOOL_FIRST=always` untuk memaksa |
| 404 di `/api/v1/chat/history` | `conversation_id` salah / tidak ada | Endpoint **sudah ada**; pastikan param `conversation_id` sesuai, atau pakai `GET /api/v1/chat/conversations/{id}/history` |
| Vite: "Failed to resolve import" | Lockfile/node_modules stale | `rm -rf node_modules package-lock.json && npm install` |
| Port 8000/5173 dipakai | Proses lain | `lsof -i :8000` / `lsof -i :5173`, atau ubah port |
| `[MOCK DATA]` tidak muncul di UI | Backend tidak mengirim `is_mock` | Periksa flag mock backend & kontrak `C-9` |

---

## 10. Membersihkan Data

```bash
# Reset total state lokal (DESTRUKTIF — hanya untuk dev)
rm -rf storage/jarvis.db storage/snapshots/
mkdir -p storage/snapshots
```

> Jangan pernah menjalankan ini di perangkat yang menyimpan rekaman produksi.

---

## 11. Status Perintah

| Perintah | Status | Bukti |
|---|---|---|
| `python3 -m venv .venv` | **Berhasil** | `.venv/` ada; Python 3.14.8 |
| `pip install -e ".[dev]"` | **Berhasil** | `pytest`, `ruff` tersedia di `.venv/bin` |
| `pytest -q` | **Berhasil** | **78 passed**, 4 warnings, 7.55 dtk (2026-10-22 15:05) |
| `ruff check .` + `ruff format --check .` | **Berhasil** | All checks passed; 72 file bersih |
| `uvicorn jarvis_api.main:app` | **Berhasil** | smoke test: `GET /api/v1/health` → 200 `{"status":"healthy","version":"0.1.0-mvp"}`; `POST /api/v1/chat/messages` → 200 + `tools_executed[0].tool_name=get_system_status`; `POST /api/v1/cameras` → 201, kamera sintetis `status='online'` (`fps=10.07`); `GET /api/v1/events` → 1 event `motion` (`is_mock=true`); `GET /api/v1/cameras/{id}/snapshot` → 200 |
| `pip install -r apps/api/requirements.txt` | **Tidak berlaku** | Tidak ada `requirements.txt` — satu `pyproject.toml` di root (§4) |
| `npm install` (workspace root) | **Belum dijalankan** | `apps/web/` belum ada; `package.json` belum ada |
| `npm run dev` (apps/web) | **Belum dijalankan** | `apps/web/` belum ada (Fase 5) |
| `make test` | **Belum dijalankan** | `Makefile` belum dibuat |
| `python -m jarvis_surveillance.worker` | **Tidak berlaku** | Worker berjalan in-process via `lifespan` (§5.2) |

Yang **sudah** terverifikasi di environment penyusunan:

```
$ node -v
v26.11.1
$ npm -v
12.2.1
$ python3 -V
Python 3.14.8
$ pytest -q
78 passed, 4 warnings in 7.55s
```

> Sesuai `docs/TEST-PLAN.md` §10, dokumen ini **tidak mengklaim** apa pun sudah berhasil tanpa bukti eksekusi di atas.
> Baris "Berhasil" = ada output nyata; "Belum dijalankan" = tidak ada klaim.

---

## 12. Checklist Sebelum Demo / Rilis Lokal

- [ ] `.env` ada, `.gitignore` memuat `.env` dan `storage/`.
- [ ] `git status` bersih dari file secret (`gitleaks detect --no-git`).
- [ ] `JARVIS_TEST_MODE=false` **hanya** bila Dattio key valid dan key ter-redact di log
      (nama env: `JARVIS_TEST_MODE`; `LLM_TEST_MODE` **tidak** dibaca backend).
- [ ] `MOCK_CAMERA_FEED` sesuai kondisi nyata; badge mock tampil bila aktif.
- [ ] Backend ter-bind `127.0.0.1`.
- [ ] Reverse proxy (bila dipakai) punya TLS + auth + security headers.
- [ ] Checklist §8 dijalankan seluruhnya dan lolos.
- [ ] Dokumentasi yang relevan di repo **sudah diperbarui** bila kontrak berubah.

---

*Dokumen deployment lokal. Perintah backend sudah dieksekusi dan terbukti lulus (§11); bagian frontend masih
antrian Fase 5.*
