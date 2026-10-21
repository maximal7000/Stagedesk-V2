# Änderungswünsche Anzeige und Admin (Gruppen 2, 3, 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vertretungsplan aus der öffentlichen WebUntis-Monitor-Schnittstelle mit Schüler- und Lehrkräfte-Ansicht, änderbarer Ansicht-Typ, ein gemeinsamer Zeitplan pro Bildschirm, Aufteilung Normal/Breit und Farbschema Hell/Dunkel/Tageslicht/Zeitplan.

**Architecture:**
- **Etappe 1, Backend** (Tasks 1–6): neue, reine Module `untis_monitor.py` (Client), `substitution_rows.py` (Sortierung und Klassenlisten), `screen_schedule.py` (gemeinsamer Zeitplan), `sun.py` und `color_scheme.py`; drei Migrationen 0044–0046 mit Rückweg; `display.py` setzt alles zum Payload zusammen.
- **Etappe 2, Anzeige** (Tasks 7–8): Rahmen `NormalFrame`/`WideFrame` mit Farbschema als CSS-Klasse, neue `SubstitutionsView`.
- **Etappe 3, Admin** (Tasks 9–12): Vertretungsplan-Editor, Typwahl, Zeitplan-Abschnitt, Farbschema in den Einstellungen.
- **Abschluss** (Task 13): Screenshots, Doku, Endkontrolle.

**Tech Stack:** Django 5 + Ninja 1.1, `requests`, Django-Cache (Tests LocMem); React 19, Tailwind v4, vitest, playwright-core.

**Spec:** `docs/superpowers/specs/2026-10-21-monitor-display-wishes-design.md` (Verweise §x beziehen sich darauf).

## Global Constraints

- Code englisch, Oberfläche deutsch; `python3 -I scripts/check-monitor-identifiers.py backend/monitor frontend/src/components/display frontend/src/components/monitor-admin` endet mit Exit 0.
- Copy: Texte aus der Spec wörtlich; keine Em-Dashes (der Halbgeviertstrich „–“ in Bereichen wie „Q2a–d“ und „BEC (3.–4.)“ ist gewollt), keine Floskeln, Fehler nennen Ursache und nächsten Schritt.
- Admin: Bühnenschwarz-Tokens, Bausteine aus `frontend/src/components/ui/` und `monitor-admin/shared/` (`Section`, `Field`, `Segmented`, `Checkbox`, `fieldClass`, `DragHandle`, `useListDrag`, `ConfirmDialog`), `rounded-lg`, lucide-react, `npm run check:tokens` grün.
- Anzeige: Farben nur über `--d-*`-Variablen in `display.css`; Akzent `--d-red: #da1f3d`.
- Ninja-Routen `""` statt `"/"`; Rechte über `_require_perm` (`backend/monitor/permissions.py`).
- Keine Zugangsdaten im Repo. Aufgezeichnete WebUntis-Antworten als Fixtures nur **anonymisiert**: Lehrkraft-Kürzel durch erfundene Kürzel (`YAK`, `PUL` …) ersetzen, Nachrichtentexte durch Beispieltext.
- Jede Migration hat eine Rückwärts-Funktion; `migrate monitor 0043` stellt den alten Stand samt Daten wieder her (Power-Zeitplan, Ansichten-Zeitplan, Stil).
- Monitor-Schnittstelle: Format-Cache 1 h, Daten-Cache wie bisher (`CACHE_SECONDS = 300`), Single-Flight-Sperre, Frist `DEADLINE_SECONDS = 20` für die ganze Kette inklusive Ausweichen, letzte gültige Daten bis 24 h pro Quelle.
- Klassen-Reihenfolge fest: `5, 6, 7, 8, 9, 10, E, Q1, Q2`, danach alles Unbekannte alphabetisch; Buchstaben natürlich sortiert.
- **Abweichungen von der Spec (bewusst):**
  - Klassenlisten werden im Backend formatiert (eine Stelle für beide Quellen). vitest prüft die Darstellung der fertigen Zeilen, nicht die Formatierung.
  - Geteilte Ansichten verweisen auf Inhaltsarten, nicht auf Ansichten. Die Schutzregel aus §2.1 betrifft daher nur den Wechsel: Eine Ansicht, die in einem Wechsel steckt, kann nicht selbst zum Wechsel werden.
  - Der gemeinsame Zeitplan (`Screen.schedule`) gehört zum Recht `monitor.power`, weil er ein- und ausschaltet.
