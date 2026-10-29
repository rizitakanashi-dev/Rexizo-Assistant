#!/usr/bin/env bash
# ==============================================================================
# Installer Desktop Entry Rexizo Assistant untuk Arch Linux
# Mendaftarkan Rexizo ke menu aplikasi sistem (rofi, wofi, KDE Kickoff, GNOME, dll.)
# ==============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS_DIR="$HOME/.local/share/applications"
ICONS_DIR="$HOME/.local/share/icons"
HICOLOR_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"

mkdir -p "$APPS_DIR" "$ICONS_DIR" "$HICOLOR_DIR"

# 1. Pastikan script launcher memiliki permission executable
chmod +x "$PROJECT_DIR/scripts/launch-rexizo.sh"
chmod +x "$PROJECT_DIR/scripts/rexizo.sh"

# 2. Pasang Icon ke direktori XDG Icons standar
cp -f "$PROJECT_DIR/assets/rexizo-icon.png" "$ICONS_DIR/rexizo.png"
cp -f "$PROJECT_DIR/assets/rexizo-icon.svg" "$ICONS_DIR/rexizo.svg"
cp -f "$PROJECT_DIR/assets/rexizo-icon.png" "$HICOLOR_DIR/rexizo.png"

# 3. Buat Desktop Entry File di repository dan di ~/.local/share/applications/
DESKTOP_FILE="$APPS_DIR/rexizo.desktop"

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Type=Application
Name=Rexizo Assistant
GenericName=AI Assistant & Smart CCTV
Comment=Asisten AI Multimodal Tachibana Nozomi & Smart CCTV Surveillance
Exec="$PROJECT_DIR/scripts/launch-rexizo.sh"
Icon=rexizo
Terminal=false
Categories=Utility;AudioVideo;
StartupNotify=true
Keywords=rexizo;assistant;cctv;surveillance;nozomi;jarvis;ai;
Actions=Stop;Restart;Status;

[Desktop Action Stop]
Name=Hentikan Layanan Rexizo
Exec="$PROJECT_DIR/scripts/rexizo.sh" stop

[Desktop Action Restart]
Name=Restart Layanan Rexizo
Exec="$PROJECT_DIR/scripts/rexizo.sh" restart

[Desktop Action Status]
Name=Periksa Status Rexizo
Exec="$PROJECT_DIR/scripts/rexizo.sh" status
EOF

chmod +x "$DESKTOP_FILE"
cp -f "$DESKTOP_FILE" "$PROJECT_DIR/rexizo.desktop"

# 4. Refresh Desktop Database jika perintah tersedia
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi

echo "=========================================================="
echo "✅ Rexizo Assistant berhasil didaftarkan ke App Manager!"
echo "   Desktop file: $DESKTOP_FILE"
echo "   Icon path   : $ICONS_DIR/rexizo.png"
echo "   Launcher    : $PROJECT_DIR/scripts/launch-rexizo.sh"
echo "=========================================================="

if command -v notify-send >/dev/null 2>&1; then
    notify-send -u normal -a "Rexizo Installer" -i "$PROJECT_DIR/assets/rexizo-icon.png" \
        "Rexizo Terpasang di App Manager 🎉" \
        "Buka rofi, wofi, atau menu aplikasi Arch Linux untuk membuka Rexizo." || true
fi
