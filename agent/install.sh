#!/bin/bash
# Stagedesk Geräte-Agent: Installation auf einem Raspberry Pi (Bookworm).
# Aufruf: curl -fsSL <Server>/api/monitor/agent/install.sh | sudo bash
# Idempotent: ein zweiter Lauf aktualisiert Paket und Dienste und behält die Kopplung.
set -euo pipefail

PLACEHOLDER="__STAGEDESK_""SERVER__"
SERVER="${STAGEDESK_SERVER:-__STAGEDESK_SERVER__}"
KIOSK_USER="pi"
OPT_DIR="/opt/stagedesk-agent"
CONFIG_DIR="/etc/stagedesk-agent"
STATE_DIR="/var/lib/stagedesk-agent"
UNIT_DIR="/etc/systemd/system"
LOCAL_URL="http://127.0.0.1:8765/"
work=""
PACKAGE_CHANGED=0
PACKAGES=(python3-websocket cage chromium-browser cec-utils ddcutil wlr-randr grim iw curl ca-certificates x11-apps)

cleanup() { [ -z "$work" ] || rm -rf "$work"; }
trap cleanup EXIT

say() { printf '%s\n' "$*"; }
die() { printf 'Fehler: %s\n' "$*" >&2; exit 1; }

check_system() {
  [ "$(id -u)" -eq 0 ] || die "Das Skript braucht root. Mit sudo bash ausführen."
  [ -r /etc/os-release ] || die "/etc/os-release fehlt. Das Skript läuft nur auf Raspberry Pi OS Bookworm."
  local codename
  codename="$(. /etc/os-release && printf '%s' "${VERSION_CODENAME:-}")"
  [ "$codename" = "bookworm" ] || die "Raspberry Pi OS Bookworm erwartet, gefunden: ${codename:-unbekannt}. Mit Bookworm Lite neu aufsetzen."
  id "$KIOSK_USER" >/dev/null 2>&1 || die "Der Benutzer $KIOSK_USER fehlt. Im Raspberry Pi Imager den Benutzer pi anlegen."
  case "$SERVER" in
    *"$PLACEHOLDER"*|"") die "Server-URL fehlt. Den Installationsbefehl vom Stagedesk-Server verwenden oder STAGEDESK_SERVER setzen." ;;
  esac
  SERVER="${SERVER%/}"
}

install_packages() {
  say "1/6 Pakete installieren"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update </dev/null
  apt-get install -y --no-install-recommends "${PACKAGES[@]}" </dev/null
}

install_package() {
  say "2/6 Agent-Paket laden und prüfen"
  install -d -m 755 -o root -g root "$STATE_DIR"
  local info version sha256 actual current=""
  work="$(mktemp -d)"
  info="$(curl -fsS --max-time 30 "$SERVER/api/monitor/agent/version")" || die "Der Server $SERVER ist nicht erreichbar. Netzwerk und Adresse prüfen."
  version="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')"
  sha256="$(printf '%s' "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha256"])')"
  [[ "$version" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]] || die "Der Server meldet keine gültige Agent-Version."
  [[ "$sha256" =~ ^[0-9a-f]{64}$ ]] || die "Der Server meldet keine gültige Prüfsumme."
  [ -r "$OPT_DIR/VERSION" ] && current="$(tr -d '[:space:]' < "$OPT_DIR/VERSION")"
  if [ "$current" = "$version" ] && [ -d "$OPT_DIR/stagedesk_agent" ]; then
    say "    Version $version ist schon installiert."
  else
    curl -fsS --max-time 300 -o "$work/agent.tar.gz" "$SERVER/api/monitor/agent/stagedesk-agent-$version.tar.gz" || die "Das Agent-Paket $version ließ sich nicht laden."
    actual="$(sha256sum "$work/agent.tar.gz" | cut -d' ' -f1)"
    [ "$actual" = "$sha256" ] || die "Die Prüfsumme des Pakets stimmt nicht. Installation abgebrochen, bitte später erneut versuchen."
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
    # Eine manuelle Installation ersetzt ein halb fertiges Selbst-Update: Rückfall-Zustand verwerfen.
    systemctl disable --now stagedesk-agent-rollback.timer >/dev/null 2>&1 || true
    rm -f "$STATE_DIR/pending-confirm" "$STATE_DIR/failed-version"
    rm -rf "$OPT_DIR.new"
    say "    Version $version installiert."
  fi
  PACKAGE_VERSION="$version"
}

write_config() {
  say "3/6 Konfiguration und Dienste anlegen"
  install -d -m 700 -o root -g root "$CONFIG_DIR"
  install -d -m 755 -o root -g root "$STATE_DIR"
  # config.json: nur die Server-Adresse setzen, eine bestehende Kopplung bleibt erhalten.
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
  install -m 644 "$OPT_DIR/systemd/stagedesk-agent.service" "$UNIT_DIR/stagedesk-agent.service"
  install -m 644 "$OPT_DIR/systemd/stagedesk-kiosk.service" "$UNIT_DIR/stagedesk-kiosk.service"
}

prepare_kiosk_user() {
  say "4/6 Kiosk-Benutzer vorbereiten"
  usermod -aG video,render,input,tty "$KIOSK_USER"
  systemctl mask getty@tty1.service
  # Der Bildschirm soll nie dunkel werden (consoleblank=0), die Zeile in cmdline.txt bleibt eine Zeile.
  local cmdline=/boot/firmware/cmdline.txt
  if [ -f "$cmdline" ] && ! grep -q 'consoleblank=0' "$cmdline"; then
    sed -i '1 s/[[:space:]]*$/ consoleblank=0/' "$cmdline"
  fi
  # Unsichtbarer Mauszeiger für cage (Doku: Mauszeiger ausblenden).
  local home icons
  home="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
  icons="$home/.icons"
  if [ ! -e "$icons/default/cursors/left_ptr" ] || [ ! -e "$icons/blank/cursors/left_ptr" ]; then
    local tmp name
    command -v xcursorgen >/dev/null 2>&1 || die "xcursorgen fehlt. Paket x11-apps installieren und das Skript erneut starten."
    tmp="$(mktemp -d)"
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
    chown -R "$KIOSK_USER:$KIOSK_USER" "$icons"
    rm -rf "$tmp"
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
  # Der alte 04:00-Neustart (cron.d oder root-Crontab). Den täglichen Neustart plant jetzt der Agent.
  if [ -f /etc/cron.d/stagedesk-reboot ]; then
    mv /etc/cron.d/stagedesk-reboot /etc/cron.d/stagedesk-reboot.disabled
    say "    /etc/cron.d/stagedesk-reboot abgeschaltet."
  fi
  local cron_file
  cron_file="$(mktemp)"
  if crontab -l > "$cron_file" 2>/dev/null; then
    if grep -Eq '^[^#].*(shutdown -r now|netwatch\.sh)' "$cron_file"; then
      cp "$cron_file" "$STATE_DIR/root-crontab.backup"
      sed -E 's@^([^#].*(shutdown -r now|netwatch\.sh).*)$@# abgeschaltet vom Stagedesk-Agent: \1@' "$cron_file" | crontab -
      say "    Alte Crontab-Einträge auskommentiert (Sicherung: $STATE_DIR/root-crontab.backup)."
    fi
  fi
  rm -f "$cron_file"
}

start_services() {
  say "6/6 Agent und Kiosk starten"
  systemctl daemon-reload
  systemctl enable --now stagedesk-agent.service stagedesk-kiosk.service
  if [ "${PACKAGE_CHANGED:-0}" = "1" ]; then
    systemctl restart stagedesk-agent.service
  fi
}

main() {
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
}

main "$@"