- Commit-Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01D7nDH9UeEyBKSeRzQw1WpF`.
- Checks: Backend `cd backend && source venv/bin/activate && python manage.py test monitor users`; Frontend `cd frontend && npx vitest run && npm run build && npm run check:tokens`.

## Review Focus

1. **WebUntis langsam oder weg zur Stoßzeit (7:30):** Die Kette Vertretungsplan → Konto → Einbetten bleibt zusammen unter 20 s, ein zweiter Worker wartet nicht, die letzten gültigen Daten der gewählten Quelle gehen vor dem Ausweichen. Test in Task 4 (`test_chain_respects_deadline`, `test_last_good_before_fallback`).
2. **Zeitplan-Zeilen über Mitternacht, aneinanderstoßend oder mit gelöschter Ansicht:** Der Bildschirm bleibt durchgehend an; eine gelöschte Ansicht fällt auf die Standard-Ansicht zurück, statt den Bildschirm auszuschalten. Test in Task 5 (`test_adjacent_rows_stay_on`, `test_overnight_row`, `test_deleted_view_falls_back_to_default`).
3. **Klassennamen außerhalb des Musters** („DaZ“, „5abc“, „Q2 Ku“, leer, doppelt): kein Absturz, unverändert übernommen, nach Q2 einsortiert, keine doppelte Zeile in einer Stufe. Test in Task 3 (`test_unknown_names_kept_and_last`, `test_duplicates_once_per_grade`).
4. **Sehr lange Hinweise und viele Klassen:** Zeile bricht um, Seiten werden nach gemessener Höhe gebildet, keine Zeile wird über den Seitenrand hinaus abgeschnitten; eine Zeile höher als die Seite bekommt eine eigene Seite. Test in Task 8 (`paginateByHeight` mit Übergröße).
5. **Farbschema am Tag der Zeitumstellung (25.10.2026) und bei Wechsel während der Anzeige:** Sonnenzeiten stimmen in lokaler Zeit, die Anzeige wechselt beim nächsten Abruf ohne Neuladen. Test in Task 6 (`test_dst_day_local_times`) und Task 7 (`DisplayRoot` wechselt Klasse bei neuem Payload).

---

## Etappe 1: Backend

### Task 1: Client der WebUntis-Monitor-Schnittstelle

**Files:**
- Create: `backend/monitor/untis_monitor.py`
- Create: `backend/monitor/management/commands/monitor_webuntis_record.py`
- Create: `backend/monitor/fixtures_untis/format-vplan-schueler.json`, `format-vplan-lehrer.json`, `data-holiday.json` (Abfrage für 26.10.2026: `rows` leer), `data-schueler-20261027.json` (12 Zeilen), `data-lehrer-20261027.json` (8 Zeilen) — anonymisiert aus den Rohaufnahmen vom 21.10.2026 unter `/tmp/claude-0/-home-user-Stagedesk-V2/d4261319-0d32-55a2-be62-78262df7d327/scratchpad/untis-rec2/` (`fmt-*.json`, `data-*-2026102{6,7}.json`). Die Rohdateien nie committen. Kürzel durchgehend durch erfundene Kürzel ersetzt (ein Kürzel mit Umlaut und eines mit Bindestrich bleiben als Testfall).
- Test: `backend/monitor/tests_untis_monitor.py`

**Interfaces:**
- Consumes: `MonitorSettings.webuntis_server`, `webuntis_school`; `WebUntisSession`-Muster aus `webuntis.py` (requests, `TIMEOUT = 5`).
- Produces:
  - `FORMAT_PRESETS = {'students_2': 'vplan-schueler', 'students_1': 'vplan-schueler-1', 'teachers': 'vplan-lehrer'}`
  - `class MonitorUnavailable(Exception)`
  - `fetch_format(server: str, school: str, format_name: str, deadline: float) -> dict` (Feld `payload` der Antwort; Cache-Schlüssel `monitor:untis-monitor:format:<format_name>`, 3600 s)
  - `fetch_day(server, school, format_name, options: dict, day: date, deadline: float) -> dict` (rohes `payload`)
  - `parse_header(payload: dict, show_absences: bool) -> dict` mit Schlüsseln `date` (ISO), `next_date` (ISO oder None), `absent` (Liste `{'name', 'kind': 'teacher'|'class', 'periods': '' | '3.–4.'}`), `affected` (`{'classes': [...], 'teachers': [...]}`), `messages` (Liste `{'subject', 'body'}`, Text ohne HTML), `updated_at` (ISO aus `lastUpdate` „19.10.2026 11:41:02“, lokal)
  - `parse_rows(payload: dict, options: dict) -> list[dict]` in der Zeilenform aus Task 2. Festgestelltes Format (Aufnahme 27.10.2026):
    - `row['data']` ist eine Liste von HTML-Zellen; Spalten in fester Reihenfolge, je vorhanden laut Format-Option: `showHour` → Stunden („1“, „1 - 2“ → `periods` „1.“ bzw. „1.–2.“), `showTime` → Uhrzeit (verwerfen), `showClass` → Klassen („Q1c, Q1d, Q2a“ an „, “ trennen), `showSubject` → Fach, `showRoom` → Raum, `showTeacher` → Lehrkraft, `showSubstText` → Art, `showInfo` → Hinweis. Die Spaltenzuordnung steht in einer Konstante und ist gegen beide Fixtures getestet.
    - Geänderte Lehrkraft: `<span class="substMonitorSubstElem">ROT</span> (<span class="cancelStyle">ÖLZ</span>)` → `teacher` „ROT“, `teacher_old` „ÖLZ“. Geänderter Raum: `<span class="substMonitorSubstElem">204</span> (209)` → `room` „204“, `room_old` „209“. Allgemein: Wert in `substMonitorSubstElem` (oder ganzer Text ohne Klammerteil) ist neu, Klammerteil ist alt.
    - HTML-Entities auflösen („Raum&auml;nderung“ → „Raumänderung“), Tags entfernen.
    - `kind_label`: Art-Text aus WebUntis unverändert („Raumänderung“, „Prüfung“, „Text“), leer → „Vertretung“. `kind`: enthält die Art „Entfall“ oder „Ausfall“ oder `cssClasses` „cancelStyle“ → `cancelled`; „Raumänderung“ → `room_change`; leer → `substitution`; sonst `other`.
    - `group` = `row['group']`.
    - WebUntis wiederholt einen Eintrag je Gruppe (Schülerformat: je Klasse, Lehrkräfteformat: je Lehrkraft, z. B. ROT und ÖLZ). `parse_rows` liefert die Zeilen wie geliefert; das Entdoppeln macht Task 3.
  - `load_days(server, school, format_name, *, start: date, count: int, overrides: dict, show_absences: bool, deadline: float) -> dict` mit `{'group_by': 'class'|'teacher', 'columns': {...}, 'days': [header + {'rows': [...]}], 'updated_at'}`; der zweite Tag wird mit `next_date` des ersten angefragt. `group_by` aus Format-Option `groupBy` (1 = class, 2 = teacher). `columns` aus den Format-Optionen: `{'class': showClass, 'subject': showSubject, 'teacher': showTeacher, 'room': showRoom, 'note': showInfo or showSubstText}`; Stunde, Art und bei `teacher` das Kürzel sind immer da. Die Konto-Abfrage liefert alle Spalten `True`.
- Elementtypen in `absentElements`/`affectedElements`: `1` = Klasse, `2` = Lehrkraft.

- [ ] **Step 1: Aufzeichnungsbefehl schreiben und Fixtures erzeugen**

`python manage.py monitor_webuntis_record --format vplan-schueler --date 20261021 --out <dir>` speichert `format-<name>.json` und `data-<YYYYMMDD>.json` (rohe Antworten, unverändert). Danach Kürzel und Nachrichten von Hand anonymisieren und unter `backend/monitor/fixtures_untis/` ablegen.

- [ ] **Step 2: Failing tests schreiben**

```python
class ParseHeaderTests(SimpleTestCase):
    def test_holiday_payload(self):
        h = untis_monitor.parse_header(load('data-holiday.json')['payload'], show_absences=True)
        self.assertEqual(h['date'], '2026-10-26')
        self.assertEqual(h['absent'], [{'name': 'YAK', 'kind': 'teacher', 'periods': ''}])
        self.assertEqual(h['affected']['teachers'], ['PUL', 'IMO', 'OXE'])
        self.assertEqual(h['updated_at'], '2026-10-19T11:41:02+02:00')

    def test_partial_absence_periods(self):
        # absences[{startUnit: 3, endUnit: 4}] -> "3.–4."; nur eine Stunde -> "3."
        # Fixture 27.10.: ÖLZ mit type TO, startUnit '1', endUnit '1' -> periods '1.'; ALL_DAY mit '0' -> ''
    def test_absences_hidden(self):
        # show_absences=False -> absent == [], affected == {'classes': [], 'teachers': []}
    def test_messages_html_stripped(self):
        # messageData.messages[{subject, body: "<b>Text</b>"}] -> body "Text"

class ParseRowsTests(SimpleTestCase):
    def test_students_fixture(self):
        rows = parse_rows(load('data-schueler-20261027.json')['payload'], load('format-vplan-schueler.json')['payload'])
        self.assertEqual(len(rows), 12)
        first = rows[0]
        self.assertEqual((first['periods'], first['classes'], first['subject'], first['room'],
                          first['teacher'], first['teacher_old'], first['kind'], first['kind_label']),
                         ('1.', ['5c'], 'De', '179', 'ROT', 'ÖLZ', 'substitution', 'Vertretung'))
    def test_room_change(self):      # 7a: room '204', room_old '209', kind 'room_change', periods '1.–2.'
    def test_class_list_split(self): # Griechisch: classes ['Q1c', 'Q1d', 'Q2a', 'Q2b', 'Q2d'], note 'Klausur'
    def test_teachers_fixture(self): # 8 Zeilen, group 'ROT' und 'ÖLZ' für denselben Eintrag, 'Prüfung' als kind_label
    def test_entities_and_tags(self):

