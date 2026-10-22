# Abfahrten-Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abfahrten-Ansicht mit fest zugeordneten Spalten, einer Zeitangabe vorn mit Verspätung, Störungsspalte rechts, Footer mit Datum, Wetter und Stand, Erreichbarkeitsfilter, Gleiswechsel, wachsender Linien-Plakette, Bus-Lila und gekürztem Ortsnamen.

**Architecture:** Backend liefert pro Haltestelle Spalte, Trennung Bus/Zug und gefilterte Abfahrten mit Echtzeit-Kennzeichen sowie den Stand je Quelle (Tasks 1–2); die Anzeige baut das Layout daraus (Task 3); der Editor stellt alles ein (Task 4); Doku und Screenshots (Task 5).

**Tech Stack:** Django 5 + Ninja, React 19, Tailwind v4, vitest, playwright-core.

**Spec:** `docs/superpowers/specs/2026-10-22-departures-monitor-design.md`

**Voraussetzung:** Plan `2026-10-22-signage-rename-cleanup.md` ist abgeschlossen (Pfade unten: `backend/signage/…`, `backend/signage/transit/…`, `frontend/src/components/signage/…`, Rechte `signage.*`).

## Global Constraints

- Werte aus der Spec wörtlich: Spaltenzahl 1 bis 5, Standard 4; Zeitangabe „Minuten“, „Uhrzeit“, „Gemischt“ mit Grenze 20 min, Standard Minuten; „jetzt“ unter 1 min; Verspätung „+N“ direkt hinter der Zeit; Ausfall „fällt aus“ in Rot; Abfahrten ohne Echtzeit verschwinden 1 Minute nach der geplanten Zeit; sichtbar nur Abfahrten mit tatsächlicher Abfahrt ≥ jetzt + Fußweg; Bus-Lila `#95276E` mit weißer Schrift für Busse ohne eigene Linienfarbe; Plakette ab 7 Zeichen kleinere Schrift; Gleiswechsel „~~Gl. 5~~ Gl. 7“ in Warnfarbe.
- Zeiten werden ab der **geplanten** Abfahrt gerechnet.
- Mehrere Haltestellen in einer Spalte teilen sich die Höhe gleich; innerhalb einer Haltestelle mit „Busse und Züge getrennt“ oben Busse, unten Züge, Höhe gleich; was nicht passt, wird abgeschnitten (kein Blättern). Nur die Störungsspalte blättert (Blättertakt der Ansicht).
- Anzeige-Farben nur über `--d-*`-Variablen; Admin mit den vorhandenen Bausteinen; Texte deutsch, keine Em-Dashes, kurz und sachlich.
- Commit-Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01D7nDH9UeEyBKSeRzQw1WpF`.
- Checks: Backend `python manage.py test signage users`; Frontend `npx vitest run && npm run build && npm run check:tokens`; Guard `python3 -I scripts/check-signage-identifiers.py` Exit 0.

## Review Focus

1. **Tageswechsel:** Abfahrten kurz nach Mitternacht (00:05) um 23:58 sind erreichbar und stehen am Ende; um 00:02 ist eine 23:59-Abfahrt ohne Echtzeit weg. Test in Task 1 (`test_midnight_wrap`).
2. **Fehlende Echtzeit bei NAH.SH-Bussen** (häufig): bleiben bis 1 Minute nach Plan sichtbar, nicht sofort weg. Test in Task 1 (`test_no_realtime_grace`).
3. **Haltestelle mit Spalte größer als die Spaltenzahl oder ohne Spalte:** landet in der letzten Spalte bzw. der Reihe nach, nie verloren. Test in Task 3 (`assignColumns`).
4. **Ortsname kürzen bei nur einer Haltestelle oder wenn der Rest nur „Hbf“ wäre:** „Lübeck Hbf“ bleibt ganz. Test in Task 3 (`stripCommonCity`).
5. **Sehr viele Störungen mit Bildern:** Spalte blättert, kein Überlauf über den Footer. Test in Task 3 (Pager-Test der Störungsspalte).

---

### Task 1: Abfahrten-Daten (Echtzeit, Filter, Spalten, Stand)

**Files:**
- Modify: `backend/signage/transit/db.py`, `backend/signage/transit/nahsh.py` (Feld `realtime`), `backend/signage/transit/departures.py` (Filter, Stationsfelder, Quellenstatus)
- Test: `backend/signage/tests_transit.py`

**Interfaces:**
- Produces:
  - Jede Abfahrt bekommt `realtime: bool` (DB: Echtzeitzeit `ct` vorhanden; NAH.SH: `dTimeR` vorhanden).
  - `departure_visible(dep: dict, now: datetime, walk_minutes: int) -> bool` in `departures.py`: sichtbar, wenn (tatsächliche Abfahrt = `departure_actual` oder `departure`) ≥ now + walk_minutes; zusätzlich bei `realtime == False`: geplante Abfahrt + 1 min ≥ now. Ausgefallene Abfahrten folgen derselben Regel über die geplante Zeit. Tageswechsel wie bisher (Differenz < −720 min → +1440).
  - Ersetzt den bisherigen Fußweg-Filter in `fetch_departures` (gilt jetzt auch bei Fußweg 0).
  - Jeder Stationseintrag von `fetch_departures` trägt zusätzlich `index` (Position in `stops`), `column` (aus dem Haltestellen-Eintrag, int oder None) und `split_modes` (bool, Standard True).
  - `fetch_departures` gibt `{'stations': [...], 'sources': {'db': 'ok'|'error'|'off', 'nahsh': 'ok'|'error'|'off'}}` zurück; `'error'`, sobald eine Abfrage dieser Quelle in diesem Lauf scheiterte, `'off'`, wenn die Quelle für keine Haltestelle aktiv oder (DB) ohne Zugangsdaten ist. Aufrufer (`display._fetch_transit`, Admin-Endpunkte) entsprechend anpassen.

- [ ] **Step 1: Failing tests**

```python
def test_walk_filter_uses_actual_time(self):   # Plan 22:20 +5, Fußweg 12, jetzt 22:12 -> sichtbar (22:25 >= 22:24)
def test_walk_zero_hides_departed(self):       # realtime, actual 22:10, jetzt 22:11, Fußweg 0 -> unsichtbar
def test_no_realtime_grace(self):              # realtime False, Plan 22:10: 22:11 sichtbar, 22:12 nicht
def test_midnight_wrap(self):                  # jetzt 23:58: 00:05 sichtbar; jetzt 00:02: 23:59 ohne Echtzeit unsichtbar
def test_station_fields(self):                 # index, column, split_modes (Standard True) im Eintrag
def test_sources_status(self):                 # DB ohne Zugangsdaten -> 'off'; NAH.SH-Fehler -> 'error'
```

- [ ] **Step 2: Fehlschlag** — `python manage.py test signage.tests_transit` → FAIL.
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün** — Backend-Checks.
- [ ] **Step 5: Commit** — `feat(signage): Abfahrten mit Echtzeit-Kennzeichen, Erreichbarkeit, Spalten und Quellenstatus`

### Task 2: Ansicht-Felder und Payload

**Files:**
- Modify: `backend/signage/models.py` (`DisplayView`), Create: `backend/signage/migrations/0047_departures_layout.py`
- Modify: `backend/signage/display.py` (`_fetch_transit`, `_departures_data`), `backend/signage/validation.py`, `backend/signage/schemas.py`
- Test: `backend/signage/tests_display.py`, `backend/signage/tests_migrations.py`

**Interfaces:**
- Produces (Felder an `DisplayView`):
  - `transit_time_format` CharField: `minutes` („Minuten“, Standard), `clock` („Uhrzeit“), `mixed` („Gemischt“)
  - `transit_show_disruptions` BooleanField, Standard True
  - `transit_strip_city` BooleanField, Standard True
  - `transit_columns` Standard 4 (Validierung 1–5)
  - Entfernt: `transit_disruption_position`, `transit_disruption_banner`, `transit_show_relative`
- Migration 0047: `transit_show_relative` True → `minutes`, False → `clock`; `transit_show_disruptions` = bisheriges `transit_disruption_banner`; `transit_columns` aller Ansichten → 4 (das Feld wurde bisher nicht ausgewertet). Rückweg: `minutes`/`mixed` → `transit_show_relative` True, `clock` → False; `transit_disruption_banner` = `transit_show_disruptions`, `transit_disruption_position` = 'bottom'; `transit_columns` bleibt.
- Payload `view.data` für Abfahrten: `{'stations', 'disruptions', 'columns', 'time_format', 'show_disruptions', 'strip_city', 'status': {'fetched_at': ISO|None, 'sources': {...}}}`. Ohne `show_disruptions` ist `disruptions` leer und es werden keine Störungen abgefragt.

- [ ] **Step 1: Failing tests** — Payload-Felder; Validierung (`transit_columns` 0 und 6 → 422 „Spaltenzahl 1 bis 5.“, `transit_time_format` unbekannt → 422); Migration vorwärts/rückwärts mit Altdaten.
- [ ] **Step 2: Fehlschlag.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün.**
- [ ] **Step 5: Commit** — `feat(signage): Ansicht-Felder für Spalten, Zeitangabe und Störungsspalte`

### Task 3: Anzeige

**Files:**
- Modify: `frontend/src/components/signage/display/views/DeparturesView.jsx`, `frontend/src/components/signage/display/lib/transit.js`, `frontend/src/components/signage/display/DisplayRoot.jsx` (Footer-Inhalt der Abfahrten)
- Modify: `frontend/tests/signage/display-fixtures/departures.json`, `long-departures.json`, Create: `departures-columns.json` (7 Haltestellen in 4 Spalten wie die Vorschau: Wahmstraße+Sandstraße, Kohlmarkt leer+Breite Straße, Katharineum, ZOB-Busse+Lübeck Hbf mit Gleiswechsel und „SEV RE83“; 3 Störungen, eine mit Bild)
- Test: `lib/transit.test.js`, `views/DeparturesView.test.jsx`

**Interfaces:**
- Consumes: Payload aus Task 2.
- Produces in `lib/transit.js`:
  - `BUS_FALLBACK_COLOR = '#95276E'`; `lineColor(dep)` liefert für Busse ohne `line_color` diese Farbe.
  - `formatDepartureTime(dep, now: Date, format: 'minutes'|'clock'|'mixed') -> string` („jetzt“, „3 min“, „22:08“; gemischt: ≤ 20 min Minuten, sonst Uhrzeit; gerechnet ab geplanter Abfahrt).
  - `delayLabel(dep) -> string|null` („+6“, null bei 0/ohne).
  - `assignColumns(stations, columns: number) -> station[][]`: Spalte aus `column` (1-basiert, > columns → letzte Spalte), ohne `column`: Spalte `(index mod columns) + 1`; innerhalb einer Spalte nach `index`.
  - `stripCommonCity(names: string[]) -> (name) => string`: gemeinsames erstes Wort mit Leerzeichen („Lübeck “) entfernen, wenn es bei allen Namen vorkommt und mehr als eine Haltestelle da ist; nicht kürzen, wenn der Rest nur „Hbf“, „Hauptbahnhof“ oder „Bahnhof“ wäre.
- Layout: Spalten-Grid `repeat(columns, minmax(0,1fr))` plus Störungsspalte (`0.95fr`) wenn `show_disruptions`; je Spalte `grid-template-rows: repeat(n, minmax(0,1fr))`; Haltestelle mit `split_modes` und beiden Verkehrsarten: Abschnitte „Busse“ oben, „Züge“ unten, je halbe Höhe; Kopf: Name (ggf. gekürzt) und „N min“ Fußweg; Zeile: Zeit + Verspätung, Plakette, Ziel (abgeschnitten mit …), bei Zügen Gleis (Wechsel: altes durchgestrichen, neues in `--d-warn`); keine Minutenspalte rechts. „Keine Abfahrten“ bei leerer Haltestelle. Plakette `min-width` wie bisher, wächst mit dem Text, ab 7 Zeichen 0.8-fache Schrift.
- Störungsspalte: Meldungen untereinander (Kicker mit Linie, Titel, Text, Bild), seitenweise mit `usePager`/Höhenmessung wie im Vertretungsplan, Seitenanzeige „1 / 3“.
- Footer-Kasten links neben der Uhr: „Mittwoch, 22. Oktober · 12 °C Regen · Stand 22:11“ (Wetter nur mit Daten; „DB nicht erreichbar“ bzw. „NAH.SH nicht erreichbar“ hinter dem Stand bei `'error'`).

- [ ] **Step 1: Failing tests (vitest)**

```js
expect(formatDepartureTime(dep('22:11'), at('22:11:30'), 'minutes')).toBe('jetzt')
expect(formatDepartureTime(dep('22:14'), at('22:11'), 'minutes')).toBe('3 min')
expect(formatDepartureTime(dep('22:31'), at('22:11'), 'mixed')).toBe('20 min')
expect(formatDepartureTime(dep('22:32'), at('22:11'), 'mixed')).toBe('22:32')
expect(formatDepartureTime(dep('22:14'), at('22:11'), 'clock')).toBe('22:14')
expect(lineColor({ kind_icon: 'bus', line: '8710' })).toBe('#95276E')
expect(lineColor({ kind_icon: 'bus', line: '11', line_color: '#e30613' })).toBe('#e30613')
expect(assignColumns([st(0, 1), st(1, 6), st(2, null)], 4).map((c) => c.map((s) => s.index))).toEqual([[0], [], [2], [1]])
const strip = stripCommonCity(['Lübeck Wahmstraße', 'Lübeck Hbf'])
expect(strip('Lübeck Wahmstraße')).toBe('Wahmstraße'); expect(strip('Lübeck Hbf')).toBe('Lübeck Hbf')
expect(stripCommonCity(['Lübeck Kohlmarkt'])('Lübeck Kohlmarkt')).toBe('Lübeck Kohlmarkt')
```
Plus Komponententests: Busse oben/Züge unten bei `split_modes`, gemischt ohne; keine rechte Minutenspalte; Gleiswechsel-Markup; Störungsspalte fehlt bei `show_disruptions: false`; Footer-Text.

- [ ] **Step 2: Fehlschlag.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün** — Frontend-Checks.
- [ ] **Step 5: Screenshots** — `departures-columns` in Hell/Dunkel, alle drei Zeitformate, Hochformat; ansehen und mit der Vorschau vergleichen.
- [ ] **Step 6: Commit** — `feat(signage): Abfahrten mit festen Spalten, Zeitangabe vorn und Störungsspalte`

### Task 4: Editor

**Files:**
- Modify: `frontend/src/components/signage/admin/view-editors/Departures.jsx`, `frontend/src/components/signage/admin/pages/viewData.js` (`EDITABLE_FIELDS`)
- Test: `view-editors/Departures.test.jsx`

**Interfaces:**
- Felder: „Spalten“ (1–5), pro Haltestelle „Spalte“ (Auswahl 1 bis Spaltenzahl) und Schalter „Busse und Züge getrennt“; „Zeitangabe“ (Minuten, Uhrzeit, Gemischt) mit Hilfetext „Gemischt: bis 20 Minuten als Minuten, danach als Uhrzeit.“; „Störungen anzeigen“; „Ortsnamen kürzen“ mit Hilfetext „Lässt einen Ortsnamen weg, der vor allen Haltestellen steht.“; beim Fußweg Hilfetext „Abfahrten, die man zu Fuß nicht mehr schafft, werden ausgeblendet.“. Kleine Übersicht „Spalte 1: Wahmstraße, Sandstraße · Spalte 2: …“ unter der Haltestellenliste. Wird die Spaltenzahl verkleinert, zeigt die Übersicht Haltestellen mit zu großer Spalte unter der letzten Spalte.
- Die Störungs-Einstellungen (Quellen, eigene Meldungen, ausgeblendete) bleiben; der Text „in der Leiste unten“ wird zu „in der Störungsspalte“.

- [ ] **Step 1: Failing tests** — Spaltenwahl schreibt `transit_stops[i].column`; Schalter schreibt `split_modes`; Zeitangabe/Störungen/Ortsnamen schreiben ihre Felder; Übersicht gruppiert korrekt.
- [ ] **Step 2: Fehlschlag.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün; Admin-Screenshot des Editors ansehen.**
- [ ] **Step 5: Commit** — `feat(signage-admin): Editor für Spalten, Zeitangabe und Störungsspalte`

### Task 5: Doku und Abnahme

**Files:**
- Modify: `CLAUDE.md` (Abfahrten: feste Spalten, Zeitangabe, Störungsspalte, DB-Zugangsdaten für Gleise), `DEPLOY.md` (Migration 0047, Rückweg `migrate signage 0046`; nach dem Deploy in der Abfahrten-Ansicht Spalten zuordnen; für Gleise am Hbf „Lübeck Hbf“ als DB-Haltestelle anlegen)

- [ ] **Step 1: Doku.**
- [ ] **Step 2: Endkontrolle** — alle Checks; Screenshots Anzeige und Editor.
- [ ] **Step 3: Commit** — `docs(signage): Abfahrten-Monitor`
