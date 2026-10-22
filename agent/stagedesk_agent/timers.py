"""systemd timers for the update window and the daily reboot.

The timer services only send a signal to the running agent (SIGUSR1: update, SIGUSR2: daily reboot).
The agent then asks the server for the gate over its existing connection."""
import logging
import re

log = logging.getLogger("stagedesk_agent.timers")
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
DEFAULT_WINDOW = {"weekday": 6, "from": "03:00", "until": "05:00"}
REBOOT_TIME = "04:00"
UPDATE_UNIT = "stagedesk-agent-update"
REBOOT_UNIT = "stagedesk-agent-reboot"
_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _minutes(text):
    match = _TIME.match(text) if isinstance(text, str) else None
    return int(match.group(1)) * 60 + int(match.group(2)) if match else None


def parse_window(window):
    """(weekday name, 'HH:MM', random delay seconds); invalid values fall back to the default window."""
    window = window if isinstance(window, dict) else {}
    weekday = window.get("weekday")
    start = _minutes(window.get("from"))
    if not isinstance(weekday, int) or isinstance(weekday, bool) or not 0 <= weekday <= 6 or start is None:
        window = DEFAULT_WINDOW
        weekday, start = window["weekday"], _minutes(window["from"])
    end = _minutes(window.get("until"))
    span = 0 if end is None else (end - start) % (24 * 60)
    # The run can take up to an hour: leave that much of the window after the latest start.
    return DAYS[weekday], window["from"], max(0, span - 60) * 60


def _service(description, signal):
    return (f"[Unit]\nDescription={description}\n\n[Service]\nType=oneshot\n"
            f"ExecStart=/usr/bin/systemctl kill --kill-whom=main --signal={signal} stagedesk-agent\n")


def _timer(description, calendar, delay):
    return (f"[Unit]\nDescription={description}\n\n[Timer]\nOnCalendar={calendar}\n"
            f"RandomizedDelaySec={delay}\nPersistent=false\n\n[Install]\nWantedBy=timers.target\n")


def _write_if_changed(path, text):
    try:
        if path.read_text(encoding="utf-8") == text:
            return False
    except OSError:
        pass
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def write_timers(update_window, auto_updates, daily_reboot, runner, paths):
    """Write the unit files, reload systemd only when something changed, enable or disable the timers."""
    day, start, delay = parse_window(update_window)
    directory = paths.systemd_dir
    files = {
        f"{UPDATE_UNIT}.service": _service("Stagedesk Agent: Updates starten", "SIGUSR1"),
        f"{UPDATE_UNIT}.timer": _timer("Stagedesk Agent: Update-Fenster", f"{day} {start}", delay),
        f"{REBOOT_UNIT}.service": _service("Stagedesk Agent: täglicher Neustart", "SIGUSR2"),
        f"{REBOOT_UNIT}.timer": _timer("Stagedesk Agent: täglicher Neustart", REBOOT_TIME, 0),
    }
    changed = {name: _write_if_changed(directory / name, text) for name, text in files.items()}
    if any(changed.values()):
        runner.run(["systemctl", "daemon-reload"])
    for unit, wanted in ((UPDATE_UNIT, auto_updates), (REBOOT_UNIT, daily_reboot)):
        name = f"{unit}.timer"
        enabled = runner.run(["systemctl", "is-enabled", name]).code == 0
        if wanted and not enabled:
            runner.run(["systemctl", "enable", "--now", name])
        elif wanted and changed[name]:
            runner.run(["systemctl", "restart", name])
        elif not wanted and enabled:
            runner.run(["systemctl", "disable", "--now", name])
