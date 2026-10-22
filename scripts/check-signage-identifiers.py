#!/usr/bin/env python3
"""Findet deutsche Bezeichner im Signage-Code (Glossar §3 der Schritt-0-Spec).

Aufruf: python3 -I scripts/check-signage-identifiers.py [--allow DATEI] [PFAD ...]
Exit 0 = sauber, 1 = Funde (Ausgabe "datei:zeile: token"), 2 = Pfad fehlt.
Ohne Pfade wird der Standardumfang relativ zum Repo-Root geprueft.
"""
import ast
import io
import re
import sys
import tokenize
from pathlib import Path

STEMS = ['zeige', 'bildschirm', 'klausur', 'ankuendigung', 'oepnv', 'abfahrt', 'stoerung', 'profil',
         'notfall', 'ferien', 'vorlage', 'papierkorb', 'datei', 'zeitplan', 'reihenfolge', 'sortierung',
         'farbe', 'titel', 'wetter', 'seiten', 'prozent', 'groesse', 'blinken', 'vollbild', 'haltestelle',
         'linie', 'wegzeit', 'zusatz', 'spalte', 'trennung', 'kompakt', 'aktiv', 'erstellt', 'geloescht',
         'aktualisiert', 'neu_laden', 'intervall', 'schrift', 'streik', 'ausgeblendet', 'manuell', 'eigener',
         'freitext', 'inhalt', 'hintergrund', 'bild', 'stadt', 'fokus', 'zuweisung', 'beschreibung',
         'prioritaet', 'dauer', 'daten', 'notiz', 'quelle', 'typen', 'richtung', 'gleis', 'verspaetung',
         'ausfall', 'umleitung', 'ersatz', 'fluegel', 'auslastung', 'zeit', 'ist_', 'seite', 'anzeige',
         'veranstaltung', 'versteckt', 'aktion']
WORDS = ['von', 'bis', 'tage', 'uhr', 'leer', 'links', 'rechts', 'klein', 'mittel', 'gross', 'riesig',
         'mitte', 'typ', 'art', 'beide', 'bahn', 'name_de', 'durchschalten', 'statisch', 'wichtig',
         'dringend', 'nacht', 'schulbetrieb']
OLD_PY_NAMES = {'Bildschirm', 'Klausur', 'Ankuendigung', 'MonitorConfig', 'MonitorDatei', 'MonitorEvent',
                'EventBildschirm', 'KlausurVorlage', 'MonitorGlobalSettings', 'MonitorConfigVersion'}

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ALLOW = Path(__file__).resolve().with_suffix('.allow')
SUFFIXES = {'.py', '.js', '.jsx'}
SKIP_DIRS = {'__pycache__', 'node_modules'}

SNAKE_RE = re.compile(r'[a-z][a-z0-9]*(?:_[a-z0-9]+)+')
CAMEL_RE = re.compile(r'[a-z]+[A-Z]\w*')
LITERAL_RE = re.compile(r'[a-z0-9_-]+')
IDENT_RE = re.compile(r'[A-Za-z_$][\w$]*')
# Reihenfolge: Strings zuerst; Backtick-Templates ohne weitere Verschachtelung.
JS_STRING_RE = re.compile(r"""'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`""", re.S)

# 'ist_' ist ein Praefix (ist_online), kein Teilstring: sonst waeren list_items und exist_ok Funde.
STEM_PATTERNS = [re.compile(r'(?:^|_)ist_' if s == 'ist_' else re.escape(s)) for s in STEMS]


def has_stem(lowered):
    return any(p.search(lowered) for p in STEM_PATTERNS)


def identifier_is_finding(name):
    core = name.strip('_$')
    if not (SNAKE_RE.fullmatch(core) or CAMEL_RE.fullmatch(core)):
        return False
    return has_stem(core.lower())


def literal_is_finding(value):
    return bool(LITERAL_RE.fullmatch(value)) and (value in WORDS or has_stem(value))


def scan_python(text):
    """Liefert (zeile, token) fuer eine Python-Quelle."""
    found = []
    for tok in tokenize.generate_tokens(io.StringIO(text).readline):
        if tok.type == tokenize.NAME:
            if tok.string in OLD_PY_NAMES or identifier_is_finding(tok.string):
                found.append((tok.start[0], tok.string))
        elif tok.type == tokenize.STRING:
            try:
                value = ast.literal_eval(tok.string)
            except (ValueError, SyntaxError):
                continue
            if isinstance(value, str) and literal_is_finding(value):
                found.append((tok.start[0], value))
    return found


def scan_js(text):
    """Liefert (zeile, token) fuer eine JS/JSX-Quelle. Kommentare bleiben bewusst drin."""
    found = []
    code_parts = []
    pos = 0
    for m in JS_STRING_RE.finditer(text):
        literal = m.group()
        if literal[0] == '`' and '${' in literal:
            continue  # Template mit Interpolation zaehlt als Code
        code_parts.append((pos, text[pos:m.start()]))
        pos = m.end()
        if literal_is_finding(literal[1:-1]):
            found.append((text.count('\n', 0, m.start()) + 1, literal[1:-1]))
    code_parts.append((pos, text[pos:]))
    for start, chunk in code_parts:
        for m in IDENT_RE.finditer(chunk):
            if identifier_is_finding(m.group()):
                found.append((text.count('\n', 0, start + m.start()) + 1, m.group()))
    return found


def scan_file(path, allow=frozenset()):
    text = Path(path).read_text(encoding='utf-8')
    scanner = scan_python if str(path).endswith('.py') else scan_js
    return sorted({(line, tok) for line, tok in scanner(text) if tok not in allow})


def load_allow(path):
    tokens = set()
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.split('#', 1)[0].strip()
        if line:
            tokens.add(line)
    return tokens


def walk(directory):
    for path in sorted(Path(directory).rglob('*')):
        if path.is_file() and path.suffix in SUFFIXES and not SKIP_DIRS & set(path.parts):
            yield path


def default_files(root):
    """Standardumfang; Migrationen und deren Tests nutzen bewusst alte Namen."""
    root = Path(root)
    files = [
        p for p in walk(root / 'backend/signage')
        if 'migrations' not in p.relative_to(root / 'backend/signage').parts[:-1]
        and p.name != 'tests_migrations.py'
    ]
    files += [root / 'frontend/src/pages/SignagePage.jsx']
    files += walk(root / 'frontend/src/components/signage')
    files += walk(root / 'agent')
    return [p for p in files if p.exists()]


def display(path):
    try:
        return Path(path).relative_to(Path.cwd()).as_posix()
    except ValueError:
        return Path(path).as_posix()


def main(argv):
    args = list(argv)
    allow_path = DEFAULT_ALLOW
    if '--allow' in args:
        i = args.index('--allow')
        allow_path = Path(args[i + 1])
        del args[i:i + 2]
    if args:
        paths = [Path(a).resolve() for a in args]
        missing = [p for p in paths if not p.exists()]
        if missing:
            for p in missing:
                print(f'Pfad existiert nicht: {p}', file=sys.stderr)
            return 2
        files = []
        for p in paths:
            files += list(walk(p)) if p.is_dir() else [p]
    else:
        files = default_files(ROOT)
    allow = load_allow(allow_path)
    lines = []
    for f in sorted(set(files), key=display):
        for line, tok in scan_file(f, allow):
            lines.append(f'{display(f)}:{line}: {tok}')
    for out in lines:
        print(out)
    return 1 if lines else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
