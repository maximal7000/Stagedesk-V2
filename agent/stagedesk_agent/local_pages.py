import html
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NO_SERVER = "Keine Verbindung zum Server."

_STYLE = """
html,body{margin:0;height:100%;background:#0b0b0c;color:#f2f2f2;font-family:sans-serif}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4vw;box-sizing:border-box}
h1{font-size:9vw;margin:0 0 3vw;letter-spacing:.04em}
p{font-size:3vw;margin:0;color:#c8c8c8;max-width:80vw}
.bars{display:flex;width:100%;height:30vh;margin-top:3vw}
.bars div{flex:1}
.grid{position:fixed;inset:0;opacity:.18;background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:10vw 10vw}
"""
_BARS = ["#ffffff", "#ffff00", "#00ffff", "#00ff00", "#ff00ff", "#ff0000", "#0000ff", "#000000"]


def format_code(code):
    code = str(code)
    return f"{code[:3]} {code[3:]}".strip()


# Chromium keeps the page open, so it asks the tiny local /state endpoint every 2 s.
_SCRIPT = """
var last=document.body.innerHTML;
setInterval(function(){fetch('/state',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){
if(s.body!==last){last=s.body;document.body.innerHTML=s.body}}).catch(function(){})},2000);
"""


def _page(body):
    return ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
            f"<title>Stagedesk</title><style>{_STYLE}</style></head><body>{body}"
            f"<script>{_SCRIPT}</script></body></html>")


class LocalPages:
    def __init__(self, port=8765, clock=time.monotonic):
        self._requested_port = port
        self.clock = clock
        self._lock = threading.Lock()
        self._state = ("none",)
        self._pattern = None  # (screen_name, resolution, until)
        self._server = None
        self._thread = None

    @property
    def port(self):
        return self._server.server_address[1] if self._server else self._requested_port

    def _set(self, state):
        with self._lock:
            self._state = state

    def show_code(self, code):
        self._set(("code", str(code)))

    def show_no_server(self):
        self._set(("no_server",))

    def show_none(self):
        self._set(("none",))

    def show_test_pattern(self, screen_name, resolution, seconds=60):
        with self._lock:
            self._pattern = (screen_name, resolution, self.clock() + seconds)

    def _body(self):
        with self._lock:
            state, pattern = self._state, self._pattern
            if pattern and self.clock() >= pattern[2]:
                self._pattern = pattern = None
        if pattern:
            name, resolution, _ = pattern
            bars = "".join(f'<div style="background:{c}"></div>' for c in _BARS)
            return (f'<div class="grid"></div><h1>{html.escape(name)}</h1>'
                    f"<p>{html.escape(resolution)}</p><div class=\"bars\">{bars}</div>")
        if state[0] == "code":
            return (f"<h1>Kopplungscode {html.escape(format_code(state[1]))}</h1>")
        if state[0] == "no_server":
            return f"<p>{html.escape(NO_SERVER)}</p>"
        return ""

    def render(self):
        return _page(self._body())

    def state(self):
        return {"body": self._body()}

    def start(self):
        pages = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path.split("?")[0] == "/state":
                    body, kind = json.dumps(pages.state()).encode("utf-8"), "application/json"
                else:
                    body, kind = pages.render().encode("utf-8"), "text/html"
                self.send_response(200)
                self.send_header("Content-Type", f"{kind}; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", self._requested_port), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self):
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
