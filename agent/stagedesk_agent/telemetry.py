"""A missing source gives None, never an exception."""
import json
import logging
import re
import shutil
from datetime import datetime, timezone

from .power import KIOSK_USER, wayland_command

log = logging.getLogger("stagedesk_agent.telemetry")
APT_CACHE_SECONDS = 3600
APT_FAILURE_CACHE_SECONDS = 300
APT_TIMEOUT = 60
MAX_TEXT = 500
_apt_cache = {"at": None, "value": None}


def reset_cache():
    _apt_cache.update(at=None, value=None)


def _safe(fn, *args):
    try:
        return fn(*args)
    except Exception as exc:
        log.debug("telemetry source failed: %s", exc)
        return None


def _read(path):
    try:
        return path.read_text(errors="replace")
    except OSError:
        return None


def _output(runner, args, user=None, timeout=10):
    result = runner.run(args, timeout=timeout, user=user)
    return result.out if result.code == 0 else None


def read_cpu_serial(paths):
    match = re.search(r"^Serial\s*:\s*(\S+)", _read(paths.proc / "cpuinfo") or "", re.M)
    return match.group(1) if match else None


def read_model(paths):
    try:
        return (paths.proc / "device-tree" / "model").read_bytes().decode(errors="replace").strip("\x00 \n") or None
    except OSError:
        return None


def _interfaces(runner):
    out = _output(runner, ["ip", "-j", "addr"])
    return json.loads(out) if out else []


def _ipv4(interface):
    for info in interface.get("addr_info", []):
        if info.get("family") == "inet" and info.get("local"):
            return info["local"]
    return None


def _wifi_details(runner, name):
    ssid = signal = None
    out = _safe(_output, runner, ["iw", "dev", name, "link"]) or ""
    match = re.search(r"^\s*SSID:\s*(.+?)\s*$", out, re.M)
    if match:
        ssid = match.group(1)
    match = re.search(r"^\s*signal:\s*(-?\d+)\s*dBm", out, re.M)
    if match:
        signal = int(match.group(1))
    return ssid, signal


def _network(runner):
    result = {"kind": None, "ssid": None, "signal_dbm": None, "ip": None, "mac": None}
    candidates = [i for i in _interfaces(runner) if i.get("ifname") != "lo" and _ipv4(i)]
    # a cable wins over wifi
    candidates.sort(key=lambda i: 0 if not i["ifname"].startswith("wl") else 1)
    if candidates:
        chosen = candidates[0]
        result["ip"] = _ipv4(chosen)
        result["mac"] = chosen.get("address")
        if chosen["ifname"].startswith("wl"):
            result["kind"] = "wifi"
            result["ssid"], result["signal_dbm"] = _wifi_details(runner, chosen["ifname"])
        else:
            result["kind"] = "lan"
    return result


def _temperature(runner):
    match = re.search(r"temp=(-?[\d.]+)", _output(runner, ["vcgencmd", "measure_temp"]) or "")
    return float(match.group(1)) if match else None


def _throttled(runner):
    """(now, since_boot): under-voltage, frequency cap, throttled or soft temperature limit."""
    match = re.search(r"throttled=(0x[0-9a-fA-F]+)", _output(runner, ["vcgencmd", "get_throttled"]) or "")
    if not match:
        return None, None
    value = int(match.group(1), 16)
    return bool(value & 0xF), bool(value & 0xF0000)


def _disk_percent(paths):
    usage = shutil.disk_usage(paths.root)
    return round(usage.used / usage.total * 100, 1)


def _ram_percent(paths):
    text = _read(paths.proc / "meminfo")
    total = int(re.search(r"^MemTotal:\s+(\d+)", text, re.M).group(1))
    available = int(re.search(r"^MemAvailable:\s+(\d+)", text, re.M).group(1))
    return round((total - available) / total * 100, 1)


def _uptime(paths):
    return int(float(_read(paths.proc / "uptime").split()[0]))


def _os_name(paths):
    match = re.search(r'^PRETTY_NAME="?([^"\n]+)"?', _read(paths.root / "etc" / "os-release") or "", re.M)
    return match.group(1) if match else None


def _agent_version(paths):
    return (_read(paths.opt_dir / "VERSION") or "").strip() or None


def _system(runner, paths):
    now_flag, since_flag = _safe(_throttled, runner) or (None, None)
    return {
        "temperature_c": _safe(_temperature, runner),
        "throttled_now": now_flag,
        "throttled_since_boot": since_flag,
        "disk_percent": _safe(_disk_percent, paths),
        "ram_percent": _safe(_ram_percent, paths),
        "uptime_s": _safe(_uptime, paths),
        "model": _safe(read_model, paths),
        "serial": _safe(read_cpu_serial, paths),
        "os": _safe(_os_name, paths),
        "agent_version": _safe(_agent_version, paths),
    }


def _resolution(runner, paths):
    out = _output(runner, wayland_command(["wlr-randr"], paths.root), user=KIOSK_USER) or ""
    match = re.search(r"(\d+x\d+)\s+px[^\n]*\bcurrent\b", out)
    return match.group(1) if match else None


def _browser_running(runner):
    result = runner.run(["systemctl", "is-active", "stagedesk-kiosk"], timeout=10)
    if result.code == 127 or result.code == 124:
        return None
    return result.out.strip() == "active"


def _display(runner, paths, power_status):
    return {
        "resolution": _safe(_resolution, runner, paths),
        "browser_running": _safe(_browser_running, runner),
        "power": power_status,
    }


def _state(paths):
    data = json.loads(_read(paths.state_dir / "update-state.json"))
    return data if isinstance(data, dict) else {}


def _pending_from_apt(runner, now):
    cached_at = _apt_cache["at"]
    if cached_at is not None:
        ttl = APT_CACHE_SECONDS if _apt_cache["value"] is not None else APT_FAILURE_CACHE_SECONDS
        if (now - cached_at).total_seconds() < ttl:
            return _apt_cache["value"]
    out = _output(runner, ["apt-get", "-s", "upgrade"], timeout=APT_TIMEOUT)
    value = None if out is None else sum(1 for line in out.splitlines() if line.startswith("Inst "))
    _apt_cache.update(at=now, value=value)
    return value


def _reboot_since(paths):
    stamp = (paths.root / "var" / "run" / "reboot-required").stat().st_mtime
    return datetime.fromtimestamp(stamp, timezone.utc).isoformat()


def _updates(runner, paths, now):
    state = _safe(_state, paths) or {}
    pending = state.get("pending_packages")
    if not isinstance(pending, int) or isinstance(pending, bool):
        pending = _safe(_pending_from_apt, runner, now)
    error = state.get("last_error")
    return {
        "last_at": state.get("last_at") if isinstance(state.get("last_at"), str) else None,
        "last_ok": state.get("last_ok") if isinstance(state.get("last_ok"), bool) else None,
        "last_error": str(error)[:MAX_TEXT] if error else None,
        "pending_packages": pending,
        "reboot_required_since": _safe(_reboot_since, paths),
    }


def collect(runner, paths, now, power_status=None):
    """`power_status` is the last known status text of the power module."""
    return {
        "network": _safe(_network, runner) or {"kind": None, "ssid": None, "signal_dbm": None, "ip": None, "mac": None},
        "system": _system(runner, paths),
        "display": _display(runner, paths, power_status),
        "updates": _updates(runner, paths, now),
    }
