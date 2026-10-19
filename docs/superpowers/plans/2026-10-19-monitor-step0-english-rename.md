# Monitor Schritt 0: Englische Benennung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Monitor-Modul ist in Backend, Datenbank, API und Frontend englisch benannt, die beschlossenen Funktionen sind entfernt, die Zugangsdaten stehen in der `.env`. Anzeige, Admin, ATEM und Pi-Power funktionieren wie vorher.

**Architecture:** Erst werden Zugangsdaten und Streichungen erledigt (kleinere Angriffsfläche). Dann benennt eine handgeschriebene Schema-Migration Models und Felder um (`RenameModel`/`RenameField`), alle Python-Verweise ziehen im selben Task mit. Eine Datenmigration übersetzt gespeicherte Auswahlwerte, JSON-Schlüssel und Versions-Schnappschüsse. Danach werden die Routen umbenannt (mit Legacy-Aliasen für externe Aufrufer) und zum Schluss das Frontend. Ein Prüfskript findet verbliebene deutsche Bezeichner.

**Tech Stack:** Django 5.0 + Django Ninja 1.1 (SQLite für Tests, PostgreSQL in Produktion), React 19 + Vite, Python-3-Prüfskript.

**Spec:** `docs/superpowers/specs/2026-10-19-monitor-step0-english-rename-design.md` (Glossar §3, Streichungen §4, Abbildungen §5, API §6, Rechte §7, Zugangsdaten §8). Gesamtentwurf: `docs/superpowers/specs/2026-10-19-monitor-overhaul-design.md`.

## Global Constraints

- **Abbildungen 1:1 aus der Spec übernehmen:** Glossar §3, Model-Tabelle §5.1, Feldtabellen §5.2, Auswahlwerte §5.3, JSON-Schlüssel §5.4, Routen-Tabelle §6.1. Weicht ein Name im Code davon ab, gilt die Spec.
- **Sichtbare Texte bleiben deutsch und unverändert.** Ausnahme: gestrichene Bedienelemente verschwinden.
- **Keine optischen Änderungen, keine neuen Funktionen.**
- **Uploads bleiben, wo sie sind:** Upload-Pfade (`monitor_upload_path`) und gespeicherte Dateipfade ändern sich nicht. Es wird keine Datei verschoben.
- **Ninja-Routen:** `""` statt `"/"` für Root-Endpoints, Frontend-Calls ohne Trailing-Slash (CLAUDE.md).
- **Keine Zugangsdaten im Repo.** Die Werte für `NAHSH_HAFAS_AID` und `SWHL_STORYBLOK_TOKEN` stehen nicht in Plan, Tests oder `.env.example`.
- **Tests:** Python unter `backend/` mit aktivierter venv, `DB_ENGINE` nicht gesetzt (SQLite).
- **Commit-Trailer** (Pflicht in jedem Commit):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01D7nDH9UeEyBKSeRzQw1WpF
  ```
- **Branch:** `claude/dashboard-craft-ux-wave-2-1cj1jw`. Kein Deploy, kein PR.
- **Zwischenstände:** Zwischen Task 4 und Task 8 passt das Frontend nicht zum Backend. Der Branch ist erst nach Task 9 lauffähig. Jeder Task muss trotzdem seine eigenen Prüfungen grün haben.

**Einmalige Einrichtung** (vor Task 1, falls `backend/venv` fehlt):

```bash
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
python manage.py migrate && python manage.py test monitor   # Basis: 13 Tests OK
cd ../frontend && npm ci && npm run build && npm run check:tokens
```

## Review Focus

1. **Bestehende Produktionsdaten mit Werten, die das Formular nie schreibt:** zum Beispiel `transit_stops`-Einträge ohne `api`-Schlüssel, `null` in JSON-Feldern, leere Zeitpläne. Die Migration darf daran nicht scheitern und muss fehlende Schlüssel fehlend lassen. → Test `test_forward_tolerates_missing_and_null` in Task 5.
2. **Ausgeblendete Störungen bleiben ausgeblendet:** Die Hash-IDs ändern sich nicht. → Test `test_disruption_id_is_stable` in Task 4.
3. **ATEM sendet weiter das alte Format** (`POST /notfall {aktiv, text}` mit `X-Monitor-Token`), alte Pi-Skripte lesen weiter `/bildschirm/power` mit den alten Antwort-Schlüsseln. → Tests in Task 6.
4. **Ein Pi mit altem JavaScript lädt sich nach dem Deploy selbst neu.** → Test `test_legacy_reload_key_changes_each_minute` in Task 6.
5. **Rollback:** `migrate monitor 0034` stellt alte Namen, Werte und Schlüssel wieder her. Gestrichene Felder kommen leer zurück. → Test `test_backward_restores_old_values` in Task 5.

---

### Task 1: Zugangsdaten in die `.env`

**Files:**
- Modify: `backend/core/settings.py` (neben den anderen `os.getenv`-Einträgen)
- Modify: `backend/monitor/oepnv.py:99-102` (`NAHSH_AUTH`), `:1086` (`SWL_STORYBLOK_TOKEN`), `_nahsh_rpc` (`:135`), `_swl_get` (`:1192`)
- Modify: `backend/.env.example`
- Test: `backend/monitor/tests.py`

**Interfaces:**
- Produces: `settings.NAHSH_HAFAS_AID: str`, `settings.SWHL_STORYBLOK_TOKEN: str` (Default `""`). `oepnv._nahsh_rpc` und `oepnv._swl_get` lesen die Settings **zur Laufzeit**, nicht beim Import.

- [ ] **Step 1: Failing tests schreiben**

```python
class TransitCredentialsTest(TestCase):
    @override_settings(NAHSH_HAFAS_AID='')
    def test_nahsh_without_aid_returns_none_and_logs(self):
        with self.assertLogs('monitor.oepnv', level='WARNING') as log, \
             mock.patch('urllib.request.urlopen') as urlopen:
            self.assertIsNone(oepnv._nahsh_rpc('StationBoard', {}))
        urlopen.assert_not_called()
        self.assertIn('NAHSH_HAFAS_AID', log.output[0])

    @override_settings(SWHL_STORYBLOK_TOKEN='')
    def test_swl_without_token_returns_empty_list(self):
        with self.assertLogs('monitor.oepnv', level='WARNING'), \
             mock.patch('urllib.request.urlopen') as urlopen:
            self.assertEqual(oepnv.fetch_stoerungen_swl(), [])
        urlopen.assert_not_called()

    @override_settings(NAHSH_HAFAS_AID='test-aid')
    def test_nahsh_uses_aid_from_settings(self):
        with mock.patch('urllib.request.urlopen') as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = b'{"svcResL":[{"res":{}}]}'
            oepnv._nahsh_rpc('StationBoard', {})
        body = json.loads(urlopen.call_args[0][0].data)
        self.assertEqual(body['auth'], {'type': 'AID', 'aid': 'test-aid'})
