"""
ÖPNV Abfahrtsmonitor — Stationssuche & Abfahrten
Dual-API: DB REST (v6.db.transport.rest) + NAH.SH HAFAS (mgate.exe)
"""
import json
import urllib.request
import urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo

# Explizite Zeitzone — Server kann in UTC laufen, Abfahrten sind aber CET/CEST
TIMEZONE = ZoneInfo("Europe/Berlin")


# ═══ API Konfiguration ════════════════════════════════════════════

# DB REST API (wraps db-hafas, ganz Deutschland)
DB_REST_BASE = "https://v6.db.transport.rest"

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
        url = (
            f"{DB_REST_BASE}/locations"
            f"?query={urllib.parse.quote(query)}"
            f"&results={results}"
            f"&stops=true&addresses=false&poi=false"
            f"&language=de"
        )
        data = _get_json(url, timeout=REQUEST_TIMEOUT_SEARCH)
        out = []
        for loc in data:
            if loc.get("type") != "stop":
                continue
            sid = str(loc.get("id", ""))
            if not sid:
                continue
            products = loc.get("products", {})
            produkte = [k for k, v in products.items() if v]
            out.append({
                "id": sid,
                "name": loc.get("name", ""),
                "typ": _station_type(produkte),
                "quelle": "db",
                "produkte": produkte,
            })
        return out

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
                if zusatz_api in ("nahsh", "beide") or (zusatz_api == "" and zusatz_deps is None):
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

        abfahrten.sort(key=lambda d: d.get("abfahrt", ""))

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

def _fetch_departures_db(station_id, dauer, max_results, stopovers=False):
    """Abfahrten über DB REST API holen"""
    url = (
        f"{DB_REST_BASE}/stops/{urllib.parse.quote(str(station_id))}/departures"
        f"?duration={dauer}"
        f"&results={max_results}"
        f"&language=de"
        f"&stopovers={'true' if stopovers else 'false'}"
        f"&remarks=true"
    )
    data = _get_json(url)

    abfahrten = []
    items = data.get("departures", data) if isinstance(data, dict) else data
    for dep in items:
        parsed = _parse_db_departure(dep, include_stopovers=stopovers)
        if parsed:
            abfahrten.append(parsed)
    return abfahrten


def _parse_db_departure(dep, include_stopovers=False):
    """Ein Abfahrts-Objekt aus der DB REST API parsen"""
    try:
        line = dep.get("line", {}) or {}
        linie = line.get("name", "") or line.get("fahrtNr", "") or ""
        produkt = line.get("product", "") or ""
        richtung = dep.get("direction", "") or dep.get("provenance", "") or ""

        # Zeiten parsen
        geplant = dep.get("plannedWhen") or dep.get("when") or ""
        aktuell = dep.get("when") or geplant

        abfahrt_geplant = _parse_iso_time(geplant)
        abfahrt_aktuell = _parse_iso_time(aktuell)

        # Verspätung in Minuten
        verspaetung = dep.get("delay")
        if verspaetung is not None:
            verspaetung = verspaetung // 60
        else:
            verspaetung = 0

        gleis_aktuell = dep.get("platform") or ""
        gleis_geplant = dep.get("plannedPlatform") or ""
        gleis = gleis_aktuell or gleis_geplant
        gleis_geaendert = bool(gleis_aktuell and gleis_geplant and gleis_aktuell != gleis_geplant)
        cancelled = dep.get("cancelled", False)

        # Auslastung (DB liefert loadFactor: "low-to-medium", "high", "very-high", "exceptionally-high")
        load_factor = dep.get("loadFactor", "")

        # Bemerkungen
        remarks = dep.get("remarks", []) or []
        bemerkungen = []
        for r in remarks:
            if isinstance(r, dict) and r.get("type") in ("warning", "status"):
                text = r.get("summary") or r.get("text") or ""
                if text:
                    bemerkungen.append(text)

        # Linienfarbe aus API (DB liefert line.color.fg/bg)
        line_color = ""
        color_data = line.get("color", {}) or {}
        if isinstance(color_data, dict):
            # Priorität: bg (Hintergrundfarbe der Linie), dann fg
            bg = color_data.get("bg")
            fg = color_data.get("fg")
            if bg and bg != "#000000" and bg != "#ffffff":
                line_color = bg
            elif fg and fg != "#000000" and fg != "#ffffff":
                line_color = fg

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
        if load_factor:
            result["auslastung"] = load_factor

        # Stopovers (Zwischenhalte) für Via-Filter
        if include_stopovers:
            stopovers = dep.get("stopovers") or []
            result["stopovers"] = [
                (s.get("stop", {}) or {}).get("name", "")
                for s in stopovers
                if isinstance(s, dict) and (s.get("stop", {}) or {}).get("name")
            ]

        return result
    except Exception:
        return None


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
