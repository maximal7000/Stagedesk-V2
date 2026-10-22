#!/bin/bash
# KIOSK_URL comes from the EnvironmentFile /etc/stagedesk-agent/kiosk.env; before pairing it is the
# agent's local page (http://127.0.0.1:8765/).
set -u

URL="${KIOSK_URL:-http://127.0.0.1:8765/}"

# Wait for the network (about 60 s at most) so Chromium does not load its error page.
for _ in $(seq 1 30); do
  curl -sf --max-time 3 "$URL" -o /dev/null && break
  sleep 2
done

# Prevent the "Restore pages?" prompt after a power cut.
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
