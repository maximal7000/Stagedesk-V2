"""Read-only check which power methods can work for this display. Never switches anything."""
import re
import socket

from .power import CEC_CLIENT, KIOSK_USER, HybridPower, wayland_command

CEC_TIMEOUT = 20
DDC_TIMEOUT = 15
SHORT_TIMEOUT = 5
SICP_TIMEOUT = 2
STATUS_QUERY = [0x19]


def _row(method, state, text):
    return {"method": method, "state": state, "text": text}


def _tool_problem(result, program):
    if result.code == 127:
        return f"Programm fehlt: {program}"
    if result.code == 124:
        return "Zeitlimit überschritten."
    return None


def _cec(runner):
    listing = runner.run(["cec-client", "-l"], timeout=SHORT_TIMEOUT)
    problem = _tool_problem(listing, "cec-client")
    if problem:
        return _row("cec", "fail", problem)
    found = re.search(r"Found devices:\s*(\d+)", listing.out)
    if not found or int(found.group(1)) == 0:
        return _row("cec", "fail", "Kein CEC-Adapter gefunden.")
    # One cec-client run for both commands: each start takes seconds.
    scan = runner.run(CEC_CLIENT, timeout=CEC_TIMEOUT, input="scan\npow 0\n")
    problem = _tool_problem(scan, "cec-client")
    if problem:
        return _row("cec", "fail", problem)
    block = re.search(r"device #0:.*?(?=\ndevice #|\Z)", scan.out, re.DOTALL)
    if not block:
        return _row("cec", "fail", "CEC-Adapter da, aber kein Display auf Adresse 0.")
    fields = dict(re.findall(r"^([a-z ]+?):\s+(.*?)\s*$", block.group(0), re.MULTILINE))
    name = fields.get("osd string") or "Display"
    vendor = fields.get("vendor")
    text = f"Display gefunden: {name}" + (f" ({vendor})" if vendor and vendor != "Unknown" else "") + "."
    states = re.findall(r"power status:\s*(\S+)", scan.out)
    if states and states[-1] in ("on", "standby"):
        label = "an" if states[-1] == "on" else "standby"
        return _row("cec", "ok", f"{text} Status lesbar: {label}.")
    return _row("cec", "warn", f"{text} Status nicht lesbar.")


def _sicp(config, connect):
    ip = config.get("display_ip")
    if not ip:
        return _row("sicp", "skip", "Keine Display-IP eingetragen.")
    sender = HybridPower(config, None, connect=connect)
    reply = sender._sicp(STATUS_QUERY, timeout=SICP_TIMEOUT)
    if reply is None:
        return _row("sicp", "fail", f"Keine Verbindung zu {sender.ip}:{sender.port}.")
    if not reply:
        return _row("sicp", "warn", f"Verbunden mit {sender.ip}:{sender.port}, aber keine Antwort auf die Statusabfrage.")
    return _row("sicp", "ok", f"Display antwortet auf {sender.ip}:{sender.port}.")


def _ddc(runner):
    detect = runner.run(["ddcutil", "detect", "--brief"], timeout=DDC_TIMEOUT)
    problem = _tool_problem(detect, "ddcutil")
    if problem:
        return _row("ddc", "fail", problem)
    monitor = re.search(r"Monitor:\s*(\S+)", detect.out)
    if detect.code != 0 or not re.search(r"^Display \d+", detect.out, re.MULTILINE):
        return _row("ddc", "fail", "Kein DDC-fähiges Display gefunden.")
    name = monitor.group(1) if monitor else "Display"
    power = runner.run(["ddcutil", "getvcp", "D6"], timeout=DDC_TIMEOUT)
    problem = _tool_problem(power, "ddcutil")
    if problem:
        return _row("ddc", "fail", problem)
    if power.code != 0 or "VCP code" not in power.out:
        return _row("ddc", "fail", f"Display gefunden ({name}), Energiemodus (D6) nicht lesbar.")
    return _row("ddc", "ok", f"Display gefunden ({name}), Energiemodus lesbar.")


def _hdmi(runner, root):
    result = runner.run(wayland_command(["wlr-randr"], root), timeout=SHORT_TIMEOUT, user=KIOSK_USER)
    problem = _tool_problem(result, "wlr-randr")
    if problem:
        return _row("hdmi", "fail", problem)
    output = re.search(r"^(\S+)", result.out, re.MULTILINE)
    if result.code != 0 or not output:
        return _row("hdmi", "fail", "Kein Ausgang gefunden.")
    return _row("hdmi", "warn", f"Ausgang {output.group(1)} da. Display bleibt an und zeigt ‚Kein Signal‘.")


def recommend(methods):
    state = {row["method"]: row["state"] for row in methods}
    if state.get("cec") == "ok":
        return "cec"
    if state.get("cec") in ("ok", "warn") and state.get("sicp") == "ok":
        return "hybrid"
    if state.get("ddc") == "ok":
        return "ddc"
    return "none"


def probe(runner, config, connect=socket.create_connection, root="/"):
    config = config if isinstance(config, dict) else {}
    methods = [_cec(runner), _sicp(config, connect), _ddc(runner), _hdmi(runner, root)]
    return {"methods": methods, "recommended": recommend(methods)}
