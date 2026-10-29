#!/usr/bin/env bash
# ==============================================================================
# Rexizo Assistant - Application Launcher Script for Arch Linux
# Meluncurkan backend FastAPI & frontend Vite di latar belakang,
# lalu membuka antarmuka Rexizo di web browser default.
# ==============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

BACKEND_URL="http://127.0.0.1:8000/api/v1/health"
FRONTEND_URL="http://localhost:5173"
TARGET_URL="http://localhost:5173/chat"
ICON_PATH="$PROJECT_DIR/assets/rexizo-icon.png"

notify() {
    local title="$1"
    local message="$2"
    local urgency="${3:-normal}"
    if command -v notify-send >/dev/null 2>&1; then
        notify-send -u "$urgency" -a "Rexizo Assistant" -i "$ICON_PATH" "$title" "$message" || true
    fi
}

echo "=== Memeriksa status Rexizo Assistant ==="

# 1. Periksa & jalankan Backend (FastAPI / Uvicorn) jika belum aktif
if curl -s -f --max-time 1 "$BACKEND_URL" >/dev/null 2>&1; then
    echo "✓ Backend API sudah aktif (port 8000)"
else
    echo "▶ Memulai Backend API..."
    if [ ! -f "$PROJECT_DIR/.venv/bin/uvicorn" ]; then
        notify "Gagal Membuka Rexizo" "Python virtual environment (.venv) tidak ditemukan." "critical"
        echo "Error: .venv/bin/uvicorn tidak ditemukan di $PROJECT_DIR"
        exit 1
    fi

    # Bersihkan port 8000 jika ada proses zombie yang menggantung
    fuser -k 8000/tcp >/dev/null 2>&1 || true
    sleep 0.5

    nohup "$PROJECT_DIR/.venv/bin/uvicorn" jarvis_api.main:app \
        --host 127.0.0.1 \
        --port 8000 \
        >> "$LOG_DIR/backend.log" 2>&1 &

    echo $! > "$LOG_DIR/backend.pid"
fi

# 2. Periksa & jalankan Frontend (Vite) jika belum aktif
if curl -s -I --max-time 1 "$FRONTEND_URL" >/dev/null 2>&1; then
    echo "✓ Frontend web sudah aktif (port 5173)"
else
    echo "▶ Memulai Frontend Web Server..."
    # Bersihkan port 5173 jika ada proses zombie
    fuser -k 5173/tcp >/dev/null 2>&1 || true
    sleep 0.5

    (
        cd "$PROJECT_DIR/apps/web"
        nohup npm run dev >> "$LOG_DIR/frontend.log" 2>&1 &
        echo $! > "$LOG_DIR/frontend.pid"
    )
fi

# 3. Tunggu hingga kedua layanan siap merespons (maksimal 12 detik)
echo "Menunggu layanan siap..."
READY=0
for i in $(seq 1 24); do
    if curl -s -f "$BACKEND_URL" >/dev/null 2>&1 && curl -s -I "$FRONTEND_URL" >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 0.5
done

if [ "$READY" -eq 1 ]; then
    echo "✓ Semua subsistem Rexizo online!"
    notify "Rexizo Assistant Aktif 🌸" "Membuka antarmuka Asisten AI dan CCTV di browser..." "normal"
    
    # Buka browser default
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$TARGET_URL" >/dev/null 2>&1 &
    elif command -v sensible-browser >/dev/null 2>&1; then
        sensible-browser "$TARGET_URL" >/dev/null 2>&1 &
    else
        echo "Silakan buka tautan berikut di browser: $TARGET_URL"
    fi
else
    echo "⚠️ Layanan membutuhkan waktu lebih lama untuk memulai."
    notify "Rexizo Sedang Memulai..." "Layanan sedang proses start, membuka browser..." "normal"
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$TARGET_URL" >/dev/null 2>&1 &
    fi
fi

exit 0
