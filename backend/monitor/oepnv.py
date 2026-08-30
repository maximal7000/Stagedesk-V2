"""
ÖPNV Abfahrtsmonitor — Stationssuche & Abfahrten
Dual-API: DB REST (v6.db.transport.rest) + NAH.SH HAFAS (mgate.exe)
"""
import os
import json
import re
import html as _html
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Explizite Zeitzone — Server kann in UTC laufen, Abfahrten sind aber CET/CEST
TIMEZONE = ZoneInfo("Europe/Berlin")


# ═══ API Konfiguration ════════════════════════════════════════════

# DB Timetables API (offiziell, DB API Marketplace) — Credentials via Env-Vars
DB_TT_BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1"
DB_TT_CLIENT_ID = os.getenv("DB_TT_CLIENT_ID", "")
DB_TT_API_KEY = os.getenv("DB_TT_API_KEY", "")

# DB-Kategorie → Produkt-Typ (für Filter/Icon)
DB_CAT_TO_PRODUCT = {
    "ICE": "nationalExpress", "ECE": "nationalExpress", "RJ": "nationalExpress",
    "IC": "national", "EC": "national", "EN": "national", "NJ": "national", "D": "national",
    "RE": "regionalExpress", "IRE": "regionalExpress", "erx": "regionalExpress", "ERX": "regionalExpress",
    "RB": "regional", "R": "regional", "NWB": "regional", "NBE": "regional", "ME": "regional",
    "AKN": "regional", "ERB": "regional", "WFB": "regional", "ENO": "regional",
    "S": "suburban", "U": "subway", "STR": "tram", "STB": "tram",
    "Bus": "bus", "BUS": "bus", "F": "ferry", "Fähre": "ferry",
}


# DB IRIS Meldungs-Codes → Text (Verspätungsursachen t="d" + Qualitätsmängel t="q")
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
# Codes, die keine echte Störung sind (nicht als Verspätungsgrund anzeigen)
DB_MSG_IGNORE = {84, 88, 89, 62}


def _db_tt_get(path, timeout=None):
    """DB Timetables API GET → XML-Element (ElementTree)."""
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
    # Fallback über Linien-Präfix (z.B. "RE83" → RE)
    m = re.match(r'^([A-Za-zÄÖÜ]+)', (line or ''))
    if m and m.group(1) in DB_CAT_TO_PRODUCT:
        return DB_CAT_TO_PRODUCT[m.group(1)]
    return "regional"

# NAH.SH HAFAS mgate.exe (Schleswig-Holstein + Hamburg)
NAHSH_MGATE_URL = "https://nah.sh.hafas.de/bin/mgate.exe"
NAHSH_AUTH = {"type": "AID", "aid": "r0Ot9FLFNAFxijLW"}
NAHSH_CLIENT = {"type": "IPH", "id": "NAHSH", "v": "3000700", "name": "NAHSHPROD"}
NAHSH_VER = "1.30"

REQUEST_TIMEOUT = 5       # Sekunden pro API-Request
REQUEST_TIMEOUT_SEARCH = 4  # Schnellerer Timeout für Stationssuche


# ═══ Hilfsfunktionen ══════════════════════════════════════════════

def _get_json(url, timeout=None):
    """HTTP GET und JSON parsen"""
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "Stagedesk-Monitor/1.0",
    })
    with urllib.request.urlopen(req, timeout=timeout or REQUEST_TIMEOUT) as resp:
        return json.loads(resp.read())