```

- [ ] **Step 2: Ausführen, Fehlschlag prüfen**

Run: `python manage.py test monitor.tests.TransitCredentialsTest -v 2`
Expected: FAIL (kein Logger `monitor.oepnv`, AID fest im Code)

- [ ] **Step 3: Umsetzen**
  - `settings.py` bekommt `NAHSH_HAFAS_AID = os.getenv('NAHSH_HAFAS_AID', '')` und `SWHL_STORYBLOK_TOKEN = os.getenv('SWHL_STORYBLOK_TOKEN', '')`.
  - In `oepnv.py` fallen die festen Werte weg. Dazu kommt `logger = logging.getLogger('monitor.oepnv')`.
  - Fehlt der Wert, macht `_nahsh_rpc` bzw. `_swl_get` keinen Request, loggt einmal eine Warnung mit dem Variablennamen und gibt "keine Daten" zurück: `None` bzw. eine leere Antwort, die die Aufrufer schon als Fehlerfall behandeln.
  - Prüfen, dass `fetch_stoerungen_swl` dann `[]` liefert.

- [ ] **Step 4: `.env.example` ergänzen**

Zwei Zeilen ohne Werte: `NAHSH_HAFAS_AID=` und `SWHL_STORYBLOK_TOKEN=`, darüber der Kommentar `# Öffentliche Client-Kennungen NAH.SH / Stadtwerke Lübeck (Wert aus altem oepnv.py übernehmen)`.

- [ ] **Step 5: Alle Monitor-Tests grün**

Run: `python manage.py test monitor` → Expected: OK (16 Tests)

- [ ] **Step 6: Commit** `fix(monitor): ÖPNV-Zugangsdaten aus dem Code in die .env`

---

### Task 2: Gestrichene Funktionen entfernen

**Files:**
- Create: `backend/monitor/webuntis.py`
- Create: `backend/monitor/migrations/0035_remove_dropped_features.py`
- Modify:
  - Backend: `backend/monitor/models.py`, `api.py` (`_fetch_raumplan` und Display-Felder), `schemas.py`
  - Anzeige: `frontend/src/pages/MonitorPage.jsx`
  - Admin: `frontend/src/pages/admin/MonitorAdminPage.jsx`
- Delete: `frontend/src/components/monitor/BaukastenEditor.jsx`, `BaukastenRenderer.jsx`, `BaukastenWidget.jsx`, `CameraStream.jsx`
- Test: `backend/monitor/tests_migrations.py` (neu)

**Interfaces:**
- Produces:
  - `monitor/webuntis.py`: Der unveränderte JSON-RPC-Client aus `api.py:160-262`, aufgeteilt in `authenticate(server, school, username, password) -> session`, `get_timetable(session, element_type, element_id, date_from, date_to) -> list[dict]`, `logout(session)`. Ohne Aufrufer in diesem Schritt.
  - Migration `0035`, Abhängigkeit `0034_bildschirm_neu_laden_zeit`.

- [ ] **Step 1: Failing Migrationstest schreiben** (`tests_migrations.py`, Hilfsklasse `MigrationTestCase` mit `MigrationExecutor`; `migrate_from`/`migrate_to` als Klassenattribute)

