"""Wires pairing, connection and local pages together."""
import logging
import re

from .config import Config
from .connection import Connection
from .local_pages import LocalPages
from .pairing import PairingClient
from .paths import Paths

log = logging.getLogger("stagedesk_agent")
LOCAL_URL = "http://127.0.0.1:8765/"


def read_identity(paths):
    """(serial, model) of this Raspberry Pi; 'unknown' when not readable."""
    serial = model = "unknown"
    try:
        match = re.search(r"^Serial\s*:\s*(\S+)", (paths.proc / "cpuinfo").read_text(), re.M)
        if match:
            serial = match.group(1)
    except OSError:
        pass
    try:
        model = (paths.proc / "device-tree" / "model").read_bytes().decode().strip("\x00 \n") or model
    except OSError:
        pass
    return serial, model


class Agent:
    def __init__(self, config, pages, kiosk_set_url=None, pairing_factory=None, connection_factory=None):
        self.config = config
        self.pages = pages
        self.kiosk_set_url = kiosk_set_url or (lambda url: None)
        self.pairing_factory = pairing_factory or self._default_pairing
        self.connection_factory = connection_factory or (lambda cfg, om, af: Connection(cfg, om, af))
        self.state = "pairing" if not config.token else "connecting"
        self.pairing = None
        self.connection = None
        self._stopped = False
        self._kiosk_url = None

    def _default_pairing(self, cfg):
        serial, model = read_identity(cfg.paths)
        return PairingClient(cfg, serial=serial, model=model)

    def _set_kiosk(self, url):
        if url != self._kiosk_url:
            self._kiosk_url = url
            self.kiosk_set_url(url)

    def stop(self):
        self._stopped = True
        for part in (self.pairing, self.connection):
            if part:
                part.stop()

    def send(self, msg):
        return bool(self.connection and self.connection.send(msg))

    def on_message(self, message):
        if message.get("type") == "hello":
            self.config.apply_hello(message)
            if self.config.kiosk_url:
                self._set_kiosk(self.config.kiosk_url)

    def on_auth_failed(self):
        log.warning("token rejected, starting pairing again")
        self.config.clear_pairing()
        self.state = "pairing"

    def run_once(self):
        """One phase: pairing if there is no token, otherwise the connection until it ends."""
        if not self.config.token:
            self.state = "pairing"
            self._set_kiosk(LOCAL_URL)
            self.pairing = self.pairing_factory(self.config)
            paired = self.pairing.run(on_code=self.pages.show_code, on_unreachable=self.pages.show_no_server)
            if not paired:
                return
            self.pages.show_none()
            self.state = "connecting"
            return
        self.state = "connecting"
        if self.config.kiosk_url:
            self._set_kiosk(self.config.kiosk_url)
        self.connection = self.connection_factory(self.config, self.on_message, self.on_auth_failed)
        self.connection.run_forever()

    def run(self):
        while not self._stopped:
            self.run_once()


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    paths = Paths()
    config = Config.load(paths)
    pages = LocalPages()
    pages.start()
    agent = Agent(config, pages)
    try:
        agent.run()
    except KeyboardInterrupt:
        agent.stop()
    finally:
        pages.stop()
