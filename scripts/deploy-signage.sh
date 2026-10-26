#!/usr/bin/env bash
# Update script for the parallel Signage installation on signage.t410.de.
# Call: sudo bash /opt/signage/scripts/deploy-signage.sh
#
# This is a second, independent instance of the same codebase (own database,
# venv, .env, systemd service, socket and nginx block). It never touches the
# primary installation in /opt/stagedesk.
set -euo pipefail

APP_DIR="/opt/signage"
SERVICE="signage-backend.service"
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
npm ci --silent
npm run build --silent

echo "→ collectstatic"
cd "$APP_DIR/backend"
"$VENV/bin/python" manage.py collectstatic --noinput

echo "→ migrate"
# Fresh Signage schema: no monitor_* tables exist here, so (unlike the primary
# deploy.sh) signage_rename_from_monitor is intentionally NOT run.
"$VENV/bin/python" manage.py migrate --noinput

echo "→ systemctl restart $SERVICE"
systemctl restart "$SERVICE"

systemctl reload nginx

echo "✓ Signage deploy done"
