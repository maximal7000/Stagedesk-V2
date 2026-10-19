# Monitor Anzeige und Admin (B + A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die öffentliche Monitor-Anzeige im Schuldesign und das neue Monitor-Admin, inklusive Ferien, "bis Tagesende aus", Notfall-Einschalten, Medien-Umwandlung und Vertretungsplan aus WebUntis.

**Architecture:**
- **Etappe 1, Backend** (Tasks 1–8): erst das Datenmodell additiv, dann Datenmigration und Abbau, dann Fachlogik in eigenen Modulen (`power.py`, `media.py`, `webuntis.py`, `display.py`, `push.py`) und ein zweiter Ninja-Router `api_setup.py` für neue Endpunkte.
- **Etappe 2, Anzeige** (Tasks 9–13): unter `components/display/`, mit vitest für reine Logik und einer Screenshot-Abnahme über Testdaten.
- **Etappe 3, Admin** (Tasks 14–19): unter `components/monitor-admin/` mit eigenen Routen.
- **Abschluss** (Task 20): Doku und Rollout.

**Tech Stack:**
- Backend: Django 5 + Ninja 1.1, Channels (Tests mit `InMemoryChannelLayer`), pypdfium2, Pillow, WebUntis JSON-RPC
- Frontend: React 19 + Vite, Tailwind v4, @fontsource (Oswald, Lato), vitest, playwright-core (headless Chromium unter `/opt/pw-browsers/chromium` bzw. `CHROMIUM_PATH`)

**Spec:** `docs/superpowers/specs/2026-10-19-monitor-display-admin-design.md` (Kapitelverweise unten beziehen sich darauf). Gesamtentwurf: `docs/superpowers/specs/2026-10-19-monitor-overhaul-design.md` (§4.1 Gestaltung, §7 Copy).

## Global Constraints

- **Code englisch, Oberfläche deutsch.**
  - Feld- und Wertnamen 1:1 aus Spec §3.
  - Neue Bezeichner bestehen `python3 -I scripts/check-monitor-identifiers.py` (Exit 0).
- **Copy** (Gesamtentwurf §7):
  - Labels sind Substantive oder Verben.
  - Hilfetext in einem Satz unter dem Feld, keine Tooltips als einzige Hilfe.
  - Kein "Tipp:", kein Duzen in Systemtexten, keine Em-Dashes, keine Floskeln.
  - Fehler nennen Ursache und nächsten Schritt.
- **Anzeige-Gestaltung** (Gesamtentwurf §4.1):
  - Oswald und Lato lokal gebündelt.
  - Rot `#da1f3d` nur für CI-Elemente und Ausfälle, dazu die SWL-Linienfarben.
  - Keine Schatten, Verläufe, Leuchteffekte, Pills, Spinner oder Emoji.
  - Keine Titelzeile bei dichten Ansichten.
- **Admin-Gestaltung:** Bühnenschwarz-Tokens (`bg-surface`, `text-fg-muted` …), Bausteine aus `frontend/src/components/ui/`, `rounded-lg` (keine Pills), lucide-react-Icons.
- **Pi 4:**
  - Nur `useClock` rendert sekündlich.
  - Komponenten werden auf Modulebene definiert.
  - Animiert werden nur `opacity` und `transform`; Scroll-Animationen sind verboten.
