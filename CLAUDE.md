# Stagedesk V2

Internes Verwaltungs-Tool der **Technik-AG (Bühnentechnik) am Katharineum zu Lübeck**.
Live: https://stagedesk.t410.de · Repo: github.com/maximal7000/Stagedesk-V2 (privat).

## Stack
- **Backend**: Django 5 + Django Ninja (API), Channels/WebSockets, PostgreSQL, Keycloak OIDC (`keycloak_auth`).
- **Frontend**: React 19 + Vite + **Tailwind CSS v4** (CSS-`@theme` in `src/index.css`, **keine** `tailwind.config.js`), react-router-dom, axios. Dunkles Theme, UI-Sprache **Deutsch**.
- **Auth**: Keycloak (`react-oidc-context` im Frontend). Realm `technik-ag` auf `auth.t410.de`.

## Befehle
```bash
# Backend (immer venv aktivieren!)
cd backend && source venv/bin/activate && python manage.py <cmd>
python manage.py runserver 127.0.0.1:8000     # lokal

# Frontend
cd frontend && npm run dev        # Dev-Server :5173 (erwartet Backend :8000)
cd frontend && npm run build      # Prod-Build

# Deploy (nur nach Merge auf main)
ssh -o BatchMode=yes root@t410.de "bash /opt/stagedesk/scripts/deploy.sh"
# deploy.sh macht: git pull, migrate, collectstatic, npm build, systemctl restart tag-backend.service
```

## Workflow
- Feature → eigener Branch → **Pull Request** nach `main` (kein lokaler Merge) → nach Merge Deploy-Skript.
- Commit-Nachrichten auf **Englisch**. Commit-Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Vor größeren Umbauten: Backup-Tag + Tarball (`~/stagedesk-backups/`).
- DB-/API-Credentials **niemals** committen (Repo ist öffentlich) — nur in `/opt/stagedesk/backend/.env` auf dem Server.

## Wichtige Muster
- **Django-Ninja-Routen: `""` statt `"/"`** für Root-Endpoints (`@router.get("")`). Frontend-Calls ohne Trailing-Slash. Referenz: `veranstaltung`-Router.
- **Permissions**: Backend `require_permission(request, 'modul.aktion')`; Frontend `hasPermission('modul.aktion')` via `useUser()`.
- **Kombinierte Seiten**: Übersicht + Detail in einer Komponente, bedingt über `useParams().id` (z.B. `AusleihePage`, `AnwesenheitPage`).
- **API-Client**: `frontend/src/lib/api.js` (axios mit Bearer-Token).

## Design-System (siehe auch Memory `design-system.md`)
- Akzent-Token `bg-accent`/`text-accent` = **TUES-Rot `#da1f3d`** (sparsam einsetzen), `hover:bg-accent-hover`.
- `font-display` = Barlow Semi Condensed (Titel). Bausteine in `frontend/src/components/ui/` (PageHeader, Button, StatTile, StatusBadge, EmptyState) — verwenden, Props stabil halten.
- Semantische Farben bleiben (grün=verfügbar/positiv, rot=Gefahr/überfällig, gelb=Warnung, blau=Info/Status). Generisches UI-Blau → Akzent.
- **Design-Manifest** (Nutzer-Vorgabe): keine Lila-Verläufe, keine Pill-Buttons (rounded-lg, nicht rounded-full), keine Emoji-Icons (lucide-react nutzen), keine Em-Dashes im sichtbaren Text, keine vagen Floskeln/KI-Slop-Copy, keine Fake-Metriken.

