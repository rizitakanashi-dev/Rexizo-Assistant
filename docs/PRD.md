# JARVIS — Product Requirements Document (PRD)

## 1. Visi Produk
JARVIS adalah prototype asisten AI cerdas berbasis *local-first* yang mengintegrasikan percakapan natural language dengan sistem pemantauan kamera (surveillance) cerdas. Sistem ini memungkinkan pengguna memantau keamanan properti, menanyakan status perangkat & kamera, mendapatkan notifikasi event real-time, serta menelusuri riwayat kejadian tanpa mengorbankan privasi data lokal.

---

## 2. Sasaran & Target Pengguna
- **Target Pengguna**: Pemilik rumah / operator kantor lokal yang membutuhkan asisten pemantauan cerdas dengan kontrol data penuh.
- **Karakteristik Utama**: 
  - *Local-first*: Video streaming dan snapshot disimpan secara lokal.
  - *Privacy-conscious*: Snapshot dan video tidak dikirim ke LLM publik secara default.
  - *Actionable AI*: AI dapat memanggil tool terverifikasi untuk membaca status dan event kamera.

---

## 3. Ruang Lingkup MVP (In-Scope)
1. **AI Assistant & Core**:
   - Antarmuka chat teks responsif.
   - Integrasi LLM via Dattio AI (API kompatibel OpenAI).
   - Tool Registry dengan sistem verifikasi izin (read-only vs mutating).
   - Persistent memory riwayat chat dalam database SQLite lokal.
2. **Surveillance & Computer Vision**:
   - Ingest RTSP camera feed melalui OpenCV (mendukung stream nyata maupun synthetic/mock stream untuk testing).
   - Deteksi gerakan (*Motion Detection*) berbasis frame difference / background subtractor MOG2.
   - Deteksi objek (*Object Detection*) lokal ringan (e.g., YOLOv8n / MobileNet-SSD) untuk mendeteksi `person`, `car`, `dog/cat`.
   - Pipeline event terstruktur dengan metadata (`camera_id`, `timestamp`, `event_type`, `bbox`, `confidence`).
   - Penyimpanan metadata event di SQLite dan snapshot frame lokal di direktori `storage/snapshots/`.
3. **Frontend Dashboard**:
   - Antarmuka React + TypeScript + Material UI (MUI).
   - Tampilan chat interaktif dengan JARVIS.
   - Tampilan live feed / snapshot monitoring kamera yang terdaftar.
   - Feed log event real-time via WebSocket.
   - Indikator status sistem (kamera online/offline, status service AI, disk/storage).
4. **Keamanan & Guardrails**:
   - Strict allowlist untuk eksekusi tool.
   - Tidak ada kredensial atau stream URL yang terekspos ke frontend atau LLM eksternal.

---

## 4. Non-Goals (Ditunda / Fase Lanjutan)
- **Voice / Speech (STT/TTS)**: Ditunda ke Fase 8 agar tidak menghambat delivery MVP.
- **Facial Recognition & LPR (License Plate Recognition)**: Tidak masuk dalam MVP untuk menghindari kompleksitas model dan risiko privasi awal.
- **Cloud Video Streaming / Relay**: Semua streaming tetap di jaringan lokal.
- **Autonomous Desktop / Smart Home Control**: Tidak ada eksekusi kendali perangkat fisik / OS tanpa model otorisasi eksplisit yang disetujui.
- **Infrastruktur Multi-node / Kubernetes / Distributed Queue**: Cukup arsitektur modular single-node lokal (FastAPI + background thread/process + SQLite).

---

## 5. Acceptance Criteria MVP
1. **Chat & Tooling**: Pengguna dapat bertanya "Apakah ada gerakan di kamera depan?" -> LLM memanggil tool `get_recent_events` atau `get_camera_status`, dan menjawab berdasarkan data aktual (bukan halusinasi).
2. **Surveillance Pipeline**: Ketika ada gerakan/objek terdeteksi pada RTSP feed, event tersimpan di SQLite dalam waktu < 1 detik dan terkirim ke UI via WebSocket.
3. **Dashboard React/MUI**: Menampilkan daftar kamera, status koneksi aktif, daftar riwayat event dengan thumbnail snapshot, dan chat widget yang responsif.
4. **Resilience**: Matinya service RTSP/kamera tidak membuat server backend FastAPI atau LLM crash. LLM error tidak menghentikan perekaman/deteksi event kamera.
5. **Privacy Assurance**: Tidak ada panggilan outbound ke internet yang melampirkan file video/snapshot CCTV atau RTSP credentials.
