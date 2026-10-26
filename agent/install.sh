#!/bin/bash
# Usage: curl -fsSL <server>/api/signage/agent/install.sh | sudo bash
# Idempotent: a second run updates package and services and keeps the pairing.
# Another server address (e.g. for testing): sudo STAGEDESK_SERVER=https://server bash install.sh
set -euo pipefail

PLACEHOLDER="__STAGEDESK_""SERVER__"
SERVER="${STAGEDESK_SERVER:-__STAGEDESK_SERVER__}"
OPT_DIR="/opt/stagedesk-agent"
CONFIG_DIR="/etc/stagedesk-agent"
STATE_DIR="/var/lib/stagedesk-agent"
UNIT_DIR="/etc/systemd/system"
LOCAL_URL="http://127.0.0.1:8765/"
work=""
PACKAGE_CHANGED=0
UNITS_CHANGED_AGENT=0
UNITS_CHANGED_KIOSK=0
PACKAGES=(python3-websocket cage cec-utils ddcutil wlr-randr grim iw curl ca-certificates)

cleanup() { [ -z "$work" ] || rm -rf "$work"; }
trap cleanup EXIT

say() { printf '%s\n' "$*"; }
die() { printf 'Fehler: %s\n' "$*" >&2; exit 1; }

check_system() {
  [ "$(id -u)" -eq 0 ] || die "Root-Rechte nötig (sudo)."
  [ -r /etc/os-release ] || die "/etc/os-release fehlt. Nur für Raspberry Pi OS Bookworm oder Trixie."
  local codename
  codename="$(. /etc/os-release && printf '%s' "${VERSION_CODENAME:-}")"
  case "$codename" in
    bookworm) ;;
    trixie) say "Hinweis: Trixie ist noch nicht auf echter Hardware geprüft. Bei Problemen mit Bookworm Lite (Legacy) neu aufsetzen." ;;
    *) die "Raspberry Pi OS Bookworm oder Trixie erwartet, gefunden: ${codename:-unbekannt}. Mit Bookworm Lite (Legacy) neu aufsetzen." ;;
  esac
  [ "$(id -u pi 2>/dev/null || true)" = "1000" ] || die "Der Benutzer pi mit der ID 1000 fehlt. Im Raspberry Pi Imager den Benutzer pi anlegen (der Kiosk-Dienst nutzt /home/pi und /run/user/1000)."
  case "$SERVER" in
    *"$PLACEHOLDER"*|"") die "Server-URL fehlt. Den Installationsbefehl vom Stagedesk-Server verwenden oder STAGEDESK_SERVER setzen." ;;
  esac
  SERVER="${SERVER%/}"
}

install_packages() {
  say "1/6 Pakete installieren"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update </dev/null
  # On Bookworm the package is chromium; chromium-browser only as a fallback for other sources.
  local browser=chromium
  apt-cache show chromium >/dev/null 2>&1 || browser=chromium-browser
  # Newer Debian releases ship xcursorgen as its own package instead of inside x11-apps.
  local cursorgen=x11-apps
  apt-cache show xcursorgen >/dev/null 2>&1 && cursorgen=xcursorgen
  apt-get install -y --no-install-recommends "${PACKAGES[@]}" "$browser" "$cursorgen" </dev/null
}

