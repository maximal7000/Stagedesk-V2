import logging
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from .common import REQUEST_TIMEOUT, TIMEZONE
from . import db as db_api
from .db import _fetch_departures_db, _fetch_sbahn_meta
from .nahsh import _fetch_departures_nahsh

logger = logging.getLogger('signage.transit')


# DB Timetables knows only railway stations (EVA numbers, 80xxxxx in Germany) and answers
# 400 for NAH.SH bus stop numbers.
_EVA_RE = re.compile(r"^80\d{5}$")


def _is_eva(station_id):
    return bool(_EVA_RE.match(str(station_id or "").strip()))


def _minutes_ahead(hhmm, now):
    try:
        h, m = map(int, str(hhmm).split(":")[:2])
    except (ValueError, TypeError):
        return None
    return h * 60 + m - (now.hour * 60 + now.minute)


def departure_visible(dep, now, walk_minutes):
    """Reachable by the actual time. Without real-time data the planned time is
    all there is, and it stays visible for one minute past it when no walk applies."""
    planned = dep.get("departure")
    actual = planned if dep.get("cancelled") else (dep.get("departure_actual") or planned)
    ahead = _minutes_ahead(actual, now)
    if ahead is None:
        return True
    # The look-ahead is capped at 240 min, so a gap beyond 12 h is a day change
    if ahead < -720:
        ahead += 1440
    elif ahead > 720:
        ahead -= 1440
    if dep.get("realtime", False):
        return ahead >= walk_minutes
    return ahead >= (walk_minutes if walk_minutes > 0 else -1)