class FetchTests(TestCase):
    def test_format_cached_one_hour(self):  # zweiter Aufruf ohne HTTP; nach 3601 s erneut
    def test_data_post_body(self):
        # POST .../monitor/substitution/data?school=katharineum, JSON enthält formatName, schoolName,
        # date=20261021 (int), dateOffset=0 und alle Format-Optionen; overrides überschreiben Optionen
    def test_second_day_uses_next_date(self):
    def test_deadline_raises_monitor_unavailable(self):
    def test_http_error_raises_monitor_unavailable(self):
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag prüfen**

Run: `python manage.py test monitor.tests_untis_monitor -v 2` → FAIL (`ModuleNotFoundError: monitor.untis_monitor`).

- [ ] **Step 4: Implementieren**

URL-Form wie Spec §1.2; `school` und `schoolName` sind `webuntis_school`. Frist über `time.monotonic()`-Deadline, je Request `min(TIMEOUT, Restzeit)`.

- [ ] **Step 5: Tests grün**

Run: `python manage.py test monitor.tests_untis_monitor` → OK.

- [ ] **Step 6: Commit**

```bash
git add backend/monitor/untis_monitor.py backend/monitor/management/commands/monitor_webuntis_record.py backend/monitor/fixtures_untis backend/monitor/tests_untis_monitor.py
git commit -m "feat(monitor): Client der WebUntis-Monitor-Schnittstelle (Format, Kopf, Aufzeichnung)"
```

### Task 2: Konto-Abfrage liefert Klassenlisten und Ferien aus WebUntis

**Files:**
- Modify: `backend/monitor/webuntis.py` (`_row`, `ROW_KEYS`, `_build_days`, `_is_school_day`, `school_days`, `_load`)
- Test: `backend/monitor/tests_webuntis.py`

**Interfaces:**
- Produces:
  - Zeilenform beider Quellen (gemeinsam, Konstante `ROW_KEYS` in `webuntis.py`): `{'classes': list[str], 'group': str, 'periods', 'subject', 'teacher', 'teacher_old', 'room', 'room_old', 'kind', 'kind_label', 'note'}`; `group` ist bei der Konto-Abfrage `''`, `kind_label` dort die deutsche Bezeichnung zu `kind` („Vertretung“, „Entfall“, „Raumänderung“, „Änderung“). Das bisherige `class` entfällt.
  - `get_substitutions(now, *, start: date | None = None, count: int = 2) -> dict` mit zusätzlichem `updated_at: None`.
  - Ferien: `_untis_holidays(session) -> list[tuple[date, date]]` (JSON-RPC `getHolidays`, Ergebnis 24 h gecacht unter `monitor:webuntis:holidays`); `school_days(start, count, holidays)` überspringt eigene `HolidayPeriod`, WebUntis-Ferien und Wochenenden.

- [ ] **Step 1: Failing tests**

```python
def test_row_keeps_class_list(self):
    # getSubstitutions-Eintrag mit kl=[{name:'5a'},{name:'5b'}] -> row['classes'] == ['5a', '5b']
def test_untis_holidays_skipped(self):
    # getHolidays liefert 20261012..20261024; start=2026-10-21 -> erster Tag 2026-10-26
def test_start_and_count(self):
    # start=2026-10-27, count=1 -> genau ein Tag 2026-10-27
```

- [ ] **Step 2: Fehlschlag prüfen** — Run: `python manage.py test monitor.tests_webuntis` → FAIL.
- [ ] **Step 3: Implementieren**; bestehende Tests an die neue Zeilenform anpassen (`class` → `classes`), keine Aussage abschwächen.
- [ ] **Step 4: Grün** — Run: `python manage.py test monitor.tests_webuntis` → OK.
- [ ] **Step 5: Commit** — `feat(monitor): Konto-Abfrage mit Klassenlisten und Ferien aus WebUntis`

### Task 3: Sortierung und Klassenlisten

**Files:**
- Create: `backend/monitor/substitution_rows.py`
- Test: `backend/monitor/tests_substitution_rows.py`

**Interfaces:**
- Consumes: Zeilenform aus Task 2.
- Produces:
  - `GRADE_ORDER = ['5', '6', '7', '8', '9', '10', 'E', 'Q1', 'Q2']`
  - `split_class(name: str) -> tuple[str, str] | None` — `'Q2a'` → `('Q2', 'a')`, `'10b'` → `('10', 'b')`, `'E'` → `('E', '')`; sonst `None` (Muster `^(10|[5-9]|E|Q[12])([a-z]?)$`, Groß/Klein egal, Ausgabe Buchstabe klein).
  - `class_sort_key(name: str) -> tuple`
  - `format_classes(names: list[str]) -> str` — je Stufe „Q2a, c, d“; drei oder mehr lückenlose Buchstaben als Bereich mit „–“ („Q2a–d“, „Q2a–c, e“); zwei bleiben einzeln („Q1c, d“); Stufen in fester Reihenfolge mit „, “ getrennt; unbekannte Namen unverändert am Ende.
  - Entdoppeln vorab (beide Funktionen): Zeilen, die bis auf `group` gleich sind, gelten in der Schüleransicht als ein Eintrag; in der Lehrkräfte-Ansicht bleiben Zeilen mit verschiedener `group` getrennt (vertretende und abwesende Lehrkraft), gleiche `group` doppelt wird eins.
  - `student_rows(rows: list[dict]) -> list[dict]` — je betroffener Stufe genau eine Kopie mit `classes_label` der Klassen dieser Stufe und `grade`; unbekannte Namen bilden je Name eine eigene Gruppe am Ende; Sortierung nach Stufe, erster Klasse, Stundenbeginn.
  - `teacher_rows(rows: list[dict]) -> list[dict]` — Zeile einmal, `classes_label = format_classes(alle)`, sortiert nach `group` (natürlich), dann Stundenbeginn.

- [ ] **Step 1: Failing tests**

```python
def test_order_10_after_9(self):
    self.assertEqual(sorted(['10a', 'Q1b', '5c', 'E', '9a', 'Q2a'], key=class_sort_key),
                     ['5c', '9a', '10a', 'E', 'Q1b', 'Q2a'])
def test_format_examples(self):
    self.assertEqual(format_classes(['Q2a', 'Q2c', 'Q2d']), 'Q2a, c, d')
    self.assertEqual(format_classes(['Q2d', 'Q2a', 'Q2b', 'Q2c']), 'Q2a–d')
    self.assertEqual(format_classes(['5a', '5b', '5c']), '5a–c')
    self.assertEqual(format_classes(['Q1c', 'Q1d', 'Q2a', 'Q2b', 'Q2d']), 'Q1c, d, Q2a, b, d')
def test_greek_once_per_grade(self):
    out = student_rows([row(classes=['Q1c', 'Q1d', 'Q2a', 'Q2b', 'Q2d'], subject='Grie')])
    self.assertEqual([(r['grade'], r['classes_label']) for r in out], [('Q1', 'Q1c, d'), ('Q2', 'Q2a, b, d')])
def test_support_lesson_in_each_grade(self):
    # classes 5a,5b,6a,7c,8a,8b,9d -> grades 5,6,7,8,9 je einmal
def test_unknown_names_kept_and_last(self):
    # ['DaZ', '5a', 'Q2 Ku', ''] -> '5a' zuerst, 'DaZ' und 'Q2 Ku' unverändert danach, '' ignoriert
def test_duplicates_once_per_grade(self):
    # ['5a', '5a', '5b'] -> eine Zeile, '5a, b'
def test_untis_repeats_collapsed(self):
    # Fixture data-schueler-20261027.json über parse_rows: Griechisch kommt 5x (je Klasse), Informatik 3x
    # -> Griechisch je einmal unter Q1 ('Q1c, d') und Q2 ('Q2a, b, d'), Informatik einmal unter Q2 ('Q2b–d')
def test_teacher_rows_single_line(self):
    # gleiche Zeile mit 3 Stufen -> eine Zeile, group-Sortierung 'ABC' < 'BEC' < 'ZZZ'
```