install_package() {
  say "2/6 Agent-Paket laden und prüfen"
  install -d -m 755 -o root -g root "$STATE_DIR"
  local info version sha256 actual current=""
  info="$(curl -fsS --max-time 30 "$SERVER/api/signage/agent/version")" || die "Server $SERVER nicht erreichbar."
  version="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])' 2>/dev/null)" || die "Ungültige Antwort von $SERVER/api/signage/agent/version."
  sha256="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha256"])' 2>/dev/null)" || die "Ungültige Antwort von $SERVER/api/signage/agent/version."
  [[ "$version" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]] || die "Der Server meldet keine gültige Agent-Version."
  [[ "$sha256" =~ ^[0-9a-f]{64}$ ]] || die "Der Server meldet keine gültige Prüfsumme."
  [ -r "$OPT_DIR/VERSION" ] && current="$(tr -d '[:space:]' < "$OPT_DIR/VERSION")"
  if [ "$current" = "$version" ] && [ -d "$OPT_DIR/stagedesk_agent" ]; then
    say "    Version $version ist schon installiert."
  else
    curl -fsS --max-time 300 -o "$work/agent.tar.gz" "$SERVER/api/signage/agent/stagedesk-agent-$version.tar.gz" || die "Das Agent-Paket $version ließ sich nicht laden."
    actual="$(sha256sum "$work/agent.tar.gz" | cut -d' ' -f1)"
    [ "$actual" = "$sha256" ] || die "Prüfsumme des Pakets stimmt nicht. Installation abgebrochen."
    mkdir "$work/new"
    tar -xzf "$work/agent.tar.gz" -C "$work/new" --no-same-owner
    [ -d "$work/new/stagedesk_agent" ] && [ -f "$work/new/VERSION" ] && [ -f "$work/new/kiosk/kiosk.sh" ] || die "Das Paket ist unvollständig."
    chown -R root:root "$work/new"
    find "$work/new" -type d -exec chmod 755 {} +
    find "$work/new" -type f -exec chmod 644 {} +
    chmod 755 "$work/new/kiosk/kiosk.sh"
    rm -rf "$OPT_DIR.install"
    mv "$work/new" "$OPT_DIR.install"
    rm -rf "$OPT_DIR.prev"
    [ -d "$OPT_DIR" ] && mv "$OPT_DIR" "$OPT_DIR.prev"
    mv "$OPT_DIR.install" "$OPT_DIR"
    rm -rf "$OPT_DIR.prev"
    PACKAGE_CHANGED=1
    # A manual install replaces a half-finished self-update: drop the rollback state.
    systemctl disable --now stagedesk-agent-rollback.timer >/dev/null 2>&1 || true
    rm -f "$STATE_DIR/pending-confirm" "$STATE_DIR/failed-version"
    rm -rf "$OPT_DIR.new"
    say "    Version $version installiert."
  fi
}