- **Bestehende Daten und Kiosk-URLs funktionieren weiter**, die Legacy-Aliase aus Schritt 0 bleiben.
- **Ninja-Routen:** `""` statt `"/"`.
- **Keine Zugangsdaten im Repo.**
- **Commit-Trailer** (Pflicht):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01D7nDH9UeEyBKSeRzQw1WpF
  ```
- **Branch:** `claude/dashboard-craft-ux-wave-2-1cj1jw`. Kein Deploy, kein PR.
- **Backend-Tests:** `cd backend && source venv/bin/activate && python manage.py test monitor users` (SQLite). Channels-Tests mit `@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})`.
- **Frontend-Prüfungen:** `cd frontend && npm run build && npm run check:tokens && npx vitest run`.
- **Zwischenstände:** Ab Task 2 passt das alte Frontend nicht mehr zum Backend; ab Task 14 ist das alte Admin abgelöst. Lauffähig ist der Branch erst nach Task 19. Jeder Task hält seine eigenen Prüfungen grün.

## Review Focus

1. **Echte Produktionsdaten mit Altlasten:** Ansichten mit `layout='split'` ohne WebUntis-Seite, Rotation mit nur einer Seite, Freitext ohne Titel, `active_pdf` auf eine gelöschte Datei. Die Migration läuft durch, und kein Bildschirm verliert seine Standard-Ansicht. → `test_migration_messy_views` (Task 2)
2. **Ein Bildschirm ohne gültigen Schlüssel** in der Kiosk-URL sieht den Vertretungsplan als iframe statt leer oder als Fehler. → `test_substitutions_without_key_returns_fallback_only` (Task 7) und Screenshot `substitutions-fallback` (Task 11)
3. **"Bis Tagesende aus" am Freitagabend:** Er schaltet bis Montagmorgen ab, nicht bis Samstag 05:00, sofern der Zeitplan das Wochenende ausnimmt. → `test_power_off_today_skips_days_without_window` (Task 4)
4. **Ein großes PDF mit gemischten Seiten** ergibt Seiten in der richtigen Ausrichtung. Ein kaputtes PDF lässt den Upload mit Status `failed` und lesbarer Meldung enden, nicht mit einem hängenden `processing`. → `test_corrupt_pdf_marks_failed` (Task 5)
5. **Verbindungsabbruch genau beim Blättern einer langen Liste:** Der letzte Inhalt bleibt mit "Stand HH:MM" stehen, erst nach 120 s erscheint "Verbindung verloren", und nach Rückkehr des Netzes läuft alles ohne Neuladen weiter. → vitest `connectionState` (Task 9) und Screenshot `stale-hint` (Task 10)

---

## Etappe 1: Backend

### Task 1: Datenmodell additiv (neue Felder und Models)

**Files:**
- Modify: `backend/monitor/models.py`, `backend/monitor/schemas.py`, `backend/monitor/api.py` (`_validate_view_data`)
- Create: `backend/monitor/migrations/0039_display_admin_fields.py` (per `makemigrations`)
- Test: `backend/monitor/tests_models.py` (neu)

**Interfaces — Produces** (Namen und Werte exakt aus Spec §3.1–3.4):
- **DisplayView** bekommt dazu:
  - `kind` (choices `departures|substitutions|split|media|info|rotation`, default `info`)
  - `style` (`auto|ci|dense|dark`, default `auto`)
  - `on_air_behavior` (`fullscreen|split|none`, default `fullscreen`)
  - `rotation_items` (JSON list), `media_items` (JSON list)
  - `media_seconds` (default 10), `substitutions_next_day` (default True), `page_seconds` (default 15)
  - Methode `effective_style() -> str` (`auto` → `dense` für departures/substitutions/split, sonst `ci`)
  - `split_left`/`split_right` erlauben zusätzlich `substitutions` und `departures`
  - `on_air_split_side` bleibt mit default `right`
- **Screen** bekommt dazu:
  - `location`, `scale` (`auto|100|150|200`, default `auto`), `orientation` (`landscape|portrait`)
  - `access_key` (CharField 32, unique, default `secrets.token_urlsafe(24)[:32]`)
  - `off_during_holidays` (default True), `off_until` (nullable)
- **Neue Models:**
  - `HolidayPeriod(name, start_date, end_date, created_at)`, ordering `start_date`
  - `EmergencyTemplate(title, text, note, sort_order)`
  - `MediaPage(file FK related_name='pages', index, image, width, height, orientation)`, unique `(file, index)`
- **MediaFile:** `status` (`processing|ready|failed`, default `ready`), `page_count` (default 0), `error` (Text)
- **MonitorSettings:**
  - On-Air: `on_air_active`, `on_air_since`, `on_air_text` (default `ON AIR`), `on_air_animation` (`still|pulse|blink`, default `pulse`), `on_air_show_clock` (default True)
  - Notfall: `emergency_active`, `emergency_text`, `emergency_note`, `emergency_since`
  - WebUntis: `webuntis_source` (`substitutions|timetable|unavailable|''`), `webuntis_checked_at`
- **Funktion:** `validate_rotation_items(items, own_id=None) -> list` in `models.py` wirft `ValueError` mit deutscher Meldung.
- **Schemas:** neue Felder in `DisplayViewSchema`/`UpdateSchema`, `ScreenSchema`/`UpdateSchema`, `MonitorSettingsSchema`.

- [ ] **Step 1: Failing Tests**
  - `test_access_key_generated_and_unique`: zwei Screens haben verschiedene 32-Zeichen-Schlüssel.
  - `test_effective_style_auto`: `departures` → `dense`, `info` → `ci`, `style='dark'` → `dark`.
  - `test_rotation_items_validation`:
    - Ein Verweis auf eine `rotation`-Ansicht, eine unbekannte ID, `seconds=4` oder eine leere Liste → `ValueError`.
    - `[{'view_id': v.id, 'seconds': 60}]` ist OK.
  - `test_update_view_rejects_invalid_rotation`: `PUT /api/monitor/config?view_id=…` mit ungültigem `rotation_items` → 422. Die Auth wird mit `mock.patch('monitor.api.keycloak_auth')` und `mock.patch('monitor.api._require_perm')` überbrückt, wie in bestehenden Tests üblich; gibt es keine, wird `_require_perm` gepatcht.

- [ ] **Step 2:** `python manage.py test monitor.tests_models` → FAIL
- [ ] **Step 3:** Felder, Models, Schemas, Validierung (`_validate_view_data` ruft `validate_rotation_items`). Danach `python manage.py makemigrations monitor -n display_admin_fields`.
- [ ] **Step 4:** `python manage.py test monitor users` → OK; `makemigrations --check --dry-run` → No changes
- [ ] **Step 5: Commit** `feat(monitor): Datenmodell für Anzeige und Admin (additiv)`

---

### Task 2: Datenmigration und Abbau alter Felder

**Files:**
- Create: `backend/monitor/migrations/0040_display_admin_data.py`, `0041_remove_legacy_view_fields.py`
- Modify: `models.py`, `schemas.py`, `api.py`, `oepnv.py` (Verwendungen der entfernten Felder)
- Test: `backend/monitor/tests_migrations.py`

**Interfaces — Produces:**
- Die Abbildung aus Spec §3.6, mit den Funktionen `map_view_kind(old: dict) -> str` und `translate_snapshot_b(data: dict, reverse=False) -> dict` als Modul-Funktionen in `0040` (Tests importieren per `importlib`).
- Nach `0041` existieren die in Spec §3.1 als "Entfallen" gelisteten Felder nicht mehr, `Screen.holiday_mode` ebenfalls nicht.
- `/display` bleibt in diesem Task funktionsfähig, indem es `kind` statt `layout` liefert. Den neuen Vertrag baut Task 7.

- [ ] **Step 1: Failing Tests** (`MigrationTestCase`, von `0039` nach `0041`)
  - `test_kind_mapping`: jede Zeile der Tabelle in Spec §3.6, einschließlich `standard`+`show_webuntis` → `substitutions` und `split` ohne WebUntis → `info`.
  - `test_on_air_view_moved_to_settings`: Text `AUFNAHME`, `on_air_blink=True`, `show_clock=False` ergeben `MonitorSettings(on_air_text='AUFNAHME', on_air_animation='blink', on_air_show_clock=False)`; die alte On-Air-Ansicht ist danach soft-deleted.
  - `test_on_air_behavior_mapping`: `on_air_fullscreen` → `fullscreen`, `on_air_split` → `split`, keines von beiden → `none`.
  - `test_emergency_state_moved`: `emergency_active`/`emergency_text` einer Ansicht landen in `MonitorSettings`.
  - `test_free_text_becomes_announcement`: Titel und Inhalt ergeben eine aktive `Announcement` mit Priorität `normal`.
  - `test_page_rotation_becomes_rotation_view`: Ansicht V mit 2 Rotationsseiten und Intervall 30 ergibt eine neue Ansicht "V (Wechsel)", `kind='rotation'`, `rotation_items=[{'view_id': V.id, 'seconds': 30}]`. Ein Screen mit `default_view=V` zeigt danach auf die Wechsel-Ansicht.
  - `test_holiday_mode_becomes_manual_off`
  - `test_media_items_from_active_files`: `pdf_fullscreen` mit `active_pdf=F` → `kind='media'`, `media_items=[F.id]`.
  - `test_snapshot_translated`: Ein Versions-Schnappschuss mit `layout='departures'` und `title` wird zu `kind='departures'` ohne `title`.
  - **`test_migration_messy_views`** (Review Focus 1):
    - split ohne WebUntis, Rotation mit nur einer Seite (keine Wechsel-Ansicht), Freitext nur mit Inhalt, `active_pdf` auf eine soft-gelöschte Datei (`media_items=[]`)
    - alle Screens behalten eine nicht-leere `default_view`, wo sie vorher eine hatten
  - `test_backward_restores_layouts`: zurück auf `0039`; `info` → `standard`, `media` mit PDF → `pdf_fullscreen`, Wechsel-Ansichten sind gelöscht.
- [ ] **Step 2:** `python manage.py test monitor.tests_migrations` → FAIL
- [ ] **Step 3: Migrationen schreiben**
  - `0040` als RunPython mit Rückweg.
  - `0041` mit RemoveField für die Felder aus Spec §3.1 "Entfallen" und `Screen.holiday_mode`; der Rückweg fügt sie wieder hinzu.
  - Model, Schemas und Code ziehen nach: `api.py` liest On-Air/Notfall aus `MonitorSettings`, `toggle_on_air`/`toggle_emergency` schreiben dorthin.
- [ ] **Step 4:** `python manage.py test monitor users` → OK; `makemigrations --check` → No changes
- [ ] **Step 5: Commit** `refactor(monitor): Ansichtstypen migrieren, alte Ansichtsfelder entfernen`

---

### Task 3: Rechte aufteilen

**Files:**
- Create: `backend/users/migrations/0016_split_monitor_edit.py`
- Modify: `backend/users/api.py` (`default_permissions`), `backend/monitor/api.py` (jede `_require_perm(…, 'monitor.edit')`)
- Test: `backend/monitor/tests_permissions.py` (neu)

**Interfaces — Produces:**
- Rechte `monitor.setup`, `monitor.exams`, `monitor.media`, `monitor.power`, `monitor.devices`. Die Namen in der Oberfläche:
  - `Monitor einrichten`
  - `Klausuren und Termine verwalten`
  - `Medien verwalten`
  - `Bildschirme ein- und ausschalten`
  - `Geräte verwalten`
- `monitor.edit` ist entfernt.
- Endpunkt → Recht gemäß Spec §3.5:
  - Ansichten, Bildschirme, Einstellungen, Versionen, Token, WebUntis-Links, Haltestellensuche → `setup`
  - Klausuren, Vorlagen, Termine, Ankündigungen → `exams`
  - Dateien, Papierkorb (Medien) → `media`
  - Papierkorb (Ansichten) → `setup`

- [ ] **Step 1: Failing Tests**
  - `test_edit_holders_get_four_permissions`: Migration von `0015` nach `0016`; eine Gruppe mit `monitor.edit` hat danach setup, exams, media und power, und `monitor.edit` existiert nicht mehr.
  - `test_endpoint_permission_matrix`: Für jede Zeile der Matrix verlangt der Endpunkt genau dieses Recht. Dazu wird `_require_perm` gepatcht und der übergebene Code geprüft; je Recht reicht ein repräsentativer Endpunkt plus `create_exam`, `upload_file`, `update_screen`.
- [ ] **Step 2:** FAIL · **Step 3:** umsetzen · **Step 4:** `python manage.py test monitor users` → OK
- [ ] **Step 5: Commit** `feat(monitor): Rechte setup/exams/media/power/devices statt monitor.edit`

---

### Task 4: Power-Logik, Ferien, Notfall und On-Air global

**Files:**
- Create: `backend/monitor/power.py`, `backend/monitor/api_setup.py` (zweiter Router, in `api.py` per `monitor_router.add_router("", setup_router)` eingebunden)
- Modify: `models.py` (`Screen.get_power_state` delegiert an `power.py`), `api.py` (`toggle_emergency`, `toggle_on_air`), `consumers.py`
- Test: `backend/monitor/tests_power.py`

**Interfaces — Produces:**
- `power.compute_power_state(screen, now: datetime) -> bool`, Reihenfolge exakt Spec §3.2. Die Zeit ist lokal (`settings.TIME_ZONE`).
- `power.next_on_time(screen, now) -> datetime`: Beginn des nächsten Zeitplan-Fensters, das nicht mehr heute liegt. Tage ohne passendes Fenster werden übersprungen, höchstens 14 Tage. Ohne Zeitplan: nächster Tag 05:00.
- `power.is_holiday(day: date) -> bool`
- `consumers.push_power_to_all() -> None`: ruft `push_power_to_screen` für jeden Screen.
- **Endpunkte** in `api_setup.py`:
  - `GET/POST/PUT/DELETE /holidays[/{id}]` (power)
  - `GET/POST/PUT/DELETE /emergency-templates[/{id}]` (emergency)
  - `POST /screens/power-off-today` mit Body `{screen_ids: list[int] | None}` (power) → `{off_until: {screen_id: iso}}`
  - `DELETE /screens/power-off-today` mit Body `{screen_ids | None}` (power)
- `POST /emergency` mit Body `{active, text, note}`:
  - setzt `MonitorSettings.emergency_*` und `emergency_since`
  - ruft `push_power_to_all()`
  - der Legacy-Alias `/notfall` (`aktiv`) mappt weiterhin darauf
- `POST /on-air` setzt `MonitorSettings.on_air_active`/`on_air_since`.

- [ ] **Step 1: Failing Tests** (`now` wird festgesetzt, kein echtes Datum)
  - `test_emergency_forces_on`: `manual_off` plus Notfall aktiv → True.
  - `test_order_manual_before_off_until`
  - `test_off_until_future_is_off`
  - `test_exception_before_holiday`
  - `test_holiday_period_off_only_if_flag`: Bei `off_during_holidays=False` ist der Bildschirm im Ferienzeitraum an.
  - `test_empty_schedule_always_on`
  - `test_next_on_time_same_week`: Mo–Fr 07:00–17:00, Montag 15:00 → Dienstag 07:00.
  - **`test_power_off_today_skips_days_without_window`** (Review Focus 3): Freitag 15:00 → Montag 07:00.
  - `test_next_on_time_without_schedule`: → morgen 05:00.
  - `test_power_off_today_endpoint_all_and_subset`: Ohne `screen_ids` sind alle betroffen, mit Liste nur diese; `DELETE` leert `off_until`.
  - `test_emergency_endpoint_pushes_power`: `push_power_to_all` wird aufgerufen (Mock).
- [ ] **Step 2:** FAIL · **Step 3:** umsetzen · **Step 4:** `python manage.py test monitor users` → OK
- [ ] **Step 5: Commit** `feat(monitor): Ferien, bis Tagesende aus, Notfall schaltet ein`

---

### Task 5: Medien-Umwandlung

**Files:**
- Create: `backend/monitor/media.py`, `backend/monitor/management/commands/monitor_render_media.py` (mit `__init__.py`-Dateien)
- Modify: `backend/requirements.txt` (`pypdfium2>=4.30`), `api.py` (`upload_file`, `GET /files/{id}`)
- Test: `backend/monitor/tests_media.py`

**Interfaces — Produces:**
- `media.MAX_PAGES = 50`, `media.MAX_BYTES = 50 * 1024 * 1024`, `media.LONG_EDGE = 3840`
- `media.render_file(media_file) -> None`:
  - setzt `status`, `page_count`, `error`
  - ersetzt alle `MediaPage` der Datei
  - WebP mit Qualität 90 unter `monitor/pages/`
  - PDF über pypdfium2 mit einem Maßstab, sodass die längere Kante 3840 misst
  - Bild über Pillow `ImageOps.exif_transpose`, längere Kante höchstens 3840
- `media.render_async(media_file_id) -> None`: startet `threading.Thread(daemon=True)`, öffnet die DB-Verbindung im Thread neu und schließt sie am Ende.
- `upload_file` prüft die Größe vor dem Speichern (> MAX_BYTES → 422 "Datei zu groß: höchstens 50 MB."), speichert mit `status='processing'` und startet `render_async`. Bei PDFs mit mehr als 50 Seiten setzt `render_file` `failed` mit "PDF hat N Seiten, erlaubt sind höchstens 50."
- `GET /files/{id}` → `{…, status, page_count, error, pages: [{index, url, width, height, orientation}], used_in: [{view_id, name}]}`
- Das Kommando rendert alle Dateien ohne Seiten oder mit `status != 'ready'`. Ein zweiter Lauf tut nichts.

- [ ] **Step 1: Failing Tests** (Test-PDF mit pypdfium2 erzeugen: Seite 1 A4 hoch, Seite 2 A4 quer; JPEG mit EXIF Orientation 6 per Pillow; `MEDIA_ROOT` per `override_settings` auf ein `tempfile`-Verzeichnis)
  - `test_pdf_pages_with_orientation`: 2 Seiten (`portrait`, `landscape`), längere Kante je 3840, `status='ready'`.
  - `test_exif_rotation_applied`: Breite und Höhe sind nach dem Rendern vertauscht.
  - `test_too_many_pages_failed`: 51 Seiten → `failed` mit "51 Seiten".
  - `test_upload_too_large_rejected` (422)
  - **`test_corrupt_pdf_marks_failed`** (Review Focus 4): Bytes `b'%PDF-1.4 kaputt'` → `failed`, `error` nicht leer, kein Hängen in `processing`.
  - `test_render_command_idempotent`: Der zweite Lauf ändert keine `MediaPage`-IDs.
- [ ] **Step 2:** FAIL · **Step 3:** umsetzen · **Step 4:** OK
- [ ] **Step 5: Commit** `feat(monitor): Medien als 4K-Seitenbilder vorbereiten`

---

### Task 6: WebUntis-Vertretungsplan

**Files:**
- Modify: `backend/monitor/webuntis.py`, `api_setup.py` (`POST /webuntis/check`)
- Create: `backend/monitor/management/commands/monitor_webuntis_check.py`
- Test: `backend/monitor/tests_webuntis.py`

**Interfaces — Produces:**
- `webuntis.get_substitutions(now: datetime) -> dict`
  - Ergebnis: `{source: 'substitutions'|'timetable'|'unavailable', news: str|None, days: [{date: 'YYYY-MM-DD', label: 'Heute'|'Morgen'|<Wochentag>, rows: [row]}]}`
  - Format von `row` exakt Spec §4.3
  - gecacht über Django-Cache, Schlüssel `monitor:webuntis:subs`, 300 s; bei `unavailable` 60 s
- `webuntis.detect_source(session) -> str`: -8509 bzw. "no right" → `timetable`
- `webuntis.next_school_day(day: date) -> date`: überspringt Samstag, Sonntag und `HolidayPeriod`
- `webuntis.merge_periods(rows) -> rows`: fasst aufeinanderfolgende Stunden derselben Klasse, desselben Fachs und derselben Art zu "5-6" zusammen
- `webuntis.check() -> {'login': bool, 'substitutions': bool, 'timetable': bool, 'news': bool, 'source': str}`: speichert `webuntis_source`/`webuntis_checked_at`
- Zugangsdaten aus `MonitorSettings.webuntis_*`. Sind sie leer, ist das Ergebnis `unavailable`, ohne Netzaufruf.

- [ ] **Step 1: Failing Tests** (RPC über `mock.patch` auf die Session-Methode, keine Netzaufrufe)
  - `test_substitutions_source`: Eine `getSubstitutions`-Antwort mit 2 Einträgen wird normalisiert. `type='cancel'` ergibt `cancelled`, `rmchg` ergibt `room_change`, `subst` ergibt `substitution`; `teacher_old`/`room_old` kommen aus `orgname`.
  - `test_timetable_fallback_on_8509`: `getSubstitutions` wirft den RPC-Fehler -8509. Aus `getKlassen` und `getTimetable` mit `code='cancelled'` und einer `irregular`-Stunde mit `orgid` entstehen `cancelled` und `substitution`; `source='timetable'`.
  - `test_unavailable_without_credentials`
  - `test_periods_merged_and_from_current_period`: Die Stunden 5 und 6 werden zu "5-6". Um 11:00 (Stunde 4 läuft) erscheinen keine Einträge der Stunden 1–3.
  - `test_next_school_day_skips_weekend_and_holiday`
  - `test_cached_for_300s`: Der zweite Aufruf innerhalb von 300 s macht keinen RPC.
  - `test_news_failure_is_silent`: `news` ist `None`, es gibt keine Exception.
- [ ] **Step 2:** FAIL · **Step 3:** umsetzen (Stunden-Ableitung über `getTimegridUnits`) · **Step 4:** OK
- [ ] **Step 5: Commit** `feat(monitor): Vertretungsplan aus WebUntis mit automatischer Quellenerkennung`

---

### Task 7: Display-Vertrag und Vorschau

**Files:**
- Create: `backend/monitor/display.py`
- Modify: `api.py` (`get_display_data` wird dünn und ruft `display.build_payload`; `_legacy_reload_key` und `neu_laden_zeit` entfallen), `api_setup.py` (`POST /views/preview`), `scripts/check-monitor-identifiers.allow` (Eintrag `neu_laden_zeit` entfernen)
- Test: `backend/monitor/tests_display.py`, `backend/monitor/tests_api.py` (Legacy-Reload-Test entfernen)

**Interfaces — Produces** (das ist der Vertrag für Etappe 2):

```text
build_payload(screen: Screen|None, view: DisplayView|None, *, key_ok: bool, now) -> dict
{
  "generated_at": iso,
  "reload_requested_at": iso|null,
  "screen": {"slug","name","location","scale","orientation","power": bool} | null,
  "mode": null
        | {"kind":"emergency","text","note","since"}
        | {"kind":"exam","display":"fullscreen"|"split","side":"left"|"right","title","text","active_from","active_until","location"}
        | {"kind":"on_air","display":"fullscreen"|"split","side","text","animation","show_clock","since"},
  "view": {"id","kind","style": <effective>, "page_seconds", "show_weather", "weather": {...}|null,
           "qr": {"url","label"}|null, "data": <per kind>}
}
```

Daten pro `kind`:
- `departures`: `{stations: [...wie bisher, mit max_departures], disruptions: [...]}`
- `substitutions`: `{source, news, days, fallback_url}`. Ohne `key_ok` sind `days=[]` und `news=null`, nur `fallback_url` ist gesetzt.
- `split`: `{left: {kind, data}, right: {kind, data}, left_percent}`
- `media`: `{seconds, per_screen, pages: [{url, width, height, orientation}]}`; nur Dateien mit `status='ready'`; `pdf_mode`/`pdf_pages`/`pdf_static_page` sind schon angewendet
- `info`: `{announcements, events, countdown}`
- `rotation`: `{items: [{seconds, view: <view-objekt ohne rotation>}]}`

**Regeln:**
- `mode` folgt dem Vorrang Notfall > Klausur > On-Air. On-Air greift nur bei `on_air_behavior != 'none'`; `display`/`side` kommen aus der Ansicht, bei Klausur aus der Klausur.
- `GET /display` akzeptiert `screen|bildschirm`, `view|profil`, `key` und `preview`.
- `key_ok` gilt bei passendem `screen.access_key` oder bei einer angemeldeten Anfrage mit `monitor.view` (optional, Bearer).
- **Vorschau:** `POST /views/preview` (setup) mit Body `{view: <DisplayViewUpdate-Felder + kind>, screen_id: int|None}` → `{token}` (32 Zeichen, `cache` 600 s). `GET /display?preview=<token>` baut die Antwort aus dem Entwurf, ohne zu speichern, mit `key_ok=True`.

- [ ] **Step 1: Failing Tests**
  - `test_contract_per_kind`: Für jeden `kind` stimmen die Schlüssel exakt mit dem Vertrag oben überein (Mengenvergleich der Schlüssel).
  - `test_mode_priority`: Notfall plus Klausur plus On-Air → `emergency`; Klausur plus On-Air → `exam`.
  - `test_on_air_none_behavior`: `on_air_behavior='none'` → `mode=null`.
  - **`test_substitutions_without_key_returns_fallback_only`** (Review Focus 2)
  - `test_substitutions_with_key`: `webuntis.get_substitutions` gemockt, die Tage sind enthalten.
  - `test_rotation_resolved`
  - `test_preview_requires_setup_and_token`: Ohne Recht 403; mit Recht gibt es einen Token, und `/display?preview=` liefert den ungespeicherten Namen bzw. `kind`, während die Datenbank unverändert bleibt.
  - `test_preview_token_expires`: Cache geleert → 404.
  - `test_legacy_params_still_work` (`bildschirm`, `profil`)
- [ ] **Step 2:** FAIL · **Step 3:** umsetzen · **Step 4:** `python manage.py test monitor users` → OK; Prüfskript Exit 0
- [ ] **Step 5: Commit** `feat(monitor): Display-Vertrag je Ansichtstyp, Vorschau, Schlüssel für Vertretungsdaten`

---

### Task 8: Display-WebSocket und Änderungs-Push

**Files:**
- Create: `backend/monitor/push.py`
- Modify: `consumers.py` (`DisplayConsumer`), `routing.py` (`ws/monitor/display/<slug>/`), `api.py`, `api_setup.py` (Auslöser nach jedem schreibenden Endpunkt)
- Test: `backend/monitor/tests_push.py`

**Interfaces — Produces:**
- `push.notify_changed(screen_slugs: list[str]|None = None) -> None`: `None` heißt alle; Gruppe `display_<slug>` bzw. `display_all`.
- `push.notify_reload(slug) -> None`
- `DisplayConsumer` tritt `display_<slug>` und `display_all` bei, sendet `{"type":"changed"}` bzw. `{"type":"reload"}` und ignoriert eingehende Nachrichten.
- Alle schreibenden Endpunkte aus Spec §4.2 rufen `notify_changed()`. `reload_screen` ruft `notify_reload(slug)` und setzt weiterhin `reload_requested_at`.

- [ ] **Step 1: Failing Tests** (`channels.testing.WebsocketCommunicator`, InMemoryChannelLayer)
  - `test_display_ws_receives_changed_on_view_update`
  - `test_display_ws_receives_reload`
  - `test_unknown_slug_still_connects` (es werden keine Daten gesendet)
- [ ] **Step 2:** FAIL · **Step 3:** umsetzen · **Step 4:** OK
- [ ] **Step 5: Commit** `feat(monitor): Anzeige wird per WebSocket über Änderungen informiert`

---

## Etappe 2: Anzeige

### Task 9: Fundament (Schriften, CI-Grafiken, Logik-Hooks)

**Files:**
- Modify: `frontend/package.json` (Dependencies `@fontsource/oswald`, `@fontsource/lato`; devDependencies `vitest`, `jsdom`, `playwright-core@1.47.0`; Script `"test": "vitest run"`)
- Modify: `frontend/scripts/check-tokens.mjs` (`EXCLUDE` um `src/components/display/` ergänzen, weil die Anzeige CI-Farben nutzt, keine Admin-Tokens)
- Create:
  - `frontend/src/assets/ci/wheel.svg`, `frontend/src/assets/ci/wheel-triple.svg`
  - `frontend/src/components/display/lib/{scale.js,pager.js,connection.js,useClock.js,useDisplayData.js,cache.js}`
  - Tests `frontend/src/components/display/lib/*.test.js`

**CI-Grafiken:**
- **Quellen:** `/tmp/claude-0/-home-user-Stagedesk-V2/d4261319-0d32-55a2-be62-78262df7d327/scratchpad/ci/Corporate Identity Hintergruende - Kopie/AU20-0144 Datenhintergrund quer.pdf` und `Hintergrund dreifach.pdf`.
- **Umwandlung:** `pdftocairo -svg`, danach die viewBox auf den Rad-Bereich zuschneiden (quer: `0 0 159 595.276`; dreifach: linker Streifen mit den drei Rädern).
- **Masken entfernen:** die `mask="url(#mask-N)"`-Attribute, sonst wird das Rad fast transparent dargestellt.
- **Fehlen die Dateien,** meldet der Implementierer NEEDS_CONTEXT.

**Interfaces — Produces:**
- `scale.computeRootPx({width, height, orientation, scale, zoom}) -> number`: `16 * (zoom ?? (width / (orientation==='portrait' ? 1080 : 1920)) * scaleFactor)`, wobei `scaleFactor` für `'auto'` = 1 ist und für `'150'` = 1.5
- `pager.paginate(items, perPage) -> items[][]`, `usePager(pages, seconds) -> {index, count}`
- `connection.connectionState({lastOkAt, now, online}) -> 'ok'|'stale'|'lost'`
  - `stale` ab der ersten fehlgeschlagenen Abfrage oder bei `online=false`, solange `now - lastOkAt < 120000`
- `reloadNeeded(initial, current) -> boolean`: `initial` ist der Wert beim Seitenstart; `null` zu einem Zeitstempel ergibt `true`, gleiche Werte `false`
  - `lost` ab 120000 ms
- `cache.save(slugKey, payload)`, `cache.load(slugKey) -> {payload, savedAt}|null`, über `localStorage` mit try/catch
- `useClock() -> Date`: sekündlich; der einzige sekündliche Timer
- `useDisplayData({screen, view, key, preview}) -> {payload, state, lastOkAt, retryInSeconds}`:
  - lädt `/api/monitor/display`
  - öffnet `ws(s)://<host>/ws/monitor/display/<slug>/`
  - lädt bei `changed` neu, macht bei `reload` `location.reload()`
  - pollt alle 60 s
  - Rückoff 5→10→30→60 s
  - nutzt `cache`

- [ ] **Step 1: Failing vitest-Tests**
  - `computeRootPx({width:3840,height:2160,orientation:'landscape',scale:'auto'}) === 32`
  - mit `scale:'150'` → 48
  - mit `zoom:2` → 32
  - mit `zoom:2` und `scale:'200'` → 32
  - **Festlegung:** `root = 16 * (zoom ?? (width/basis) * scaleFactor)`. Ein gesetztes `?zoom=` ist also ein absoluter Faktor. So zeigt die bestehende Kiosk-URL von glocke (`?zoom=2` auf 4K) dieselbe Größe wie "Automatisch", statt doppelt zu vergrößern.
  - `paginate([1..25], 10)` → 3 Seiten
  - `connectionState`: 0 s → `ok`; erster Fehler bei 30 s → `stale`; 121 s → `lost`
  - `cache` übersteht einen werfenden `localStorage`
  - `reloadNeeded(null, '2026-10-19T10:00:00Z') === true`, `reloadNeeded(x, x) === false`
- [ ] **Step 2:** `npx vitest run` → FAIL · **Step 3:** umsetzen · **Step 4:** vitest OK, Build OK
- [ ] **Step 5: Commit** `feat(display): Schriften, CI-Grafiken und Logik-Hooks der Anzeige`

---

### Task 10: Rahmen, Zustände, neue MonitorPage und Screenshot-Werkzeug

**Files:**
- Create:
  - `frontend/src/components/display/frame/{CiFrame,DenseFrame,DarkFrame,PortraitFrame,ClockBox}.jsx`
  - `frontend/src/components/display/states/{ConnectionLost,Loading,ScreenNotFound,IdleScreen}.jsx`
  - `frontend/src/components/display/DisplayRoot.jsx` (wählt Zustand, Modus und Ansicht)
  - `frontend/scripts/shoot-display.mjs`
  - `frontend/tests/display-fixtures/*.json`
- Modify: `frontend/src/pages/MonitorPage.jsx` (wird neu geschrieben: URL lesen, `useDisplayData`, `DisplayRoot`). Bisherige Ansichtslogik raus; noch nicht gebaute Typen rendern vorübergehend `Loading`.

**Interfaces — Produces:**
- `<Frame style={'ci'|'dense'|'dark'} orientation clock={{showWeather, weather, staleSince}}>children</Frame>` über `frame/index.js` (`Frame` wählt die Variante)
- `<ClockBox now weather staleSince />`: zeigt "Stand HH:MM", wenn `staleSince` gesetzt ist
- `DisplayRoot({payload, state, lastOkAt, retryInSeconds, now})`:
  - Reihenfolge: kein Payload und Laden → `Loading`; Bildschirm unbekannt → `ScreenNotFound`; `state==='lost'` → `ConnectionLost`; `screen.power===false` → `IdleScreen`; `mode` → Modus; sonst Ansicht
- **Testdaten** (Namen fest, von Tasks 11–13 genutzt): `info.json`, `departures.json`, `substitutions.json`, `substitutions-fallback.json`, `media-portrait.json`, `media-landscape.json`, `split.json`, `rotation.json`, `mode-emergency.json`, `mode-exam-full.json`, `mode-exam-split.json`, `mode-onair-full.json`, `mode-onair-split.json`, `screen-not-found.json`, `idle.json`, `long-departures.json`, `long-substitutions.json`
- **Screenshot-Werkzeug:** `node scripts/shoot-display.mjs [--only name] [--portrait]`
  - startet `vite preview` auf einem freien Port
  - fängt `/api/monitor/display*` per `page.route` ab und liefert die Testdaten
  - fotografiert in 3840×2160 (bzw. 2160×3840) nach `docs/superpowers/screenshots/2026-10-19-monitor/display-<name>[-portrait].png`
  - Sonderfälle: `--state lost` simuliert einen Abbruch (Route liefert 503, Uhr per `page.clock` 121 s vor); `--state stale` (30 s)
  - Chromium über `CHROMIUM_PATH` oder `/opt/pw-browsers/chromium`, `--headless=new`

- [ ] **Step 1:** Rahmen und Zustände nach den Entwürfen bauen (`assets/2026-10-19-monitor/display-style-*.png`, `state-connection-lost.png`). Texte:
  - `ConnectionLost`: "Verbindung verloren", "Der Server ist seit HH:MM nicht erreichbar. Neuer Versuch in N s. Die Anzeige läuft automatisch weiter, sobald die Verbindung zurück ist.", Liste "Letzte Daten"
  - `ScreenNotFound`: "Bildschirm nicht gefunden", "Für „<slug>" ist kein Bildschirm angelegt. Im Admin unter Monitore → Bildschirme anlegen."
  - `Loading`: "Wird geladen"
  - `IdleScreen`: nur Uhr
- [ ] **Step 2:** Werkzeug und Testdaten anlegen. `node scripts/shoot-display.mjs --only screen-not-found` und `--state lost` sowie **`--state stale`** (Review Focus 5) erzeugen 3 Bilder; der Implementierer sichtet sie (Read-Tool) und hängt sie im Report an.
- [ ] **Step 3:** `npm run build && npx vitest run && npm run check:tokens` → OK
- [ ] **Step 4: Commit** `feat(display): Rahmen, Zustandsbildschirme und Screenshot-Werkzeug`

---

### Task 11: Ansichten Abfahrten, Vertretungsplan, Info

**Files:**
- Create: `frontend/src/components/display/views/{DeparturesView,SubstitutionsView,InfoView}.jsx`, `frontend/src/components/display/views/index.js`
- Modify: `DisplayRoot.jsx`

**Interfaces:** Jede Ansicht ist `({view, now}) => JSX` und liest `view.data` gemäß Vertrag Task 7. `views/index.js` exportiert `VIEW_COMPONENTS = {departures, substitutions, info, …}`.

**Vorgaben:**
- **DeparturesView** (`departures.png`):
  - Pro Haltestelle so viele Zeilen, wie bei einer Mindest-Zeilenschrift von 0,95rem passen, höchstens `max_departures`. Gemessen wird per `ResizeObserver` auf der Karte; neu gerechnet nur bei Größenänderung, nicht sekündlich.
  - Linienchips in SWL-Farben (vorhandene Tabelle `SWL_LINE_COLORS` übernehmen).
  - Verspätung als "+N" in Warnfarbe, Ausfall durchgestrichen mit "Fällt aus".
  - Die Störungsleiste blättert alle `page_seconds`.
- **SubstitutionsView** (`substitutions.png`):
  - Heute und Morgen nebeneinander, die Nachricht zum Tag als Kasten.
  - Klasse nur in der ersten Zeile ihrer Gruppe, Ersetztes durchgestrichen.
  - `cancelled` wird rot "Entfall", `room_change` blau "Raumänderung".
  - Blättern mit "Seite n / m".
  - Bei `days.length===0 && fallback_url` ein iframe im Rahmen (ohne Invertierungsfilter).
- **InfoView** (`display-info.png`): Ankündigungen (`urgent` mit dem Label "Dringend"), Termine, Countdown, QR in der Ecke.

- [ ] **Step 1:** Ansichten bauen.
- [ ] **Step 2: Screenshots** `departures`, `long-departures`, `substitutions`, `long-substitutions`, **`substitutions-fallback`** (Review Focus 2), `info`, jeweils in 3840×2160. Prüfung gegen die Entwürfe und die Gestaltungsregeln; Abweichungen beheben.
- [ ] **Step 3:** Build, vitest und Token-Prüfung OK
- [ ] **Step 4: Commit** `feat(display): Abfahrten, Vertretungsplan und Info-Ansicht`

---

### Task 12: Medien, Split, Wechsel und Sondermodi

**Files:**
- Create: `views/{MediaView,SplitView,RotationView}.jsx`, `frontend/src/components/display/modes/{OnAirMode,EmergencyMode,ExamMode}.jsx`, `modes/index.js`
- Modify: `DisplayRoot.jsx`
- Delete: `frontend/src/components/monitor/PdfFullscreen.jsx` (falls nicht mehr referenziert; im Report vermerken)

**Vorgaben:**
- **MediaView:**
  - Seiten nacheinander alle `seconds`, `per_screen` (1–3) nebeneinander.
  - Hochformat-Seiten stehen mittig im CI-Rahmen mit Uhr; Querformat-Seiten randlos mit `object-fit: contain` auf Weiß (Stil `ci`) bzw. Schwarz (`dark`).
  - Wechsel per Deckkraft (300 ms).
- **SplitView:** Die zwei Unteransichten über `VIEW_COMPONENTS`, Breite `left_percent`.
- **RotationView:** Wechsel nach `items[i].seconds`; rendert die Unteransicht im effektiven Stil der Unteransicht.
- **Sondermodi:**
  - `OnAirMode` (`mode-on-air.png`): rotes Schild mit weißer Schrift auf Schwarz. Animation `still`, `pulse` (Deckkraft 1↔0,72, 2,4 s, ease-in-out) oder `blink` (1 s hart). Bei `prefers-reduced-motion` immer `still`. Die Uhr nur bei `show_clock`. Kein Text "auf Sendung".
  - `EmergencyMode` (`mode-emergency.png`): roter Balken "NOTFALL" mit Uhr, Text groß, Zusatz `note`, "Ausgelöst HH:MM". Keine Animation.
  - `ExamMode` (`mode-exam.png`): Stil A mit Kicker "Klausur", Titel, Text, Beginn/Ende/Noch.
  - Split-Varianten: Modus auf der Seite `side`, gegenüber die Ansicht (`split-*.png`, Standard rechts).

- [ ] **Step 1:** bauen
- [ ] **Step 2: Screenshots** `media-portrait`, `media-landscape`, `split`, `rotation` (erstes Element), `mode-emergency`, `mode-exam-full`, `mode-exam-split`, `mode-onair-full`, `mode-onair-split`, `idle`; sichten und beheben.
- [ ] **Step 3:** Build, vitest und Token-Prüfung OK; `grep -rn "PdfFullscreen\|components/monitor/" frontend/src` findet nichts
- [ ] **Step 4: Commit** `feat(display): Medien, Split, Wechsel und Sondermodi`

---

### Task 13: Abnahme der Anzeige

**Files:**
- Create: `docs/superpowers/screenshots/2026-10-19-monitor/` (alle Anzeige-Bilder) und `docs/superpowers/screenshots/2026-10-19-monitor/README.md` (Liste: Bild → was es zeigt)
- Modify: Komponenten unter `components/display/` nur für Befunde

- [ ] **Step 1:** Volle Matrix fotografieren:
  - jede Testdatei in allen drei Stilen (`--style ci|dense|dark` überschreibt `view.style` in den Testdaten)
  - `info`, `departures`, `substitutions` und `media-portrait` zusätzlich `--portrait`
  - die Zustände `lost`, `stale`, `idle`, `screen-not-found`
- [ ] **Step 2:** Den impeccable-Detektor auf `frontend/src/components/display` laufen lassen (`.claude/skills/impeccable/scripts/impeccable detect --json frontend/src/components/display`) und jeden Befund beheben oder im Report begründen.
- [ ] **Step 3: Gestaltungs-Checkliste je Bild prüfen** und das Ergebnis in den Report:
  - kein Rot außer CI, Ausfällen und Linienchips
  - keine Schatten, Verläufe oder Pills
  - keine Titelzeile bei dichten Ansichten
  - Mindestschrift eingehalten
  - Hochformat ohne Überlauf
- [ ] **Step 4: Commit** `test(display): Screenshot-Abnahme der Anzeige`

---

## Etappe 3: Admin

### Task 14: Admin-Fundament (Routen, Navigation, gemeinsame Bausteine, Screenshot-Werkzeug)

**Files:**
- Create:
  - `frontend/src/components/monitor-admin/shared/{useDraft.js,useDraft.test.js,SaveBar.jsx,UnsavedChangesProvider.jsx,ConfirmDialog.jsx,ScreenStatus.jsx,api.js}`
  - `frontend/src/components/monitor-admin/MonitorAdminLayout.jsx`
  - `frontend/src/components/monitor-admin/pages/Overview.jsx` (vorerst nur Gerüst)
  - `frontend/scripts/shoot-admin.mjs`, `frontend/tests/admin-fixtures/*.json`
- Modify: `frontend/src/App.jsx` (Routen gemäß Spec §6.1, verschachtelt unter `MonitorAdminLayout`, ersetzen `/monitor-admin`), `frontend/src/components/DashboardLayout.jsx:145` (Unterpunkte je Recht)

**Interfaces — Produces:**
- `useDraft(original) -> {draft, set(path, value), changedCount, reset(), save(fn) -> Promise}`. Verglichen wird per tiefer Gleichheit pro Pfad der obersten Ebene; `changedCount` zählt geänderte Felder der obersten Ebene.
- `<SaveBar count onSave onDiscard saving />` zeigt "1 ungespeicherte Änderung" bzw. "N ungespeicherte Änderungen" · "Verwerfen" · "Speichern".
- `UnsavedChangesProvider` mit `useUnsavedGuard(isDirty)`: registriert `beforeunload`; liefert `confirmLeave() -> boolean`, das die Sidebar-Links der Monitor-Unterseiten vor der Navigation aufrufen. Text: "Es gibt ungespeicherte Änderungen. Seite trotzdem verlassen?"
- `<ConfirmDialog title body confirmLabel tone='danger'|'default' onConfirm onCancel />`
- `api.js`: dünne Funktionen über `lib/api.js` für alle Endpunkte aus Schritt 0 und Spec §4.5, zum Beispiel `getScreens()`, `updateScreen(id, data)`, `previewView(draft, screenId)`, `powerOffToday(ids)`, `undoPowerOffToday(ids)`
- **Navigation:** Unter "Monitore" stehen Übersicht, Bildschirme, Ansichten, Klausuren & Termine, Medien, Ferien & Zeitpläne, Einstellungen. Sichtbar je Recht: `view` für die Übersicht, `setup` für Bildschirme, Ansichten und Einstellungen, `exams`, `media`, `power`.
- **Screenshot-Werkzeug:** `node scripts/shoot-admin.mjs [--only page]`
  - startet `vite preview`
  - setzt vor dem Laden einen Testnutzer in den Storage, den `src/authConfig.js` (`userStore`) für oidc-client-ts verwendet (Schlüssel `oidc.user:<authority>:<client_id>`, `expires_at` in der Zukunft, `profile` mit Admin-Rolle bzw. allen Monitor-Rechten)
  - fängt `/api/**` mit Testdaten ab
  - fotografiert in 1440×900 nach `docs/superpowers/screenshots/2026-10-19-monitor/admin-<page>.png`
  - Keycloak wird nicht kontaktiert. Braucht die App dafür eine Anpassung im Produktivcode, meldet der Implementierer NEEDS_CONTEXT.

- [ ] **Step 1: Failing vitest**
  - `useDraft`: Ändern und Zurückändern ergibt `changedCount` 0.
  - Zwei Felder geändert → 2.
  - `reset` → 0.
  - `save` ruft `fn(draft)` auf und übernimmt danach den Entwurf als neues Original.
- [ ] **Step 2:** FAIL · **Step 3:** umsetzen · **Step 4:** vitest OK; `node scripts/shoot-admin.mjs --only overview` erzeugt ein Bild (Gerüst)
- [ ] **Step 5: Commit** `feat(monitor-admin): Routen, Navigation, Speichermodell und Screenshot-Werkzeug`

---

### Task 15: Übersicht mit Sondermodi

**Files:**
- Modify: `frontend/src/components/monitor-admin/pages/Overview.jsx`
- Create: `frontend/src/components/monitor-admin/shared/{EmergencyDialog.jsx,UndoToast.jsx}`

**Vorgaben** (`admin-overview.png`):
- **Kopf:** "Monitore", darunter "N Bildschirme · M online"; Knöpfe "Alle bis Tagesende aus" (power) und "Bildschirm koppeln".
  - "Bildschirm koppeln" ist deaktiviert, mit dem Hinweis darunter "Kopplung folgt mit dem Geräte-Agent."
  - "Alle bis Tagesende aus" bestätigt per `ConfirmDialog` und zeigt danach die Leiste "Alle Bildschirme aus bis <Tag HH:MM> · Rückgängig".
- **Drei Kästen:**
  - On-Air-Schalter (onair), wirkt sofort, mit `UndoToast` (8 s)
  - Notfall "Auslösen…" (emergency) mit dem Untertitel "Manuell. Nicht mit der Brandmeldeanlage verbunden."
  - Nächste Klausur
- **Tabelle Bildschirme:** Name und Ort, Status, "Zeigt gerade" mit Begründungssatz, Gerät, Aktionen (Vorschau, Neu laden, Menü). Das Menü enthält "Bis Tagesende aus" sowie "Jetzt einschalten"/"Jetzt ausschalten" (setzt `power_mode`); beides wirkt sofort und zeigt eine `UndoToast`.
  - **Begründungssätze** (aus `/display`-Daten und Screen-Feldern abgeleitet; Funktion `explainScreen(screen, payload) -> string` in `shared/explain.js` mit vitest):
    - "Standard-Ansicht"
    - "laut Zeitplan bis HH:MM"
    - "weil Termin „X" läuft"
    - "weil Klausur „X" bis HH:MM läuft"
    - "Notfall aktiv"
    - "aus bis <Tag HH:MM>"
    - "in den Ferien aus"
  - **Status:** "Online" bzw. "Offline · zuletzt gesehen HH:MM" aus `cec_status_at`. Bis Teilprojekt C kommt das Online-Kriterium vom letzten CEC-Status innerhalb von 5 min; fehlt er, steht dort "Unbekannt".
- **Kästen "Datenquellen"** (Abfahrten, WebUntis, Störungen: letzter Erfolg aus `generated_at` bzw. dem WebUntis-Prüfzeitpunkt) **und "Demnächst"** (nächste Ferien, nächster Termin).
- **EmergencyDialog:**
  - Vorlagenliste oder freier Text plus Zusatz.
  - "Weiter" führt zur zweiten Bestätigung "Notfall auf allen Bildschirmen anzeigen und ausgeschaltete Bildschirme einschalten?" mit "Notfall auslösen" (danger).
  - Ist der Notfall aktiv: "Notfall beenden".

- [ ] **Step 1:** vitest für `explainScreen`, ein Fall je Satz → FAIL · **Step 2:** umsetzen · **Step 3:** Screenshots `overview`, `overview-emergency-dialog`, `overview-day-off` sichten
- [ ] **Step 4:** Build, vitest und Token-Prüfung OK · **Step 5: Commit** `feat(monitor-admin): Übersicht mit Sondermodi und Bildschirmstatus`

---

### Task 16: Bildschirme

**Files:**
- Create: `pages/Screens.jsx`, `pages/ScreenDetail.jsx`, `shared/ScheduleEditor.jsx`

**Vorgaben** (`admin-screen-detail.png`):
- **Liste:** Tabelle wie in der Übersicht, mit "Neuer Bildschirm".
- **Detail:**
  - Abschnitte "Anzeige", "Ein- und Ausschalten" und "Kiosk-URL", jeweils mit `useDraft` und `SaveBar`.
  - **Anzeige:** Name, Ort, Standard-Ansicht, Skalierung (Segmente Automatisch/100 %/150 %/200 %, Hilfetext "Automatisch passt die Größe an die Auflösung des Bildschirms an."), Ausrichtung.
  - **Ein- und Ausschalten:** Steuerung (Automatisch/Immer an/Immer aus), Zeitplan (`ScheduleEditor`: Zeilen mit Tagen und von/bis), "In den Ferien ausgeschaltet", Ausnahmen nach Datum.
  - **Kiosk-URL:** `<origin>/monitor?screen=<slug>&key=<key>` mit "Kopieren" und "Neu erzeugen" (ConfirmDialog: "Der alte Link funktioniert danach nicht mehr für den Vertretungsplan.").
  - **Rechts "Gerät":** CEC-Status, zuletzt gemeldet, "Neu laden", Platzhalter "Kein Agent installiert. WLAN, Temperatur und Updates erscheinen hier, sobald der Geräte-Agent eingerichtet ist."
  - **Protokoll:** entfällt bis C.

- [ ] **Step 1:** bauen · **Step 2:** Screenshots `screens`, `screen-detail`, `screen-detail-dirty` (mit SaveBar) sichten · **Step 3:** Build, vitest und Token-Prüfung OK
- [ ] **Step 4: Commit** `feat(monitor-admin): Bildschirme mit Zeitplan und Kiosk-URL`

---

### Task 17: Ansichten mit Editoren und Live-Vorschau

**Files:**
- Create:
  - `pages/Views.jsx`, `pages/ViewEdit.jsx`
  - `view-editors/{Departures,Substitutions,Media,Info,Split,Rotation}.jsx`
  - `shared/{LivePreview.jsx,StopSearch.jsx,StopFilterDialog.jsx}`

**Vorgaben** (`admin-view-edit.png`):
- **Liste** mit Typ und "Verwendet auf".
- **"Neue Ansicht":** zuerst ein Schritt "Typ wählen". Die Kacheln tragen die Typnamen Abfahrten, Vertretungsplan, Geteilt, Medien, Info und Wechsel, je mit einem Satz Beschreibung.
- **ViewEdit:**
  - links Allgemein (Name, Stil: Automatisch/CI/Dicht/Dunkel, Wetter, QR), darunter der Editor des Typs
  - rechts `LivePreview` und "Verwendet auf"
  - unten `SaveBar`
  - "Duplizieren" und "Löschen" (Papierkorb)
- **Departures-Editor:**
  - Haltestellen-Tabelle (Ziehen zum Sortieren mit nativem HTML5-Drag, keine neue Bibliothek), Spalten Fußweg, Max. Zeilen (Standard 10), Verkehrsmittel.
  - "Haltestelle hinzufügen" über `StopSearch` (`/transit/search`).
  - "›" öffnet `StopFilterDialog`: Linien, Richtung, Via, Verkehrsmittel, Zusatz-Haltestelle.
  - Dazu die Abschnitte Störungen und Streik.
- **Weitere Editoren:**
  - **Substitutions:** "Morgen zeigen", Blättertakt, iframe-Rückfall-Link
  - **Media:** Dateien wählen und sortieren, Sekunden, Seiten nebeneinander, Modus
  - **Info:** Ankündigungen, Termine, Countdown
  - **Split:** links/rechts und Breite
  - **Rotation:** Liste aus Ansicht und Sekunden; `rotation`-Ansichten sind nicht wählbar
- **LivePreview:**
  - Bildschirm-Auswahl, deren Auflösung und Ausrichtung gelten.
  - Entwurf entprellt 600 ms → `previewView` → iframe `src="/monitor?preview=<token>"` in der Originalgröße, verkleinert per `transform: scale()`.
  - Hinweis darunter: "Zeigt den Stand mit den ungespeicherten Änderungen."
  - Bei Fehlern: "Vorschau nicht verfügbar: <Grund>."

- [ ] **Step 1:** bauen · **Step 2:** Screenshots `views`, `view-new`, `view-edit-departures`, `view-edit-rotation`, `stop-filter-dialog` sichten · **Step 3:** Build, vitest und Token-Prüfung OK
- [ ] **Step 4: Commit** `feat(monitor-admin): Ansichten mit typbezogenen Editoren und Live-Vorschau`

---

### Task 18: Klausuren & Termine, Medien, Ferien & Zeitpläne, Einstellungen

**Files:**
- Create: `pages/{Exams,Media,Schedules,Settings}.jsx`

**Vorgaben:**
- **Exams:**
  - Gruppen "Läuft gerade", "Kommt" und "Vergangen" (die letzten 10).
  - Klausuren und Termine gemischt nach Zeit, gekennzeichnet als "Klausur" bzw. "Termin".
  - Formular als Seitenpanel: Klausur mit Titel, Text, von/bis, Bildschirme, Darstellung (Vollbild/Geteilt/Ansicht behalten), Seite (Standard rechts); Termin mit Name, Beschreibung, von/bis, Zuordnung Bildschirm → Ansicht.
  - "Aus Vorlage" übernimmt eine Klausur-Vorlage.
  - Ankündigungen als eigener Abschnitt unten.
- **Media:**
  - Hochladen per Ziehen und Ablegen oder Dateiauswahl.
  - Kacheln mit der ersten Seite, Seitenzahl, Ausrichtung und Status ("Wird vorbereitet", "Fertig", "Fehlgeschlagen: <Fehler>"); `processing` wird alle 3 s abgefragt.
  - Detailpanel mit allen Seiten und "Verwendet in"; Löschen über den Papierkorb.
- **Schedules:**
  - Ferienzeiträume als Tabelle (Name, von, bis) mit Anlegen, Bearbeiten und Löschen.
  - Wochenübersicht der Ein-/Aus-Zeiten aller Bildschirme als Zeilen Mo–So mit Balken, reines CSS-Grid.
  - Hinweis "Automatische Updates: Sonntag 03:00 (wirksam mit dem Geräte-Agent)".
- **Settings** in den Abschnitten:
  - WebUntis: Server, Schule, Benutzer, Passwort, "Verbindung testen" mit dem Ergebnis als Satz, zum Beispiel "Vertretungen werden direkt abgerufen." / "Vertretungen werden aus den Stundenplänen der Klassen abgeleitet." / "Keine Verbindung: <Grund>."
  - ÖPNV-Grundeinstellungen und Störungsfilter
  - Notfall-Vorlagen (Liste, sortierbar)
  - On-Air (Text, Animation Ruhig/Pulsieren/Blinken, Uhr anzeigen)
  - Wetter-Schlüssel

- [ ] **Step 1:** bauen · **Step 2:** Screenshots `exams`, `exam-form`, `media`, `media-processing`, `schedules`, `settings` sichten · **Step 3:** Build, vitest und Token-Prüfung OK
- [ ] **Step 4: Commit** `feat(monitor-admin): Klausuren, Medien, Ferien und Einstellungen`

---

### Task 19: Altes Admin entfernen und Abnahme des Admin

**Files:**
- Delete: `frontend/src/pages/admin/MonitorAdminPage.jsx`
- Modify: `frontend/scripts/check-tokens.mjs` (`EXCLUDE`-Eintrag für `MonitorAdminPage.jsx` entfernen; `src/components/monitor-admin/` wird geprüft), `scripts/check-monitor-identifiers.py` (Standard-Bereich um `frontend/src/components/display` und `frontend/src/components/monitor-admin` erweitern, alte Pfade entfernen)
- Create: Admin-Screenshots in `docs/superpowers/screenshots/2026-10-19-monitor/`, README ergänzen

- [ ] **Step 1:** `grep -rn "MonitorAdminPage" frontend/src` findet nichts; `npm run build`, `npm run check:tokens`, `npm run test:tokens`, `npx vitest run` → OK
- [ ] **Step 2:** `python3 -I scripts/check-monitor-identifiers.py` → Exit 0; `python3 -m unittest scripts/test_check_monitor_identifiers.py` → OK
- [ ] **Step 3:** Alle Admin-Seiten und Zustände fotografieren. impeccable-Detektor auf `frontend/src/components/monitor-admin`; Befunde beheben oder begründen. Copy-Checkliste (Global Constraints) je Seite im Report.
- [ ] **Step 4: Commit** `refactor(monitor-admin): altes Monitor-Admin entfernt, Abnahme-Screenshots`

---

## Abschluss

### Task 20: Doku, Rollout und Schlussprüfung

**Files:**
- Modify:
  - `DEPLOY.md` (neuer Abschnitt "Monitor Anzeige und Admin")
  - `docs/raspberry-pi-monitor.md` (Kiosk-URL mit `key`; Zoom im Admin, `?zoom=` nur noch als Notbehelf)
  - `CLAUDE.md` (Abschnitt "Monitor": neue Admin-Routen und Ordner `components/display/` und `components/monitor-admin/`)

- [ ] **Step 1: DEPLOY.md** gemäß Spec §8:
  1. Backup-Tag und Dump
  2. Probelauf mit dem Produktions-Dump (`migrate`, Stichprobe Ansichten/Bildschirme/Rechte)
  3. Deploy (`pip install -r requirements.txt` für pypdfium2)
  4. `python manage.py monitor_render_media`
  5. `python manage.py monitor_webuntis_check`
  6. Sichtprüfung von glocke und mensa
  7. Kiosk-URL mit Schlüssel aus dem Admin pro Pi in `kiosk.sh` eintragen
  8. Rückweg: `migrate monitor 0038`, `migrate users 0015`, Code auf den Backup-Tag
- [ ] **Step 2: Gesamtprüfung**
  - `python manage.py test` und `makemigrations --check`
  - `migrate monitor 0038 && migrate users 0015 && migrate` auf der Dev-DB
  - Frontend: `npm run build`, `check:tokens`, `test:tokens`, `npx vitest run`
  - Prüfskript Exit 0
- [ ] **Step 3: Commit** `docs(monitor): Deploy und Pi-Einrichtung für Anzeige und Admin`
