import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

from .common import REQUEST_TIMEOUT, REQUEST_TIMEOUT_SEARCH, TIMEZONE, _product_icon


DB_TT_BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1"
DB_TT_CLIENT_ID = os.getenv("DB_TT_CLIENT_ID", "")
DB_TT_API_KEY = os.getenv("DB_TT_API_KEY", "")

DB_CAT_TO_PRODUCT = {
    "ICE": "nationalExpress", "ECE": "nationalExpress", "RJ": "nationalExpress",
    "IC": "national", "EC": "national", "EN": "national", "NJ": "national", "D": "national",
    "RE": "regionalExpress", "IRE": "regionalExpress", "erx": "regionalExpress", "ERX": "regionalExpress",
    "RB": "regional", "R": "regional", "NWB": "regional", "NBE": "regional", "ME": "regional",
    "AKN": "regional", "ERB": "regional", "WFB": "regional", "ENO": "regional",
    "S": "suburban", "U": "subway", "STR": "tram", "STB": "tram",
    "Bus": "bus", "BUS": "bus", "F": "ferry", "Fähre": "ferry",
}


# DB IRIS message codes -> text (delay causes t="d" + quality issues t="q")
DB_MSG_TEXT = {
    1: "Nähere Informationen in Kürze", 2: "Polizeieinsatz", 3: "Feuerwehreinsatz auf der Strecke",
    4: "Kurzfristiger Personalausfall", 5: "Ärztliche Versorgung eines Fahrgastes", 6: "Betätigen der Notbremse",
    7: "Unbefugte Personen auf der Strecke", 8: "Notarzteinsatz auf der Strecke", 9: "Streikauswirkungen",
    10: "Tiere auf der Strecke", 11: "Unwetter", 12: "Warten auf ein verspätetes Schiff",
    13: "Pass- und Zollkontrolle", 14: "Defekt am Bahnhof", 15: "Beeinträchtigung durch Vandalismus",
    16: "Entschärfung einer Fliegerbombe", 17: "Beschädigung einer Brücke", 18: "Umgestürzter Baum auf der Strecke",
    19: "Unfall an einem Bahnübergang", 20: "Tiere im Gleis", 21: "Warten auf Anschlussreisende",
    22: "Witterungsbedingte Beeinträchtigungen", 23: "Betriebsstabilisierung", 24: "Verspätung im Ausland",
    25: "Bereitstellung weiterer Wagen", 26: "Abhängen von Wagen", 27: "Technische Störung am Bus",
    28: "Gegenstände auf der Strecke", 29: "Ersatzverkehr mit Bus ist eingerichtet", 30: "Personalausfall im Stellwerk",
    31: "Bauarbeiten", 32: "Längere Haltezeit am Bahnhof", 33: "Defekt an der Oberleitung", 34: "Defekt an einem Signal",
    35: "Streckensperrung", 36: "Technische Störung am Zug", 37: "Kurzfristiger Fahrzeugausfall", 38: "Defekt an der Strecke",
    39: "Stau / Hohes Verkehrsaufkommen", 40: "Defektes Stellwerk", 41: "Defekt an einem Bahnübergang",
    42: "Außerplanmäßige Geschwindigkeitsbeschränkung", 43: "Verspätung eines vorausfahrenden Zuges",
    44: "Warten auf einen entgegenkommenden Zug", 45: "Vorfahrt eines anderen Zuges", 46: "Vorfahrt eines anderen Zuges",
    47: "Verspätete Bereitstellung", 48: "Verspätung aus vorheriger Fahrt", 49: "Kurzfristiger Personalausfall",
    50: "Kurzfristige Erkrankung von Personal", 51: "Verspätetes Personal aus vorheriger Fahrt", 52: "Streik",
    53: "Unwetterauswirkungen", 54: "Verfügbarkeit der Gleise derzeit eingeschränkt", 55: "Technischer Defekt an einem anderen Zug",
    56: "Laden der Antriebsbatterie", 57: "Zusätzlicher Halt", 58: "Umleitung", 59: "Schnee und Eis",
    60: "Witterungsbedingt verminderte Geschwindigkeit", 61: "Defekte Tür", 62: "Behobener Defekt am Zug",
    63: "Technische Untersuchung am Zug", 64: "Defekt an einer Weiche", 65: "Erdrutsch", 66: "Hochwasser",
    67: "Behördliche Maßnahme", 68: "Hohes Fahrgastaufkommen", 69: "Zug verkehrt mit verminderter Geschwindigkeit",
    70: "WLAN nicht verfügbar", 71: "Eingeschränktes WLAN", 72: "Info/Entertainment nicht verfügbar",
    73: "Heute: Mehrzweckabteil vorne", 74: "Heute: Mehrzweckabteil hinten", 75: "Heute: 1. Klasse vorne",
    76: "Heute: 1. Klasse hinten", 77: "1. Klasse fehlt", 78: "Ersatzverkehr mit Bus ist eingerichtet",
    79: "Mehrzweckabteil fehlt", 80: "Abweichende Wagenreihung", 81: "Fahrzeugtausch", 82: "Mehrere Wagen fehlen",
    83: "Heute ohne fahrzeuggebundene Einstiegshilfe", 84: "Zug verkehrt richtig gereiht", 85: "Ein Wagen fehlt",
    86: "Gesamter Zug ohne Reservierung", 87: "Einzelne Wagen ohne Reservierung", 88: "Keine Qualitätsmängel",
    89: "Reservierungen sind wieder vorhanden", 90: "Kein gastronomisches Angebot", 91: "Fahrradmitnahme nicht möglich",
    92: "Fahrradmitnahme kann nicht garantiert werden", 93: "Behindertengerechte Einrichtung fehlt", 94: "Ersatzbewirtschaftung",
    95: "Universaltoilette fehlt", 96: "Zustieg kann nicht garantiert werden", 97: "Hohe Auslastung",
    98: "Sonstige Qualitätsmängel", 99: "Verzögerungen im Betriebsablauf",
}
# Codes that are not real disruptions (not shown as delay cause)
DB_MSG_IGNORE = {84, 88, 89, 62}


