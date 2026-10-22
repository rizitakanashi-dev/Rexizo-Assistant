# JARVIS — API Contracts & Specifications

Version: `v1`  
Base URL: `http://localhost:8000/api/v1`

---

## 1. Authentication & Headers
- Untuk prototype lokal MVP, autentikasi berbasis session lokal atau Header API Key sederhana (`X-JARVIS-API-KEY: <key>`), default allow untuk localhost.
- Content-Type: `application/json` (kecuali stream MJPEG atau upload/download snapshot).

---

## 2. Endpoints

### 2.1 System & Health
#### `GET /api/v1/health`
Mengembalikan status kesehatan sistem dan komponen.
```json
{
  "status": "healthy",
  "version": "0.1.0-mvp",
  "uptime_seconds": 3600,
  "components": {
    "database": "connected",
    "surveillance_workers": "running",
    "llm_service": "available"
  }
}
```

#### `GET /api/v1/system/status`
Ringkasan metrik sistem lokal (CPU, Memory, Storage snapshot, kamera terdaftar).
```json
{
  "cpu_usage_percent": 18.4,
  "memory_usage_percent": 42.1,
  "disk_free_gb": 128.5,
  "active_cameras": 2,
  "total_cameras": 2,
  "events_today": 34,
  "ai": {
    "enabled": true,
    "provider": "dattio",
    "model": "dattio-model",
    "degraded": false,
    "tool_mode": "auto"
  }
}
```
`ai.degraded=true` berarti AI berjalan tanpa provider nyata (mode offline/FakeProvider).

---

### 2.2 Cameras Management
#### `GET /api/v1/cameras`
Mendapatkan daftar semua kamera yang dikonfigurasi.
```json
[
  {
    "id": "cam_front_door",
    "name": "Front Door",
    "is_enabled": true,
    "status": "online", // "online" | "offline" | "connecting" | "error"
    "fps": 15.0,
    "last_seen_at": "2026-10-22T06:00:00Z",
    "stream_url_preview": "/api/v1/cameras/cam_front_door/stream",
    "snapshot_url": "/api/v1/cameras/cam_front_door/snapshot"
  }
]
```

#### `POST /api/v1/cameras`
Mendaftarkan kamera baru (RTSP URL hanya disimpan di backend, tidak pernah dipublikasikan mentah ke frontend).
```json
// Request Body:
{
  "id": "cam_backyard",
  "name": "Backyard",
  "rtsp_url": "rtsp://admin:pass@192.168.1.50:554/stream1",
  "motion_detection_enabled": true,
  "object_detection_enabled": true
}
```

#### `GET /api/v1/cameras/{id}/snapshot`
Mengembalikan frame JPEG terkini langsung dari worker memory.
- Response: `image/jpeg` binary data.

#### `GET /api/v1/cameras/{id}/stream`
Mengembalikan stream video MJPEG langsung untuk ditampilkan pada elemen `<img>` HTML.
- Response: `multipart/x-mixed-replace; boundary=frame`

---

### 2.3 Events
#### `GET /api/v1/events`
Query log event dengan filter.
- **Query Params**:
  - `camera_id` (optional, string)
  - `event_type` (optional: `motion` | `object_detected` | `camera_offline`)
  - `start_time` (optional, ISO8601 string)
  - `end_time` (optional, ISO8601 string)
  - `limit` (default: 50, max: 200)
  - `offset` (default: 0)

```json
{
  "total": 120,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "evt_98741",
      "camera_id": "cam_front_door",
      "camera_name": "Front Door",
      "event_type": "object_detected",
      "timestamp": "2026-10-22T05:58:12Z",
      "confidence": 0.89,
      "metadata": {
        "label": "person",
        "bbox": [120, 80, 240, 360],
        "motion_area_percent": 14.5
      },
      "snapshot_path": "/api/v1/events/evt_98741/snapshot",
      "is_mock": false
    }
  ]
}
```

#### `GET /api/v1/events/{id}/snapshot`
Mengunduh gambar snapshot statis yang disimpan saat event terpicu.
- Response: `image/jpeg`