- [ ] **Step 2: Fehlschlag** — `python manage.py test monitor.tests_substitution_rows` → FAIL.
- [ ] **Step 3: Implementieren** (reine Funktionen, keine Django-Abhängigkeit).
- [ ] **Step 4: Grün.**
- [ ] **Step 5: Commit** — `feat(monitor): Klassen sortieren und zusammenfassen`

### Task 4: Vertretungsplan-Ansicht: Felder, Quellenkette, Tageslogik

**Files:**
- Modify: `backend/monitor/models.py` (`DisplayView`)
- Create: `backend/monitor/migrations/0044_substitution_sources.py`
- Create: `backend/monitor/substitutions.py` (Quellenkette)
- Modify: `backend/monitor/display.py` (`_substitutions_data`, `_split_side`, `_view_object`, `build_payload`, `_NULLABLE_DRAFT_FIELDS`)
- Modify: `backend/monitor/validation.py` (`CHOICE_FIELDS`, neue Zeitprüfung), `backend/monitor/schemas.py` (Ansicht-Schemas)
- Test: `backend/monitor/tests_substitutions.py`, `backend/monitor/tests_migrations.py`, `backend/monitor/tests_display.py`

**Interfaces:**
- Consumes: `untis_monitor.load_days`, `FORMAT_PRESETS`, `MonitorUnavailable` (Task 1); `webuntis.get_substitutions(now, start=, count=)` (Task 2); `substitution_rows.student_rows/teacher_rows` (Task 3).
- Produces (neue Felder an `DisplayView`):
  - `substitutions_source` CharField, Auswahl `monitor` („WebUntis-Vertretungsplan“), `account` („WebUntis-Konto“), `embed` („WebUntis-Seite einbetten“), Standard `monitor`
  - `substitutions_format` CharField, Auswahl `students_2` („Schüler, 2 Tage“), `students_1` („Schüler, 1 Tag“), `teachers` („Lehrkräfte“), `custom` („Eigenes Format“), Standard `students_2`
  - `substitutions_custom_format` CharField(max 100, blank)
  - `substitutions_show_absences` BooleanField, Standard True
  - `substitutions_show_exams` BooleanField(null=True), None = wie im WebUntis-Format
  - `substitutions_next_day_from` CharField(max 5, blank), Standard `'16:00'`, leer = aus
- Produces: `substitutions.load(view, now, *, single_day: bool) -> dict`:
  `{'source': 'monitor'|'substitutions'|'timetable'|'unavailable', 'fallback': bool, 'group_by': 'class'|'teacher', 'columns': {...}, 'days': [{'date', 'label', 'absent', 'affected', 'messages', 'rows'}], 'news', 'updated_at', 'fetched_at'}`; Zeilen bereits durch `student_rows` bzw. `teacher_rows`.
- Payload `view.data` für Vertretungsplan: obiges plus `'embed_url'` (bisher `fallback_url`, gleicher Wert) und `'mode': 'embed'|'live'`. `build_payload` berechnet `mode` zuerst und gibt `single_day=True` weiter, wenn `mode['display'] == 'split'`; geteilte Ansichten immer `single_day=True`.

- [ ] **Step 1: Failing tests Quellenkette und Tageslogik**

```python
def test_monitor_source_default(self):          # load_days aufgerufen mit 'vplan-schueler', count=2
def test_students_1_single_day(self):           # count=1
def test_custom_format_name(self):              # 'custom' + 'vplan-aula' -> format_name 'vplan-aula'
def test_teachers_group_by_teacher(self):       # teacher_rows statt student_rows
def test_next_day_from_cutoff(self):
    # 15:59 -> start heute; 16:00 -> start morgen (Untis überspringt Ferien selbst); '' -> immer heute
def test_single_day_in_split_and_modes(self):   # single_day=True -> count=1 trotz students_2
def test_show_exams_override(self):             # True -> overrides {'showExamSupervision': True}; None -> {}
def test_fallback_to_account(self):
    # MonitorUnavailable, Zugangsdaten vorhanden -> source 'substitutions', fallback True
def test_fallback_skips_account_without_credentials(self):  # -> mode 'embed', fallback True
def test_last_good_before_fallback(self):
    # letzter gültiger Monitor-Stand (< 24 h) vorhanden -> der wird gezeigt, fallback False
def test_chain_respects_deadline(self):
    # Monitor verbraucht 18 s der Frist -> Konto bekommt nur die Restzeit, Kette endet < 20 s
def test_embed_source(self):                    # source 'embed' -> kein HTTP, mode 'embed'
def test_updated_at_from_untis(self):           # monitor: updated_at aus Kopf; account: None
```

- [ ] **Step 2: Failing migration test** (Muster in `tests_migrations.py`)

```python
def test_0044_existing_views(self):
    # Vorher: substitutions-Ansicht mit substitutions_next_day=False
    # Nachher: substitutions_source 'monitor', substitutions_format 'students_1',
    # show_absences True, next_day_from '16:00'; mit substitutions_next_day=True -> 'students_2'
    # Rückwärts nach 0043: substitutions_next_day aus format zurückgerechnet
```

- [ ] **Step 3: Fehlschlag** — `python manage.py test monitor.tests_substitutions monitor.tests_migrations` → FAIL.
- [ ] **Step 4: Implementieren**

Kette in `substitutions.load`: gewählte Quelle zuerst, dann die folgenden in der Reihenfolge `monitor → account (nur mit Zugangsdaten) → embed`. Cache-, Sperr- und Last-Good-Schlüssel je Quelle und Format: `monitor:subs:<source>:<format_name>:<start>:<count>`. `substitutions_next_day` bleibt im Modell (für den Rückweg), wird aber nicht mehr gelesen. `validation.py`: neue Auswahlfelder in `CHOICE_FIELDS`; `substitutions_next_day_from` leer oder `HH:MM`, sonst 422 „Uhrzeit ungültig: bitte im Format HH:MM eintragen oder leer lassen“.

- [ ] **Step 5: Grün** — `python manage.py test monitor` → OK.
- [ ] **Step 6: Commit** — `feat(monitor): Vertretungsplan mit Datenquelle, Ausgabe, Ausweichen und Tageslogik`

