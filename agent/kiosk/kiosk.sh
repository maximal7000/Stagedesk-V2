#!/bin/bash
# KIOSK_URL comes from the EnvironmentFile /etc/stagedesk-agent/kiosk.env; before pairing it is the
# agent's local page (http://127.0.0.1:8765/).
set -u

# Resolution and rotation from the admin (kiosk.env), set with wlr-randr inside cage. cage gives an output
# its preferred mode again whenever it reconnects (TV switched on, CEC standby, HDMI handshake after a
# boot), so a watcher applies them again after every change it did not make itself.
OUTPUT_CHECK_SECONDS="${OUTPUT_CHECK_SECONDS:-5}"

apply_output() {
  local output args=()
  output="$(wlr-randr 2>/dev/null | awk '/^[^ ]/ {print $1; exit}')"
  [ -n "$output" ] || return 0
  case "${OUTPUT_MODE:-}" in
    "") ;;
    *@*) args+=(--mode "${OUTPUT_MODE}Hz") ;;
    *) args+=(--mode "$OUTPUT_MODE") ;;
  esac
  [ -n "${OUTPUT_TRANSFORM:-}" ] && args+=(--transform "$OUTPUT_TRANSFORM")
  # A mode the screen rejects only leaves the previous one in place.
  wlr-randr --output "$output" "${args[@]}" || echo "wlr-randr ${args[*]} fehlgeschlagen" >&2
}

# Compares whole wlr-randr listings: after a rejected mode the state stays the same and is not retried
# until the output changes again. Ends with cage (wlr-randr then fails for a while).
watch_output() {
  local seen now failures=0
  seen="$(wlr-randr 2>/dev/null)"
  while sleep "$OUTPUT_CHECK_SECONDS"; do
    if ! now="$(wlr-randr 2>/dev/null)"; then
      failures=$((failures + 1))
      [ "$failures" -ge 6 ] && return 0
      continue
    fi
    failures=0
    [ "$now" = "$seen" ] && continue
    echo "Bildausgabe geändert, Auflösung und Drehung werden neu gesetzt" >&2
    apply_output
    seen="$(wlr-randr 2>/dev/null)"
  done
}

# Sourced by the tests: only the functions above.
[ "${BASH_SOURCE[0]}" != "$0" ] && return 0

URL="${KIOSK_URL:-http://127.0.0.1:8765/}"

# Wait for the network (about 60 s at most) so Chromium does not load its error page.
for _ in $(seq 1 30); do
  curl -sf --max-time 3 "$URL" -o /dev/null && break
  sleep 2
done

# Prevent the "Restore pages?" prompt after a power cut.
PREF="$HOME/.config/chromium/Default/Preferences"
[ -f "$PREF" ] && sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PREF"

if [ -n "${OUTPUT_MODE:-}" ] || [ -n "${OUTPUT_TRANSFORM:-}" ]; then
  apply_output
  watch_output &
fi

BROWSER=chromium
command -v "$BROWSER" >/dev/null 2>&1 || BROWSER=chromium-browser

exec "$BROWSER" \
  --kiosk "$URL" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --lang=de \
  --no-first-run \
  --check-for-update-interval=31536000 \
  --ozone-platform=wayland \
  --start-fullscreen