```python
class RemoveDroppedFeaturesTest(MigrationTestCase):
    migrate_from = ('monitor', '0034_bildschirm_neu_laden_zeit')
    migrate_to = ('monitor', '0035_remove_dropped_features')

    def setUpBeforeMigration(self, apps):
        Config = apps.get_model('monitor', 'MonitorConfig')
        self.bk = Config.objects.create(name='BK', slug='bk', layout_modus='baukasten')
        Config.objects.create(name='RP', slug='rp', raumplan_server='s.webuntis.com',
                              raumplan_schule='kath', raumplan_benutzername='u', raumplan_passwort='p')

    def test_baukasten_becomes_standard(self):
        Config = self.apps.get_model('monitor', 'MonitorConfig')
        self.assertEqual(Config.objects.get(slug='bk').layout_modus, 'standard')

    def test_profile_credentials_copied_when_global_empty(self):
        g = self.apps.get_model('monitor', 'MonitorGlobalSettings').objects.get()
        self.assertEqual((g.raumplan_server, g.raumplan_schule, g.raumplan_benutzername, g.raumplan_passwort),
                         ('s.webuntis.com', 'kath', 'u', 'p'))

    def test_dropped_fields_are_gone(self):
        fields = {f.name for f in self.apps.get_model('monitor', 'MonitorConfig')._meta.get_fields()}
        self.assertFalse(fields & {'layout_widgets', 'zeige_bildschirmschoner', 'kamera_url',
                                   'ticker_text', 'raumplan_raum', 'raumplan_cache'})
```

Dazu kommt `test_global_credentials_not_overwritten`: Vorher gesetzte globale Werte bleiben erhalten. Dass `MonitorGlobalSettings` ein Singleton ist, zeigt `load()` in `models.py:786`. Die Migration nutzt `get_or_create(pk=1)`.

- [ ] **Step 2: Ausführen, Fehlschlag prüfen**

Run: `python manage.py test monitor.tests_migrations -v 2` → Expected: FAIL (Migration fehlt)

- [ ] **Step 3: Migration `0035` schreiben**

Zuerst `RunPython(forward, reverse)`:
- `forward` setzt `baukasten` auf `standard` und kopiert die Zugangsdaten der ersten Ansicht mit gesetztem `raumplan_server` in die globalen Einstellungen, wenn dort `raumplan_server` leer ist.
- `reverse` ist ein No-op.

Danach `RemoveField` für alle Felder aus Spec §4 sowie `AlterField` für `layout_modus` ohne den Wert `baukasten`.

- [ ] **Step 4: Models, Schemas und `api.py` anpassen**
  - Felder und Choice `baukasten` raus.
  - `_fetch_raumplan` und der Schlüssel `raumplan` in der Display-Antwort entfallen.
  - Der Client wandert nach `webuntis.py`.

  Prüfen mit `python manage.py makemigrations monitor --check --dry-run` → Expected: "No changes detected"

- [ ] **Step 5: Frontend entfernen**
  - **MonitorPage:** Bildschirmschoner (`:292`, `:379-407`, `:533-560`), Ticker, Kamera, Raumplan-Anzeige, Baukasten-Layout und die Imports der gelöschten Komponenten raus.
  - **MonitorAdminPage:** die zugehörigen Bedienelemente raus. Dazu gehören die Feldlisten `:466`, `:911` und die Widget-Liste `:992`, soweit sie gestrichene Felder nennen.

  Prüfen:
  ```bash
  cd frontend && npm run build
  grep -rn "Baukasten\|CameraStream\|bildschirmschoner\|ticker_\|raumplan" src/ ; echo exit=$?
  ```
  Expected: Build OK. `grep` findet nichts (`exit=1`).

- [ ] **Step 6: Alle Backend-Tests grün** — `python manage.py test monitor` → OK

- [ ] **Step 7: Commit** `refactor(monitor): Baukasten, Bildschirmschoner, Kamera, Ticker und Raumplan-Widget entfernen`

---

### Task 3: Prüfskript für deutsche Bezeichner

**Files:**
- Create: `scripts/check-monitor-identifiers.py`, `scripts/check-monitor-identifiers.allow`
- Test: `scripts/test_check_monitor_identifiers.py`

**Interfaces:**
- Produces: CLI `python3 -I scripts/check-monitor-identifiers.py [PATH ...]`.
  - Ohne Pfade prüft es `backend/monitor` (ohne `migrations/`), `frontend/src/pages/MonitorPage.jsx`, `frontend/src/pages/admin/MonitorAdminPage.jsx` und `frontend/src/components/monitor`.
  - Exit 0 = sauber, 1 = Funde (Ausgabe `datei:zeile: token`), 2 = Pfad existiert nicht.
  - Spätere Tasks rufen es mit ihren eigenen Pfaden auf.

**Regeln** (fest, aus Glossar §3). Ein Token ist ein Fund, wenn:
1. Er snake_case ist (`[a-z][a-z0-9]*(_[a-z0-9]+)+`) oder camelCase (`[a-z]+[A-Z]\w*`) und einen Stamm aus `STEMS` enthält (Groß-/Kleinschreibung egal).
2. Ein **ganzes** String-Literal nur aus Kleinbuchstaben, Ziffern, `_` und `-` besteht und entweder in `WORDS` steht oder einen Stamm enthält.
3. Er in einer `.py`-Datei als Name-Token (per `tokenize`, nicht in Strings) genau `Bildschirm`, `Klausur`, `Ankuendigung`, `MonitorConfig`, `MonitorDatei`, `MonitorEvent`, `EventBildschirm`, `KlausurVorlage`, `MonitorGlobalSettings` oder `MonitorConfigVersion` lautet.

