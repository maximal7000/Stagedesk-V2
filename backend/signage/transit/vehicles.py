"""Live vehicle positions from NAH.SH (HAFAS JourneyGeoPos) for the map side.

HAFAS calculates the positions from the timetable plus the real-time delays along the route; there are no
GPS reports for Lübeck. Each vehicle comes with its positions for the next 30 seconds in 5-second steps, so
the screen animates between two requests."""
import logging
import math
from datetime import datetime

from django.core.cache import cache

from .common import TIMEZONE
from .nahsh import NAHSH_PRODUCTS, _nahsh_rpc

logger = logging.getLogger('signage.transit')

STEP_MS = 5000
PERIOD_MS = 30000
CACHE_SECONDS = 15
# A screen shows a few kilometres; larger boxes would only load HAFAS
MAX_SPAN = 0.4


def line_key(name):
    """"Bus    9", "Bus 9" and "9" are the same line; "SEV RE83" stays."""
    text = ' '.join(str(name or '').split())
    for prefix in ('Bus ', 'STR ', 'Tram '):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text.upper()


def decode_polyline(text):
    """Google polyline (precision 5), as HAFAS sends it in `crdEncYX`."""
    points, index, lat, lon = [], 0, 0, 0
    while index < len(text):
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                if index >= len(text):
                    return points
                byte = ord(text[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lon += deltas[1]
        points.append([round(lat / 1e5, 5), round(lon / 1e5, 5)])
    return points


def _kind(product):
    cls = product.get('cls') or 0
    for bit, name in NAHSH_PRODUCTS.items():
        if cls == 1 << bit:
            return 'bus' if 'bus' in name.lower() else name
    return 'bus'


def _line(product):
    context = product.get('prodCtx') or {}
    line = (context.get('line') or '').strip()
    if line:
        return line
    name = ' '.join((product.get('name') or '').split())
    return name.removeprefix('Bus ').strip()


def parse_vehicles(res):
    common = res.get('common') or {}
    products = common.get('prodL') or []
    polys = common.get('polyL') or []
    vehicles = []
    for journey in res.get('jnyL') or []:
        product = products[journey['prodX']] if isinstance(journey.get('prodX'), int) and journey['prodX'] < len(products) else {}
        pos = journey.get('pos') or {}
        if 'x' not in pos or 'y' not in pos:
            continue
        frames = []
        for poly_index in ((journey.get('ani') or {}).get('polyG') or {}).get('polyXL') or []:
            if isinstance(poly_index, int) and poly_index < len(polys):
                frames = decode_polyline(polys[poly_index].get('crdEncYX') or '')
                break
        if not frames:
            frames = [[round(pos['y'] / 1e6, 5), round(pos['x'] / 1e6, 5)]]
        name = ' '.join((product.get('name') or '').split())
        replacement = name.startswith('SEV')
        line = _line(product)
        if replacement and not line.startswith('SEV'):
            line = f'SEV {line}'
        vehicles.append({
            'id': journey.get('jid') or '',
            'line': line,
            'key': line_key(line),
            'direction': journey.get('dirTxt') or '',
            'kind': _kind(product),
            'replacement': replacement,
            'frames': frames,
        })
    return vehicles


def round_bbox(bbox):
    """(south, west, north, east) widened onto a 0.005 degree grid, so screens with the same view share a
    request."""
    south, west, north, east = bbox
    steps = 200  # 1 / 0.005
    down = lambda value: math.floor(round(value * steps, 6)) / steps
    up = lambda value: math.ceil(round(value * steps, 6)) / steps
    return down(south), down(west), up(north), up(east)


def fetch_vehicles(bbox, now=None):
    """Raises on a HAFAS error; without an AID an empty list."""
    south, west, north, east = round_bbox(bbox)
    key = f'signage:vehicles:{south}:{west}:{north}:{east}'
    cached = cache.get(key)
    if cached is not None:
        return cached
    now = now or datetime.now(TIMEZONE)
    coord = lambda value: int(round(value * 1e6))
    res = _nahsh_rpc('JourneyGeoPos', {
        'rect': {'llCrd': {'x': coord(west), 'y': coord(south)}, 'urCrd': {'x': coord(east), 'y': coord(north)}},
        'perSize': PERIOD_MS, 'perStep': STEP_MS, 'onlyRT': False, 'jnyFltrL': [], 'trainPosMode': 'CALC',
        'date': now.strftime('%Y%m%d'), 'time': now.strftime('%H%M%S'), 'maxJny': 200,
    })
    result = {'vehicles': parse_vehicles(res) if res else [], 'step_ms': STEP_MS,
              'fetched_at': now.isoformat(timespec='seconds')}
    cache.set(key, result, CACHE_SECONDS)
    return result