---

### 2.4 Chat & AI Assistant
#### `POST /api/v1/chat/messages`
Kirim pesan teks ke JARVIS. Path alternatif yang setara: `POST /api/v1/chat`.

```json
// Request Body:
{
  "conversation_id": "conv_default",          // opsional; UUID dibuat server bila kosong
  "message": "Apakah ada orang di depan pintu dalam 15 menit terakhir?",  // maks 2000 karakter
  "client_message_id": "cm-1"                // opsional; idempotensi (ulang = jawaban yang sama)
}

// Response Body:
{
  "conversation_id": "conv_default",
  "message_id": "3f2c...-uuid",
  "reply": "Ya, pada pukul 05:58:12 terdeteksi 1 orang di kamera Front Door dengan tingkat keyakinan 89%.",
  "tools_executed": [
    {
      "name": "get_recent_events",            // nama kanonik tool
      "tool_name": "get_recent_events",        // alias field lama (kompatibilitas)
      "status": "ok",                         // ok | error | denied
      "duration_ms": 12,
      "parameters": {
        "camera_id": "cam_front_door",
        "event_type": "object_detected",
        "minutes_ago": 15
      },
      "result": [                             // data otoritatif, bukan narasi LLM
        { "id": "evt_1", "camera_name": "Front Door", "event_type": "object_detected" }
      ],
      "result_summary": "1 item",
      "error": null
    }
  ],
  "meta": {
    "provider": "dattio",                     // dattio | fake
    "model": "dattio-model",
    "latency_ms": 842,
    "rounds": 2,
    "tool_calls": 1,
    "stop_reason": "completed",               // completed | no_tool_grounding | max_rounds | idempotent_replay
    "degraded": false,
    "usage": {}
  },
  "created_at": "2026-10-22T06:00:05Z"
}
```

Catatan:
- `reply` adalah narasi LLM; `tools_executed[].result` adalah data faktual otoritatif.
  Frontend wajib menampilkan `result` agar pengguna dapat memeriksa klaim.
- Tool yang tersedia: `get_system_status`, `get_camera_list` (alias `list_cameras`),
  `get_recent_events`, `search_events`. Tool mutating/destructive tidak pernah
  dikirim ke LLM pada MVP.

#### `GET /api/v1/chat/history`
Mendapatkan riwayat percakapan.
- **Query Params**: `conversation_id`, `limit` (default: 30)
- Path alternatif yang setara: `GET /api/v1/chat/conversations/{conversation_id}/history`

#### `DELETE /api/v1/chat/conversations/{conversation_id}`
Mengarsipkan percakapan (soft-delete; data tidak dihapus permanen).
```json
{ "conversation_id": "conv_default", "archived": true }
```

#### Error envelope (seluruh endpoint AI)
```json
{
  "error": {
    "code": "AI_INVALID_REQUEST",
    "message": "Pesan terlalu panjang.",
    "details": { "max_chars": 2000 }
  }
}
```
Kode: `AI_DISABLED`, `AI_INVALID_REQUEST`, `AI_PROVIDER_ERROR`, `AI_RATE_LIMITED`,
`AI_TIMEOUT`, `AI_UNAVAILABLE`, `TOOL_NOT_ALLOWED`, `TOOL_DENIED`, `NOT_FOUND`, `INTERNAL_ERROR`.

---

### 2.5 Real-Time WebSocket
#### `WS /ws/events`
Koneksi WebSocket dua arah untuk update event real-time ke UI.
- Pesan masuk (dari server ke client):
```json
{
  "event": "NEW_EVENT",
  "data": {
    "id": "evt_98742",
    "camera_id": "cam_front_door",
    "camera_name": "Front Door",
    "event_type": "motion",
    "timestamp": "2026-10-22T06:01:00Z",
    "metadata": {
      "motion_area_percent": 8.2
    },
    "snapshot_url": "/api/v1/events/evt_98742/snapshot",
    "is_mock": false
  }
}
```
- Ping / Pong heartbeat setiap 30 detik untuk menjaga koneksi tetap aktif.