Tokens aus der `.allow`-Datei (ein Token pro Zeile, `#`-Kommentare) sind nie Funde.

```python
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
```

Start-Inhalt der `.allow`-Datei (jede Zeile kommentiert mit dem Grund):
- `onair`, `notfall`, `bildschirm`, `profil`, `aktiv`: Legacy-Alias-Routen und -Parameter (§6.1)
- `neu_laden_zeit`: Übergangsschlüssel (§6.3)
- `manuell`: Hash-Eingabe von `_disruption_id` (§5.4)
- `power_zeitplan`, `ferien_modus`, `power_ausnahmen`, `cec_status_zeit`: Legacy-Antwort von `/bildschirm/power`

- [ ] **Step 1: Failing Tests** (`unittest`, Fixtures als `tempfile`-Dateien)
  - `test_snake_case_with_stem_is_flagged`: `x = config.zeige_uhr` → Fund `zeige_uhr`
  - `test_camel_case_with_stem_is_flagged`: `const bildschirmSlug = 1` → Fund
  - `test_visible_german_text_is_ignored`: `<p>Bildschirm nicht gefunden</p>` und `"Linien und Richtungen"` → kein Fund
  - `test_whole_lowercase_literal_in_words_is_flagged`: `{'von': '07:00'}` → Fund `von`
  - `test_python_old_model_name_flagged_but_not_in_string`: `from .models import Bildschirm` → Fund. `msg = "Bildschirm"` → kein Fund.
  - `test_allowlist_suppresses`: `'neu_laden_zeit'` mit Allowlist → kein Fund
  - `test_missing_path_exits_2`
  - `test_stagedesk_is_not_a_finding`: `stagedesk_url` → kein Fund. Das ist der Grund, warum `tage` nur in `WORDS` steht und nicht in `STEMS`.

- [ ] **Step 2: Ausführen, Fehlschlag prüfen** — `python3 -m unittest scripts/test_check_monitor_identifiers.py` → FAIL

- [ ] **Step 3: Skript schreiben**
  - **Python-Dateien:** `tokenize` (NAME und STRING getrennt).
  - **JS/JSX:**
    - Kommentare werden *nicht* entfernt; deutsche Bezeichner in Kommentaren sollen mit umbenannt werden.
    - String-Literale per Regex `'…'`, `"…"`, `` `…` `` ohne `${`.
    - Bezeichner per `[A-Za-z_$][\w$]*`.
  - **Ausgabe** sortiert nach Datei und Zeile.

- [ ] **Step 4: Tests grün** — `python3 -m unittest scripts/test_check_monitor_identifiers.py` → OK

- [ ] **Step 5: Bestandsaufnahme**

Run: `python3 -I scripts/check-monitor-identifiers.py | wc -l` → Expected: deutlich über 0. Die Zahl im Commit-Text notieren; das ist die Arbeitsliste für die Tasks 4 bis 8.

- [ ] **Step 6: Commit** `chore(monitor): Prüfskript für deutsche Bezeichner`

---

### Task 4: Models und Felder umbenennen (Schema-Migration und Python-Verweise)

**Files:**
- Create: `backend/monitor/migrations/0036_english_names.py` (von Hand geschrieben, **nicht** per `makemigrations`; das würde für jedes Feld interaktiv nachfragen)
- Modify: `backend/monitor/models.py`, `api.py`, `schemas.py`, `oepnv.py`, `consumers.py`, `webuntis.py`, `admin.py`, `tests.py`, `tests_migrations.py`

**Interfaces:**
- Produces:
  - **Models und Felder** exakt nach Spec §5.1/§5.2.
  - **Methoden** nach Glossar:
    - `Screen.get_active_view()`, `Screen.get_active_event_view()`, `Screen.get_active_exam()`, `Screen.get_power_state()`
    - `Screen._time_in_window(time, start, end)`, `Screen._active_exception(today)`
    - `DisplayView.get(slug=None)`, `DisplayView.set_on_air(status)`
    - `DisplayView.get_background_image_url()`, `get_image_url()`, `get_webuntis_url_next_day()` (`get_logo_url`, `get_pdf_url`, `get_webuntis_url` bleiben)
    - `Exam/DisplayEvent/Announcement.is_active_now()`, `Announcement.is_visible()`
  - **API-Hilfsfunktionen:**
    - `_validate_view_data(data)`, `_validate_exam_data(data)`
    - `_fetch_weather(view)`, `_fetch_transit(view)`, `_fetch_disruptions(view)`
    - `_snapshot_view(view)`, `_log_audit(request, action, detail='', via_token=False)`
  - **oepnv:**
    - `fetch_departures(stops, duration=60, max_per_stop=20, …, strike_lines=None, strike_types=None)`
    - `fetch_disruptions_nahsh(line_filter=None, max_num=200)`, `fetch_disruptions_swl(line_filter=None)`
    - `_disruption_id(source, title, text)`, `search_stations(…)`
    - übrige private Funktionen nach Glossar
  - **Schemas** nach Glossar, zum Beispiel `MediaFileSchema`, `DisplayViewSchema`, `DisplayViewUpdateSchema`, `ScreenListSchema`, `ExamSchema`, `EmergencySchema` (`active: bool`, `text: str = ''`), `MonitorSettingsSchema`.
  - **Schlüssel der Display-Antwort:** `config` bleibt (schon englisch). Neu sind `departures`, `disruptions`, `weather`, `announcements`, `events`, `exam`, `reload_requested_at`. Die `*_resolved`-Schlüssel folgen den Feldnamen, zum Beispiel `background_image_url_resolved`, `webuntis_url_next_day_resolved`.
  - **Route-Pfade und gespeicherte Werte ändern sich in diesem Task NICHT** (Tasks 5 und 6).