## Signage / Raspberry-Pi-Displays (früher "Monitor")
- Öffentliche Anzeige-Seiten (kein Login): `/signage?screen=<slug>&key=<key>` (Kiosk-URL aus dem Admin; alt `?bildschirm=` geht weiter) und `/aufgaben-monitor`. **Alte Adressen bleiben dauerhaft**: `/monitor…`, `/monitor-admin/…`, `/api/monitor/…` (Middleware `backend/signage/legacy_paths.py`), `/ws/monitor/pi|display/<slug>/` (`routing.py`), im Frontend eine Weiterleitung; die frühen Endpunkte `/bildschirm/…` und `/notfall` liegen in `backend/signage/api/legacy.py`. Medien liegen weiter unter `media/monitor/…`. Skalierung pro Bildschirm im Admin; `?zoom=` nur Notbehelf, überstimmt das Admin.
- Signage-Admin `/signage-admin` (Übersicht) mit `/screens[/:id]`, `/views[/:id|/new]`, `/exams`, `/media`, `/schedules`, `/settings`. Rechte `signage.view/setup/exams/media/power/onair/emergency/devices` (Umbenennung aus `monitor.*` mit `users` 0017, Rückweg `migrate users 0016`).
- Code: Anzeige `frontend/src/components/signage/display/` (Einstieg `components/signage/display/DisplayRoot.jsx`, Seite `frontend/src/pages/SignagePage.jsx`), Admin `frontend/src/components/signage/admin/` (`pages/`, `view-editors/`, `shared/`). Backend-App `backend/signage/` (`api/`-Paket, `transit/`-Paket), Vertrag `/display` in `backend/signage/display.py`. Umgebungsvariablen (`DB_TT_*`, `NAHSH_HAFAS_AID`, `SWHL_STORYBLOK_TOKEN`, `PUBLIC_BASE_URL`, `REDIS_URL`): `DEPLOY.md`.
- Screenshots: `node frontend/scripts/shoot-display.mjs` bzw. `shoot-admin.mjs` (headless Chromium mit `--headless=new`, Testdaten in `frontend/tests/signage/display-fixtures/` bzw. `admin-fixtures/`).
- Bezeichner-Guard: `python3 -I scripts/check-signage-identifiers.py` (ohne Argumente prüft alles; Code englisch, Exit 0 nötig).
- **Vertretungsplan-Quellen**: „WebUntis-Vertretungsplan“ (öffentlicher Monitor-Endpunkt, kein Konto), „WebUntis-Konto“, „WebUntis-Seite einbetten“; bei Ausfall automatisch in dieser Reihenfolge weiter (kein Hinweis auf dem Bildschirm; aktive Quelle in den Einstellungen unter „Verbindung testen“). Ausgabe-Voreinstellungen `vplan-schueler`, `vplan-schueler-1`, `vplan-lehrer`, `custom`. Der Typ einer Ansicht ist änderbar.
- **Abfahrten-Monitor**: feste Spalten (`transit_columns` 1 bis 5, Standard 4; pro Haltestelle `column`, `split_modes` = "Busse und Züge getrennt"), Haltestellen einer Spalte teilen die Höhe, Überhang wird abgeschnitten. `transit_strip_city` = "Ortsnamen kürzen" (Standard an). Zeitangabe pro Ansicht Minuten/Uhrzeit/Gemischt (bis 20 min Minuten): Minuten zählen bis zur tatsächlichen Abfahrt (Verspätung eingerechnet, kein "+N"), Uhrzeit bleibt die geplante mit "+N" daneben; sichtbar nur Abfahrten ab jetzt + Fußweg, ohne Echtzeit weg 1 min nach Plan. Störungen (`transit_show_disruptions`, blättern im Blättertakt) in eigener Spalte rechts oder per `transit_disruption_column` unter den Haltestellen einer Abfahrten-Spalte; Bilder volle Breite, Text ungekürzt. Fußweg, Spalte, Busse/Züge getrennt und Anzahl wirken pro Abruf in `display.py`, ohne neuen Abruf; die Vorschau speichert Abrufe nach ihren Eingaben (60 s, Störungen 300 s). Quelle pro Haltestelle (`source`: leer = Automatisch, `db`, `nahsh`, `both`; Editor zeigt "Quelle: …"): Automatisch fragt die DB nur für Bahnhofsnummern (EVA 80xxxxx) mit NAH.SH als Ersatz, sonst NAH.SH; die Schalter unter "Erweitert" gelten nur für Automatisch. Kein Quellen-Hinweis in der Fußzeile. Speichern verwirft den Abfahrten-Zwischenspeicher nur bei geänderten Haltestellen, Filtern oder Quellen; pro Ansicht läuft höchstens ein Abruf gleichzeitig. SEV-Busse folgen dem Zug-Filter der Haltestelle. Bei Minuten/Gemischt sortiert nach tatsächlicher Abfahrt, bei Uhrzeit nach Plan. Pro Haltestelle werden mindestens 50 Abfahrten abgerufen (Fußweg filtert danach). Fällt eine Quelle für eine Haltestelle kurz aus, bleiben deren letzte Abfahrten bis 10 min stehen. Fußweg mit Symbol; eine Störung, die höher als die Spalte ist, scrollt im Blättertakt. Gleise brauchen `DB_TT_CLIENT_ID` und `DB_TT_API_KEY`; am Hbf "Lübeck Hbf" als DB-Haltestelle (nur Züge) unter "ZOB/Hauptbahnhof" in dieselbe Spalte. Migrationen `signage` 0047 und 0048, Rückweg `migrate signage 0046`: Spaltenzahl bleibt erhalten; Spalte je Haltestelle und Ortsnamen kürzen werden ignoriert (`DEPLOY.md`).
- **Zeitplan**: pro Bildschirm eine Liste (Tage, von, bis, Ansicht oder Standard-Ansicht); außerhalb der Zeilen ist der Bildschirm aus. Recht `signage.power`. Kein `power_schedule` mehr (ab Migration 0045).
- **Aufteilung** pro Ansicht: Automatisch/Normal/Breit (ersetzt „Stil“). **Farbschema** in den Einstellungen Hell/Dunkel/Tageslicht/Zeitplan (Sonnenzeiten Lübeck offline berechnet), pro Bildschirm Wie eingestellt/Immer hell/Immer dunkel.
- `signage_webuntis_record --format <name> --date YYYYMMDD --out <dir>` zeichnet rohe WebUntis-Antworten für Testdaten auf; vor dem Commit anonymisieren. Rollout und Rückweg: `DEPLOY.md`.
- Management: `signage_render_media` (fehlende Medien-Seitenbilder rendern, idempotent), `signage_webuntis_check` (WebUntis-Verbindung). Rollout und Rückweg: `DEPLOY.md`.
- Pi-Setup-Anleitung: `docs/raspberry-pi-monitor.md` (cage + chromium Kiosk, systemd, CEC/Power).
- **Geräte-Agent** (`agent/`, Python, läuft als root auf dem Pi): `stagedesk_agent/` (Telemetrie, Befehle, Power, Selbst-Update mit Rückfall, Kopplung), `systemd/`, `kiosk/kiosk.sh`, `install.sh`. Installation: `curl -fsSL https://stagedesk.t410.de/api/signage/agent/install.sh | sudo bash` (alte URL geht weiter; Raspberry Pi OS Legacy Bookworm, Benutzer `pi`). Tests: `cd agent && python3 -m unittest discover -s tests`. Selbst-Update ersetzt nur Code; Unit-/Kiosk-Änderungen brauchen erneutes `install.sh`.
- Kopplung im Admin: Übersicht "Bildschirm koppeln" (Code vom Pi, Recht `signage.devices`). Backend: `backend/signage/devices.py`, `api/devices.py`, `agent_package.py`; Auslieferung unter `/api/signage/agent/`. Der Agent nutzt die neuen Pfade; `VERSION` blieb, installierte Pis nutzen die alten bis zum nächsten Agent-Update.
- **Power-Methode** `none` ("Keine Steuerung", Standard für neue Bildschirme; `power_on`/`power_off` → 422) und Geräte-Befehle `power_probe` (liest die Hardware, Recht `signage.devices`), `power_test`/`power_test_end` (Methode mit `params` {method, config, seconds 5..60} zeitlich begrenzt testen, Recht `signage.power`); Agent ab 1.1.0, Migration `signage` 0049.
- Management `signage_device_watch` (Ampel, Warnungen, Benachrichtigungen; Timer `scripts/stagedesk-device-watch.{service,timer}`). `backend/requirements-dev.txt` (`websocket-client`) nur für den E2E-Test `signage/tests_agent_e2e.py`. Rollout und Rückweg: `DEPLOY.md`, Abschnitte "Geräte-Agent" und "Umbenennung monitor → signage".
- Bekannter Pi: **glocke** (`172.22.0.229`, mDNS `rpi-monitor-glocke.local`), iiyama LH4341UHS-B2, 4K, CEC (schaltet an+aus). Power-Dienst via `wss://.../ws/signage/pi/glocke/` (glocke nutzt bis zum Agent-Update noch den alten Pfad `/ws/monitor/pi/glocke/`).

## Dateien
- Routen: `frontend/src/App.jsx` · Navigation/Sidebar: `frontend/src/components/DashboardLayout.jsx`
- Core-URLs: `backend/core/urls.py` · Settings: `backend/core/settings.py`
- Permissions-Default: `backend/users/api.py` (`default_permissions`)
- Weitere Doku: `README.md`, `QUICKSTART.md`, `DEPLOY.md`, `KEYCLOAK_SETUP.md`, `PROJEKTDOKUMENTATION.md`.
