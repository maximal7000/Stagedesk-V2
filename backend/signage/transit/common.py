import json
import urllib.request
from zoneinfo import ZoneInfo


# Explicit zone: the server may run in UTC, departures are CET/CEST
TIMEZONE = ZoneInfo("Europe/Berlin")


REQUEST_TIMEOUT = 5       # seconds per API request
REQUEST_TIMEOUT_SEARCH = 4


def _get_json(url, timeout=None):
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "Stagedesk-Monitor/1.0",
    })
    with urllib.request.urlopen(req, timeout=timeout or REQUEST_TIMEOUT) as resp:
        return json.loads(resp.read())


def _product_icon(product):
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
