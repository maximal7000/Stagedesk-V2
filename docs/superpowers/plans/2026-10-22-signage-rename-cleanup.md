# Umbenennung `monitor` → `signage` und Aufräumen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Anzeige-Modul heißt in Backend, Datenbank und Frontend `signage`, alte Adressen funktionieren weiter, der Code ist aufgeteilt und aufgeräumt, Fehlermeldungen sind kurz und sachlich; das Verhalten ändert sich nicht.

**Architecture:** Erst die Backend-App samt Datenbank (Task 1) und die Rechte (Task 2), dann das Frontend (Task 3) und die öffentlichen Adressen mit Alt-Aliassen (Task 4). Danach reine Aufräum-Tasks ohne Verhaltensänderung (Tasks 5–8) und Doku mit Abnahme (Task 9).

**Tech Stack:** Django 5 + Ninja 1.1, Channels, SQLite (Tests) und PostgreSQL 16 (Produktion, lokal unter `/usr/lib/postgresql/16` verfügbar, Cluster `16/main`); React 19 + Vite, vitest; Agent Python 3.11 stdlib.

**Spec:** `docs/superpowers/specs/2026-10-22-signage-rename-cleanup-design.md`

## Global Constraints

- **Keine Verhaltensänderung** außer den in der Spec genannten (neue Adressen, umbenannte Rechte-Codes, Fehlermeldungen, Log-Hinweis bei fehlenden DB-Zugangsdaten).
- Alte Adressen bleiben **dauerhaft**: `/monitor?screen=…`, `/monitor-admin/…` (Weiterleitung), `/api/monitor/…`, `/ws/monitor/pi/<slug>/`, `/ws/monitor/display/<slug>/`, `…/api/monitor/agent/install.sh`; ebenso die frühen Alt-Endpunkte `/bildschirm/…`, `/notfall`.
- Gespeicherte Mediendateien behalten ihren Pfad: `upload_to` schreibt weiter unter `monitor/…` (Daten, keine Bezeichner); der Funktionsname darf englisch werden.
- Bestehende Migrationen 0001–0046 werden nicht neu geschrieben; nur App-Bezüge (`dependencies`, `apps.get_model`, `to=`) von `monitor` auf `signage`.
- Sichtbare Oberfläche bleibt deutsch; Code und Kommentare englisch; keine Em-Dashes im sichtbaren Text.
- Keine Zugangsdaten im Repo.
- Commit-Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01D7nDH9UeEyBKSeRzQw1WpF`.
- Checks (ab Task 1): Backend `cd backend && source venv/bin/activate && python manage.py test signage users`, `python manage.py makemigrations --check --dry-run`; Agent `cd agent && python3 -m unittest discover -s tests`; Frontend `cd frontend && npx vitest run && npm run build && npm run check:tokens`; Guard `python3 -I scripts/check-signage-identifiers.py` (ab Task 1, ohne Argumente) Exit 0.

## Review Focus

1. **Deploy-Reihenfolge:** Der neue Code startet, bevor die Tabellen umbenannt sind; `signage_rename_from_monitor` muss ohne Modelle (nur SQL) laufen und in `deploy.sh` vor `migrate` stehen. Test in Task 1 (`test_forward_on_old_schema_without_app_tables`).
2. **PostgreSQL-Eigenheiten:** Sequenzen der `id`-Spalten, M2M-Tabellen, Fremdschlüssel nach dem Umbenennen; Einfügen neuer Zeilen danach. Probe auf lokalem PostgreSQL in Task 1 (Step „Postgres-Probe“).
3. **Bereits installierte Pis** mit altem Agent sprechen `/api/monitor/agent/…` und `/ws/monitor/pi/<slug>/` an. Test in Task 4 (`test_legacy_and_new_paths_same_response`, WebSocket-Test für beide Pfade).
4. **Nutzer und Gruppen behalten ihre Rechte** nach der Umbenennung der Codes. Test in Task 2 (`test_permission_assignments_survive_rename`).
5. **Mediendateien** bleiben erreichbar (Pfade unter `monitor/…`). Test in Task 1 (`test_upload_path_unchanged`).

---

### Task 1: Backend-App `signage` mit Datenbank-Umbenennung

**Files:**
- Move: `backend/monitor/` → `backend/signage/` (`git mv`)
- Modify: `backend/signage/apps.py` (`name = 'signage'`, Klasse `SignageConfig`), `backend/core/settings.py` (`INSTALLED_APPS`), `backend/core/urls.py`, `backend/core/asgi.py`, alle Imports `monitor.` → `signage.` im Backend
- Modify: alle Migrationen in `backend/signage/migrations/` (nur App-Bezüge), `backend/users/migrations/` nur falls sie `('monitor', …)` als Abhängigkeit nennen
- Create: `backend/signage/management/commands/signage_rename_from_monitor.py`
- Rename: Management-Befehle `monitor_render_media`, `monitor_webuntis_check`, `monitor_webuntis_record`, `monitor_device_watch` → `signage_*`
- Modify: Logger-Namen `monitor.*` → `signage.*`, Cache-Präfixe `'monitor:'` → `'signage:'`, Channels-Gruppennamen mit `monitor` → `signage`
- Rename: `scripts/check-monitor-identifiers.py`, `.allow`, `test_check_monitor_identifiers.py` → `check-signage-identifiers.*` (Default-Bereich auf `backend/signage`, `frontend/src/components/signage`, `agent` vorbereiten; bis Task 3 auch die alten Frontend-Pfade)
- Modify: `scripts/deploy.sh` (vor `migrate`: `"$VENV/bin/python" manage.py signage_rename_from_monitor`), `scripts/stagedesk-device-watch.service` (neuer Befehlsname)
- Test: `backend/signage/tests_rename.py`

**Interfaces:**
- Produces: App-Label `signage`; Befehl `signage_rename_from_monitor [--reverse]`; API-Router weiterhin unter `/api/monitor` (neue Adressen erst in Task 4); Router-Variable `signage_router`.
- Befehl, Verhalten:
  - Vorwärts: in einer Transaktion alle Tabellen mit Präfix `monitor_` → `signage_` (`ALTER TABLE … RENAME TO …`), auf PostgreSQL zusätzlich die zugehörigen Sequenzen `monitor_…_seq` → `signage_…_seq`; `UPDATE django_migrations SET app='signage' WHERE app='monitor'`; `UPDATE django_content_type SET app_label='signage' WHERE app_label='monitor'`.
  - Nichts zu tun (keine `monitor_*`-Tabelle, keine `monitor`-Zeilen): Ausgabe „Nichts umzubenennen.“, Exit 0.
  - Beide Präfixe gleichzeitig vorhanden: Abbruch mit Exit 1 und „Tabellen für monitor und signage vorhanden, Umbenennung abgebrochen.“, nichts geändert.
  - `--reverse`: dasselbe in Gegenrichtung.
  - Nutzt nur `connection.introspection.table_names()` und SQL, keine Modelle.

- [ ] **Step 1: `git mv backend/monitor backend/signage`, App-Konfiguration, Imports, Migrationsbezüge umstellen; `python manage.py check` ohne Fehler**
- [ ] **Step 2: Failing tests für den Befehl**

```python
class RenameCommandTests(TransactionTestCase):
    def test_reverse_then_forward_round_trip(self):
        # Ausgangslage Test-DB: signage_*; Zeilen in signage_screen, signage_displayview, M2M-Tabelle anlegen
        call_command('signage_rename_from_monitor', '--reverse')
        # -> nur monitor_* Tabellen, django_migrations.app == 'monitor', content_type.app_label == 'monitor'
        call_command('signage_rename_from_monitor')
        # -> nur signage_* Tabellen, gleiche Zeilen und Zuordnungen, Migrationsverlauf und Content-Types auf 'signage'
    def test_forward_twice_is_noop(self):  # zweiter Lauf: "Nichts umzubenennen."
    def test_both_prefixes_aborts(self):   # künstliche Tabelle monitor_x neben signage_*: Exit 1, nichts geändert
    def test_forward_on_old_schema_without_app_tables(self):
        # nach --reverse existieren keine signage_* Tabellen; Befehl läuft ohne Modellzugriff durch
    def test_upload_path_unchanged(self):  # upload path for kind 'image' starts with 'monitor/'