- [ ] **Step 1: `tests.py` auf die neuen Namen umschreiben** (Inhalt der 13 Tests unverändert) und einen Test ergänzen:

```python
def test_disruption_id_is_stable(self):
    # Hash-Eingaben bleiben identisch, sonst tauchen ausgeblendete Meldungen wieder auf
    self.assertEqual(oepnv._disruption_id('manuell', 'Titel', 'Text'),
                     hashlib.md5('manuell|Titel|Text'.encode()).hexdigest()[:12])
```

- [ ] **Step 2: Ausführen, Fehlschlag prüfen** — `python manage.py test monitor` → Expected: ImportError (`Screen` existiert nicht)

- [ ] **Step 3: Migration `0036` schreiben**
  - Abhängigkeit `0035`.
  - Erst `RenameModel` für alle 11 Models (§5.1; `WebUntisLink` bleibt), dann `RenameField` für jedes Feld aus §5.2.
  - Zum Schluss `AlterField` für Felder mit geändertem `related_name` bzw. geänderten Choices-Labels.

- [ ] **Step 4: Python-Code umbenennen**
  - `models.py`, `schemas.py`, `api.py`, `oepnv.py`, `consumers.py`, `webuntis.py`, `admin.py` nach §5 und Glossar.
  - Lokale Variablen und Funktionen ebenfalls, zum Beispiel `versteckt` → `hidden`, `aktuelle_ids` → `current_ids`.
  - `_disruption_id` behält den f-String exakt.
  - Die Literale der **gespeicherten Werte** (`'abfahrten'`, `'links'`, `'manuell_an'` …) und die JSON-Schlüssel (`'wegzeit_minuten'` …) bleiben in diesem Task stehen.

- [ ] **Step 5: Prüfen**

```bash
python manage.py makemigrations monitor --check --dry-run   # No changes detected
python manage.py test monitor                                # OK
python3 -I ../scripts/check-monitor-identifiers.py monitor/models.py monitor/schemas.py monitor/consumers.py monitor/admin.py monitor/webuntis.py
```

Erwartung beim Prüfskript: Funde nur noch für gespeicherte Werte und JSON-Schlüssel. Jeder Fund ist ein String-Literal aus §5.3/§5.4.

- [ ] **Step 6: Commit** `refactor(monitor): Models, Felder und Python-Code englisch benennen`

---

### Task 5: Gespeicherte Werte, JSON-Schlüssel, Versionen und Rechte migrieren

**Files:**
- Create: `backend/monitor/migrations/0037_english_values.py`
- Create: `backend/users/migrations/0015_rename_monitor_emergency_permission.py`
- Modify: `backend/monitor/models.py` (Choices), `api.py`, `oepnv.py` (Literale), `backend/users/api.py:787-793`, `:900`
- Test: `backend/monitor/tests_migrations.py` (auch der Rechte-Test, mit `migrate_from`/`migrate_to` auf `users`)

**Interfaces:**
- Produces in `0037_english_values.py`, als Modul-Konstanten und reine Funktionen (die Tests importieren sie per `importlib.import_module('monitor.migrations.0037_english_values')`):
  - `CHOICE_MAP: dict[str, dict[str, dict[str, str]]]` — Model → Feld → {alt: neu}, exakt §5.3
  - `SCHEDULE_KEYS`, `SCREEN_SCHEDULE_KEYS`, `EXCEPTION_KEYS`, `STOP_KEYS`, `STOP_SOURCE_VALUES`, `MANUAL_DISRUPTION_KEYS`, `PAGE_ROTATION_VALUES` — exakt §5.4
  - `FIELD_MAP: dict[str, str]` — alte → neue Feldnamen von `MonitorConfig` (§5.2), für Schnappschüsse
  - `DROPPED_FIELDS: set[str]` — Felder aus §4
  - `translate_stop(entry: dict, reverse: bool = False) -> dict`
  - `translate_snapshot(data: dict, reverse: bool = False) -> dict`: benennt Schlüssel um, übersetzt Auswahlwerte und JSON-Schlüssel darin. Vorwärts fallen `DROPPED_FIELDS` weg.
- Produces in `users`: Die Permission mit dem Code `monitor.notfall` heißt danach `monitor.emergency`. `default_permissions` nennt `monitor.emergency`.

