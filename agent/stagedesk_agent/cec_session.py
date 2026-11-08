"""One long-running cec-client. Every new cec-client announces the Pi to the TV again, and many TVs then
show a "device can be controlled with the remote" message; a session that stays open announces once."""
import logging
import re
import subprocess
import threading

log = logging.getLogger("stagedesk_agent.cec")
# Log level 1 (errors) + 8 (traffic): the TV's own broadcasts arrive as TRAFFIC lines.
COMMAND = ["cec-client", "-d", "9"]
ANSWER_TIMEOUT = 8
_POWER = re.compile(r"power status: (on|standby|in transition from standby to on|in transition from on to standby)")
_TRAFFIC = re.compile(r">> ([0-9a-f])[0-9a-f]:([0-9a-f]{2})(?::([0-9a-f]{2}))?", re.IGNORECASE)
_POWER_TEXT = {"on": "an", "standby": "standby",
               "in transition from standby to on": "an", "in transition from on to standby": "standby"}
STANDBY_OPCODE = "36"
REPORT_POWER_OPCODE = "90"


class CecUnavailable(Exception):
    pass


class CecSession:
    def __init__(self, popen=subprocess.Popen):
        self._popen = popen
        self._proc = None
        self._lock = threading.Lock()  # one command at a time
        self._answer = threading.Condition()
        self._last_answer = None
        self._answers = 0
        self.state = None
        self.on_change = None  # called with "an" or "standby" when the TV's state changes

    def _ensure(self):
        if self._proc is not None and self._proc.poll() is None:
            return
        try:
            self._proc = self._popen(COMMAND, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, text=True, bufsize=1)
        except OSError as exc:
            self._proc = None
            raise CecUnavailable(str(exc)) from exc
        threading.Thread(target=self._read, args=(self._proc,), daemon=True, name="cec-reader").start()

    def _read(self, proc):
        for line in proc.stdout:
            self._parse(line)
        log.warning("cec-client ended (code %s)", proc.poll())

    def _parse(self, line):
        answer = _POWER.search(line)
        if answer:
            state = _POWER_TEXT[answer.group(1)]
            with self._answer:
                self._last_answer = state
                self._answers += 1
                self._answer.notify_all()
            self._set_state(state)
            return
        traffic = _TRAFFIC.search(line)
        if not traffic or traffic.group(1) != "0":  # only what the TV itself sends
            return
        opcode, param = traffic.group(2).lower(), traffic.group(3)
        if opcode == STANDBY_OPCODE:
            self._set_state("standby")
        elif opcode == REPORT_POWER_OPCODE and param in ("00", "01"):
            self._set_state("an" if param == "00" else "standby")

    def _set_state(self, state):
        if state == self.state:
            return
        self.state = state
        callback = self.on_change
        if callback is not None:
            try:
                callback(state)
            except Exception:
                log.exception("cec state callback failed")

    def send(self, command):
        with self._lock:
            self._write(command)

    def _write(self, command):
        self._ensure()
        try:
            self._proc.stdin.write(f"{command}\n")
            self._proc.stdin.flush()
        except (OSError, ValueError) as exc:
            self.close()
            raise CecUnavailable(str(exc)) from exc

    def query_power(self, device, timeout=ANSWER_TIMEOUT):
        """"an" or "standby"; raises CecUnavailable when the session cannot run or the TV does not answer."""
        with self._lock:
            with self._answer:
                seen = self._answers
            self._write(f"pow {device}")
            with self._answer:
                if not self._answer.wait_for(lambda: self._answers > seen, timeout):
                    raise CecUnavailable("Fernseher antwortet nicht über CEC")
                return self._last_answer

    def close(self):
        """The next command starts a new cec-client (and announces the Pi once more)."""
        proc, self._proc = self._proc, None
        if proc is None:
            return
        try:
            proc.stdin.write("q\n")
            proc.stdin.flush()
        except (OSError, ValueError):
            pass
        try:
            proc.terminate()
        except OSError:
            pass
