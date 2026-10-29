#!/usr/bin/env bash
# ==============================================================================
# Rexizo Service Management CLI
# Penggunaan:
#   ./scripts/rexizo.sh start    -> Jalankan backend & frontend, buka browser
#   ./scripts/rexizo.sh stop     -> Hentikan semua proses Rexizo
#   ./scripts/rexizo.sh restart  -> Restart backend & frontend
#   ./scripts/rexizo.sh status   -> Cek status port & service
#   ./scripts/rexizo.sh logs     -> Lihat log langsung
# ==============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

ACTION="${1:-status}"

status_backend() {
    if curl -s -f --max-time 1 "http://127.0.0.1:8000/api/v1/health" >/dev/null 2>&1; then
        echo "🟢 Backend API : RUNNING (port 8000)"
        return 0
    else
        echo "🔴 Backend API : STOPPED (port 8000)"
        return 1
    fi
}

status_frontend() {
    if curl -s -I --max-time 1 "http://localhost:5173" >/dev/null 2>&1; then
        echo "🟢 Frontend    : RUNNING (port 5173)"
        return 0
    else
        echo "🔴 Frontend    : STOPPED (port 5173)"
        return 1
    fi
}

stop_services() {
    echo "Menghentikan layanan Rexizo..."
    fuser -k 8000/tcp >/dev/null 2>&1 || true
    fuser -k 5173/tcp >/dev/null 2>&1 || true
    sleep 1
    echo "✓ Semua layanan Rexizo telah dihentikan."
    if command -v notify-send >/dev/null 2>&1; then
        notify-send -u low -a "Rexizo Assistant" "Rexizo Dihentikan" "Layanan backend dan frontend telah nonaktif." || true
    fi
}

case "$ACTION" in
    start)
        exec "$PROJECT_DIR/scripts/launch-rexizo.sh"
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        sleep 1
        exec "$PROJECT_DIR/scripts/launch-rexizo.sh"
        ;;
    status)
        echo "=== Status Rexizo Assistant ==="
        status_backend || true
        status_frontend || true
        ;;
    logs)
        tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
        ;;
    *)
        echo "Penggunaan: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