### Task 5: Gemeinsamer Zeitplan pro Bildschirm

**Files:**
- Create: `backend/monitor/screen_schedule.py`
- Create: `backend/monitor/migrations/0045_unified_screen_schedule.py`
- Modify: `backend/monitor/models.py` (`Screen.schedule` help_text, `Screen.power_schedule` entfernen, `get_active_view`)
- Modify: `backend/monitor/power.py` (`_schedule_entries`, `compute_power_state`, `next_on_time`)
- Modify: `backend/monitor/api.py` (`SCREEN_POWER_FIELDS`, `update_screen`, `get_screen_power`, `legacy_get_screen_power`), `backend/monitor/schemas.py`, `backend/monitor/validation.py`
- Test: `backend/monitor/tests_screen_schedule.py`, `tests_power.py`, `tests_migrations.py`, `tests_api.py`

**Interfaces:**
- Produces:
  - Zeile: `{'days': [0-6], 'from': 'HH:MM', 'until': 'HH:MM', 'view_id': int | None}`; `None` = Standard-Ansicht; `until < from` = über Mitternacht (wie bisher beim Power-Zeitplan).
  - `row_matches(row: dict, weekday: int, hhmm: str) -> bool` (über Mitternacht: der Teil nach 0 Uhr zählt zum Folgetag, wie `power.time_in_window`).
  - `active_row(rows: list, local_now: datetime) -> dict | None` — erste passende Zeile.
  - `is_on(rows, local_now) -> bool` — `True` ohne Zeilen, sonst Vereinigung aller Zeilen.
  - `merge_legacy(view_rows: list, power_rows: list) -> list` — Ansichten-Zeilen auf die Einschaltzeiten zugeschnitten (je Tag und Fenster geschnitten, leere Schnitte entfallen) oben, darunter jede Einschaltzeile mit `view_id: None`. Ohne Einschaltzeilen: Ansichten-Zeilen unverändert, darunter `{'days': [0..6], 'from': '00:00', 'until': '23:59', 'view_id': None}`, falls es Ansichten-Zeilen gibt.
  - `split_legacy(rows) -> (view_rows, power_rows)` für den Rückweg: `power_rows` = alle Zeilen ohne `view_id`, `view_rows` = Zeilen mit `view_id`; ergibt sich ohne Standard-Zeile kein Einschaltfenster, dann `power_rows` = alle Zeilen ohne `view_id`-Feld.
  - `validate_screen_schedule(rows) -> list` in `validation.py`: Tage nicht leer und in 0–6, Zeiten `HH:MM`, `from != until`, `view_id` None oder vorhandene, nicht gelöschte Ansicht; sonst 422 mit Zeilennummer („Zeile 2: Bitte mindestens einen Wochentag wählen.“, „Zeile 2: Beginn und Ende sind gleich.“, „Zeile 2: Die gewählte Ansicht gibt es nicht mehr.“).
  - API: `schedule` gehört zu `SCREEN_POWER_FIELDS`; Ändern schickt den Power-Zustand sofort an den Pi. `GET /screens/power` und das Alt-Endpoint liefern `power_schedule` weiter, abgeleitet als Liste der Zeilen ohne `view_id` (`[{days, from, until}]`).

- [ ] **Step 1: Failing tests**

```python
def test_no_rows_always_on(self):
def test_adjacent_rows_stay_on(self):
    rows = [r([0], '07:00', '13:00', 5), r([0], '13:00', '18:00', None)]
    for t in ('12:59', '13:00', '13:01'):
        self.assertTrue(is_on(rows, monday(t)))
def test_top_row_wins_on_overlap(self):        # active_row liefert Zeile 1
def test_overnight_row(self):                  # Fr 22:00–06:00: Fr 23:00 an, Sa 05:59 an, Sa 06:01 aus
def test_outside_rows_off(self):
def test_active_view_from_row(self):           # Screen.get_active_view -> Ansicht der Zeile
def test_standard_row_uses_default_view(self):
def test_deleted_view_falls_back_to_default(self):  # Ansicht gelöscht -> Standard-Ansicht, is_on True
def test_override_and_event_still_win(self):
def test_next_on_time_uses_rows(self):
def test_merge_legacy_clips_to_power(self):
    # power Mo–Fr 07:00–18:00, view Mo 06:00–09:00 -> Mo 07:00–09:00 view, dann Mo–Fr standard
def test_merge_legacy_without_power(self):     # Standard-Zeile 00:00–23:59 angehängt
def test_validation_messages(self):
def test_schedule_requires_power_permission(self):  # nur monitor.setup -> 403
```

- [ ] **Step 2: Failing migration test** — `0045` vorwärts mit Altdaten (beide Listen gefüllt, nur eine gefüllt, beide leer) und rückwärts nach 0044 (`power_schedule` und `schedule` wiederhergestellt).
- [ ] **Step 3: Fehlschlag** — `python manage.py test monitor.tests_screen_schedule monitor.tests_power monitor.tests_migrations` → FAIL.
- [ ] **Step 4: Implementieren**; `compute_power_state` Schritt 6 ruft `screen_schedule.is_on(screen.schedule, local_now)`. Alle übrigen Leser von `power_schedule` (`grep -rn power_schedule backend/monitor`) umstellen.
- [ ] **Step 5: Grün** — `python manage.py test monitor` → OK.
- [ ] **Step 6: Commit** — `feat(monitor): ein gemeinsamer Zeitplan für Einschaltzeiten und Ansichten`

### Task 6: Aufteilung und Farbschema

**Files:**
- Create: `backend/monitor/sun.py`, `backend/monitor/color_scheme.py`
- Create: `backend/monitor/migrations/0046_layout_color_scheme.py`
- Modify: `backend/monitor/models.py` (`DisplayView.layout` statt `style`, `effective_layout`; `MonitorSettings.color_scheme`, `light_from`, `light_until`; `Screen.color_scheme`)
- Modify: `backend/monitor/display.py` (`_view_object`, `_screen_object`, Vorschau), `api.py` (Einstellungen, Bildschirm), `schemas.py`, `validation.py` (`CHOICE_FIELDS`: `layout` statt `style`)
- Test: `backend/monitor/tests_color_scheme.py`, `tests_migrations.py`, `tests_display.py`

**Interfaces:**
- Produces:
  - `DisplayView.layout`: `auto` („Automatisch“, Standard), `normal` („Normal“), `wide` („Breit“). `effective_layout()`: `auto` → `normal` für `info`, `media`; sonst `wide`.
  - `MonitorSettings.color_scheme`: `light` („Hell“, Standard), `dark` („Dunkel“), `daylight` („Tageslicht“), `schedule` („Zeitplan“); `light_from` Standard `'07:00'`, `light_until` Standard `'18:00'`.
  - `Screen.color_scheme`: `inherit` („Wie eingestellt“, Standard), `light` („Immer hell“), `dark` („Immer dunkel“); Feld gehört zu `monitor.setup`.
  - `sun.sun_times(day: date) -> tuple[datetime, datetime]` (Sonnenaufgang, -untergang, lokal aware; Lübeck `LAT = 53.8655`, `LON = 10.6866`; NOAA-Näherung, Sonnenhöhe −0,833°).
  - `color_scheme.resolve(screen: Screen | None, settings: MonitorSettings, now: datetime) -> 'light' | 'dark'`.
  - Payload: `screen.scheme` und auf oberster Ebene `scheme` (auch ohne Bildschirm, etwa in der Vorschau: Einstellung ohne Ausnahme); `view.layout` ersetzt `view.style`.
  - `GET /settings` liefert zusätzlich `daylight_today: {'sunrise': 'HH:MM', 'sunset': 'HH:MM'}`.
