#!/usr/bin/env bash
# Update-Script für Stagedesk V2 auf dem Server.
# Aufruf: sudo bash /opt/stagedesk/scripts/deploy.sh
set -euo pipefail

APP_DIR="/opt/stagedesk"
SERVICE="tag-backend.service"
VENV="$APP_DIR/backend/venv"

cd "$APP_DIR"

echo "→ git pull"
git pull --ff-only

echo "→ venv/pip"
if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r backend/requirements.txt

echo "→ frontend build"
cd "$APP_DIR/frontend"
if [ ! -f .env.production ]; then
    echo "  (erstelle .env.production aus .env.production.example)"
    cp .env.production.example .env.production
fi
npm ci --silent
npm run build --silent

echo "→ collectstatic"
cd "$APP_DIR/backend"
"$VENV/bin/python" manage.py collectstatic --noinput

# Nach der Umbenennung läuft das alte Backend gegen umbenannte Tabellen:
# Bau und collectstatic liegen deshalb davor, der Neustart direkt danach.
echo "→ migrate"
cd "$APP_DIR/backend"
"$VENV/bin/python" manage.py signage_rename_from_monitor
"$VENV/bin/python" manage.py migrate --noinput

echo "→ systemctl restart $SERVICE"
systemctl restart "$SERVICE"

UNIT_SRC="$APP_DIR/scripts/stagedesk-device-watch.service"
UNIT_DST="/etc/systemd/system/stagedesk-device-watch.service"
if [ -f "$UNIT_DST" ]; then
    echo "→ stagedesk-device-watch.service aktualisieren"
    cp "$UNIT_SRC" "$UNIT_DST"
    systemctl daemon-reload
fi

systemctl reload nginx

echo "✓ Deploy fertig"
