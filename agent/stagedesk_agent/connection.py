"""WebSocket connection to the server with automatic reconnect."""
import json
import logging
import struct
import threading
from urllib.parse import urlsplit

from .config import backoff_delays

log = logging.getLogger("stagedesk_agent.connection")
AUTH_FAILED_CODE = 4003
RECV_TIMEOUT = 120  # server pings every 60 s


class ConnectionClosed(Exception):
    def __init__(self, code=None):
        super().__init__(f"closed ({code})")
        self.code = code


class WebsocketTransport:
    """Adapter around websocket-client (imported lazily, so tests need no package)."""

    def __init__(self, url, headers):
        import websocket
        self._ws = websocket
        self._conn = websocket.create_connection(
            url, header=[f"{k}: {v}" for k, v in headers.items()], timeout=RECV_TIMEOUT)

    def recv(self):
        ws = self._ws
        try:
            opcode, frame = self._conn.recv_data_frame(True)
        except ws.WebSocketTimeoutException:
            raise ConnectionClosed(None)
        except ws.WebSocketConnectionClosedException:
            raise ConnectionClosed(None)
        if opcode == ws.ABNF.OPCODE_CLOSE:
            code = struct.unpack("!H", frame.data[:2])[0] if len(frame.data) >= 2 else None
            raise ConnectionClosed(code)
        if opcode == ws.ABNF.OPCODE_TEXT:
            return frame.data.decode("utf-8", "replace")
        return ""  # ping/pong/binary frames: nothing for the caller

    def send(self, text):
        self._conn.send(text)

    def close(self):
        try:
            self._conn.close()
        except Exception:
            pass


def ws_url(server, slug):
    parts = urlsplit(server)
    scheme = "wss" if parts.scheme == "https" else "ws"
    return f"{scheme}://{parts.netloc}/ws/signage/pi/{slug}/"


class Connection:
    def __init__(self, config, on_message, on_auth_failed, transport_factory=WebsocketTransport,
                 delays=backoff_delays, sleep=None, stop_event=None):
        self.config = config
        self.on_message = on_message
        self.on_auth_failed = on_auth_failed
        self.transport_factory = transport_factory
        self.delays = delays
        self._stop_event = stop_event or threading.Event()  # shared with the agent: set from the signal handler
        self.sleep = sleep or self._stop_event.wait
        self._got_message = False
        self.outages = 0  # connect failures and lost connections; the agent restarts the kiosk after one
        self._transport = None
        self._lock = threading.Lock()

    @property
    def _stopped(self):
        return self._stop_event.is_set()

    def stop(self):
        """Stop and close the transport. Not for signal handlers (takes the lock); they set the event."""
        self._stop_event.set()
        with self._lock:
            transport = self._transport
        if transport:
            transport.close()

    def is_connected(self):
        with self._lock:
            return self._transport is not None

    def send(self, msg):
        with self._lock:
            transport = self._transport
            if transport is None:
                return False
            try:
                transport.send(json.dumps(msg))
            except Exception as exc:
                log.warning("send failed: %s", exc)
                return False
        return True

    def run_forever(self):
        delays = self.delays()
        while not self._stopped:
            if not (self.config.token and self.config.slug):
                self._auth_failed()
                return
            try:
                transport = self.transport_factory(
                    ws_url(self.config.server, self.config.slug),
                    {"Authorization": f"Bearer {self.config.token}"})
            except Exception as exc:
                log.warning("connect failed: %s", exc)
                self.outages += 1
                self._wait(delays)
                continue
            with self._lock:
                self._transport = transport
            self._got_message = False
            try:
                code = self._read(transport)
            finally:
                with self._lock:
                    self._transport = None
                transport.close()
            if self._got_message:
                delays = self.delays()  # a working connection: next outage starts at 5 s again
            if code == AUTH_FAILED_CODE:
                self._auth_failed()
                return
            if not self._stopped:
                self.outages += 1
                self._wait(delays)

    def _wait(self, delays):
        self.sleep(next(delays))

    def _auth_failed(self):
        self.config.clear_pairing()
        self.on_auth_failed()

    def _read(self, transport):
        while not self._stopped:
            try:
                raw = transport.recv()
            except ConnectionClosed as closed:
                return closed.code
            except Exception as exc:
                log.warning("read failed: %s", exc)
                return None
            if not raw:
                continue
            self._got_message = True
            try:
                message = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(message, dict):
                continue
            if message.get("type") == "ping":
                self.send({"type": "pong"})
                continue
            try:
                self.on_message(message)
            except ConnectionClosed as closed:
                return closed.code
            except Exception:
                log.exception("message handler failed")
        return None