- Migration 0046: `ci` → `normal`, `dense` → `wide`, `dark` → `wide`, `auto` → `auto`; Bildschirme, deren Standard-Ansicht `dark` war, bekommen `color_scheme = 'dark'`. Rückwärts: `normal` → `ci`, `wide` → `dense`, außer bei Ansichten, die Standard-Ansicht eines Bildschirms mit `dark` sind: dann `dark`.

- [ ] **Step 1: Failing tests**

```python
def test_sun_midsummer(self):
    rise, set_ = sun_times(date(2026, 6, 21))
    self.assertTrue(timedelta(hours=17) <= set_ - rise <= timedelta(hours=17, minutes=35))
    self.assertAlmostMinutes(midpoint(rise, set_), time(13, 19), tolerance=5)   # CEST
def test_sun_midwinter(self):
    # 21.12.2026: Tageslänge 7:00 bis 7:30, Mittelpunkt 12:15 ±5 (CET)
def test_dst_day_local_times(self):
    # 25.10.2026: rise und set in Europe/Berlin, utcoffset +01:00, rise zwischen 07:00 und 07:30
def test_daylight_resolve(self):              # 1 min vor Sonnenaufgang dark, 1 min danach light
def test_schedule_resolve(self):              # 06:59 dark, 07:00 light, 18:00 light, 18:01 dark
def test_screen_exception_wins(self):
def test_payload_has_scheme_and_layout(self): # view.layout 'wide' für substitutions mit auto
```

- [ ] **Step 2: Failing migration test** für 0046 vorwärts und rückwärts.
- [ ] **Step 3: Fehlschlag** — `python manage.py test monitor.tests_color_scheme monitor.tests_migrations` → FAIL.
- [ ] **Step 4: Implementieren**; Validierung `light_from < light_until`, sonst 422 „Die helle Zeit muss vor ihrem Ende beginnen.“.
- [ ] **Step 5: Grün** — `python manage.py test monitor users` → OK.
- [ ] **Step 6: Commit** — `feat(monitor): Aufteilung Normal/Breit und Farbschema mit Tageslicht`

---

## Etappe 2: Anzeige

### Task 7: Rahmen Normal und Breit, Farbschema, Uhr-Kasten

**Files:**
- Create: `frontend/src/components/display/frame/NormalFrame.jsx` (aus `CiFrame.jsx`), `WideFrame.jsx` (aus `DenseFrame.jsx`)
- Delete: `CiFrame.jsx`, `DenseFrame.jsx`, `DarkFrame.jsx`
- Modify: `frame/Frame.jsx`, `frame/index.js`, `frame/parts.jsx` (`CiWheel`), `frame/PortraitFrame.jsx`, `frame/ClockBox.jsx`, `display.css`, `DisplayRoot.jsx`, alle Aufrufer mit `style`-Prop (`grep -rn "style=\|\.style\b" frontend/src/components/display frontend/src/pages/MonitorPage.jsx frontend/src/components/monitor-admin/shared/LivePreview.jsx`)
- Modify: `frontend/tests/display-fixtures/*.json` (`style` → `layout`, `scheme` ergänzen), `frontend/scripts/shoot-display.mjs`
- Test: `frame/Frame.test.jsx`, `DisplayRoot.test.jsx`, `frame/ClockBox.test.jsx`

**Interfaces:**
- Consumes: Payload `scheme`, `view.layout` (Task 6).
- Produces:
  - `Frame({ layout = 'normal', scheme = 'light', orientation, clock, footer, wheel, stripe, children })`
  - CSS-Klassen `d-scheme-light`, `d-scheme-dark` ersetzen `d-tone-*`; zusätzlich `d-layout-wide` setzt `--d-surface` mit 80 % Deckkraft (light `#ffffffcc`, dark `#181818cc`).
  - `CiWheel` ohne `look`: immer leicht grau (`--d-wheel`, light `#e6e6e6`, dark `#2a2a2a`), in `normal` links angeschnitten neben dem Inhalt, in `wide` an derselben Stelle **unter** dem Inhalt (`z-0`, Inhalt `z-10`).
  - `ClockBox` nutzt `--d-surface` und `--d-fg` wie alle Kästen; die Variablen `--d-box-*` entfallen.

- [ ] **Step 1: Failing tests**

```jsx
it('wählt den Rahmen nach Aufteilung', () => {
  render(<Frame layout="wide" scheme="dark">x</Frame>)
  expect(document.querySelector('.d-root')).toHaveClass('d-scheme-dark', 'd-layout-wide')
})
it('Rad liegt bei Breit hinter dem Inhalt', () => { /* img[data-wheel] vor main, main hat z-10 */ })
it('wechselt das Schema ohne Neuladen', () => {
  // DisplayRoot mit payload scheme 'light', dann rerender mit 'dark' -> Klasse wechselt, kein reload-Aufruf
})
it('Uhr-Kasten nutzt die Kastenfarbe', () => { /* ClockBox variant="box" hat Klasse d-card */ })
```

- [ ] **Step 2: Fehlschlag** — `cd frontend && npx vitest run src/components/display` → FAIL.
- [ ] **Step 3: Implementieren**; Hochformat bekommt dieselben zwei Aufteilungen (Band mit drei Rädern bleibt).
- [ ] **Step 4: Grün** — `npx vitest run && npm run build`.
- [ ] **Step 5: Screenshots** — `node frontend/scripts/shoot-display.mjs` mit Matrix `{info, substitutions, departures, split} × {normal, wide} × {light, dark}`; Bilder ansehen: Rad an gleicher Stelle, Text über dem Rad lesbar, Uhr-Kasten in Kastenfarbe.
- [ ] **Step 6: Commit** — `feat(display): Aufteilung Normal/Breit, Farbschema per CSS-Klasse, Uhr in Kastenfarbe`

### Task 8: Vertretungsplan-Anzeige

**Files:**
- Modify: `frontend/src/components/display/views/SubstitutionsView.jsx`
- Modify: `frontend/src/components/display/lib/pager.js` (neu `paginateByHeight`)
- Modify: `frontend/tests/display-fixtures/substitutions.json`, `long-substitutions.json`, `substitutions-fallback.json`; Create: `substitutions-teachers.json`, `substitutions-fallback-source.json`
- Test: `views/SubstitutionsView.test.jsx`, `lib/pager.test.js`