def _db_tt_get(path, timeout=None):
    req = urllib.request.Request(DB_TT_BASE + path, headers={
        "DB-Client-Id": DB_TT_CLIENT_ID,
        "DB-Api-Key": DB_TT_API_KEY,
        "Accept": "application/xml",
        "User-Agent": "Stagedesk-Monitor/1.0",
    })
    with urllib.request.urlopen(req, timeout=timeout or REQUEST_TIMEOUT) as resp:
        return ET.fromstring(resp.read())


def _db_cat_product(cat, line):
    if cat in DB_CAT_TO_PRODUCT:
        return DB_CAT_TO_PRODUCT[cat]
    # Fallback via the line prefix (e.g. "RE83" -> RE)
    m = re.match(r'^([A-Za-zÄÖÜ]+)', (line or ''))
    if m and m.group(1) in DB_CAT_TO_PRODUCT:
        return DB_CAT_TO_PRODUCT[m.group(1)]
    return "regional"


_DB_META_CACHE = {}  # eva -> (meta_evas, timestamp); large stations split the S-Bahn into its own EVA


def _db_meta_evas(eva):
    """IRIS splits platform groups into sibling EVAs (meta field): Hamburg Hbf = 8002549
    (long-distance/regional), S-Bahn = 8098549."""
    import time as _time
    now = _time.time()
    hit = _DB_META_CACHE.get(str(eva))
    if hit and now - hit[1] < 86400:
        return hit[0]
    evas = []
    try:
        root = _db_tt_get(f"/station/{urllib.parse.quote(str(eva))}", timeout=REQUEST_TIMEOUT_SEARCH)
        for s in root.findall("station"):
            if s.get("eva") == str(eva):
                meta = s.get("meta") or ""
                evas = [x for x in meta.split("|") if x and x != str(eva)]
                break
    except Exception:
        evas = []
    _DB_META_CACHE[str(eva)] = (evas, now)
    return evas


def _fetch_sbahn_meta(eva, duration, max_results, stopovers=False):
    out = []
    for m_eva in _db_meta_evas(eva):
        try:
            deps = _fetch_departures_db(m_eva, duration, max_results, stopovers=stopovers)
        except Exception:
            continue
        for d in deps:
            if d.get("kind_icon") == "sbahn":
                out.append(d)
    return out


