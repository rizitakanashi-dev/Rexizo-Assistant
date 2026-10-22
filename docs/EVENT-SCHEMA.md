# JARVIS — Event Schema Specification

## 1. Definisi & Perbedaan Kategori Event

Sistem membedakan secara tegas antara **Motion Detection** dan **Object Detection**:
1. **Motion Detection (`motion`)**:
   - Dihitung menggunakan algoritma pembanding frame (*frame differencing* atau *MOG2 background subtraction*).
   - Menunjukkan adanya perubahan piksel melebihi ambang batas (*threshold area percent*).
   - *Tidak mengidentifikasi* jenis objek (apakah orang, kucing, atau daun bergoyang).
2. **Object Detection (`object_detected`)**:
   - Dihitung oleh model Computer Vision (YOLOv8n / MobileNet) yang dijalankan pada frame di mana motion terdeteksi.
   - Menghasilkan label objek (`person`, `car`, `dog`, dll.), nilai *confidence score* (0.0 - 1.0), dan *bounding box* koordinat `[x1, y1, x2, y2]`.
3. **Camera Status (`camera_status`)**:
   - Event status siklus hidup kamera (`connected`, `disconnected`, `reconnecting`, `fps_dropped`).

---

## 2. Event Payload Schema (JSON / Pydantic Model)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JarvisSurveillanceEvent",
  "type": "object",
  "required": [
    "id",
    "camera_id",
    "event_type",
    "timestamp",
    "metadata"
  ],
  "properties": {
    "id": {
      "type": "string",
      "description": "Identifier unik event, format: evt_<timestamp_ms>_<random>"
    },
    "camera_id": {
      "type": "string",
      "description": "ID unik kamera yang memicu event"
    },
    "camera_name": {
      "type": "string",
      "description": "Nama manusiawi kamera untuk kemudahan display UI"
    },
    "event_type": {
      "type": "string",
      "enum": ["motion", "object_detected", "camera_status"]
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "Waktu UTC event tercatat, format ISO 8601 (e.g. 2026-10-22T06:00:00.000Z)"
    },
    "confidence": {
      "type": ["number", "null"],
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Tingkat kepastian deteksi (wajib terisi untuk object_detected, null untuk motion/status)"
    },
    "snapshot_path": {
      "type": ["string", "null"],
      "description": "Path relatif penyimpanan file gambar frame JPEG di disk lokal"
    },
    "is_mock": {
      "type": "boolean",
      "default": false,
      "description": "Flag apakah event berasal dari synthetic/mock generator untuk keperluan testing"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "label": {
          "type": "string",
          "description": "Label objek seperti person, car, bicycle"
        },
        "bbox": {
          "type": "array",
          "items": { "type": "integer" },
          "minItems": 4,
          "maxItems": 4,
          "description": "Koordinat piksel [x_min, y_min, x_max, y_max]"
        },
        "motion_area_percent": {
          "type": "number",
          "description": "Persentase luas area pergerakan terhadap total frame"
        },
        "reason": {
          "type": "string",
          "description": "Deskripsi alasan untuk event camera_status (e.g. RTSP timeout)"
        }
      }
    }
  }
}
```

---

## 3. SQLite Database Schema (Tabel `surveillance_events`)

```sql
CREATE TABLE IF NOT EXISTS surveillance_events (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    camera_name TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'motion' | 'object_detected' | 'camera_status'
    timestamp DATETIME NOT NULL,
    confidence REAL,
    snapshot_path TEXT,
    metadata_json TEXT, -- Serialized JSON metadata
    is_mock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_camera_time 
ON surveillance_events (camera_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_type_time 
ON surveillance_events (event_type, timestamp DESC);
```
