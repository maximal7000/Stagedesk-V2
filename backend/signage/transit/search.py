"""Station search across DB Timetables and NAH.SH HAFAS."""
import logging
import urllib.parse

from . import db
from .common import REQUEST_TIMEOUT_SEARCH
from .db import _db_tt_get
from .nahsh import _nahsh_products_from_bitmask, _nahsh_rpc

logger = logging.getLogger('signage.transit')


def search_stations(query, results=10, use_db=True, use_nahsh=True):
    """Queries DB and NAH.SH HAFAS in parallel.
    Returns [{"id": "...", "name": "...", "kind": "...", "source": "...", "products": [...]}]"""
    if not query or len(query) < 2:
        return []
    if not use_db and not use_nahsh:
        return []

    from concurrent.futures import ThreadPoolExecutor, as_completed

    db_results = []
    nahsh_results = []

    def _search_db():
        # DB Timetables /station/{pattern} -> EVA numbers
        if not db.DB_TT_CLIENT_ID:
            return []
        root = _db_tt_get(f"/station/{urllib.parse.quote(query)}", timeout=REQUEST_TIMEOUT_SEARCH)
        out = []
        for st in root.findall("station"):
            eva = st.get("eva")
            name = st.get("name")
            if not eva or not name:
                continue
            # DB Timetables only returns railway stations
            products = ["nationalExpress", "national", "regionalExpress", "regional", "suburban"]
            out.append({
                "id": str(eva),
                "name": name,
                "kind": "station",
                "source": "db",
                "products": products,
            })
        return out[:results]

    def _search_nahsh():
        res = _nahsh_rpc("LocMatch", {
            "input": {
                "field": "S",
                "loc": {"name": f"{query}?", "type": "S"},
                "maxLoc": results,
            },
        }) or {}
        matches = res.get("match", {}).get("locL", [])
        out = []
        for loc in matches:
            if loc.get("type") != "S":
                continue
            sid = str(loc.get("extId", ""))
            if not sid:
                # Fallback: parse lid "A=1@O=...@L=8000199@..."
                lid = loc.get("lid", "")
                if "@L=" in lid:
                    sid = lid.split("@L=")[1].split("@")[0]
            if not sid:
                continue
            products = _nahsh_products_from_bitmask(loc.get("pCls"))
            out.append({
                "id": sid,
                "name": loc.get("name", ""),
                "kind": _station_type(products),
                "source": "nahsh",
                "products": products,
            })
        return out

    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_db = pool.submit(_search_db) if use_db else None
        fut_nahsh = pool.submit(_search_nahsh) if use_nahsh else None

        if fut_db:
            try:
                db_results = fut_db.result(timeout=REQUEST_TIMEOUT_SEARCH + 1)
            except Exception as e:
                logger.warning(f"DB Stationssuche Fehler: {e}")

        if fut_nahsh:
            try:
                nahsh_results = fut_nahsh.result(timeout=REQUEST_TIMEOUT_SEARCH + 1)
            except Exception as e:
                logger.warning(f"NAH.SH Stationssuche Fehler: {e}")

    # Merge: DB first, NAH.SH fills in
    combined = {}
    for s in db_results:
        combined[s["id"]] = s
    for s in nahsh_results:
        if s["id"] not in combined:
            combined[s["id"]] = s
        else:
            existing = combined[s["id"]]
            for p in s["products"]:
                if p not in existing["products"]:
                    existing["products"].append(p)
            if "nahsh" not in existing["source"]:
                existing["source"] = "db+nahsh"

    stops = list(combined.values())[:results]
    return stops


def _station_type(products):
    if any(p in products for p in ["nationalExpress", "national"]):
        return "long_distance"
    if any(p in products for p in ["regionalExpress", "regional", "suburban"]):
        return "regional"
    if any(p in products for p in ["subway", "tram"]):
        return "urban"
    if any(p in products for p in ["bus", "ferry", "taxi"]):
        return "bus"
    return "other"
