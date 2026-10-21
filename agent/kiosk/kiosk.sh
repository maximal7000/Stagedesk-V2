#!/bin/bash
# Startet Chromium im Vollbild. Die URL steht in KIOSK_URL (EnvironmentFile /etc/stagedesk-agent/kiosk.env).
# Vor der Kopplung ist das die lokale Seite des Agents (http://127.0.0.1:8765/).
set -u

URL="${KIOSK_URL:-http://127.0.0.1:8765/}"

# Auf das Netz warten (höchstens etwa 60 s), damit Chromium nicht die Fehlerseite lädt.
for _ in $(seq 1 30); do
  curl -sf --max-time 3 "$URL" -o /dev/null && break
  sleep 2
done

# Die Meldung "Wiederherstellen?" nach einem Stromausfall verhindern.
PREF="$HOME/.config/chromium/Default/Preferences"
[ -f "$PREF" ] && sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PREF"

BROWSER=chromium
command -v "$BROWSER" >/dev/null 2>&1 || BROWSER=chromium-browser

exec "$BROWSER" \
  --kiosk "$URL" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --no-first-run \
  --check-for-update-interval=31536000 \
  --ozone-platform=wayland \
  --start-fullscreen
