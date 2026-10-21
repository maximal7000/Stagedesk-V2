"""Pairing with the server before the first token (spec section 3)."""
import json
import logging
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

log = logging.getLogger("stagedesk_agent.pairing")
POLL_INTERVAL = 5
DEFAULT_LIFETIME = timedelta(minutes=15)


def http_post(url, payload, timeout=15):
    """POST JSON, return (status, parsed body). Network errors raise OSError."""
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
    def __init__(self, config, http_post=http_post, serial="unknown", model="unknown", now=None):
        self.config = config
        self.http_post = http_post
        self.serial = serial
        self.model = model
        self.now = now or (lambda: datetime.now(timezone.utc))
        self._stopped = False
        self._expires_at = None

    def stop(self):
        self._stopped = True

    def _url(self, name):
        return f"{self.config.server.rstrip('/')}/api/monitor/agent/pair/{name}"

    def start(self):
        status, body = self.http_post(self._url("start"), {"serial": self.serial, "model": self.model})
        if status != 200 or "code" not in body:
            raise OSError(f"pair/start answered {status}")
        expires = _parse_time(body.get("expires_at")) or self.now() + DEFAULT_LIFETIME
        self._expires_at = expires
        return body["code"], body["pairing_id"], expires

    def poll(self, pairing_id):
        """None while waiting, {"status": "paired"} on success, {"status": "expired"} when a new code is needed."""
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
        raise OSError(f"pair/poll answered {status}")

    def run(self, on_code, on_unreachable=None, sleep=time.sleep, poll_interval=POLL_INTERVAL):
        """Block until paired (True) or stopped (False). Shows a new code after expiry."""
        pairing_id = None
        while not self._stopped:
            try:
                if pairing_id is None:
                    code, pairing_id, _ = self.start()
                    on_code(code)
                elif self.now() >= self._expires_at:
                    pairing_id = None
                    continue
                else:
                    result = self.poll(pairing_id)
                    if result is None:
                        pass
                    elif result["status"] == "paired":
                        return True
                    else:
                        pairing_id = None
                        continue
            except OSError as exc:
                log.warning("pairing: %s", exc)
                if on_unreachable:
                    on_unreachable()
            sleep(poll_interval)
        return False