```

- [ ] **Step 3: Fehlschlag** — `python manage.py test signage.tests_rename` → FAIL (Befehl fehlt).
- [ ] **Step 4: Befehl implementieren, Befehle/Logger/Cache/Gruppen/Guard/Skripte umbenennen.**
- [ ] **Step 5: Grün** — `python manage.py test signage users`, `makemigrations --check --dry-run` („No changes detected“), Guard Exit 0, Agent-Tests.
- [ ] **Step 6: Postgres-Probe** — lokales Cluster starten (`pg_ctlcluster 16 main start`), Datenbank `probe` anlegen, mit dem Stand von `main` (`git worktree add` in den Scratchpad) `DB_ENGINE=postgres migrate` und Beispieldaten (Bildschirm, Ansicht mit Rotation, Mediendatei, Gerät) anlegen; dann mit diesem Branch `signage_rename_from_monitor`, `migrate` (darf nichts anwenden), eine neue Ansicht anlegen (Sequenz funktioniert), `--reverse`, wieder vorwärts. Ergebnis im Bericht; Cluster danach stoppen.
- [ ] **Step 7: Commit** — `refactor(signage): App monitor heißt signage, Datenbank-Umbenennung per Befehl`

### Task 2: Rechte-Codes `signage.*`

**Files:**
- Create: `backend/users/migrations/0017_rename_monitor_permissions_to_signage.py`
- Modify: `backend/users/api.py` (Liste der Rechte und Standardrechte), alle `_require_perm(request, 'monitor.…')` in `backend/signage/`, Frontend `hasPermission('monitor.…')` (`grep -rn "'monitor\." frontend/src`), Test-Mocks und Admin-Fixtures
- Test: `backend/users/tests.py` (oder bestehende Rechte-Tests), `backend/signage/tests_permissions.py`

**Interfaces:**
- Produces: Codes `signage.view`, `signage.setup`, `signage.exams`, `signage.media`, `signage.power`, `signage.onair`, `signage.emergency`, `signage.devices` (Anzeigenamen unverändert). Migration benennt nur `code` um (Muster wie `0015_rename_monitor_emergency_permission.py`), Rückweg vorhanden.

- [ ] **Step 1: Failing tests** — `test_permission_assignments_survive_rename`: Nutzer mit `monitor.setup` und Gruppe mit `monitor.power` vor der Migration, danach `signage.setup` bzw. `signage.power` zugeordnet; Rückweg stellt `monitor.*` her. API-Test: Endpunkt mit `signage.setup` erlaubt, ohne 403.
- [ ] **Step 2: Fehlschlag.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün** — Backend- und Frontend-Checks.
- [ ] **Step 5: Commit** — `refactor(signage): Rechte heißen signage.*`

### Task 3: Frontend-Ordner `signage`

**Files:**
- Move: `frontend/src/components/display/` → `frontend/src/components/signage/display/`, `frontend/src/components/monitor-admin/` → `frontend/src/components/signage/admin/`, `frontend/src/pages/MonitorPage.jsx` → `frontend/src/pages/SignagePage.jsx`
- Move: `frontend/tests/display-fixtures/` → `frontend/tests/signage/display-fixtures/`, `frontend/tests/admin-fixtures/` → `frontend/tests/signage/admin-fixtures/`
- Modify: `frontend/src/App.jsx`, `frontend/src/components/DashboardLayout.jsx`, alle Imports, `frontend/scripts/shoot-display.mjs`, `shoot-admin.mjs`, `check-tokens.mjs` (Pfade), Komponentennamen `Monitor…` → `Signage…` (z. B. `MonitorAdminLayout` → `SignageAdminLayout`)
- Modify: Guard-Default-Bereich (nur noch neue Pfade)

**Interfaces:**
- Produces: Routen bleiben in diesem Task unverändert (`/monitor`, `/monitor-admin/…`); neue Routen kommen in Task 4.

- [ ] **Step 1: Verschieben und Imports anpassen** (`git mv`).
- [ ] **Step 2: Grün** — `npx vitest run && npm run build && npm run check:tokens`; beide Screenshot-Skripte laufen durch (`--out` in den Scratchpad), Guard Exit 0.
- [ ] **Step 3: Commit** — `refactor(signage): Frontend-Ordner signage`

### Task 4: Neue Adressen mit dauerhaften Alt-Aliassen

**Files:**
- Modify: `backend/core/urls.py` (Router unter `/api/signage`), Create: `backend/signage/legacy_paths.py` mit Middleware `LegacyPathMiddleware`, eingetragen in `backend/core/settings.py` `MIDDLEWARE` vor `CommonMiddleware`
- Modify: `backend/signage/routing.py` (beide Präfixe `ws/signage/…` und `ws/monitor/…`)
- Modify: `backend/signage/devices.py` (Kiosk-URL `/signage?…`), `frontend/src/components/signage/admin/pages/screenData.js` (`kioskUrl` → `/signage?…`), `installCommand` in `settingsData.js`
- Modify: `frontend/src/App.jsx` (Routen `/signage` und `/monitor` auf dieselbe Seite; `/signage-admin/*` neu, `/monitor-admin/*` → `<Navigate>` auf `/signage-admin/*` mit Rest und Query), Navigationslinks auf `/signage-admin`
- Modify: Agent `agent/stagedesk_agent/{pairing,self_update,connection,commands,agent}.py`, `agent/install.sh` auf `/api/signage/…`, `/ws/signage/…`, `/signage?…`
- Test: `backend/signage/tests_legacy_paths.py`, Agent-Tests anpassen, `frontend/src/App.test.jsx` (falls vorhanden, sonst Routen-Test neu)

**Interfaces:**
- Produces: `LegacyPathMiddleware` schreibt `request.path_info` mit Präfix `/api/monitor/` auf `/api/signage/` um (nur dieses Präfix). WebSocket: beide Präfixe in `websocket_urlpatterns`.

- [ ] **Step 1: Failing tests** — `test_legacy_and_new_paths_same_response`: `GET /api/monitor/display?screen=…` und `/api/signage/display?screen=…` gleicher Status und gleiches JSON (bis auf `generated_at`); gleiches für `/api/monitor/agent/install.sh`. WebSocket: `ws/monitor/pi/<slug>/` und `ws/signage/pi/<slug>/` verbinden beide. Frontend: `/monitor-admin/screens/3?x=1` landet auf `/signage-admin/screens/3?x=1`; `/monitor?screen=a` rendert die Anzeige.
- [ ] **Step 2: Fehlschlag.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Grün** — alle Checks inkl. Agent.
- [ ] **Step 5: Commit** — `feat(signage): Adressen /signage, alte /monitor-Adressen bleiben`

### Task 5: `oepnv.py` in `signage/transit/` aufteilen

**Files:**
- Create: `backend/signage/transit/__init__.py`, `db.py`, `nahsh.py`, `disruptions.py`, `departures.py`, `search.py`
- Delete: `backend/signage/oepnv.py`
- Modify: Aufrufer (`display.py`, API-Module, Tests: `grep -rn oepnv backend/signage`), `backend/signage/apps.py` (`ready()`)
- Test: bestehende Tests mit neuen Importen; `backend/signage/tests_transit.py` für den Log-Hinweis

**Interfaces:**
- Produces: `signage.transit` exportiert `fetch_departures`, `search_stations`, `fetch_disruptions_nahsh`, `fetch_disruptions_swl`, `disruption_id` (bisher `_disruption_id`) mit unveränderten Signaturen. Logger `signage.transit`; alle `print` → `logger.warning/info`. `SignageConfig.ready()` schreibt einmal `logger.warning("DB_TT_CLIENT_ID/DB_TT_API_KEY not set, DB departures disabled")`, wenn einer fehlt. Modul-Kopf korrigiert (DB Timetables API statt „DB REST v6“).

- [ ] **Step 1: Failing test** — `test_warns_when_db_credentials_missing` (`assertLogs('signage.transit', 'WARNING')` beim Aufruf von `ready()` mit leeren Werten; keine Warnung mit gesetzten Werten).
- [ ] **Step 2: Fehlschlag.**
- [ ] **Step 3: Aufteilen** (Code verschieben, nicht umschreiben).
- [ ] **Step 4: Grün** — Backend-Checks; zusätzlich Verhaltensgleichheit: die bisherigen Transit-Tests laufen unverändert bis auf Importe.
- [ ] **Step 5: Commit** — `refactor(signage): Abfahrten-Code in signage/transit aufgeteilt`

### Task 6: API in `signage/api/` aufteilen

**Files:**
- Create: `backend/signage/api/__init__.py` (setzt `signage_router` aus den Teil-Routern zusammen), `views.py`, `screens.py`, `media.py`, `exams.py` (Klausuren, Vorlagen, Termine, Hinweise, Ferien), `settings.py`, `display.py` (Endpunkte von `/display`, nicht zu verwechseln mit `signage/display.py`), `legacy.py` (`/bildschirm/…`, `/notfall`, alte Namen), `setup.py` (bisher `api_setup.py`), `devices.py` (bisher `api_devices.py`)
- Delete: `backend/signage/api.py`, `api_setup.py`, `api_devices.py`
- Modify: `backend/core/urls.py`, Tests mit Importen aus den alten Modulen

**Interfaces:**
- Produces: `from signage.api import signage_router`; alle Pfade, Methoden, Schemas und Rechte unverändert.

- [ ] **Step 1: Vorher-Liste der Routen sichern** — Skript im Scratchpad gibt alle `(method, path)` des Routers sortiert aus; Ausgabe speichern.
- [ ] **Step 2: Aufteilen** (Code verschieben).
- [ ] **Step 3: Nachher-Liste vergleichen** — identisch (Diff leer); `python manage.py test signage users` grün.
- [ ] **Step 4: Commit** — `refactor(signage): API nach Bereichen aufgeteilt`

### Task 7: Kommentare aufräumen

**Files:**
- Modify: alle `.py` in `backend/signage/` außer `migrations/`, alle `.js/.jsx/.css` in `frontend/src/components/signage/` und `frontend/src/pages/SignagePage.jsx`, `agent/stagedesk_agent/`, `agent/install.sh`, `agent/kiosk/kiosk.sh`

**Interfaces:**
- Regeln: Kommentare und Docstrings, die nur wiederholen, was der Code sagt, oder generisch klingen („Hilfsfunktion für …“, „Spec §x“-Verweise ohne Inhalt, Aufzählungen von Selbstverständlichem, Abschnittsbanner `# ═══ … ═══`), ersatzlos löschen. Was bleibt, erklärt ein Warum oder eine Eigenheit einer externen Schnittstelle, auf Englisch, knapp. Kein Code ändert sich.

- [ ] **Step 1: Python-Gleichheit sichern** — Skript im Scratchpad: für jede geänderte `.py`-Datei AST von vorher (`git show HEAD:<pfad>`) und nachher ohne Docstrings vergleichen (`ast.dump` nach Entfernen von Docstring-`Expr`-Knoten); Ausgabe „identisch“ für alle Dateien.
- [ ] **Step 2: Aufräumen.**
- [ ] **Step 3: Prüfen** — AST-Skript meldet nur „identisch“; Frontend-Build und Tests grün; Agent-Tests grün; `bash -n` für die Shell-Skripte.
- [ ] **Step 4: Commit** — `chore(signage): Kommentare gekürzt und englisch`

### Task 8: Fehlermeldungen

**Files:**
- Modify: sichtbare Texte in `frontend/src/components/signage/display/` (Zustände, Views), `frontend/src/components/signage/admin/` (inkl. `shared/errorText.js`, Toasts), `HttpError`-Texte in `backend/signage/` (inkl. `validation.py`), Kiosk-/Agent-Meldungen in `agent/`
- Test: betroffene Tests auf neue Texte

**Interfaces:**
- Regeln: kurz und sachlich wie in einem normalen Programm: was nicht geht, bei Bedarf die Ursache in wenigen Worten; keine Menüpfade, keine Handlungsanleitungen in ganzen Sätzen, keine Floskeln. Deutsch. Vorgaben aus der Spec: „Vertretungsplan nicht verfügbar.“ (statt „Der Vertretungsplan ist derzeit nicht abrufbar. Im Admin unter …“), „Kiosk-URL ohne Schlüssel.“ (statt „Für den Vertretungsplan fehlt der Bildschirm-Schlüssel in der Kiosk-URL.“).
- Unverändert bleiben alle Texte, die in `docs/superpowers/specs/2026-10-2*.md` wörtlich in Anführungszeichen stehen (vom Nutzer so gewollt), und reine Feldbeschriftungen.

- [ ] **Step 1: Bestandsliste** — alle geänderten Texte vorher → nachher als Tabelle in den Bericht.
- [ ] **Step 2: Tests auf neue Texte umstellen (rot), Texte ändern (grün).**
- [ ] **Step 3: Alle Checks grün.**
- [ ] **Step 4: Commit** — `chore(signage): sachliche Fehlermeldungen`

### Task 9: Doku und Abnahme

**Files:**
- Modify: `CLAUDE.md` (Pfade, Befehle, Rechte, Adressen, Guard), `DEPLOY.md` (neuer Abschnitt: Probe auf Produktionskopie, `deploy.sh` ruft `signage_rename_from_monitor` vor `migrate`, Rückweg: `migrate users 0016`, `signage_rename_from_monitor --reverse`, alten Stand auschecken; Tabelle der Umgebungsvariablen `DB_TT_CLIENT_ID`, `DB_TT_API_KEY`, `NAHSH_HAFAS_AID`, `SWHL_STORYBLOK_TOKEN`, `PUBLIC_BASE_URL`, `REDIS_URL` mit Zweck und Herkunft), `docs/raspberry-pi-monitor.md` (neue Adressen, alte gehen weiter), `README.md`/`QUICKSTART.md` falls sie `monitor`-Pfade nennen

- [ ] **Step 1: Doku schreiben.**
- [ ] **Step 2: Endkontrolle** — alle Checks aus den Global Constraints grün; `grep -rn "monitor" backend/signage frontend/src/components/signage agent --include=*.py --include=*.js --include=*.jsx` zeigt nur noch Alt-Adressen, Medienpfade und Migrationen; Screenshots Anzeige und Admin laufen.
- [ ] **Step 3: Commit** — `docs(signage): Doku nach der Umbenennung`