**Regeln für unvollständige Daten:**
- Fehlende Schlüssel bleiben fehlend.
- `None` und Nicht-Dicts in Listen werden unverändert übernommen.
- Unbekannte Schlüssel bleiben unverändert.
- Caches (`transit_cache`, `transit_disruption_cache`, `weather_cache`, jeweils mit `*_at`) werden auf `None` gesetzt.

- [ ] **Step 1: Failing Tests** (`EnglishValuesMigrationTest(MigrationTestCase)`, von `0036` nach `0037`)
  - `test_choice_values_translated`: Werte aus §5.3 vorher, danach zum Beispiel `layout == 'departures'`, `on_air_position == 'top-right'`, `power_mode == 'manual_on'`, `priority == 'urgent'`, `pdf_mode == 'cycle'`.
  - `test_transit_stop_keys_translated`:
    - vorher `{'id': '8000237', 'name': 'Lübeck Hbf', 'wegzeit_minuten': 14, 'api': 'beide', 'zeige_bahn': True, 'zusatz_zeige_bus': False, 'max_zug': 5}`
    - nachher `{'id': '8000237', 'name': 'Lübeck Hbf', 'walk_minutes': 14, 'source': 'both', 'show_rail': True, 'extra_show_bus': False, 'max_train': 5}`
  - `test_schedules_translated`: `{'profil_id': 3, 'tage': [0, 1], 'von': '07:00', 'bis': '17:00'}` → `{'view_id': 3, 'days': [0, 1], 'from': '07:00', 'until': '17:00'}`. Analog `power_exceptions` mit `von_datum` → `from_date`.
  - `test_snapshot_translated_and_dropped_fields_removed`: Ein `DisplayViewVersion.data` mit `{'layout_modus': 'abfahrten', 'oepnv_stationen': [...], 'zeige_kamera': True}` wird zu `{'layout': 'departures', 'transit_stops': [...übersetzt...]}` ohne `zeige_kamera`.
  - `test_caches_cleared`
  - **`test_forward_tolerates_missing_and_null`** (Review Focus 1): ein Stop ohne `api`, `transit_stops = None`, `schedule = []`, `power_exceptions = [None, 'x']` → Migration läuft durch. Werte bleiben, wie in den Regeln oben beschrieben.
  - **`test_backward_restores_old_values`** (Review Focus 5): vorwärts, dann zurück auf `0034`. Choice-Werte, Stop-Schlüssel und Zeitpläne sind wieder alt.
  - `test_permission_renamed`: Eine Permission `monitor.notfall` mit Gruppen-Zuweisung heißt danach `monitor.emergency`, die Zuweisung bleibt.

- [ ] **Step 2: Ausführen, Fehlschlag prüfen** — `python manage.py test monitor.tests_migrations` → FAIL

- [ ] **Step 3: Migrationen schreiben**
  - **`0037`:** `RunPython(forward, backward)` über alle Models nach den Konstanten. Rückwärts kehren die Abbildungen sich um.
  - **`users/0015`:** `RunPython` mit Rückweg. Abhängigkeit auf die letzte `users`-Migration (`0014_userprofile_notify_disabled`).

- [ ] **Step 4: Code-Literale umstellen**
  - Choices in `models.py`, alle Literale in `api.py` und `oepnv.py` nach §5.3/§5.4.
  - Dazu die Antwort-Schlüssel von Störungen: `source`, `kind`, `title`, `lines`, `from`, `until`, `image`, `stops`, `suggestion`.
  - Die Quellkennungen in der Antwort heißen `'manual'`, `'nahsh'`, `'swl'`. Die Hash-Eingabe in `_disruption_id` bleibt bei den alten Werten: Aufrufer übergeben `'manuell'`. Das steht als Kommentar an der Stelle.

  Danach `python manage.py makemigrations --check --dry-run` → No changes.

- [ ] **Step 5: Prüfen**

```bash
python manage.py test monitor users   # OK
python3 -I ../scripts/check-monitor-identifiers.py backend/monitor   # nur noch Funde aus Task 6 (Routen-Pfade, Query-Parameter)
```

- [ ] **Step 6: Commit** `refactor(monitor): gespeicherte Werte, JSON-Schlüssel und Recht monitor.emergency migrieren`

---

### Task 6: API-Routen, Legacy-Aliase und Übergangsschlüssel

**Files:**
- Modify: `backend/monitor/api.py`
- Test: `backend/monitor/tests_api.py` (neu, Django-`Client` gegen `/api/monitor/...`)

**Interfaces:**
- Consumes: Funktionen und Schemas aus Task 4/5.
- Produces:
  - Routen exakt nach §6.1, mit neuen Query-Parametern: `view_id` statt `profil_id`, `kind` statt `typ`/`art`, `file` statt `datei`.
  - `/display?screen=&view=`
  - Block `# Legacy aliases (ATEM, Pi scripts)` am Ende von `api.py` mit:
    - `POST /onair` (`OnAirSchema`)
    - `POST /notfall` (`LegacyEmergencySchema`: `aktiv: bool`, `text: str = ''`)
    - `GET /bildschirm/power?slug=` mit der **alten Antwortform** `{slug, power, power_zeitplan, ferien_modus, power_ausnahmen, cec_status, cec_status_zeit}`
    - `POST /bildschirm/cec-status?slug=&status=`
  - `/display` akzeptiert zusätzlich `bildschirm` und `profil`.
  - `_legacy_reload_key(now) -> str`: ISO-Zeit auf die Minute abgerundet. Wird in `/display` als `neu_laden_zeit` ausgegeben, mit dem Kommentar `# TODO(step-b): remove legacy reload key`.

