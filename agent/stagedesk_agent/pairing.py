import http.client
import json
import logging
import threading
import time
import urllib.error
import urllib.request
from .config import backoff_delays
from datetime import datetime, timedelta, timezone

log = logging.getLogger("stagedesk_agent.pairing")
POLL_INTERVAL = 5
DEFAULT_LIFETIME = timedelta(minutes=15)
MAX_LIFETIME = timedelta(hours=1)


class ServerBusy(Exception):
    """The server answered, but not usefully (429, 5xx): not a network problem."""


def http_post(url, payload, timeout=15):
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as err:
        status, raw = err.code, err.read()
    try:
        body = json.loads(raw.decode() or "{}")
    except ValueError:
        body = {}
    return status, body if isinstance(body, dict) else {}


def _parse_time(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class PairingClient:
    def __init__(self, config, http_post=http_post, serial="unknown", model="unknown", now=None,
                 monotonic=time.monotonic, stop_event=None):
        self.config = config
        self.http_post = http_post
        self.serial = serial
        self.model = model
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.monotonic = monotonic
        self._stop_event = stop_event or threading.Event()
        self._deadline = 0.0

    def stop(self):
        self._stop_event.set()

    def _url(self, name):
        return f"{self.config.server.rstrip('/')}/api/signage/agent/pair/{name}"

    def _lifetime(self, value):
        """Measured at receipt (immune to a wrong device clock)."""
        expires = _parse_time(value)
        lifetime = (expires - self.now()) if expires else DEFAULT_LIFETIME
        if not timedelta(0) < lifetime <= MAX_LIFETIME:
            lifetime = DEFAULT_LIFETIME
        return lifetime.total_seconds()

    def start(self):
        status, body = self.http_post(self._url("start"), {"serial": self.serial, "model": self.model})
        if status != 200:
            raise ServerBusy(f"pair/start answered {status}")
        code, pairing_id = body["code"], body["pairing_id"]
        expires = _parse_time(body.get("expires_at")) or self.now() + DEFAULT_LIFETIME
        self._deadline = self.monotonic() + self._lifetime(body.get("expires_at"))
        return code, pairing_id, expires

    def poll(self, pairing_id):
        status, body = self.http_post(self._url("poll"), {"pairing_id": pairing_id})
        if status == 202:
            return None
        if status in (404, 410):
            return {"status": "expired"}
        if status == 200 and body.get("status") == "paired":
            self.config.token = body["token"]
            self.config.slug = body["slug"]
            self.config.key = body["key"]
            self.config.save()
            return {"status": "paired", "slug": body["slug"]}
        raise ServerBusy(f"pair/poll answered {status}")

    def run(self, on_code, on_unreachable=None, sleep=None, poll_interval=POLL_INTERVAL):
        sleep = sleep or self._stop_event.wait
        delays = backoff_delays(jitter=False)
        pairing_id = code = None
        unreachable = False
        while not self._stop_event.is_set():
            wait = poll_interval
            try:
                if pairing_id is None:
                    code, pairing_id, _ = self.start()
                    on_code(code)
                    unreachable = False
                elif self.monotonic() >= self._deadline:
                    pairing_id = None
                    continue
                else:
                    result = self.poll(pairing_id)
                    if unreachable and code is not None:
                        on_code(code)  # network is back: show the code again
                    unreachable = False
                    if result is None:
                        pass
                    elif result["status"] == "paired":
                        return True
                    else:
                        pairing_id = None
                        continue
                delays = backoff_delays(jitter=False)
            except ServerBusy as exc:
                log.warning("pairing: %s", exc)
                wait = next(delays)
            except (OSError, http.client.HTTPException) as exc:
                log.warning("pairing: %s", exc)
                if on_unreachable and not unreachable:
                    on_unreachable()
                unreachable = True
                wait = next(delays)
            except (KeyError, ValueError, TypeError) as exc:
                log.warning("pairing: malformed answer (%r)", exc)
                pairing_id = None
                wait = next(delays)
            sleep(wait)
        return False