def fetch_departures(stops, duration=60, max_per_stop=20,
                     show_bus=True, show_rail=True, show_long_distance=True,
                     use_db=True, use_nahsh=True, show_via=False,
                     strike_lines=None, strike_types=None):
    """DB first, NAH.SH HAFAS as fallback. Per-stop product filters
    (show_bus/show_rail/show_long_distance) override the global defaults."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    errors = set()

    def _stop_sources(station):
        source = station.get("source", "")
        if source == "db":
            return True, False
        if source == "nahsh":
            return False, True
        if source == "both":
            return True, True
        return use_db and _is_eva(station.get("id")), use_nahsh

    def _extra_uses_db(station):
        source = station.get("extra_source", "")
        return source in ("db", "both") or (source == "" and _is_eva(station.get("extra_id")))

    def _fetch_single(station, index):
        station_id = station.get("id", "")
        station_name = station.get("name", "")
        filter_lines = station.get("filter_lines", [])
        filter_direction = station.get("filter_direction", "")
        filter_via = station.get("filter_via", "").strip()
        column = station.get("column")

        # Per-stop API choice: "db", "nahsh", "both" (default: global setting)
        station_source = station.get("source", "")
        st_use_db, st_use_nahsh = _stop_sources(station)

        st_bus = station.get("show_bus", show_bus)
        st_rail = station.get("show_rail", show_rail)
        st_long_distance = station.get("show_long_distance", show_long_distance)

        if not station_id:
            return None

        raw_departures = None
        error = None

        need_stopovers = bool(filter_via) or show_via

        if st_use_db:
            failed = []
            try:
                raw_departures = _fetch_departures_db(station_id, duration, max_per_stop * 2,
                                                      stopovers=need_stopovers, failed=failed)
            except Exception as e:
                logger.warning(f"DB Abfahrten Fehler ({station_name}): {e}")
                failed = ["all"]
                # Stopovers can cause 500s: retry without them
                if need_stopovers:
                    failed = []
                    try:
                        raw_departures = _fetch_departures_db(station_id, duration, max_per_stop * 2,
                                                              stopovers=False, failed=failed)
                        logger.info(f"DB Fallback ohne Stopovers OK ({station_name})")
                    except Exception as e2:
                        logger.warning(f"DB Fallback Fehler ({station_name}): {e2}")
                        failed = ["all"]
            if failed:
                errors.add("db")

        # S-Bahn from the meta EVA (opt-in): large stations split the S-Bahn off
        if st_use_db and station.get("show_suburban", False) and raw_departures:
            try:
                sbahn_deps = _fetch_sbahn_meta(station_id, duration, max_per_stop * 2, stopovers=need_stopovers)
                existing = {(d["line"], d["departure"], d["direction"]) for d in raw_departures}
                for d in sbahn_deps:
                    k = (d["line"], d["departure"], d["direction"])
                    if k not in existing:
                        existing.add(k)
                        raw_departures.append(d)
                # Pre-sort by time, otherwise the max cap (before the final sort) cuts off
                # the appended S-Bahn rows again.
                _n = datetime.now(TIMEZONE)
                _nm = _n.hour * 60 + _n.minute

                def _rawmin(d):
                    try:
                        h, m = map(int, str(d.get("departure", "99:99")).split(":")[:2])
                        diff = h * 60 + m - _nm
                        return diff + 1440 if diff < -120 else diff
                    except (ValueError, TypeError):
                        return 99999
                raw_departures.sort(key=_rawmin)
            except Exception as e:
                logger.warning(f"S-Bahn-Merge Fehler ({station_name}): {e}")
                errors.add("db")

        if st_use_nahsh and (raw_departures is None or len(raw_departures) == 0 or station_source == "both"):
            try:
                nahsh_deps = _fetch_departures_nahsh(station_id, duration, max_per_stop * 2, stopovers=need_stopovers)
                if nahsh_deps is not None:
                    if raw_departures is None:
                        raw_departures = nahsh_deps
                    else:
                        existing_keys = {(d["line"], d["departure"]) for d in raw_departures}
                        for dep in nahsh_deps:
                            if (dep["line"], dep["departure"]) not in existing_keys:
                                raw_departures.append(dep)
            except Exception as e:
                logger.warning(f"NAH.SH Abfahrten Fehler ({station_name}): {e}")
                errors.add("nahsh")
                if raw_departures is None:
                    error = str(e)

        if raw_departures is None:
            raw_departures = []

        extra_id = station.get("extra_id", "").strip()
        extra_source = station.get("extra_source", "")
        if extra_id:
            try:
                extra_deps = None
                if _extra_uses_db(station):
                    extra_failed = []
                    try:
                        extra_deps = _fetch_departures_db(extra_id, duration, max_per_stop * 2,
                                                          stopovers=False, failed=extra_failed)
                    except Exception:
                        extra_failed = ["all"]
                    if extra_failed:
                        errors.add("db")
                # NAH.SH: when asked for explicitly, for "both", or when DB returned nothing
                if extra_source in ("nahsh", "both") or (extra_source == "" and not extra_deps):
                    try:
                        nahsh_z = _fetch_departures_nahsh(extra_id, duration, max_per_stop * 2, stopovers=False)
                        if nahsh_z is not None:
                            if extra_deps is None:
                                extra_deps = nahsh_z
                            else:
                                existing_keys = {(d["line"], d["departure"]) for d in extra_deps}
                                for dep in nahsh_z:
                                    if (dep["line"], dep["departure"]) not in existing_keys:
                                        extra_deps.append(dep)
                    except Exception:
                        errors.add("nahsh")
                if extra_deps:
                    z_bus = station.get("extra_show_bus", True)
                    z_rail = station.get("extra_show_rail", True)
                    z_long_distance = station.get("extra_show_long_distance", True)
                    z_suburban = station.get("extra_show_suburban", True)
                    z_subway = station.get("extra_show_subway", True)
                    z_tram = station.get("extra_show_tram", True)
                    z_ferry = station.get("extra_show_ferry", True)
                    filtered_extra = []
                    for dep in extra_deps:
                        kind = dep.get("kind", "")
                        if kind in ("bus",) and not z_bus:
                            continue
                        if kind in ("regional", "regionalExpress") and not z_rail:
                            continue
                        if kind in ("suburban",) and not z_suburban:
                            continue
                        if kind in ("subway",) and not z_subway:
                            continue
                        if kind in ("tram",) and not z_tram:
                            continue
                        if kind in ("ferry",) and not z_ferry:
                            continue
                        if kind in ("nationalExpress", "national") and not z_long_distance:
                            continue
                        filtered_extra.append(dep)
                    existing_keys = {(d["line"], d["departure"]) for d in raw_departures}
                    for dep in filtered_extra:
                        if (dep["line"], dep["departure"]) not in existing_keys:
                            raw_departures.append(dep)
                    logger.info(f"Zusatz-Station {extra_id} lieferte {len(filtered_extra)} Abfahrten für {station_name}")
            except Exception as e:
                logger.warning(f"Zusatz-Station Fehler ({station_name}): {e}")

        now = datetime.now(TIMEZONE)

        departures = []
        for dep in raw_departures:
            kind = dep.get("kind", "")
            if kind in ("bus",) and not st_bus:
                continue
            if kind in ("regional", "regionalExpress") and not st_rail:
                continue
            if kind in ("suburban",) and not station.get("show_suburban", True):
                continue
            if kind in ("subway",) and not station.get("show_subway", True):
                continue
            if kind in ("tram",) and not station.get("show_tram", True):
                continue
            if kind in ("ferry",) and not station.get("show_ferry", True):
                continue
            if kind in ("nationalExpress", "national") and not st_long_distance:
                continue
            if strike_lines:
                line_lower = dep["line"].strip().lower()
                if any(sl.strip().lower() == line_lower for sl in strike_lines):
                    continue
                # Number match too: "Bus 1" matches "1"
                line_parts = line_lower.split()
                line_number = line_parts[-1] if line_parts else line_lower
                if any(sl.strip().lower() == line_number for sl in strike_lines):
                    continue
            if strike_types:
                kind_icon = dep.get("kind_icon", "")
                # "re" also hides "rb", "ice" also "ic"
                if kind_icon in strike_types:
                    continue
                if 're' in strike_types and kind_icon == 'rb':
                    continue
                if 'ice' in strike_types and kind_icon == 'ic':
                    continue

            if filter_lines and len(filter_lines) > 0:
                line_lower = dep["line"].strip().lower()
                line_parts = line_lower.split()
                line_number = line_parts[-1] if line_parts else line_lower
                if not any(
                    fl.lower() == line_lower or fl.lower() == line_number
                    for fl in filter_lines
                ):
                    continue
            if filter_direction:
                if filter_direction.lower() not in dep["direction"].lower():
                    continue
            if filter_via:
                via_stops = dep.get("stopovers", [])
                via_lower = filter_via.lower()
                if not any(via_lower in h.lower() for h in via_stops):
                    continue

            # The walk filter runs per request in the display payload
            if not departure_visible(dep, now, 0):
                continue

            if show_via:
                cleaned = dict(dep)
            else:
                cleaned = {k: v for k, v in dep.items() if k != "stopovers"}
            departures.append(cleaned)
            if len(departures) >= max_per_stop:
                break

        # Day-aware sort: "00:03" goes last, not first
        # (plain string sort put trains after midnight on top).
        _now = datetime.now(ZoneInfo("Europe/Berlin"))
        _now_min = _now.hour * 60 + _now.minute

        def _dep_sortmin(d):
            t = d.get("departure") or d.get("departure_actual") or "99:99"
            try:
                h, m = map(int, str(t).split(":")[:2])
                diff = h * 60 + m - _now_min
                if diff < -120:  # already after midnight -> next day
                    diff += 1440
                return diff
            except (ValueError, TypeError):
                return 99999

        departures.sort(key=_dep_sortmin)

        entry = {
            "station_name": station_name,
            "station_id": station_id,
            "departures": departures,
            "index": index,
            "column": column if isinstance(column, int) and not isinstance(column, bool) else None,
            "split_modes": bool(station.get("split_modes", True)),
        }
        if error:
            entry["error"] = error
        return entry

    valid = [(i, s) for i, s in enumerate(stops) if s.get("id")]

    def _status(name, active):
        if not active:
            return "off"
        return "error" if name in errors else "ok"

    def _result(stations):
        db_active = bool(db_api.DB_TT_CLIENT_ID and db_api.DB_TT_API_KEY) and any(
            _stop_sources(s)[0] or (s.get("extra_id", "").strip() and _extra_uses_db(s))
            for _, s in valid)
        nahsh_active = any(
            _stop_sources(s)[1] or (s.get("extra_id", "").strip() and s.get("extra_source", "") != "db")
            for _, s in valid)
        return {"stations": stations,
                "sources": {"db": _status("db", db_active), "nahsh": _status("nahsh", nahsh_active)}}

    if not valid:
        return _result([])

    if len(valid) == 1:
        result = _fetch_single(valid[0][1], valid[0][0])
        return _result([result] if result else [])

    results = [None] * len(valid)
    with ThreadPoolExecutor(max_workers=min(len(valid), 4)) as pool:
        futures = {pool.submit(_fetch_single, s, i): pos for pos, (i, s) in enumerate(valid)}
        for fut in as_completed(futures, timeout=REQUEST_TIMEOUT + 2):
            pos = futures[fut]
            try:
                results[pos] = fut.result()
            except Exception as e:
                logger.warning(f"Station-Fetch Fehler: {e}")

    return _result([e for e in results if e is not None])