- [ ] **Step 1: Failing Tests**

```python
class LegacyAliasTest(TestCase):
    def setUp(self):
        self.view = DisplayView.objects.create(name='V', slug='v', is_default=True, api_token='tok')
        self.screen = Screen.objects.create(name='S', slug='glocke', default_view=self.view)

    def test_legacy_onair_with_token(self):
        r = self.client.post('/api/monitor/onair', {'on_air': True},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(DisplayView.objects.get(pk=self.view.pk).is_on_air)

    def test_legacy_notfall_old_payload(self):
        r = self.client.post('/api/monitor/notfall', {'aktiv': True, 'text': 'Probealarm'},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        v = DisplayView.objects.get(pk=self.view.pk)
        self.assertEqual((v.emergency_active, v.emergency_text), (True, 'Probealarm'))

    def test_new_emergency_route(self):
        r = self.client.post('/api/monitor/emergency', {'active': True, 'text': 'X'},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)

    def test_legacy_power_keeps_old_response_shape(self):
        r = self.client.get('/api/monitor/bildschirm/power', {'slug': 'glocke'}).json()
        self.assertEqual(set(r), {'slug', 'power', 'power_zeitplan', 'ferien_modus',
                                  'power_ausnahmen', 'cec_status', 'cec_status_zeit'})

    def test_display_accepts_old_and_new_params(self):
        for params in ({'screen': 'glocke'}, {'bildschirm': 'glocke'}, {'view': 'v'}, {'profil': 'v'}):
            self.assertEqual(self.client.get('/api/monitor/display', params).status_code, 200)

    def test_legacy_reload_key_changes_each_minute(self):
        t = timezone.make_aware(datetime(2026, 10, 19, 10, 42, 31))
        self.assertEqual(_legacy_reload_key(t), _legacy_reload_key(t + timedelta(seconds=20)))
        self.assertNotEqual(_legacy_reload_key(t), _legacy_reload_key(t + timedelta(seconds=40)))
        self.assertIn('neu_laden_zeit', self.client.get('/api/monitor/display', {'screen': 'glocke'}).json())
```

Dazu kommt `test_old_admin_route_is_gone`: `GET /api/monitor/bildschirme` liefert 404.

- [ ] **Step 2: Ausführen, Fehlschlag prüfen** — `python manage.py test monitor.tests_api` → FAIL

- [ ] **Step 3: Routen umbenennen, Aliase und `_legacy_reload_key` ergänzen** (Alias-Funktionen rufen die neuen Funktionen auf, nur die Legacy-Power-Route bildet die Antwort auf die alten Schlüssel ab)

- [ ] **Step 4: Prüfen**

```bash
python manage.py test monitor users                              # OK
python3 -I ../scripts/check-monitor-identifiers.py monitor       # Exit 0 (alles Übrige steht in .allow)
```

- [ ] **Step 5: Commit** `refactor(monitor): englische API-Routen mit Aliasen für ATEM und Pi`

---

### Task 7: Anzeige-Frontend umstellen

**Files:**
- Modify: `frontend/src/pages/MonitorPage.jsx`, `frontend/src/components/monitor/PdfFullscreen.jsx`

**Interfaces:**
- Consumes: Display-Antwort aus Task 4–6 (`departures`, `disruptions`, `weather`, `announcements`, `events`, `exam`, `reload_requested_at`, Konfigurationsfelder nach §5.2, Werte nach §5.3/§5.4).
- Produces: URL-Parameter `screen`, `view` und `zoom`; `bildschirm` und `profil` werden weiter gelesen.

- [ ] **Step 1: Bezeichner und Datenzugriffe umbenennen**
  - Alle Feldzugriffe nach §5.2, alle verglichenen Werte nach §5.3/§5.4, zum Beispiel `layout === 'departures'`, `dep.walk_minutes`, `side === 'right'`.
  - Lokale Namen nach Glossar, zum Beispiel `SWL_LINE_COLORS`, `getLineColor`, `chipTextColor` (bleibt), `swlColorForLine` (bleibt), `isGenericNotice`, `screenSlug`, `viewSlug`.
  - Der Reload liest `json.reload_requested_at`.
  - `/display` wird mit `screen` bzw. `view` aufgerufen.
  - **Sichtbare Texte nicht ändern.**

- [ ] **Step 2: Prüfen**

```bash
cd frontend && npm run build && npm run check:tokens
python3 -I ../scripts/check-monitor-identifiers.py src/pages/MonitorPage.jsx src/components/monitor
```

Expected: Build OK, check-tokens unverändert, Prüfskript Exit 0.