def _fetch_departures_db(station_id, duration, max_results, stopovers=False, failed=None):
    """/plan (planned) plus /fchg (real-time changes). A failed /fchg or /plan hour
    still yields the remaining data; it is appended to `failed` so the caller can
    report the source as degraded. Raises when every /plan request failed."""
    if not DB_TT_CLIENT_ID:
        return []
    now = datetime.now(TIMEZONE)

    changes = {}
    replaced_by = {}   # (cat, nr) of the original -> replacement label (e.g. "Bus 114392")
    replacement_trips = []        # replacement trips (tl t="e" + <ref>) only appear in /fchg; added as departures of their own
    try:
        fchg = _db_tt_get(f"/fchg/{station_id}")
        for s in fchg.findall("s"):
            dp = s.find("dp")
            if dp is None:
                continue
            codes = []      # d + q, for flag detection (SEV/detour)
            codes_d = []    # only t="d" = real delay/cancellation causes (shown)
            for m in list(dp) + list(s):
                if m.tag != "m":
                    continue
                t = m.get("t")
                c = m.get("c")
                if t in ("d", "q") and c and c.isdigit():
                    ci = int(c)
                    codes.append(ci)
                    if t == "d":
                        codes_d.append(ci)
            changes[s.get("id")] = {
                "ct": dp.get("ct"), "cp": dp.get("cp"), "cs": dp.get("cs"),
                "cpth": dp.get("cpth"), "codes": codes, "codes_d": codes_d,
            }
            # Replacement service: this trip replaces another one (original in <ref>)
            tl = s.find("tl")
            ref = s.find("ref")
            if tl is not None and tl.get("t") == "e" and ref is not None:
                r_tl = ref.find("tl")
                if r_tl is not None and r_tl.get("n"):
                    orig_key = (r_tl.get("c") or "", r_tl.get("n") or "")
                    repl_label = ((tl.get("c") or "") + " " + (tl.get("n") or "")).strip()
                    replaced_by[orig_key] = repl_label
                    replacement_trips.append(s)
    except Exception:
        if failed is not None:
            failed.append("fchg")

    hours = 1 + min(3, int(duration) // 60)
    # Also load the previous hour (i=-1): delayed trains with an early planned time
    # are in the plan of the PLANNED hour, not the current one.
    deps = []
    plan_failures, last_plan_error = 0, None
    for i in range(-1, hours):
        t = now + timedelta(hours=i)
        try:
            plan = _db_tt_get(f"/plan/{station_id}/{t.strftime('%y%m%d')}/{t.strftime('%H')}")
        except Exception as e:
            plan_failures += 1
            last_plan_error = e
            if failed is not None:
                failed.append("plan")
            continue
        for s in plan.findall("s"):
            dp = s.find("dp")
            if dp is None:
                continue
            pt = dp.get("pt") or ""
            if len(pt) < 10:
                continue
            line = dp.get("l") or ""
            tl = s.find("tl")
            cat = (tl.get("c") if tl is not None else "") or ""
            tl_t = (tl.get("t") if tl is not None else "") or ""
            if not line and tl is not None:
                line = (cat + (tl.get("n") or "")).strip()
            ppth = [p for p in (dp.get("ppth") or "").split("|") if p]
            destination = ppth[-1] if ppth else ""
            try:
                dt_plan = datetime.strptime(pt, "%y%m%d%H%M").replace(tzinfo=TIMEZONE)
            except Exception:
                continue
            ch = changes.get(s.get("id"), {})
            ct = ch.get("ct")
            cancelled = ch.get("cs") == "c"
            delay = 0
            dt_real = dt_plan
            realtime = False
            if ct and len(ct) >= 10:
                try:
                    dt_real = datetime.strptime(ct, "%y%m%d%H%M").replace(tzinfo=TIMEZONE)
                    delay = int((dt_real - dt_plan).total_seconds() // 60)
                    realtime = True
                except Exception:
                    pass
            min_until = (dt_real - now).total_seconds() / 60
            if min_until < -1 or min_until > duration:
                continue
            platform_planned = dp.get("pp") or ""
            platform_actual = ch.get("cp") or platform_planned
            product = _db_cat_product(cat, line)

            codes = ch.get("codes", [])
            # Reason/remark only from real causes (t="d"); quality notes
            # (t="q", e.g. "2nd class only") are not a delay reason on the row.
            remarks = []
            for c in ch.get("codes_d", []):
                if c in DB_MSG_IGNORE:
                    continue
                txt = DB_MSG_TEXT.get(c)
                if txt and txt not in remarks:
                    remarks.append(txt)
            rail_replacement = any(c in (29, 78) for c in codes)
            diversion = 58 in codes

            wing_train = bool(dp.get("wings"))
            replacement_train = tl_t == "e"

            # Stop changes: changed route cpth vs planned ppth
            added_stops, dropped_stops = [], []
            ends_early, planned_destination = False, ""
            cpth = ch.get("cpth")
            if cpth:
                new_route = [p for p in cpth.split("|") if p]
                setp, setn = set(ppth), set(new_route)
                added_stops = [h for h in new_route if h not in setp][:3]
                dropped_stops = [h for h in ppth if h not in setn][:3]
                if new_route:
                    orig_destination = ppth[-1] if ppth else ""
                    destination = new_route[-1]
                    # Train ends early: the new destination is on the original route, stops after it are dropped
                    if orig_destination and destination != orig_destination and destination in ppth:
                        ends_early, planned_destination = True, orig_destination

            result = {
                "line": line,
                "direction": destination,
                "departure": dt_plan.strftime("%H:%M"),
                "departure_actual": dt_real.strftime("%H:%M"),
                "delay": delay,
                "realtime": realtime,
                "platform": str(platform_actual),
                "kind": product,
                "kind_icon": _product_icon(product),
                "cancelled": cancelled,
                "remarks": remarks[:3],
                "_sortkey": dt_plan.timestamp(),
            }
            if platform_actual and platform_planned and platform_actual != platform_planned:
                result["platform_planned"] = str(platform_planned)
            if rail_replacement:
                result["rail_replacement"] = True
            if diversion:
                result["diversion"] = True
            if wing_train:
                result["wing_train"] = True
            if replacement_train:
                result["replacement_train"] = True
            if added_stops:
                result["added_stops"] = added_stops
            if dropped_stops:
                result["dropped_stops"] = dropped_stops
            if ends_early:
                result["ends_early"] = True
                result["planned_destination"] = planned_destination
            _ek = (cat, (tl.get("n") if tl is not None else "") or "")
            if _ek in replaced_by:
                result["replaced_by"] = replaced_by[_ek]
            if stopovers:
                result["stopovers"] = ppth[:-1] if len(ppth) > 1 else []
            deps.append(result)

    if plan_failures == hours + 1:
        raise last_plan_error

    for s in replacement_trips:
        dp = s.find("dp"); tl = s.find("tl"); ref = s.find("ref")
        if dp is None or tl is None:
            continue
        pt = dp.get("pt") or ""
        ch = changes.get(s.get("id"), {})
        ct = ch.get("ct")
        if len(pt) < 10:
            continue
        try:
            dt_plan = datetime.strptime(pt, "%y%m%d%H%M").replace(tzinfo=TIMEZONE)
            dt_real = datetime.strptime(ct, "%y%m%d%H%M").replace(tzinfo=TIMEZONE) if (ct and len(ct) >= 10) else dt_plan
        except Exception:
            continue
        min_until = (dt_real - now).total_seconds() / 60
        if min_until < -1 or min_until > duration:
            continue
        ppth = [p for p in (dp.get("ppth") or "").split("|") if p]
        cat = tl.get("c") or "Bus"
        line = (dp.get("fb") or (cat + " " + (tl.get("n") or ""))).strip()
        r_tl = ref.find("tl") if ref is not None else None
        replacement_for = (f"{r_tl.get('c')} {r_tl.get('n')}".strip()) if r_tl is not None else ""
        product = 'bus' if 'bus' in cat.lower() else _db_cat_product(cat, line)
        res = {
            "line": line, "direction": ppth[-1] if ppth else "",
            "departure": dt_plan.strftime("%H:%M"), "departure_actual": dt_real.strftime("%H:%M"),
            "delay": int((dt_real - dt_plan).total_seconds() // 60),
            "realtime": bool(ct and len(ct) >= 10),
            "platform": str(dp.get("cp") or dp.get("pp") or ""),
            "kind": product, "kind_icon": _product_icon(product) if product != 'bus' else 'bus',
            "cancelled": False, "remarks": [], "rail_replacement": True,
            "replacement_for": replacement_for, "_sortkey": dt_plan.timestamp(),
        }
        if stopovers:
            res["stopovers"] = ppth[:-1] if len(ppth) > 1 else []
        deps.append(res)

    deps.sort(key=lambda d: d.get("_sortkey", 0))
    seen, out = set(), []
    for d in deps:
        key = (d["line"], d["departure"], d["direction"])
        if key in seen:
            continue
        seen.add(key)
        d.pop("_sortkey", None)
        out.append(d)
    return out[:max_results]
