import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from .common import REQUEST_TIMEOUT, TIMEZONE
from .db import _fetch_departures_db, _fetch_sbahn_meta
from .nahsh import _fetch_departures_nahsh

logger = logging.getLogger('signage.transit')


def fetch_departures(stops, duration=60, max_per_stop=20,
                     show_bus=True, show_rail=True, show_long_distance=True,
                     use_db=True, use_nahsh=True, show_via=False,
                     strike_lines=None, strike_types=None):
    """DB first, NAH.SH HAFAS as fallback. Per-stop product filters
    (show_bus/show_rail/show_long_distance) override the global defaults."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _fetch_single(station):
        station_id = station.get("id", "")
        station_name = station.get("name", "")
        filter_lines = station.get("filter_lines", [])
        filter_direction = station.get("filter_direction", "")
        filter_via = station.get("filter_via", "").strip()
        walk_minutes = station.get("walk_minutes", 0)

        # Per-stop API choice: "db", "nahsh", "both" (default: global setting)
        station_source = station.get("source", "")
        if station_source == "db":
            st_use_db, st_use_nahsh = True, False
        elif station_source == "nahsh":
            st_use_db, st_use_nahsh = False, True
        elif station_source == "both":
            st_use_db, st_use_nahsh = True, True
        else:
            st_use_db, st_use_nahsh = use_db, use_nahsh

        st_bus = station.get("show_bus", show_bus)
        st_rail = station.get("show_rail", show_rail)
        st_long_distance = station.get("show_long_distance", show_long_distance)

        if not station_id:
            return None

        raw_departures = None
        error = None

        need_stopovers = bool(filter_via) or show_via

        if st_use_db:
            try:
                raw_departures = _fetch_departures_db(station_id, duration, max_per_stop * 2, stopovers=need_stopovers)
            except Exception as e:
                logger.warning(f"DB Abfahrten Fehler ({station_name}): {e}")
                # Stopovers can cause 500s: retry without them
                if need_stopovers:
                    try:
                        raw_departures = _fetch_departures_db(station_id, duration, max_per_stop * 2, stopovers=False)
                        logger.info(f"DB Fallback ohne Stopovers OK ({station_name})")
                    except Exception as e2:
                        logger.warning(f"DB Fallback Fehler ({station_name}): {e2}")

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
                if raw_departures is None:
                    error = str(e)

        if raw_departures is None:
            raw_departures = []

        extra_id = station.get("extra_id", "").strip()
        extra_source = station.get("extra_source", "")
        if extra_id:
            try:
                extra_deps = None
                if extra_source in ("db", "both", ""):
                    try:
                        extra_deps = _fetch_departures_db(extra_id, duration, max_per_stop * 2, stopovers=False)
                    except Exception:
                        pass
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
                        pass
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

            # Walking-time filter: drop departures within the walking time,
            # using departure_actual (real departure time) when present
            walk_ref_time = dep.get("departure_actual") or dep.get("departure")
            if walk_minutes > 0 and walk_ref_time:
                try:
                    dep_time = datetime.strptime(walk_ref_time, "%H:%M").replace(
                        year=now.year, month=now.month, day=now.day,
                        tzinfo=TIMEZONE
                    )
                    diff_min = (dep_time - now).total_seconds() / 60
                    # Only correct the day rollover when > 12 h in the past
                    # (departure just after midnight, now just before midnight)
                    if diff_min < -720:
                        diff_min += 1440
                    if diff_min < walk_minutes:
                        continue
                except (ValueError, TypeError):
                    pass

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
        }
        if walk_minutes > 0:
            entry["walk_minutes"] = walk_minutes
        if error:
            entry["error"] = error
        return entry

    valid = [s for s in stops if s.get("id")]
    if not valid:
        return []

    if len(valid) == 1:
        result = _fetch_single(valid[0])
        return [result] if result else []

    results = [None] * len(valid)
    with ThreadPoolExecutor(max_workers=min(len(valid), 4)) as pool:
        futures = {pool.submit(_fetch_single, s): i for i, s in enumerate(valid)}
        for fut in as_completed(futures, timeout=REQUEST_TIMEOUT + 2):
            idx = futures[fut]
            try:
                results[idx] = fut.result()
            except Exception as e:
                logger.warning(f"Station-Fetch Fehler: {e}")

    return [e for e in results if e is not None]
