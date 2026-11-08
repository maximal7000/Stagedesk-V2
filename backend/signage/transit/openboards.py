"""DB OpenBoards (rail only, replacement services included). Same DB API Marketplace credentials as
Timetables. One request returns at most the next 30 minutes, so longer look-aheads take several windows;
the API allows 10 requests per second."""
import json
import math
import urllib.request
from datetime import datetime, timedelta

from . import db
from .common import REQUEST_TIMEOUT, TIMEZONE, _product_icon

OB_BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/open-boards/v1"
WINDOW_MINUTES = 30
MAX_WINDOWS = 4
# Departures that are late started before "now" by their schedule; start the first window a bit earlier.
LOOKBACK_MINUTES = 5


def _post(path, body, timeout=None):
    req = urllib.request.Request(OB_BASE + path, data=json.dumps(body).encode(), method="POST", headers={
        "DB-Client-Id": db.DB_TT_CLIENT_ID,
        "DB-Api-Key": db.DB_TT_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Stagedesk-Monitor/1.0",
    })
    with urllib.request.urlopen(req, timeout=timeout or REQUEST_TIMEOUT) as resp:
        return json.loads(resp.read())


def _names(data):
    out = {}
    for place in data.get("stopPlaces") or []:
        names = place.get("localizedNames") or []
        name = next((n.get("name") for n in names if n.get("language") == "deu"), None) or (names[0].get("name") if names else None)
        if place.get("evaNumber") and name:
            out[str(place["evaNumber"])] = name
    return out


def _time(value):
    try:
        return datetime.fromisoformat(value).astimezone(TIMEZONE)
    except (TypeError, ValueError):
        return None


def _cancelled(dep):
    # The sample answers carry no cancelled trip; these are the names the API uses for it elsewhere.
    return any(dep.get(key) is True for key in ("canceled", "cancelled")) or dep.get("timeType") in ("CANCELED", "CANCELLED")


def _departure(dep, names, now, duration, stopovers):
    transport = dep.get("transport") or {}
    planned, actual = _time(dep.get("timeSchedule")), _time(dep.get("time"))
    planned = planned or actual
    actual = actual or planned
    if planned is None:
        return None
    if not -1 <= (actual - now).total_seconds() / 60 <= duration:
        return None
    name = (transport.get("line") or {}).get("name") or transport.get("journeyDescription") or ""
    category = transport.get("category") or ""
    replacement = transport.get("replacementTransport") or None
    targets = [names.get(str(p.get("evaNumber")), "") for p in (transport.get("direction") or {}).get("stopPlaces") or []]
    via = sorted(transport.get("via") or [], key=lambda v: v.get("displayPriority", 0))
    platform = (dep.get("platform") or {}).get("name") or ""
    platform_planned = (dep.get("platformSchedule") or {}).get("name") or ""
    if replacement:
        product = "bus" if replacement.get("realType") == "BUS" else db._db_cat_product(category, name)
        line = f"SEV {name}".strip()
    else:
        product = db._db_cat_product(category, name)
        line = name
    result = {
        "line": line,
        "direction": " / ".join(t for t in targets if t),
        "departure": planned.strftime("%H:%M"),
        "departure_actual": actual.strftime("%H:%M"),
        "delay": int((actual - planned).total_seconds() // 60),
        "realtime": dep.get("timeType") not in (None, "SCHEDULE"),
        "platform": str(platform or platform_planned),
        "kind": product,
        "kind_icon": _product_icon(product),
        "cancelled": _cancelled(dep),
        "remarks": [],
        "_sortkey": planned.timestamp(),
    }
    if platform and platform_planned and platform != platform_planned:
        result["platform_planned"] = str(platform_planned)
    if replacement:
        result["rail_replacement"] = True
        result["replacement_for"] = name
    if stopovers:
        result["stopovers"] = [names[str(v.get("evaNumber"))] for v in via if str(v.get("evaNumber")) in names]
    return result


def fetch_departures_openboards(station_id, duration, max_results, stopovers=False, now=None):
    """Raises when the first window fails; later windows that fail only shorten the list."""
    if not (db.DB_TT_CLIENT_ID and db.DB_TT_API_KEY):
        return []
    now = now or datetime.now(TIMEZONE)
    start = now - timedelta(minutes=LOOKBACK_MINUTES)
    windows = min(MAX_WINDOWS, max(1, math.ceil((int(duration) + LOOKBACK_MINUTES) / WINDOW_MINUTES)))
    deps, seen = [], set()
    for i in range(windows):
        body = {
            "stopPlaceOrStation": {"evaNumbers": [str(station_id)]},
            "timeWindow": {"timeStart": (start + timedelta(minutes=WINDOW_MINUTES * i)).isoformat(timespec="seconds")},
            "maxViaStops": 3,
            "languages": ["deu"],
        }
        try:
            data = _post("/departures", body)
        except Exception:
            if i == 0:
                raise
            break
        names = _names(data)
        for dep in data.get("departures") or []:
            key = (dep.get("journeyId"), dep.get("departureId"))
            if key in seen:
                continue
            seen.add(key)
            row = _departure(dep, names, now, duration, stopovers)
            if row:
                deps.append(row)
        if len(deps) >= max_results:
            break
    deps.sort(key=lambda d: d["_sortkey"])
    for d in deps:
        d.pop("_sortkey", None)
    return deps[:max_results]