class _PostRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Redirect-Handler der POST bei 307/308 beibehält (statt zu GET zu wechseln)"""
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
    """NAH.SH HAFAS mgate.exe JSON-RPC Request"""
    payload = json.dumps({
        "ver": NAHSH_VER,
        "lang": "de",
        "auth": NAHSH_AUTH,
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

    # Antwort auswerten
    svc = data.get("svcResL", [{}])[0]
    if svc.get("err", "OK") != "OK":
        raise Exception(f"HAFAS error: {svc.get('errTxt', svc.get('err'))}")
    return svc.get("res", {})


# ═══ NAH.SH Produkttypen ═════════════════════════════════════════

# NAH.SH HAFAS Produkt-Bitmask (Bit-Position → Typ)
NAHSH_PRODUCTS = {
    0: "nationalExpress",   # ICE
    1: "national",          # IC/EC
    2: "regionalExpress",   # RE
    3: "regional",          # RB
    4: "suburban",          # S-Bahn
    5: "bus",               # Bus
    6: "ferry",             # Fähre
    7: "subway",            # U-Bahn
    8: "tram",              # Straßenbahn
    9: "taxi",              # AST/Taxi
}


def _nahsh_products_from_bitmask(bitmask):
    """Produkt-Bitmask zu Produktliste"""
    if not bitmask:
        return []
    try:
        mask = int(bitmask)
    except (ValueError, TypeError):
        return []
    return [name for bit, name in NAHSH_PRODUCTS.items() if mask & (1 << bit)]


# ═══ Stationssuche ════════════════════════════════════════════════

def search_stations(query, results=10, use_db=True, use_nahsh=True):
    """
    Stationen suchen — fragt DB REST + NAH.SH HAFAS parallel ab.
    Gibt Liste zurück: [{"id": "...", "name": "...", "typ": "...", "quelle": "...", "produkte": [...]}]
    """
    if not query or len(query) < 2:
        return []
    if not use_db and not use_nahsh:
        return []

    from concurrent.futures import ThreadPoolExecutor, as_completed

    db_results = []
    nahsh_results = []

    def _search_db():
        # DB Timetables /station/{pattern} → EVA-Nummern
        if not DB_TT_CLIENT_ID:
            return []
        root = _db_tt_get(f"/station/{urllib.parse.quote(query)}", timeout=REQUEST_TIMEOUT_SEARCH)
        out = []
        for st in root.findall("station"):
            eva = st.get("eva")
            name = st.get("name")
            if not eva or not name:
                continue
            # DB Timetables liefert nur Bahnhöfe (Zugverkehr)
            produkte = ["nationalExpress", "national", "regionalExpress", "regional", "suburban"]
            out.append({
                "id": str(eva),
                "name": name,
                "typ": "bahnhof",
                "quelle": "db",
                "produkte": produkte,
            })
        return out[:results]

    def _search_nahsh():
        res = _nahsh_rpc("LocMatch", {
            "input": {
                "field": "S",
                "loc": {"name": f"{query}?", "type": "S"},
                "maxLoc": results,
            },
        })
        matches = res.get("match", {}).get("locL", [])
        out = []
        for loc in matches:
            if loc.get("type") != "S":
                continue
            sid = str(loc.get("extId", ""))
            if not sid:
                # Fallback: lid parsen "A=1@O=...@L=8000199@..."
                lid = loc.get("lid", "")
                if "@L=" in lid:
                    sid = lid.split("@L=")[1].split("@")[0]
            if not sid:
                continue
            produkte = _nahsh_products_from_bitmask(loc.get("pCls"))
            out.append({
                "id": sid,
                "name": loc.get("name", ""),
                "typ": _station_type(produkte),
                "quelle": "nahsh",
                "produkte": produkte,
            })
        return out

    # Parallel abfragen
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_db = pool.submit(_search_db) if use_db else None
        fut_nahsh = pool.submit(_search_nahsh) if use_nahsh else None

        if fut_db:
            try:
                db_results = fut_db.result(timeout=REQUEST_TIMEOUT_SEARCH + 1)
            except Exception as e:
                print(f"DB Stationssuche Fehler: {e}")

        if fut_nahsh:
            try:
                nahsh_results = fut_nahsh.result(timeout=REQUEST_TIMEOUT_SEARCH + 1)
            except Exception as e:
                print(f"NAH.SH Stationssuche Fehler: {e}")

    # Merge: DB zuerst, dann NAH.SH ergänzen
    combined = {}
    for s in db_results:
        combined[s["id"]] = s
    for s in nahsh_results:
        if s["id"] not in combined:
            combined[s["id"]] = s
        else:
            existing = combined[s["id"]]
            for p in s["produkte"]:
                if p not in existing["produkte"]:
                    existing["produkte"].append(p)
            if "nahsh" not in existing["quelle"]:
                existing["quelle"] = "db+nahsh"

    stationen = list(combined.values())[:results]
    return stationen


def _station_type(produkte):
    """Haupttyp der Station bestimmen"""
    if any(p in produkte for p in ["nationalExpress", "national"]):
        return "fernverkehr"
    if any(p in produkte for p in ["regionalExpress", "regional", "suburban"]):
        return "nahverkehr"
    if any(p in produkte for p in ["subway", "tram"]):
        return "stadtverkehr"
    if any(p in produkte for p in ["bus", "ferry", "taxi"]):
        return "bus"
    return "sonstig"


# ═══ Abfahrten holen ═════════════════════════════════════════════

def fetch_departures(stationen, dauer=60, max_pro_station=20,
                     zeige_bus=True, zeige_bahn=True, zeige_fernverkehr=True,
                     use_db=True, use_nahsh=True, zeige_via=False,
                     streik_linien=None, streik_typen=None):
    """
    Abfahrten für mehrere Stationen parallel holen.
    Versucht DB REST, fällt auf NAH.SH HAFAS zurück.
    Per-Station Produktfilter: station.zeige_bus/bahn/fernverkehr überschreibt globale Defaults.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _fetch_single(station):
        station_id = station.get("id", "")
        station_name = station.get("name", "")
        filter_linien = station.get("filter_linien", [])
        filter_richtung = station.get("filter_richtung", "")
        filter_via = station.get("filter_via", "").strip()
        wegzeit = station.get("wegzeit_minuten", 0)

        # Per-Station API-Auswahl: "db", "nahsh", "beide" (default: globale Einstellung)
        station_api = station.get("api", "")
        if station_api == "db":
            st_use_db, st_use_nahsh = True, False
        elif station_api == "nahsh":
            st_use_db, st_use_nahsh = False, True
        elif station_api == "beide":
            st_use_db, st_use_nahsh = True, True
        else:
            # Fallback auf globale Einstellung
            st_use_db, st_use_nahsh = use_db, use_nahsh

        # Per-Station Produktfilter (fallback auf globale Werte)
        st_bus = station.get("zeige_bus", zeige_bus)
        st_bahn = station.get("zeige_bahn", zeige_bahn)
        st_fern = station.get("zeige_fernverkehr", zeige_fernverkehr)

        if not station_id:
            return None

        abfahrten_roh = None
        fehler = None

        # Stopovers laden wenn Via-Filter gesetzt ODER via-Anzeige aktiv
        need_stopovers = bool(filter_via) or zeige_via

        # ─── Versuch 1: DB REST API ───
        if st_use_db:
            try:
                abfahrten_roh = _fetch_departures_db(station_id, dauer, max_pro_station * 2, stopovers=need_stopovers)
            except Exception as e:
                print(f"DB Abfahrten Fehler ({station_name}): {e}")
                # Stopovers können 500er verursachen — Fallback ohne Stopovers
                if need_stopovers:
                    try:
                        abfahrten_roh = _fetch_departures_db(station_id, dauer, max_pro_station * 2, stopovers=False)
                        print(f"DB Fallback ohne Stopovers OK ({station_name})")
                    except Exception as e2:
                        print(f"DB Fallback Fehler ({station_name}): {e2}")

        # ─── S-Bahn aus meta-EVA dazuholen (opt-in) — große Bahnhöfe trennen S-Bahn ab ───
        if st_use_db and station.get("zeige_sbahn", False) and abfahrten_roh:
            try:
                sbahn_deps = _fetch_sbahn_meta(station_id, dauer, max_pro_station * 2, stopovers=need_stopovers)
                existing = {(d["linie"], d["abfahrt"], d["richtung"]) for d in abfahrten_roh}
                for d in sbahn_deps:
                    k = (d["linie"], d["abfahrt"], d["richtung"])
                    if k not in existing:
                        existing.add(k)
                        abfahrten_roh.append(d)
                # Zeitlich vorsortieren, sonst schneidet der max-Cap (vor dem finalen Sort) die
                # hinten angehängten S-Bahnen wieder ab.
                _n = datetime.now(TIMEZONE)
                _nm = _n.hour * 60 + _n.minute

                def _rawmin(d):
                    try:
                        h, m = map(int, str(d.get("abfahrt", "99:99")).split(":")[:2])
                        diff = h * 60 + m - _nm
                        return diff + 1440 if diff < -120 else diff
                    except (ValueError, TypeError):
                        return 99999
                abfahrten_roh.sort(key=_rawmin)
            except Exception as e:
                print(f"S-Bahn-Merge Fehler ({station_name}): {e}")

        # ─── Versuch 2: NAH.SH HAFAS (Fallback oder wenn beide aktiv) ───
        if st_use_nahsh and (abfahrten_roh is None or len(abfahrten_roh) == 0 or station_api == "beide"):
            try:
                nahsh_deps = _fetch_departures_nahsh(station_id, dauer, max_pro_station * 2, stopovers=need_stopovers)
                if nahsh_deps is not None:
                    if abfahrten_roh is None:
                        abfahrten_roh = nahsh_deps
                    else:
                        existing_keys = {(d["linie"], d["abfahrt"]) for d in abfahrten_roh}
                        for dep in nahsh_deps:
                            if (dep["linie"], dep["abfahrt"]) not in existing_keys:
                                abfahrten_roh.append(dep)
            except Exception as e:
                print(f"NAH.SH Abfahrten Fehler ({station_name}): {e}")
                if abfahrten_roh is None:
                    fehler = str(e)

        if abfahrten_roh is None:
            abfahrten_roh = []

        # ─── Zusatz-Station (kombiniert) ───
        zusatz_id = station.get("zusatz_id", "").strip()
        zusatz_api = station.get("zusatz_api", "")
        if zusatz_id:
            try:
                zusatz_deps = None
                if zusatz_api in ("db", "beide", ""):
                    try:
                        zusatz_deps = _fetch_departures_db(zusatz_id, dauer, max_pro_station * 2, stopovers=False)
                    except Exception:
                        pass
                # NAH.SH: bei explizitem Wunsch, bei „beide", oder wenn DB nichts lieferte
                if zusatz_api in ("nahsh", "beide") or (zusatz_api == "" and not zusatz_deps):
                    try:
                        nahsh_z = _fetch_departures_nahsh(zusatz_id, dauer, max_pro_station * 2, stopovers=False)
                        if nahsh_z is not None:
                            if zusatz_deps is None:
                                zusatz_deps = nahsh_z
                            else:
                                existing_keys = {(d["linie"], d["abfahrt"]) for d in zusatz_deps}
                                for dep in nahsh_z:
                                    if (dep["linie"], dep["abfahrt"]) not in existing_keys:
                                        zusatz_deps.append(dep)
                    except Exception:
                        pass
                if zusatz_deps:
                    # Produktfilter für Zusatz-Station
                    z_bus = station.get("zusatz_zeige_bus", True)
                    z_bahn = station.get("zusatz_zeige_bahn", True)
                    z_fern = station.get("zusatz_zeige_fernverkehr", True)
                    z_sbahn = station.get("zusatz_zeige_sbahn", True)
                    z_ubahn = station.get("zusatz_zeige_ubahn", True)
                    z_tram = station.get("zusatz_zeige_tram", True)
                    z_faehre = station.get("zusatz_zeige_faehre", True)
                    filtered_zusatz = []
                    for dep in zusatz_deps:
                        typ = dep.get("typ", "")
                        if typ in ("bus",) and not z_bus:
                            continue
                        if typ in ("regional", "regionalExpress") and not z_bahn:
                            continue
                        if typ in ("suburban",) and not z_sbahn:
                            continue
                        if typ in ("subway",) and not z_ubahn:
                            continue
                        if typ in ("tram",) and not z_tram:
                            continue
                        if typ in ("ferry",) and not z_faehre:
                            continue
                        if typ in ("nationalExpress", "national") and not z_fern:
                            continue
                        filtered_zusatz.append(dep)
                    existing_keys = {(d["linie"], d["abfahrt"]) for d in abfahrten_roh}
                    for dep in filtered_zusatz:
                        if (dep["linie"], dep["abfahrt"]) not in existing_keys:
                            abfahrten_roh.append(dep)
                    print(f"Zusatz-Station {zusatz_id} lieferte {len(filtered_zusatz)} Abfahrten für {station_name}")
            except Exception as e:
                print(f"Zusatz-Station Fehler ({station_name}): {e}")

        # Aktuelle Zeit für Wegzeit-Filter
        now = datetime.now(TIMEZONE)

        # ─── Filter anwenden ───
        abfahrten = []
        for dep in abfahrten_roh:
            typ = dep.get("typ", "")
            if typ in ("bus",) and not st_bus:
                continue
            if typ in ("regional", "regionalExpress") and not st_bahn:
                continue
            if typ in ("suburban",) and not station.get("zeige_sbahn", True):
                continue
            if typ in ("subway",) and not station.get("zeige_ubahn", True):
                continue
            if typ in ("tram",) and not station.get("zeige_tram", True):
                continue
            if typ in ("ferry",) and not station.get("zeige_faehre", True):
                continue
            if typ in ("nationalExpress", "national") and not st_fern:
                continue
            # ─── Streik-Filter: Linien und Typen ausblenden ───
            if streik_linien:
                linie_lower = dep["linie"].strip().lower()
                if any(sl.strip().lower() == linie_lower for sl in streik_linien):
                    continue
                # Auch Nummer-Match: "Bus 1" matched "1"
                linie_parts = linie_lower.split()
                linie_nummer = linie_parts[-1] if linie_parts else linie_lower
                if any(sl.strip().lower() == linie_nummer for sl in streik_linien):
                    continue
            if streik_typen:
                typ_icon = dep.get("typ_icon", "")
                # "re" blendet auch "rb" aus, "ice" auch "ic"
                if typ_icon in streik_typen:
                    continue
                if 're' in streik_typen and typ_icon == 'rb':
                    continue
                if 'ice' in streik_typen and typ_icon == 'ic':
                    continue

            if filter_linien and len(filter_linien) > 0:
                linie_lower = dep["linie"].strip().lower()
                linie_parts = linie_lower.split()
                linie_nummer = linie_parts[-1] if linie_parts else linie_lower
                if not any(
                    fl.lower() == linie_lower or fl.lower() == linie_nummer
                    for fl in filter_linien
                ):
                    continue
            if filter_richtung:
                if filter_richtung.lower() not in dep["richtung"].lower():
                    continue
            if filter_via:
                halte = dep.get("stopovers", [])
                via_lower = filter_via.lower()
                if not any(via_lower in h.lower() for h in halte):
                    continue

            # Wegzeit-Filter: Abfahrten die innerhalb der Wegzeit liegen ausfiltern
            # Nutze abfahrt_aktuell (echte Abfahrtszeit) falls vorhanden
            wegzeit_time = dep.get("abfahrt_aktuell") or dep.get("abfahrt")
            if wegzeit > 0 and wegzeit_time:
                try:
                    dep_time = datetime.strptime(wegzeit_time, "%H:%M").replace(
                        year=now.year, month=now.month, day=now.day,
                        tzinfo=TIMEZONE
                    )
                    diff_min = (dep_time - now).total_seconds() / 60
                    # Nur Tageswechsel korrigieren wenn > 12h in der Vergangenheit
                    # (Abfahrt kurz nach Mitternacht, jetzt kurz vor Mitternacht)
                    if diff_min < -720:
                        diff_min += 1440
                    if diff_min < wegzeit:
                        continue
                except (ValueError, TypeError):
                    pass

            # Stopovers behalten wenn via-Anzeige aktiv, sonst entfernen
            if zeige_via:
                cleaned = dict(dep)
            else:
                cleaned = {k: v for k, v in dep.items() if k != "stopovers"}
            abfahrten.append(cleaned)
            if len(abfahrten) >= max_pro_station:
                break

        # Tagesbewusst sortieren: "00:03" gehört ans Ende, nicht an den Anfang.
        # (String-Sortierung stellte Züge nach Mitternacht fälschlich nach oben.)
        _now = datetime.now(ZoneInfo("Europe/Berlin"))
        _now_min = _now.hour * 60 + _now.minute

        def _dep_sortmin(d):
            t = d.get("abfahrt") or d.get("abfahrt_aktuell") or "99:99"
            try:
                h, m = map(int, str(t).split(":")[:2])
                diff = h * 60 + m - _now_min
                if diff < -120:  # bereits nach Mitternacht → nächster Tag
                    diff += 1440
                return diff
            except (ValueError, TypeError):
                return 99999

        abfahrten.sort(key=_dep_sortmin)

        entry = {
            "station_name": station_name,
            "station_id": station_id,
            "abfahrten": abfahrten,
        }
        if wegzeit > 0:
            entry["wegzeit_minuten"] = wegzeit
        if fehler:
            entry["fehler"] = fehler
        return entry

    # Stationen parallel abfragen
    valid = [s for s in stationen if s.get("id")]
    if not valid:
        return []

    if len(valid) == 1:
        result = _fetch_single(valid[0])
        return [result] if result else []

    ergebnis = [None] * len(valid)
    with ThreadPoolExecutor(max_workers=min(len(valid), 4)) as pool:
        futures = {pool.submit(_fetch_single, s): i for i, s in enumerate(valid)}
        for fut in as_completed(futures, timeout=REQUEST_TIMEOUT + 2):
            idx = futures[fut]
            try:
                ergebnis[idx] = fut.result()
            except Exception as e:
                print(f"Station-Fetch Fehler: {e}")

    return [e for e in ergebnis if e is not None]


