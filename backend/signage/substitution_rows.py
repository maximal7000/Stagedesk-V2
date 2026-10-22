"""Sortierung und Klassenlisten des Vertretungsplans (reine Funktionen, ohne Django)."""
import re

GRADE_ORDER = ['5', '6', '7', '8', '9', '10', 'E', 'Q1', 'Q2']
_CLASS_RE = re.compile(r'^(10|[5-9]|E|Q[12])([a-z]?)$', re.IGNORECASE)
_UNKNOWN = len(GRADE_ORDER)


def split_class(name):
    match = _CLASS_RE.match((name or '').strip())
    if not match:
        return None
    return match.group(1).upper(), match.group(2).lower()


def class_sort_key(name):
    parts = split_class(name)
    if parts is None:
        return (_UNKNOWN, (name or '').strip(), '')
    return (GRADE_ORDER.index(parts[0]), '', parts[1])


def _clean(names):
    return [n.strip() for n in names if n and n.strip()]


def _natural(text):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r'(\d+)', text or '')]


def _period_start(row):
    match = re.search(r'\d+', row.get('periods') or '')
    return int(match.group()) if match else float('inf')


def _dedupe(rows, with_group):
    seen = {}
    for row in rows:
        key = tuple(
            (k, tuple(v) if isinstance(v, list) else v)
            for k, v in sorted(row.items()) if with_group or k != 'group'
        )
        seen.setdefault(key, row)
    return list(seen.values())


def _runs(letters):
    runs, current = [], []
    for letter in letters:
        if current and ord(letter) == ord(current[-1]) + 1:
            current.append(letter)
        else:
            if current:
                runs.append(current)
            current = [letter]
    if current:
        runs.append(current)
    return runs


def _format_grade(grade, letters):
    items = [grade] if '' in letters else []
    for run in _runs(sorted(l for l in letters if l)):
        if len(run) >= 3:
            items.append(f'{run[0]}–{run[-1]}')
        else:
            items.extend(run)
    if '' in letters:
        return ', '.join(items)
    return grade + ', '.join(items)


def format_classes(names):
    by_grade, unknown = {}, set()
    for name in _clean(names):
        parts = split_class(name)
        if parts is None:
            unknown.add(name)
        else:
            by_grade.setdefault(parts[0], set()).add(parts[1])
    chunks = [_format_grade(g, by_grade[g]) for g in GRADE_ORDER if g in by_grade]
    return ', '.join(chunks + sorted(unknown))


def student_rows(rows):
    out = []
    for row in _dedupe(rows, with_group=False):
        groups = {}
        for name in sorted(set(_clean(row.get('classes') or [])), key=class_sort_key):
            parts = split_class(name)
            groups.setdefault(parts[0] if parts else name, []).append(name)
        for grade, names in groups.items():
            out.append({**row, 'grade': grade, 'classes_label': format_classes(names),
                        '_sort': (class_sort_key(names[0]), _period_start(row))})
    out.sort(key=lambda r: r['_sort'])
    for row in out:
        del row['_sort']
    return out


def teacher_rows(rows):
    result = [{**row, 'classes_label': format_classes(row.get('classes') or [])}
              for row in _dedupe(rows, with_group=True)]
    result.sort(key=lambda r: (_natural(r.get('group')), _period_start(r)))
    return result