write_config() {
  say "3/6 Konfiguration und Dienste anlegen"
  install -d -m 700 -o root -g root "$CONFIG_DIR"
  install -d -m 755 -o root -g root "$STATE_DIR"
  # config.json: only set the server address, an existing pairing is kept.
  STAGEDESK_CONFIG="$CONFIG_DIR/config.json" STAGEDESK_SERVER_URL="$SERVER" python3 - <<'PY'
import json, os
path, server = os.environ["STAGEDESK_CONFIG"], os.environ["STAGEDESK_SERVER_URL"]
try:
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        data = {}
except (OSError, ValueError):
    data = {}
data["server"] = server
fd = os.open(path + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
os.chmod(path + ".tmp", 0o600)
os.replace(path + ".tmp", path)
PY
  if [ ! -f "$CONFIG_DIR/kiosk.env" ]; then
    (umask 077; printf 'KIOSK_URL=%s\n' "$LOCAL_URL" > "$CONFIG_DIR/kiosk.env")
  fi
  chmod 600 "$CONFIG_DIR/kiosk.env"
  if ! cmp -s "$OPT_DIR/systemd/stagedesk-agent.service" "$UNIT_DIR/stagedesk-agent.service"; then
    install -m 644 "$OPT_DIR/systemd/stagedesk-agent.service" "$UNIT_DIR/stagedesk-agent.service"
    UNITS_CHANGED_AGENT=1
  fi
  if ! cmp -s "$OPT_DIR/systemd/stagedesk-kiosk.service" "$UNIT_DIR/stagedesk-kiosk.service"; then
    install -m 644 "$OPT_DIR/systemd/stagedesk-kiosk.service" "$UNIT_DIR/stagedesk-kiosk.service"
    UNITS_CHANGED_KIOSK=1
  fi
}

prepare_kiosk_user() {
  say "4/6 Kiosk-Benutzer vorbereiten"
  usermod -aG video,render,input,tty pi
  systemctl mask getty@tty1.service
  # The screen must never blank (consoleblank=0); cmdline.txt must stay a single line.
  local cmdline=/boot/firmware/cmdline.txt
  if [ -f "$cmdline" ] && ! grep -q 'consoleblank=0' "$cmdline"; then
    sed -i '1 s/[[:space:]]*$/ consoleblank=0/' "$cmdline"
  fi
  local home icons
  home="$(getent passwd pi | cut -d: -f6)"
  icons="$home/.icons"
  if [ ! -e "$icons/default/cursors/left_ptr" ] || [ ! -e "$icons/blank/cursors/left_ptr" ]; then
    local name
    command -v xcursorgen >/dev/null 2>&1 || die "xcursorgen fehlt. Paket xcursorgen bzw. x11-apps installieren und das Skript erneut starten."
    local tmp="$work/cursor"
    mkdir -p "$tmp"
    echo "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAE0lEQVR4nGNgGAWjYBSMAgYwAAAEEAABsax5zAAAAABJRU5ErkJggg==" | base64 -d > "$tmp/blank.png"
    echo "16 0 0 $tmp/blank.png" > "$tmp/blank.cursor"
    mkdir -p "$icons/blank/cursors" "$icons/default/cursors"
    xcursorgen "$tmp/blank.cursor" "$icons/blank/cursors/left_ptr"
    printf '[Icon Theme]\nName=blank\n' > "$icons/blank/index.theme"
    cp "$icons/blank/cursors/left_ptr" "$icons/default/cursors/left_ptr"
    printf '[Icon Theme]\nName=default\n' > "$icons/default/index.theme"
    for name in default arrow top_left_arrow left_ptr_watch watch hand1 hand2 hand pointer pointing_hand \
                xterm text ibeam crosshair cross fleur move all-scroll grabbing closedhand openhand \
                col-resize row-resize sb_h_double_arrow sb_v_double_arrow question_arrow help; do
      ln -sf left_ptr "$icons/default/cursors/$name"
    done
    chown -R "pi:pi" "$icons"
  fi
}

disable_old_setup() {
  say "5/6 Alte Dienste abschalten (Dateien bleiben liegen)"
  local unit
  for unit in stagedesk-power.service kiosk.service; do
    if systemctl cat "$unit" >/dev/null 2>&1; then
      systemctl disable --now "$unit" || true
      say "    $unit abgeschaltet."
    fi
  done
  if systemctl cat stagedesk-reboot.timer >/dev/null 2>&1; then
    systemctl disable --now stagedesk-reboot.timer || true
    say "    stagedesk-reboot.timer abgeschaltet."
  fi
  # The old 04:00 reboot (cron.d or root crontab). The agent schedules the daily reboot now.
  if [ -f /etc/cron.d/stagedesk-reboot ]; then
    mv /etc/cron.d/stagedesk-reboot /etc/cron.d/stagedesk-reboot.disabled
    say "    /etc/cron.d/stagedesk-reboot abgeschaltet."
  fi
  local cron_file="$work/crontab"
  if crontab -l > "$cron_file" 2>/dev/null; then
    if grep -Eq '^[^#].*(shutdown -r now|netwatch\.sh)' "$cron_file"; then
      cp "$cron_file" "$STATE_DIR/root-crontab.backup"
      sed -E 's@^([^#].*(shutdown -r now|netwatch\.sh).*)$@# abgeschaltet vom Stagedesk-Agent: \1@' "$cron_file" | crontab -
      say "    Alte Crontab-Einträge auskommentiert (Sicherung: $STATE_DIR/root-crontab.backup)."
    fi
  fi
}

start_services() {
  say "6/6 Agent und Kiosk starten"
  systemctl daemon-reload
  systemctl enable --now stagedesk-agent.service stagedesk-kiosk.service
  # On the first run enable --now starts both services; on a rerun restart only on changes.
  if [ "$PACKAGE_CHANGED" = "1" ] || [ "$UNITS_CHANGED_AGENT" = "1" ]; then
    systemctl restart stagedesk-agent.service
  fi
  if [ "$UNITS_CHANGED_KIOSK" = "1" ]; then
    systemctl restart stagedesk-kiosk.service
  fi
}

main() {
  work="$(mktemp -d)"
  check_system
  install_packages
  install_package
  write_config
  prepare_kiosk_user
  disable_old_setup
  start_services
  if python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("token") else 1)' "$CONFIG_DIR/config.json" 2>/dev/null; then
    say "Fertig. Der Agent läuft mit der bestehenden Kopplung."
  else
    say "Fertig. Der Bildschirm zeigt jetzt einen Kopplungscode."
  fi
  say "Hinweis: Die Einstellung gegen das Abdunkeln des Bildschirms (consoleblank=0) gilt erst nach dem nächsten Neustart."
}

main "$@"