- [ ] **Step 3: Sichtprüfung mit echtem Backend**
  - Backend lokal mit einer Ansicht pro verbliebenem Layout (`standard`, `timetable`, `on_air`, `departures`, `pdf_fullscreen`, `image_fullscreen`, `split`) starten.
  - Für jede `/monitor?view=<slug>` in headless Chromium öffnen (`/opt/pw-browsers/chromium`, `--headless=new`) und prüfen: keine Konsolenfehler, kein Fehlerzustand.
  - Zusätzlich `/monitor?profil=<slug>` einmal.
  - Ergebnis im Commit-Text festhalten.

- [ ] **Step 4: Commit** `refactor(monitor): Anzeige-Frontend englisch benannt`

---

### Task 8: Admin-Frontend und Rechte umstellen

**Files:**
- Modify: `frontend/src/pages/admin/MonitorAdminPage.jsx` (Rechte `:191-194`), `frontend/src/components/DashboardLayout.jsx:145` und `frontend/src/App.jsx:109` (nur prüfen; `monitor.view` bleibt)

**Interfaces:**
- Consumes: Routen §6.1 (neue Pfade, keine Aliase), Schemas aus Task 4/5, Recht `monitor.emergency`.

- [ ] **Step 1: Umbenennen**
  - Alle API-Aufrufe nach §6.1, zum Beispiel `/monitor/screens`, `/monitor/exams`, `/monitor/trash/restore`, Query `view_id`.
  - Feldnamen in Formularen, Feldlisten und Payloads nach §5.2, Auswahlwerte nach §5.3, Stop-Schlüssel nach §5.4.
  - `canEmergency = isAdmin || hasPermission('monitor.emergency')`.
  - Lokale Namen nach Glossar.
  - Sichtbare Texte nicht ändern.

- [ ] **Step 2: Prüfen**

```bash
cd frontend && npm run build && npm run check:tokens
python3 -I ../scripts/check-monitor-identifiers.py src/pages/admin/MonitorAdminPage.jsx
grep -rn "'/monitor/\(profile\|bildschirme\|klausuren\|dateien\|papierkorb\|ankuendigungen\|klausur-vorlagen\|global-settings\|stoerungen\|oepnv\)" src/ ; echo exit=$?
```

Expected: Build OK. Prüfskript Exit 0. `grep` findet nichts (`exit=1`).

- [ ] **Step 3: Sichtprüfung mit echtem Backend**

Das Admin braucht einen Keycloak-Login. Ist lokal keiner möglich, entfällt diese Sichtprüfung. Sie wird dann in der Übergabe an den Nutzer als offener Punkt zum Prüfen auf localhost genannt. Mit Login wird in jedem Bereich einmal geladen und gespeichert:
- eine Ansicht samt Haltestelle mit Fußweg
- einen Bildschirm samt Zeitplan
- eine Klausur
- eine Ankündigung
- einen Datei-Upload
- Papierkorb wiederherstellen
- Version wiederherstellen

Danach in der DB prüfen, dass die Werte unter den neuen Namen stehen.

- [ ] **Step 4: Commit** `refactor(monitor): Admin-Frontend englisch benannt, Recht monitor.emergency`

---

### Task 9: Schlussprüfung und Deploy-Notiz

**Files:**
- Modify: `DEPLOY.md` (Abschnitt "Monitor Schritt 0" mit Backup, `.env`-Variablen, Probelauf, Rollback nach Spec §10/§11)
- Modify: `docs/raspberry-pi-monitor.md` (Kiosk-URL-Beispiele `?screen=`; alte Parameter funktionieren weiter)

- [ ] **Step 1: Gesamtprüfung**

```bash
cd backend && source venv/bin/activate
python manage.py makemigrations --check --dry-run      # No changes detected
python manage.py test                                  # alle Apps OK
python manage.py migrate monitor 0034 && python manage.py migrate   # Rückweg und Hinweg laufen auf frischer DB durch
cd .. && python3 -I scripts/check-monitor-identifiers.py            # Exit 0
python3 -m unittest scripts/test_check_monitor_identifiers.py       # OK
cd frontend && npm run build && npm run check:tokens && npm run test:tokens
```

- [ ] **Step 2: Diff gegen die Spec lesen**

`git diff 37861ff --stat` und die Feldtabellen §5.2 gegen `models.py` abgleichen, Feld für Feld. Abweichungen beheben, nicht dokumentieren.

- [ ] **Step 3: Deploy-Notiz schreiben**

`DEPLOY.md` beschreibt in Kurzform:
1. Backup-Tag und DB-Dump
2. `NAHSH_HAFAS_AID` und `SWHL_STORYBLOK_TOKEN` in `/opt/stagedesk/backend/.env`
3. Probelauf: Produktions-Dump in eine Test-DB, `migrate`, Stichprobe Ansicht/Bildschirm/Klausur/Version
4. Deploy
5. `/display?screen=glocke` und `?screen=mensa` prüfen, ATEM On-Air einmal schalten
6. Rollback: `migrate monitor 0034` plus Code auf den Backup-Tag, `migrate users 0014`

- [ ] **Step 4: Commit und Push**

```bash
git commit -m "docs(monitor): Deploy-Schritte für Schritt 0"
git push -u origin claude/dashboard-craft-ux-wave-2-1cj1jw
```
