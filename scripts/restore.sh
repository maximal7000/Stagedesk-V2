#!/usr/bin/env bash
# Restore eines Stagedesk-Backups.
#   sudo bash /opt/stagedesk/scripts/restore.sh <db-dump> [media-tarball]
#
# - Postgres-DB wird DROP+CREATE+pg_restore: Vorhandene Daten gehen verloren.
# - Media-Tarball wird in den aktuellen Media-Ordner extrahiert (vorher Backup-Kopie).
set -euo pipefail

APP_DIR="/opt/stagedesk"
ENV_FILE="$APP_DIR/backend/.env"
MEDIA_DIR="$APP_DIR/backend/media"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <db-dump> [media-tarball]" >&2
    exit 1
fi
DB_DUMP="$1"
MEDIA_TAR="${2:-}"

if [ ! -f "$DB_DUMP" ]; then
    echo "FEHLER: DB-Dump $DB_DUMP nicht gefunden" >&2
    exit 1
fi

# shellcheck disable=SC2046
export $(grep -E '^(DB_NAME|DB_USER|DB_PASSWORD|DB_HOST|DB_PORT)=' "$ENV_FILE" | xargs)

read -r -p "ACHTUNG: DB '$DB_NAME' wird komplett ersetzt. Fortfahren? (yes/N) " ANSWER
[ "$ANSWER" = "yes" ] || { echo "Abgebrochen."; exit 1; }

echo "→ tag-backend.service stoppen"
systemctl stop tag-backend.service || true

echo "→ DB neu anlegen + restore"
PGPASSWORD="$DB_PASSWORD" psql \
    --host="${DB_HOST:-127.0.0.1}" --port="${DB_PORT:-5432}" \
    --username="$DB_USER" --dbname=postgres \
    -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" \
    -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"

PGPASSWORD="$DB_PASSWORD" pg_restore \
    --host="${DB_HOST:-127.0.0.1}" --port="${DB_PORT:-5432}" \
    --username="$DB_USER" --dbname="$DB_NAME" \
    --no-owner --no-privileges \
    "$DB_DUMP"

if [ -n "$MEDIA_TAR" ]; then
    if [ ! -f "$MEDIA_TAR" ]; then
        echo "FEHLER: Media-Tarball $MEDIA_TAR nicht gefunden" >&2
        exit 1
    fi
    if [ -d "$MEDIA_DIR" ]; then
        BAK="$MEDIA_DIR.bak.$(date +%Y%m%d_%H%M%S)"
        echo "→ aktuellen Media-Ordner sichern nach $BAK"
        mv "$MEDIA_DIR" "$BAK"
    fi
    echo "→ Media-Tarball entpacken"
    mkdir -p "$(dirname "$MEDIA_DIR")"
    tar --use-compress-program='zstd -d' \
        -xf "$MEDIA_TAR" \
        -C "$(dirname "$MEDIA_DIR")"
fi

echo "→ tag-backend.service starten"
systemctl start tag-backend.service

echo "✓ Restore fertig"