# ═══ DB REST — Abfahrten ══════════════════════════════════════════

_DB_META_CACHE = {}  # eva -> (meta_evas, timestamp) — große Bahnhöfe trennen S-Bahn in eigene EVA


def _db_meta_evas(eva):
    """Geschwister-EVAs eines Bahnhofs (aus dem meta-Feld) — z.B. die separate S-Bahn-EVA.
    IRIS trennt Bahnsteig-Gruppen: Hamburg Hbf = 8002549 (Fern/Regio), S-Bahn = 8098549."""
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


def _fetch_sbahn_meta(eva, dauer, max_results, stopovers=False):
    """S-Bahn-Abfahrten aus den meta-Geschwister-EVAs einsammeln (nur typ_icon == sbahn)."""
    out = []
    for m_eva in _db_meta_evas(eva):
        try:
            deps = _fetch_departures_db(m_eva, dauer, max_results, stopovers=stopovers)
        except Exception:
            continue
        for d in deps:
            if d.get("typ_icon") == "sbahn":
                out.append(d)
    return out


def _fetch_departures_db(station_id, dauer, max_results, stopovers=False):
    """Abfahrten über die DB Timetables API (/plan geplant + /fchg Echtzeit).
    Extrahiert: Verspätung, Gleis(-wechsel), Ausfall, Meldungen (Verspätungsgründe/
    Ersatzverkehr/Umleitung/Qualität), Flügelzug, Ersatzzug, Halt-Änderungen."""
    if not DB_TT_CLIENT_ID:
        return []
    now = datetime.now(TIMEZONE)

    # Echtzeit-Änderungen je Stop-ID
    changes = {}
    ersetzt_durch = {}   # (cat, nr) des Originals -> Ersatz-Label (z.B. "Bus 114392")
    ersatz_s = []        # Ersatz-Fahrten (tl t="e" + <ref>) — stehen nur im /fchg, als eigene Abfahrt ergänzen
    try:
        fchg = _db_tt_get(f"/fchg/{station_id}")
        for s in fchg.findall("s"):
            dp = s.find("dp")
            if dp is None:
                continue
            codes = []      # d + q — für Flag-Erkennung (SEV/Umleitung)
            codes_d = []    # nur t="d" = echte Verspätungs-/Ausfallursachen (fürs Anzeigen)
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
            # Ersatzverkehr: dieser Trip ersetzt einen anderen (Original steht im <ref>)
            tl = s.find("tl")
            ref = s.find("ref")
            if tl is not None and tl.get("t") == "e" and ref is not None:
                r_tl = ref.find("tl")
                if r_tl is not None and r_tl.get("n"):
                    orig_key = (r_tl.get("c") or "", r_tl.get("n") or "")
                    repl_label = ((tl.get("c") or "") + " " + (tl.get("n") or "")).strip()
                    ersetzt_durch[orig_key] = repl_label
                    ersatz_s.append(s)
    except Exception:
        pass

    stunden = 1 + min(3, int(dauer) // 60)
    # Auch die vorherige Stunde laden (i=-1): Züge mit früher Plan-Zeit aber
    # Verspätung stehen im Plan der GEPLANTEN Stunde, nicht der aktuellen.
    deps = []
    for i in range(-1, stunden):
        t = now + timedelta(hours=i)
        try:
            plan = _db_tt_get(f"/plan/{station_id}/{t.strftime('%y%m%d')}/{t.strftime('%H')}")
        except Exception:
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
            ziel = ppth[-1] if ppth else ""
            try:
                dt_plan = datetime.strptime(pt, "%y%m%d%H%M").replace(tzinfo=TIMEZONE)
            except Exception:
                continue
            ch = changes.get(s.get("id"), {})
            ct = ch.get("ct")
            cancelled = ch.get("cs") == "c"
            verspaetung = 0
            dt_real = dt_plan
            if ct and len(ct) >= 10:
                try:
                    dt_real = datetime.strptime(ct, "%y%m%d%H%M").replace(tzinfo=TIMEZONE)
                    verspaetung = int((dt_real - dt_plan).total_seconds() // 60)
                except Exception:
                    pass
            min_until = (dt_real - now).total_seconds() / 60
            if min_until < -1 or min_until > dauer:
                continue
            gleis_geplant = dp.get("pp") or ""
            gleis_aktuell = ch.get("cp") or gleis_geplant
            produkt = _db_cat_product(cat, line)

            # ─── Meldungen aus Change-Codes ───
            codes = ch.get("codes", [])
            # Grund/Bemerkung NUR aus echten Ursachen (t="d") — Qualitätshinweise
            # (t="q", z.B. „nur 2. Klasse") gehören nicht als Verspätungsgrund auf die Zeile.
            bemerkungen = []
            for c in ch.get("codes_d", []):
                if c in DB_MSG_IGNORE:
                    continue
                txt = DB_MSG_TEXT.get(c)
                if txt and txt not in bemerkungen:
                    bemerkungen.append(txt)
            ersatzverkehr = any(c in (29, 78) for c in codes)
            umleitung = 58 in codes

            # ─── Flügelzug / Ersatzzug ───
            fluegelzug = bool(dp.get("wings"))
            ersatzzug = tl_t == "e"

            # ─── Halt-Änderungen (geänderte Route cpth vs ppth) ───
            zusatz_halte, entfall_halte = [], []
            endet_frueher, ziel_geplant = False, ""
            cpth = ch.get("cpth")
            if cpth:
                neu = [p for p in cpth.split("|") if p]
                setp, setn = set(ppth), set(neu)
                zusatz_halte = [h for h in neu if h not in setp][:3]
                entfall_halte = [h for h in ppth if h not in setn][:3]
                if neu:
                    orig_ziel = ppth[-1] if ppth else ""
                    ziel = neu[-1]  # neues Ziel
                    # Zug endet früher: neues Ziel liegt in der Original-Route, dahinter fällt was weg
                    if orig_ziel and ziel != orig_ziel and ziel in ppth:
                        endet_frueher, ziel_geplant = True, orig_ziel

            result = {
                "linie": line,
                "richtung": ziel,
                "abfahrt": dt_plan.strftime("%H:%M"),
                "abfahrt_aktuell": dt_real.strftime("%H:%M"),
                "verspaetung": verspaetung,
                "gleis": str(gleis_aktuell),
                "typ": produkt,
                "typ_icon": _product_icon(produkt),
                "ausfall": cancelled,
                "bemerkungen": bemerkungen[:3],
                "_sortkey": dt_plan.timestamp(),
            }
            if gleis_aktuell and gleis_geplant and gleis_aktuell != gleis_geplant:
                result["gleis_geplant"] = str(gleis_geplant)
            if ersatzverkehr:
                result["ersatzverkehr"] = True
            if umleitung:
                result["umleitung"] = True
            if fluegelzug:
                result["fluegelzug"] = True
            if ersatzzug:
                result["ersatzzug"] = True
            if zusatz_halte:
                result["zusatz_halte"] = zusatz_halte
            if entfall_halte:
                result["entfall_halte"] = entfall_halte
            if endet_frueher:
                result["endet_frueher"] = True
                result["ziel_geplant"] = ziel_geplant
            _ek = (cat, (tl.get("n") if tl is not None else "") or "")
            if _ek in ersetzt_durch:
                result["ersetzt_durch"] = ersetzt_durch[_ek]
            if stopovers:
                result["stopovers"] = ppth[:-1] if len(ppth) > 1 else []
            deps.append(result)

    # Ersatz-Fahrten (nur im /fchg vorhanden) als eigene Abfahrten ergänzen
    for s in ersatz_s:
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
        if min_until < -1 or min_until > dauer:
            continue
        ppth = [p for p in (dp.get("ppth") or "").split("|") if p]
        cat = tl.get("c") or "Bus"
        line = (dp.get("fb") or (cat + " " + (tl.get("n") or ""))).strip()
        r_tl = ref.find("tl") if ref is not None else None
        ersatz_fuer = (f"{r_tl.get('c')} {r_tl.get('n')}".strip()) if r_tl is not None else ""
        produkt = 'bus' if 'bus' in cat.lower() else _db_cat_product(cat, line)
        res = {
            "linie": line, "richtung": ppth[-1] if ppth else "",
            "abfahrt": dt_plan.strftime("%H:%M"), "abfahrt_aktuell": dt_real.strftime("%H:%M"),
            "verspaetung": int((dt_real - dt_plan).total_seconds() // 60),
            "gleis": str(dp.get("cp") or dp.get("pp") or ""),
            "typ": produkt, "typ_icon": _product_icon(produkt) if produkt != 'bus' else 'bus',
            "ausfall": False, "bemerkungen": [], "ersatzverkehr": True,
            "ersatz_fuer": ersatz_fuer, "_sortkey": dt_plan.timestamp(),
        }
        if stopovers:
            res["stopovers"] = ppth[:-1] if len(ppth) > 1 else []
        deps.append(res)

    deps.sort(key=lambda d: d.get("_sortkey", 0))
    seen, out = set(), []
    for d in deps:
        key = (d["linie"], d["abfahrt"], d["richtung"])
        if key in seen:
            continue
        seen.add(key)
        d.pop("_sortkey", None)
        out.append(d)
    return out[:max_results]


# ═══ NAH.SH HAFAS — Abfahrten ════════════════════════════════════

def _fetch_departures_nahsh(station_id, dauer, max_results, stopovers=False):
    """Abfahrten über NAH.SH HAFAS mgate.exe holen"""
    now = datetime.now(TIMEZONE)

    req_data = {
        "type": "DEP",
        "stbLoc": {"lid": f"A=1@L={station_id}@"},
        "dur": min(dauer, 1440),  # max 24h
        "maxJny": min(max_results, 100),
        "date": now.strftime("%Y%m%d"),
        "time": now.strftime("%H%M%S"),
    }
    # Hinweis: getPasslist wird von NAH.SH HAFAS nicht unterstützt
    # Stopovers sind bei StationBoard nicht verfügbar — Via-Infos nur über DB REST API

    res = _nahsh_rpc("StationBoard", req_data)

    # Common-Daten (Linien, Produkte, Orte etc.)
    common = res.get("common", {})
    prod_list = common.get("prodL", [])
    loc_list = common.get("locL", [])
    rem_list = common.get("remL", [])

    abfahrten = []
    for jny in res.get("jnyL", []):
        parsed = _parse_nahsh_departure(jny, prod_list, loc_list, rem_list, now)
        if parsed:
            abfahrten.append(parsed)

    return abfahrten


def _parse_nahsh_departure(jny, prod_list, loc_list, rem_list, ref_date):
    """Ein Abfahrts-Objekt aus NAH.SH HAFAS parsen"""
    try:
        stb_stop = jny.get("stbStop", {})

        # Linie aus prodL
        prod_idx = jny.get("prodX", stb_stop.get("dProdX"))
        linie = ""
        produkt = ""
        line_color = ""
        if prod_idx is not None and prod_idx < len(prod_list):
            prod = prod_list[prod_idx]
            linie = prod.get("name", "") or prod.get("addName", "") or ""
            # Produkt-Klasse
            cls_val = prod.get("cls")
            if cls_val:
                prods = _nahsh_products_from_bitmask(cls_val)
                produkt = prods[0] if prods else ""
            # Linienfarbe aus HAFAS style/icoX
            style = prod.get("style", {}) or {}
            if isinstance(style, dict):
                bg = style.get("bg") or style.get("bgC") or ""
                fg = style.get("fg") or style.get("fgC") or ""
                if bg and bg not in ("000000", "#000000", "FFFFFF", "#FFFFFF"):
                    line_color = bg if bg.startswith("#") else f"#{bg}"
                elif fg and fg not in ("000000", "#000000", "FFFFFF", "#FFFFFF"):
                    line_color = fg if fg.startswith("#") else f"#{fg}"

        # Richtung
        richtung = jny.get("dirTxt", "")
        if not richtung:
            dir_loc_idx = jny.get("dirLocX")
            if dir_loc_idx is not None and dir_loc_idx < len(loc_list):
                richtung = loc_list[dir_loc_idx].get("name", "")

        # Zeiten (Format: HHMMSS)
        d_time_s = stb_stop.get("dTimeS", "")  # geplant
        d_time_r = stb_stop.get("dTimeR", "")  # real/aktuell

        abfahrt_geplant = _parse_hafas_time(d_time_s, ref_date)
        abfahrt_aktuell = _parse_hafas_time(d_time_r, ref_date) or abfahrt_geplant

        # Verspätung berechnen (DDHHMMSS oder HHMMSS Format)
        verspaetung = 0
        if d_time_s and d_time_r:
            try:
                plan_min = _hafas_to_minutes(d_time_s)
                real_min = _hafas_to_minutes(d_time_r)
                verspaetung = real_min - plan_min
                if verspaetung < -120:
                    verspaetung += 1440  # Tageswechsel
            except (ValueError, IndexError):
                pass

        # Gleis (R = real/aktuell, S = geplant/Soll)
        gleis_aktuell = stb_stop.get("dPlatfR") or ""
        gleis_geplant = stb_stop.get("dPlatfS") or ""
        gleis = gleis_aktuell or gleis_geplant
        gleis_geaendert = bool(gleis_aktuell and gleis_geplant and gleis_aktuell != gleis_geplant)

        # Ausfall
        cancelled = jny.get("isCncl", False) or stb_stop.get("dCncl", False)

        # Bemerkungen
        bemerkungen = []
        for rem_ref in (jny.get("remL") or jny.get("msgL") or []):
            rem_idx = rem_ref.get("remX") if isinstance(rem_ref, dict) else None
            if rem_idx is not None and rem_idx < len(rem_list):
                rem = rem_list[rem_idx]
                if rem.get("type") in ("W", "I", "A"):  # Warning, Info, Attention
                    text = rem.get("txtS") or rem.get("txtN") or ""
                    if text:
                        bemerkungen.append(text)

        if not linie and not richtung:
            return None

        result = {
            "linie": linie,
            "richtung": richtung,
            "abfahrt": abfahrt_geplant,
            "abfahrt_aktuell": abfahrt_aktuell,
            "verspaetung": verspaetung,
            "gleis": str(gleis),
            "typ": produkt,
            "typ_icon": _product_icon(produkt),
            "ausfall": cancelled,
            "bemerkungen": bemerkungen[:2],
        }
        if line_color:
            result["linien_farbe"] = line_color
        if gleis_geaendert:
            result["gleis_geplant"] = str(gleis_geplant)

        # Stopovers aus stopL (Halteliste, wenn getPasslist=True)
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


# ═══ Zeit-Parser ══════════════════════════════════════════════════

def _parse_iso_time(iso_str):
    """ISO-Zeitstring zu HH:MM parsen (immer Europe/Berlin)"""
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        # Explizit nach Europe/Berlin konvertieren (nicht Server-TZ!)
        dt = dt.astimezone(TIMEZONE)
        return dt.strftime("%H:%M")
    except Exception:
        return ""


def _hafas_to_minutes(time_str):
    """HAFAS Zeit (HHMMSS oder DDHHMMSS) zu Minuten seit Mitternacht"""
    if len(time_str) >= 8:
        d = int(time_str[:2])
        h = int(time_str[2:4])
        m = int(time_str[4:6])
        return d * 1440 + h * 60 + m
    h = int(time_str[:2])
    m = int(time_str[2:4])
    return h * 60 + m


def _parse_hafas_time(time_str, ref_date=None):
    """HAFAS Zeitstring zu HH:MM parsen.
    Format: HHMMSS (6-stellig) oder DDHHMMSS (8-stellig, DD = Tagesoffset)
    """
    if not time_str or len(time_str) < 4:
        return ""
    try:
        if len(time_str) >= 8:
            # DDHHMMSS — DD ist Tagesoffset (01 = nächster Tag)
            h = int(time_str[2:4])
            m = int(time_str[4:6])
        else:
            # HHMMSS
            h = int(time_str[:2])
            m = int(time_str[2:4])
        if h >= 24:
            h -= 24  # Nächster Tag
        return f"{h:02d}:{m:02d}"
    except (ValueError, IndexError):
        return ""


def _product_icon(product):
    """Produkttyp zu Icon-Bezeichnung"""
    mapping = {
        "nationalExpress": "ice",
        "national": "ic",
        "regionalExpress": "re",
        "regional": "rb",
        "suburban": "sbahn",
        "subway": "ubahn",
        "tram": "tram",
        "bus": "bus",
        "ferry": "faehre",
        "taxi": "taxi",
    }
    return mapping.get(product, "zug")


# ═══ Störungsmeldungen ════════════════════════════════════════════
# Bahn: NAH.SH HAFAS (HimSearch, deckt RE/RB inkl. DB Regio ab)
# Bus:  Stadtverkehr/Stadtwerke Lübeck (Storyblok-CMS, öffentlicher Read-Token)

SWL_STORYBLOK_TOKEN = "UDFTUVH6rpOAv9hnKKsl4gtt"  # öffentlicher CDN-Read-Token (aus swhl.de)
SWL_STORYBLOK_BASE = "https://api.storyblok.com/v2/cdn"

_LINE_RE = re.compile(r'\b(RE|RB|X|SH|ME|AKN|ERB|NBE|S)\s?-?\s?(\d{1,3})\b')


def _normalize_line(s):
    return (s or '').upper().replace(' ', '').replace('-', '').strip()


def _extract_lines_from_text(text):
    out = set()
    for m in _LINE_RE.finditer(text or ''):
        out.add((m.group(1) + m.group(2)).upper())
    return out


_IMG_URL_RE = re.compile(r'(https?://[^\s"\'<>]+?\.(?:png|jpe?g|gif|webp))', re.I)


def _clean_html_text(raw):
    """Störungs-Text von HTML befreien und ggf. eingebettetes Bild (z.B. Umleitungskarte) extrahieren.
    Gibt (sauberer_text, bild_url) zurück."""
    if not raw:
        return '', ''
    s = str(raw)
    m = _IMG_URL_RE.search(s)
    img = m.group(1) if m else ''
    s = re.sub(r'(?i)<br\s*/?>', ' · ', s)      # Zeilenumbrüche → Trenner
    s = re.sub(r'<[^>]+>', '', s)                # restliche Tags entfernen
    s = _html.unescape(s)                        # &amp; etc.
    s = re.sub(r'(?:\s*·\s*){2,}', ' · ', s)     # doppelte Trenner zusammenfassen
    s = re.sub(r'\s+', ' ', s).strip(' ·\t\n')
    return s, img


def _him_text(m):
    cands = []
    if m.get('text'):
        cands.append(m['text'])
    for grp in m.get('texts', []) or []:
        for t in grp.get('texts', []) or []:
            if t.get('text'):
                cands.append(t['text'])
    return max(cands, key=len) if cands else ''


def _him_date(d, t):
    d = str(d or '')
    if len(d) < 8:
        return ''
    s = f"{d[6:8]}.{d[4:6]}.{d[0:4]}"
    t = str(t or '')
    if len(t) >= 4:
        s += f" {t[0:2]}:{t[2:4]}"
    return s


def _stoerung_id(quelle, titel, text):
    """Stabile Kurz-ID einer Störung (für Ausblenden). Bleibt gleich solange Inhalt gleich;
    verschwindet die Meldung beim Anbieter, verschwindet die ID → Ausblendung wird auto-bereinigt."""
    import hashlib
    key = f"{quelle}|{(titel or '').strip()}|{(text or '').strip()[:120]}"
    return hashlib.md5(key.encode('utf-8')).hexdigest()[:12]


def fetch_stoerungen_nahsh(linien_filter=None, max_num=200):
    """Zug-Störungen/Baumaßnahmen aus NAH.SH HAFAS (HimSearch), gefiltert auf Linien."""
    wanted = {_normalize_line(x) for x in (linien_filter or []) if x}
    try:
        res = _nahsh_rpc('HimSearch', {'maxNum': max_num})
    except Exception:
        return []
    out, seen = [], set()
    for m in res.get('msgL', []) or []:
        head = (m.get('head') or '').strip().rstrip('.')
        raw_text = _him_text(m)
        text, bild = _clean_html_text(raw_text)
        head = _clean_html_text(head)[0] or head
        lines = _extract_lines_from_text(head + ' ' + raw_text)
        norm_lines = {_normalize_line(x) for x in lines}
        if wanted:
            if not (wanted & norm_lines):
                continue
        elif not lines:
            continue  # ohne Filter nur Meldungen mit erkennbarer Linie
        key = text[:120]
        if key in seen:
            continue
        seen.add(key)
        low = (head + ' ' + text).lower()
        typ = 'bauarbeiten' if ('bau' in low or 'sperr' in low) else 'stoerung'
        out.append({
            'id': _stoerung_id('bahn', head, text),
            'quelle': 'bahn', 'typ': typ,
            'titel': head or 'Störung', 'text': text,
            'linien': sorted(lines),
            'von': _him_date(m.get('sDate'), m.get('sTime')),
            'bis': _him_date(m.get('eDate'), m.get('eTime')),
            'prio': m.get('prio', 0),
            'all_lines': False, 'bild': bild, 'haltestellen': [], 'vorschlag': '',
        })
    out.sort(key=lambda x: -(x.get('prio') or 0))
    return out[:25]


def _swl_get(path):
    url = f"{SWL_STORYBLOK_BASE}/{path}{'&' if '?' in path else '?'}token={SWL_STORYBLOK_TOKEN}&version=published"
    req = urllib.request.Request(url, headers={'User-Agent': 'Stagedesk-Monitor/1.0'})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT + 3) as resp:
        return json.loads(resp.read())


def _swl_parse_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(str(s).strip()[:16], '%Y-%m-%d %H:%M').replace(tzinfo=ZoneInfo("Europe/Berlin"))
    except Exception:
        return None


def _swl_fmt(s):
    d = _swl_parse_date(s)
    return d.strftime('%d.%m.%Y %H:%M') if d else ''


def fetch_stoerungen_swl(linien_filter=None):
    """Bus-Störungen von Stadtverkehr/Stadtwerke Lübeck (Storyblok), gefiltert auf Linien."""
    wanted = {_normalize_line(x) for x in (linien_filter or []) if x}
    try:
        data = _swl_get('stories?starts_with=' + urllib.parse.quote('mobil/stoerungsmeldungen/')
                        + '&per_page=100&resolve_relations=TickerMessage.linien')
    except Exception:
        return []
    rels = {r.get('uuid'): r for r in data.get('rels', []) or []}
    now = datetime.now(ZoneInfo("Europe/Berlin"))
    out = []
    for st in data.get('stories', []) or []:
        c = st.get('content', {}) or {}
        if c.get('component') != 'TickerMessage':
            continue
        linien = []
        for lx in c.get('linien', []) or []:
            r = rels.get(lx) if isinstance(lx, str) else None
            nm = (r or {}).get('name') if r else None
            if nm:
                linien.append(str(nm))
        all_lines = bool(c.get('all_lines'))
        bis_dt = _swl_parse_date(c.get('enddate'))
        if bis_dt and bis_dt < now:
            continue  # abgelaufen
        if wanted and not all_lines and not (wanted & {_normalize_line(x) for x in linien}):
            continue
        title = _clean_html_text(c.get('title'))[0] or (c.get('title') or '').strip()
        text, text_img = _clean_html_text(c.get('maintext'))
        low = (title + ' ' + text).lower()
        typ = 'bauarbeiten' if ('bau' in low or 'sperr' in low) else 'stoerung'
        # Bild-Asset (z.B. Umleitungskarte) bevorzugt, sonst aus Text extrahiert
        img = c.get('image')
        bild = (img.get('filename') if isinstance(img, dict) else img) or text_img or ''
        # Betroffene Haltestellen / Alternativvorschlag (optional)
        stops = [str(s) for s in (c.get('stops') or []) if s] if isinstance(c.get('stops'), list) else []
        suggestion = (c.get('suggestion') or '').strip() if isinstance(c.get('suggestion'), str) else ''
        out.append({
            'id': _stoerung_id('bus', title, text),
            'quelle': 'bus', 'typ': typ,
            'titel': title or 'Störung', 'text': text,
            'linien': (['alle'] if all_lines else linien),
            'von': _swl_fmt(c.get('startdate')),
            'bis': _swl_fmt(c.get('enddate')),
            'highlighted': bool(c.get('highlighted')),
            'all_lines': all_lines,
            'bild': bild,
            'haltestellen': stops[:8],
            'vorschlag': suggestion,
        })
    out.sort(key=lambda x: (not x.get('highlighted'),))
    return out[:25]
