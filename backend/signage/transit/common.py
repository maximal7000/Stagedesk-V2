"""Shared constants and helpers of the transit package."""
import json
import urllib.request
from zoneinfo import ZoneInfo


# Explizite Zeitzone — Server kann in UTC laufen, Abfahrten sind aber CET/CEST
TIMEZONE = ZoneInfo("Europe/Berlin")


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
