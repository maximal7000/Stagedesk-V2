#!/usr/bin/env bash
# Tägliches lokales Backup von Stagedesk V2:
#   - Postgres-Dump (pg_dump --format=custom)
#   - Media-Tarball (komprimiert)
# Rotation: 7 daily + 4 weekly (Sonntags) automatisch.
#
# Aufruf manuell: sudo bash /opt/stagedesk/scripts/backup.sh
# Per systemd-Timer: stagedesk-backup.timer -> stagedesk-backup.service
set -euo pipefail

APP_DIR="/opt/stagedesk"
BACKUP_DIR="/var/backups/stagedesk"
ENV_FILE="$APP_DIR/backend/.env"
MEDIA_DIR="$APP_DIR/backend/media"
DAILY_KEEP=7
WEEKLY_KEEP=4

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

# DB-Credentials aus backend/.env lesen (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT)
if [ ! -f "$ENV_FILE" ]; then
    echo "FEHLER: $ENV_FILE fehlt" >&2
    exit 1
fi
# shellcheck disable=SC2046
export $(grep -E '^(DB_ENGINE|DB_NAME|DB_USER|DB_PASSWORD|DB_HOST|DB_PORT)=' "$ENV_FILE" | xargs)

DB_ENGINE="${DB_ENGINE:-postgres}"
if [ "$DB_ENGINE" != "postgres" ]; then
    echo "FEHLER: backup.sh unterstützt nur DB_ENGINE=postgres (aktuell: $DB_ENGINE)" >&2
    exit 1
fi

TS=$(date +%Y-%m-%d_%H%M)
DOW=$(date +%u)  # 1=Mo … 7=So

DB_FILE="$BACKUP_DIR/daily/db-$TS.dump"
MEDIA_FILE="$BACKUP_DIR/daily/media-$TS.tar.zst"

echo "→ Postgres-Dump: $DB_FILE"
PGPASSWORD="$DB_PASSWORD" pg_dump \
    --host="${DB_HOST:-127.0.0.1}" \
    --port="${DB_PORT:-5432}" \
    --username="$DB_USER" \
    --format=custom \
    --no-owner --no-privileges \
    --file="$DB_FILE" \
    "$DB_NAME"

echo "→ Media-Tarball: $MEDIA_FILE"
if [ -d "$MEDIA_DIR" ]; then
    tar --use-compress-program='zstd -T0 -19' \
        -cf "$MEDIA_FILE" \
        -C "$(dirname "$MEDIA_DIR")" \
        "$(basename "$MEDIA_DIR")"
else
    echo "  (kein Media-Ordner — überspringe)"
fi

# Sonntags zusätzlich Hardlink ins weekly-Verzeichnis (kein doppelter Speicherbedarf)
if [ "$DOW" = "7" ]; then
    echo "→ Wochen-Snapshot (Sonntag)"
    ln -f "$DB_FILE" "$BACKUP_DIR/weekly/db-$TS.dump"
    [ -f "$MEDIA_FILE" ] && ln -f "$MEDIA_FILE" "$BACKUP_DIR/weekly/media-$TS.tar.zst" || true
fi

# Rotation: ältere Daily/Weekly-Dateien löschen
prune() {
    local dir="$1" keep="$2" pattern="$3"
    # shellcheck disable=SC2012
    ls -1t "$dir"/$pattern 2>/dev/null | tail -n +$((keep + 1)) | xargs -r rm -v
}
echo "→ Rotation"
prune "$BACKUP_DIR/daily"  "$DAILY_KEEP"  "db-*.dump"
prune "$BACKUP_DIR/daily"  "$DAILY_KEEP"  "media-*.tar.zst"
prune "$BACKUP_DIR/weekly" "$WEEKLY_KEEP" "db-*.dump"
prune "$BACKUP_DIR/weekly" "$WEEKLY_KEEP" "media-*.tar.zst"

# Permissions absichern: nur root darf lesen
chmod 700 "$BACKUP_DIR" "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 600 "$BACKUP_DIR"/daily/* "$BACKUP_DIR"/weekly/* 2>/dev/null || true

echo "✓ Backup fertig: $(du -sh "$BACKUP_DIR" | cut -f1) belegt"