**Interfaces:**
- Consumes: `view.data` aus Task 4 (`mode`, `group_by`, `days[].absent/affected/messages/rows`, Zeilen mit `classes_label`, `group`, `fallback`, `updated_at`, `fetched_at`, `embed_url`).
- Produces: `paginateByHeight(heights: number[], available: number) -> number[][]` (Indizes je Seite; eine Zeile höher als `available` bekommt eine eigene Seite).
- Spalten:
  - `group_by: 'class'`: Klasse · Std. · Fach · Lehrkraft · Raum · Art · Hinweis
  - `group_by: 'teacher'`: Kürzel · Std. · Klasse · Fach · Lehrkraft · Raum · Art · Hinweis
  - Art zeigt `kind_label`, Farbe nach `kind` (Entfall rot, Raumänderung blau).
  - Spalten mit `columns[x] === false` entfallen (Format-Optionen aus WebUntis).
  - Lehrkraft und Raum mit Altwert: `<s>HRT</s> KLM`. Hinweis und Klasse brechen um (`whitespace-normal`, kein `truncate`).
- Kopf je Tag (nur wenn Einträge da sind): „Abwesend“ mit Lehrkräften und Klassen (Stunden in Klammern, „BEC (3.–4.)“), „Betroffen“ mit Klassen und Lehrkräften; Nachrichten darunter.
- Fußzeile: „Stand WebUntis · 21.10. 07:42“ aus `updated_at`, sonst „Stand 07:42“ aus `fetched_at`; bei `fallback` zusätzlich „Ersatzquelle“.
- `mode: 'embed'` zeigt das iframe mit `embed_url`.

- [ ] **Step 1: Failing tests**

```js
it('paginateByHeight', () => {
  expect(paginateByHeight([10, 10, 10], 25)).toEqual([[0, 1], [2]])
  expect(paginateByHeight([10, 40, 10], 25)).toEqual([[0], [1], [2]])
})
```
```jsx
it('Lehrkräfte-Ansicht: Kürzel vorn, Klasse nach der Stunde', () => { /* Spaltenköpfe in Reihenfolge */ })
it('Hinweis wird nie abgeschnitten', () => { /* Zelle ohne truncate, langer Text vollständig im DOM */ })
it('Kopf zeigt Abwesend und Betroffen', () => { /* "BEC (3.–4.)" */ })
it('Fußzeile mit Stand WebUntis und Ersatzquelle', () => {})
it('Einbetten zeigt iframe', () => {})
it('blendet Spalten aus, die das Format abschaltet', () => { /* columns.room false -> kein Kopf "Raum" */ })
```

- [ ] **Step 2: Fehlschlag** — `npx vitest run src/components/display` → FAIL.
- [ ] **Step 3: Implementieren**; Zeilenhöhen nach dem Rendern messen (versteckte Messschicht in voller Breite), daraus Seiten mit `paginateByHeight`, Blättern weiter mit `usePager` und `view.page_seconds`.
- [ ] **Step 4: Grün** — `npx vitest run && npm run build`.
- [ ] **Step 5: Screenshots** der Fixtures in Normal/Breit × Hell/Dunkel, Splitscreen ein Tag; ansehen.
- [ ] **Step 6: Commit** — `feat(display): Vertretungsplan mit Lehrkräfte-Ansicht, Kopfbereich und umbrechenden Hinweisen`

---

## Etappe 3: Admin

### Task 9: Vertretungsplan-Editor und Aufteilung im Ansicht-Editor

**Files:**
- Modify: `frontend/src/components/monitor-admin/view-editors/Substitutions.jsx`
- Modify: `frontend/src/components/monitor-admin/pages/viewData.js` (`EDITABLE_FIELDS`, `STYLE_OPTIONS` → `LAYOUT_OPTIONS`, `styleHelp` → `layoutHelp`), `pages/ViewEdit.jsx` (Feld „Aufteilung“), `pages/Schedules.jsx`, `shared/LivePreview.jsx`
- Test: `pages/viewData.test.js`, `view-editors/Substitutions.test.jsx`

**Interfaces:**
- Consumes: Felder aus Task 4 und `layout` aus Task 6.
- Produces:
  - `LAYOUT_OPTIONS = [{value: 'auto', label: 'Automatisch'}, {value: 'normal', label: 'Normal'}, {value: 'wide', label: 'Breit'}]`
  - `layoutHelp(layout, kind)`: Normal „Inhalt rechts neben dem Schullogo.“, Breit „Inhalt über die ganze Breite, das Schullogo liegt dahinter.“, Automatisch „Info und Medien: Normal. Abfahrten, Vertretungsplan, Geteilt und Wechsel: Breit.“
  - Editor-Felder in dieser Reihenfolge: „Datenquelle“ (Auswahl mit Hilfetexten aus Spec §1.1 wörtlich), bei `monitor` „Ausgabe“ und bei `custom` „Formatname“; „Abwesenheiten anzeigen“ (nur `monitor`), „Klausuren anzeigen“ (Auswahl „Wie in WebUntis“, „Ja“, „Nein“ auf `null/true/false`), „Nächsten Schultag zeigen ab“ (Uhrzeit, Schalter zum Abschalten), Blättertakt; bei `embed` die beiden Rückfall-Links wie bisher. „Morgen zeigen“ entfällt.

- [ ] **Step 1: Failing tests** — Sichtbarkeit je Quelle (Ausgabe nur bei `monitor`, Formatname nur bei `custom`, Links nur bei `embed`); Klausuren-Auswahl setzt `null/true/false`; Abschalten setzt `''`; `viewPayload` sendet `layout`, nie `style`.
- [ ] **Step 2: Fehlschlag** — `npx vitest run src/components/monitor-admin` → FAIL.
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün** — `npx vitest run && npm run check:tokens`.
- [ ] **Step 5: Commit** — `feat(monitor-admin): Vertretungsplan-Editor mit Datenquelle und Ausgabe, Aufteilung statt Stil`

### Task 10: Typ einer Ansicht ändern

**Files:**
- Modify: `frontend/src/components/monitor-admin/pages/ViewEdit.jsx`, `pages/viewData.js`
- Modify: `backend/monitor/validation.py` (`validate_view_data`), `backend/monitor/api.py` (PUT `/config`)
- Test: `pages/ViewEdit.test.jsx`, `pages/viewData.test.js`, `backend/monitor/tests_api.py`

**Interfaces:**
- Produces:
  - Frontend `kindChangeProblem(viewId, nextKind, views) -> string | null` in `viewData.js`: steckt die Ansicht in einem Wechsel und ist `nextKind === 'rotation'` → „Diese Ansicht ist Teil des Wechsels „<Name>“. Erst dort entfernen.“
  - Backend: gleiche Regel in `validate_view_data` (422 mit derselben Meldung).
  - Typ-Auswahl rechts neben dem Namensfeld (`KIND_OPTIONS`), Plakette „Typ: …“ entfällt. Der Wechsel tauscht sofort den Editor-Teil und die Live-Vorschau; Felder des alten Typs bleiben im Entwurf und werden mitgespeichert.
  - Beim Speichern mit geändertem Typ und `usedOn(viewId, screens).length = N > 0`: `ConfirmDialog` „Die Ansicht läuft auf N Bildschirmen. Nach dem Speichern zeigen sie den neuen Typ.“ (bei N = 1 „auf einem Bildschirm“).

