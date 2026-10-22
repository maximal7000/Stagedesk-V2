"""Disruption messages: rail from NAH.SH HAFAS, bus from Stadtverkehr Luebeck (Storyblok)."""
import hashlib
import html as _html
import json
import logging
import re
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings

from .common import REQUEST_TIMEOUT
from .nahsh import _nahsh_rpc

logger = logging.getLogger('signage.transit')


# Rail: NAH.SH HAFAS (HimSearch, covers RE/RB incl. DB Regio)
# Bus: Stadtverkehr/Stadtwerke Lübeck (Storyblok CMS, public read token)

# The token comes from settings.SWHL_STORYBLOK_TOKEN (.env) at runtime
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
    """Strip HTML from a disruption text and extract an embedded image (e.g. detour map).
    Returns (text, image_url)."""
    if not raw:
        return '', ''
    s = str(raw)
    m = _IMG_URL_RE.search(s)
    img = m.group(1) if m else ''
    s = re.sub(r'(?i)<br\s*/?>', ' · ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = _html.unescape(s)
    s = re.sub(r'(?:\s*·\s*){2,}', ' · ', s)
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


def disruption_id(source, title, text):
    """Stable short ID of a disruption (for hiding). Unchanged while the content is unchanged;
    when the provider drops the message the ID disappears and the hidden entry is pruned.
    `source` is the old source key ('bahn', 'bus', 'manuell'), not the response value,
    so the IDs in transit_disruption_hidden stay valid."""
    key = f"{source}|{(title or '').strip()}|{(text or '').strip()[:120]}"
    return hashlib.md5(key.encode('utf-8')).hexdigest()[:12]


def fetch_disruptions_nahsh(line_filter=None, max_num=200):
    wanted = {_normalize_line(x) for x in (line_filter or []) if x}
    try:
        res = _nahsh_rpc('HimSearch', {'maxNum': max_num}) or {}
    except Exception:
        return []
    out, seen = [], set()
    for m in res.get('msgL', []) or []:
        head = (m.get('head') or '').strip().rstrip('.')
        raw_text = _him_text(m)
        text, image = _clean_html_text(raw_text)
        head = _clean_html_text(head)[0] or head
        lines = _extract_lines_from_text(head + ' ' + raw_text)
        norm_lines = {_normalize_line(x) for x in lines}
        if wanted:
            if not (wanted & norm_lines):
                continue
        elif not lines:
            continue  # without a filter only messages with a recognisable line
        key = text[:120]
        if key in seen:
            continue
        seen.add(key)
        low = (head + ' ' + text).lower()
        kind = 'construction' if ('bau' in low or 'sperr' in low) else 'disruption'
        out.append({
            # Hash input keeps the old source key 'bahn' (hidden list)
            'id': disruption_id('bahn', head, text),
            'source': 'nahsh', 'kind': kind,
            'title': head or 'Störung', 'text': text,
            'lines': sorted(lines),
            'from': _him_date(m.get('sDate'), m.get('sTime')),
            'until': _him_date(m.get('eDate'), m.get('eTime')),
            'prio': m.get('prio', 0),
            'all_lines': False, 'image': image, 'stops': [], 'suggestion': '',
        })
    out.sort(key=lambda x: -(x.get('prio') or 0))
    return out[:25]


def _swl_get(path):
    """Without a configured token: None (no data)."""
    token = getattr(settings, "SWHL_STORYBLOK_TOKEN", "")
    if not token:
        logger.warning("SWHL_STORYBLOK_TOKEN ist nicht gesetzt, Bus-Störungen werden übersprungen.")
        return None
    url = f"{SWL_STORYBLOK_BASE}/{path}{'&' if '?' in path else '?'}token={token}&version=published"
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


def fetch_disruptions_swl(line_filter=None):
    wanted = {_normalize_line(x) for x in (line_filter or []) if x}
    try:
        data = _swl_get('stories?starts_with=' + urllib.parse.quote('mobil/stoerungsmeldungen/')
                        + '&per_page=100&resolve_relations=TickerMessage.linien')
    except Exception:
        return []
    if not data:
        return []
    rels = {r.get('uuid'): r for r in data.get('rels', []) or []}
    now = datetime.now(ZoneInfo("Europe/Berlin"))
    out = []
    for st in data.get('stories', []) or []:
        c = st.get('content', {}) or {}
        if c.get('component') != 'TickerMessage':
            continue
        lines = []
        for lx in c.get('linien', []) or []:
            r = rels.get(lx) if isinstance(lx, str) else None
            nm = (r or {}).get('name') if r else None
            if nm:
                lines.append(str(nm))
        all_lines = bool(c.get('all_lines'))
        until_dt = _swl_parse_date(c.get('enddate'))
        if until_dt and until_dt < now:
            continue
        if wanted and not all_lines and not (wanted & {_normalize_line(x) for x in lines}):
            continue
        title = _clean_html_text(c.get('title'))[0] or (c.get('title') or '').strip()
        text, text_img = _clean_html_text(c.get('maintext'))
        low = (title + ' ' + text).lower()
        kind = 'construction' if ('bau' in low or 'sperr' in low) else 'disruption'
        # Prefer the image asset (e.g. detour map), otherwise extract from the text
        img = c.get('image')
        image = (img.get('filename') if isinstance(img, dict) else img) or text_img or ''
        stops = [str(s) for s in (c.get('stops') or []) if s] if isinstance(c.get('stops'), list) else []
        suggestion = (c.get('suggestion') or '').strip() if isinstance(c.get('suggestion'), str) else ''
        out.append({
            # Hash input keeps the old source key 'bus' (hidden list)
            'id': disruption_id('bus', title, text),
            'source': 'swl', 'kind': kind,
            'title': title or 'Störung', 'text': text,
            'lines': (['all'] if all_lines else lines),
            'from': _swl_fmt(c.get('startdate')),
            'until': _swl_fmt(c.get('enddate')),
            'highlighted': bool(c.get('highlighted')),
            'all_lines': all_lines,
            'image': image,
            'stops': stops[:8],
            'suggestion': suggestion,
        })
    out.sort(key=lambda x: (not x.get('highlighted'),))
    return out[:25]
