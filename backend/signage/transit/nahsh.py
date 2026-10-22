import json
import logging
import urllib.request
from datetime import datetime

from django.conf import settings

from .common import REQUEST_TIMEOUT, TIMEZONE, _product_icon

logger = logging.getLogger('signage.transit')


NAHSH_MGATE_URL = "https://nah.sh.hafas.de/bin/mgate.exe"
# The AID comes from settings.NAHSH_HAFAS_AID (.env) at runtime
NAHSH_CLIENT = {"type": "IPH", "id": "NAHSH", "v": "3000700", "name": "NAHSHPROD"}
NAHSH_VER = "1.30"


class _PostRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keeps POST on 307/308 instead of switching to GET."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code in (307, 308) and req.data is not None:
            new_req = urllib.request.Request(
                newurl, data=req.data, headers=dict(req.header_items()),
                method=req.get_method(),
            )
            return new_req
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_post_opener = urllib.request.build_opener(_PostRedirectHandler)


def _nahsh_rpc(method, req_data):
    """Without a configured AID: None (no data)."""
    aid = getattr(settings, "NAHSH_HAFAS_AID", "")
    if not aid:
        logger.warning("NAHSH_HAFAS_AID ist nicht gesetzt, NAH.SH-Abfragen werden übersprungen.")
        return None
    payload = json.dumps({
        "ver": NAHSH_VER,
        "lang": "de",
        "auth": {"type": "AID", "aid": aid},
        "client": NAHSH_CLIENT,
        "svcReqL": [{
            "meth": method,
            "req": req_data,
        }],
    }).encode("utf-8")

    req = urllib.request.Request(NAHSH_MGATE_URL, data=payload, headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Stagedesk-Monitor/1.0",
    })
    with _post_opener.open(req, timeout=REQUEST_TIMEOUT) as resp:
        data = json.loads(resp.read())

    svc = data.get("svcResL", [{}])[0]
    if svc.get("err", "OK") != "OK":
        raise Exception(f"HAFAS error: {svc.get('errTxt', svc.get('err'))}")
    return svc.get("res", {})


# NAH.SH HAFAS product bitmask (bit position -> type)
NAHSH_PRODUCTS = {
    0: "nationalExpress",   # ICE
    1: "national",          # IC/EC
    2: "regionalExpress",   # RE
    3: "regional",          # RB
    4: "suburban",          # S-Bahn
    5: "bus",
    6: "ferry",
    7: "subway",            # U-Bahn
    8: "tram",
    9: "taxi",              # AST/Taxi
}


def _nahsh_products_from_bitmask(bitmask):
    if not bitmask:
        return []
    try:
        mask = int(bitmask)
    except (ValueError, TypeError):
        return []
    return [name for bit, name in NAHSH_PRODUCTS.items() if mask & (1 << bit)]


def _fetch_departures_nahsh(station_id, duration, max_results, stopovers=False):
    now = datetime.now(TIMEZONE)

    req_data = {
        "type": "DEP",
        "stbLoc": {"lid": f"A=1@L={station_id}@"},
        "dur": min(duration, 1440),  # max 24h
        "maxJny": min(max_results, 100),
        "date": now.strftime("%Y%m%d"),
        "time": now.strftime("%H%M%S"),
    }
    # NAH.SH HAFAS does not support getPasslist
    # StationBoard has no stopovers; via info only from the DB API

    res = _nahsh_rpc("StationBoard", req_data) or {}

    common = res.get("common", {})
    prod_list = common.get("prodL", [])
    loc_list = common.get("locL", [])
    rem_list = common.get("remL", [])

    departures = []
    for jny in res.get("jnyL", []):
        parsed = _parse_nahsh_departure(jny, prod_list, loc_list, rem_list, now)
        if parsed:
            departures.append(parsed)

    return departures