- [ ] **Step 1: Failing tests** — Typwechsel zeigt neuen Editor; Zurückwechseln zeigt alte Werte; Schutzregel als Meldung und Speichern gesperrt; Nachfrage mit N; Backend 422 mit Meldung.
- [ ] **Step 2: Fehlschlag.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün** — Frontend- und Backend-Checks.
- [ ] **Step 5: Commit** — `feat(monitor-admin): Typ einer Ansicht änderbar`

### Task 11: Zeitplan-Abschnitt und Farbschema pro Bildschirm

**Files:**
- Create: `frontend/src/components/monitor-admin/shared/ScreenScheduleEditor.jsx`, `shared/WeekOverview.jsx`
- Modify: `shared/schedule.js` (`scheduleProblems` mit `view_id`, `overlapHints`, `weekBars` auf `schedule`), `pages/ScreenDetail.jsx`, `pages/screenData.js` (`POWER_FIELDS`: `schedule` statt `power_schedule`; `DISPLAY_FIELDS` + `color_scheme`), `shared/explain.js`, `pages/viewData.js` (`usedOn`), `pages/Schedules.jsx`, `pages/overviewData.js`
- Delete: `shared/ScheduleEditor.jsx`, wenn kein Aufrufer bleibt
- Test: `shared/schedule.test.js`, `pages/ScreenDetail.test.jsx`, `pages/screenData.test.js`

**Interfaces:**
- Consumes: Zeilenform und Rechte aus Task 5, `Screen.color_scheme` aus Task 6.
- Produces:
  - `overlapHints(rows) -> (string | null)[]`: für jede Zeile, die sich mit einer früheren überschneidet, „Überschneidet sich mit Zeile N, Zeile N hat Vorrang.“ (N = erste frühere Zeile, 1-basiert); über Mitternacht berücksichtigt; aneinanderstoßend ist keine Überschneidung.
  - `weekBars(rows) -> [{day: 0-6, start: minutes, end: minutes, viewId: number | null}]` für die Wochenübersicht.
  - Abschnitt „Zeitplan“ (eigene `Section`, Recht `monitor.power`) zwischen „Anzeige“ und „Ein- und Ausschalten“: Hilfetext „Zu diesen Zeiten ist der Bildschirm an und zeigt die gewählte Ansicht. Außerhalb ist er aus.“; ohne Zeilen nur „Kein Zeitplan · Zeitplan hinzufügen“; mit Zeilen darüber die Wochenübersicht (Mo–So, 0–24 Uhr, Balken je Ansicht in festen Farben aus einer Palette von 6 Tönen, Aus-Zeit schraffiert, Legende mit Ansichtsnamen); Zeilen mit Tagen, Von, Bis, Ansicht („Standard-Ansicht“ zuerst), Ziehgriff, Löschen; Hinweis unter überschneidenden Zeilen.
  - „Ein- und Ausschalten“ behält Steuerung, Ferien, Ausnahmen, Steuerung des Bildschirms; der alte Zeitplan dort entfällt.
  - In „Anzeige“: Feld „Farbschema“ als `Segmented` mit „Wie eingestellt“, „Immer hell“, „Immer dunkel“.

- [ ] **Step 1: Failing tests**

```js
it('overlapHints', () => {
  expect(overlapHints([row([0], '07:00', '13:00'), row([0], '12:00', '15:00'), row([0], '15:00', '18:00')]))
    .toEqual([null, 'Überschneidet sich mit Zeile 1, Zeile 1 hat Vorrang.', null])
})
it('weekBars teilt Zeilen über Mitternacht', () => { /* Fr 22:00–06:00 -> Fr 1320–1440, Sa 0–360 */ })
```
```jsx
it('leerer Zeitplan ist kompakt', () => { /* nur Text und Knopf, keine Wochenübersicht */ })
it('Zeitplan ohne Recht power nur lesend', () => {})
it('speichert schedule mit view_id null für Standard-Ansicht', () => {})
```

- [ ] **Step 2: Fehlschlag** — `npx vitest run src/components/monitor-admin` → FAIL.
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün** — `npx vitest run && npm run build && npm run check:tokens`.
- [ ] **Step 5: Screenshots** — `node frontend/scripts/shoot-admin.mjs` für Bildschirm-Seite leer und mit drei Zeilen inkl. Überschneidung; ansehen.
- [ ] **Step 6: Commit** — `feat(monitor-admin): gemeinsamer Zeitplan mit Wochenübersicht, Farbschema pro Bildschirm`

### Task 12: Farbschema in den Einstellungen

**Files:**
- Modify: `frontend/src/components/monitor-admin/pages/Settings.jsx`, `pages/settingsData.js`
- Test: `pages/Settings.test.jsx`, `pages/settingsData.test.js`

**Interfaces:**
- Consumes: `color_scheme`, `light_from`, `light_until`, `daylight_today` aus Task 6.
- Produces: Abschnitt „Farbschema“ (Recht `monitor.setup`) mit `Segmented` „Hell“, „Dunkel“, „Tageslicht“, „Zeitplan“; bei Tageslicht Hilfetext „Heute hell von 07:58 bis 18:12.“ (Werte aus `daylight_today`); bei Zeitplan zwei Uhrzeitfelder „Hell von“ und „bis“; Hinweis „Einzelne Bildschirme können auf der Bildschirm-Seite immer hell oder immer dunkel bleiben.“ `SCHEME_FIELDS = ['color_scheme', 'light_from', 'light_until']`.

- [ ] **Step 1: Failing tests** — Zeitfelder nur bei Zeitplan; Tageslicht-Text mit Werten; Payload enthält nur geänderte Felder.
- [ ] **Step 2: Fehlschlag.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün** — `npx vitest run && npm run check:tokens`.
- [ ] **Step 5: Commit** — `feat(monitor-admin): Farbschema für alle Bildschirme`

---

## Abschluss

### Task 13: Screenshots, Doku, Endkontrolle

**Files:**
- Modify: `CLAUDE.md` (Monitor-Abschnitt: Datenquellen, Zeitplan, Aufteilung, Farbschema, `monitor_webuntis_record`), `DEPLOY.md` (Rollout der Migrationen 0044–0046, Rückweg `migrate monitor 0043`, Kontrolle nach Deploy: Vertretungsplan zeigt „Stand WebUntis“, Zeitplan der Bildschirme glocke und mensa ansehen)
- Modify: `frontend/scripts/shoot-display.mjs`, `shoot-admin.mjs` (neue Fixtures)

- [ ] **Step 1: Alle Checks** — Backend `python manage.py test monitor users`, Frontend `npx vitest run && npm run build && npm run check:tokens`, Bezeichner-Guard; alles grün, Ausgabe ohne Warnungen.
- [ ] **Step 2: Screenshots** aller betroffenen Anzeigen (Normal/Breit × Hell/Dunkel, Hochformat, Splitscreen, Sondermodi geteilt) und Admin-Seiten (Ansicht-Editor Vertretungsplan, Typwahl, Bildschirm-Zeitplan, Einstellungen Farbschema); ansehen und an den Nutzer schicken.
- [ ] **Step 3: Migrations-Probe** — frische DB mit Altdaten aus 0043, `migrate`, dann `migrate monitor 0043`, Daten vergleichen.
- [ ] **Step 4: Commit** — `docs(monitor): Datenquellen, Zeitplan, Aufteilung und Farbschema`