def _parse_nahsh_departure(jny, prod_list, loc_list, rem_list, ref_date):
    try:
        stb_stop = jny.get("stbStop", {})

        prod_idx = jny.get("prodX", stb_stop.get("dProdX"))
        line = ""
        product = ""
        line_color = ""
        if prod_idx is not None and prod_idx < len(prod_list):
            prod = prod_list[prod_idx]
            line = prod.get("name", "") or prod.get("addName", "") or ""
            cls_val = prod.get("cls")
            if cls_val:
                prods = _nahsh_products_from_bitmask(cls_val)
                product = prods[0] if prods else ""
            # Line colour from HAFAS style/icoX
            style = prod.get("style", {}) or {}
            if isinstance(style, dict):
                bg = style.get("bg") or style.get("bgC") or ""
                fg = style.get("fg") or style.get("fgC") or ""
                if bg and bg not in ("000000", "#000000", "FFFFFF", "#FFFFFF"):
                    line_color = bg if bg.startswith("#") else f"#{bg}"
                elif fg and fg not in ("000000", "#000000", "FFFFFF", "#FFFFFF"):
                    line_color = fg if fg.startswith("#") else f"#{fg}"

        direction = jny.get("dirTxt", "")
        if not direction:
            dir_loc_idx = jny.get("dirLocX")
            if dir_loc_idx is not None and dir_loc_idx < len(loc_list):
                direction = loc_list[dir_loc_idx].get("name", "")

        # Times (format HHMMSS)
        d_time_s = stb_stop.get("dTimeS", "")  # planned
        d_time_r = stb_stop.get("dTimeR", "")  # real-time

        departure_planned = _parse_hafas_time(d_time_s, ref_date)
        departure_actual = _parse_hafas_time(d_time_r, ref_date) or departure_planned

        # Delay (DDHHMMSS or HHMMSS)
        delay = 0
        if d_time_s and d_time_r:
            try:
                plan_min = _hafas_to_minutes(d_time_s)
                real_min = _hafas_to_minutes(d_time_r)
                delay = real_min - plan_min
                if delay < -120:
                    delay += 1440  # day rollover
            except (ValueError, IndexError):
                pass

        # Platform (R = real-time, S = planned)
        platform_actual = stb_stop.get("dPlatfR") or ""
        platform_planned = stb_stop.get("dPlatfS") or ""
        platform = platform_actual or platform_planned
        platform_changed = bool(platform_actual and platform_planned and platform_actual != platform_planned)

        cancelled = jny.get("isCncl", False) or stb_stop.get("dCncl", False)

        remarks = []
        for rem_ref in (jny.get("remL") or jny.get("msgL") or []):
            rem_idx = rem_ref.get("remX") if isinstance(rem_ref, dict) else None
            if rem_idx is not None and rem_idx < len(rem_list):
                rem = rem_list[rem_idx]
                if rem.get("type") in ("W", "I", "A"):  # Warning, Info, Attention
                    text = rem.get("txtS") or rem.get("txtN") or ""
                    if text:
                        remarks.append(text)

        if not line and not direction:
            return None

        result = {
            "line": line,
            "direction": direction,
            "departure": departure_planned,
            "departure_actual": departure_actual,
            "delay": delay,
            "realtime": bool(d_time_r),
            "platform": str(platform),
            "kind": product,
            "kind_icon": _product_icon(product),
            "cancelled": cancelled,
            "remarks": remarks[:2],
        }
        if line_color:
            result["line_color"] = line_color
        if platform_changed:
            result["platform_planned"] = str(platform_planned)

        # Stopovers from stopL (stop list, if getPasslist=True)
        stop_list = jny.get("stopL", [])
        if stop_list and isinstance(stop_list, list):
            stopovers = []
            for stop in stop_list:
                loc_idx = stop.get("locX")
                if loc_idx is not None and loc_idx < len(loc_list):
                    name = loc_list[loc_idx].get("name", "")
                    if name:
                        stopovers.append(name)
            if stopovers:
                result["stopovers"] = stopovers

        return result
    except Exception:
        return None


def _parse_iso_time(iso_str):
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        # Convert to Europe/Berlin explicitly (not the server zone)
        dt = dt.astimezone(TIMEZONE)
        return dt.strftime("%H:%M")
    except Exception:
        return ""


def _hafas_to_minutes(time_str):
    if len(time_str) >= 8:
        d = int(time_str[:2])
        h = int(time_str[2:4])
        m = int(time_str[4:6])
        return d * 1440 + h * 60 + m
    h = int(time_str[:2])
    m = int(time_str[2:4])
    return h * 60 + m


def _parse_hafas_time(time_str, ref_date=None):
    """Format HHMMSS (6 digits) or DDHHMMSS (8 digits, DD = day offset)."""
    if not time_str or len(time_str) < 4:
        return ""
    try:
        if len(time_str) >= 8:
            # DDHHMMSS: DD is the day offset (01 = next day)
            h = int(time_str[2:4])
            m = int(time_str[4:6])
        else:
            h = int(time_str[:2])
            m = int(time_str[2:4])
        if h >= 24:
            h -= 24  # next day
        return f"{h:02d}:{m:02d}"
    except (ValueError, IndexError):
        return ""
