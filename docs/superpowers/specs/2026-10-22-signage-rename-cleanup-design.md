# Umbenennung `monitor` → `signage` und Aufräumen

Stand: 22.10.2026 · Status: Entwurf, wartet auf Review

Ziel: Das Anzeige-Modul heißt in Backend und Frontend einheitlich `signage`, der Code ist aufgeräumt, Kommentare und Fehlermeldungen klingen wie in einem normalen Programm. **Das Verhalten ändert sich nicht.** Die Änderungswünsche zum Abfahrten-Monitor kommen danach als eigenes Projekt.

Ausblick (nicht Teil dieser Spec): Das Modul soll später als eigene Anwendung nur für das Katharineum laufen können (Login über das schuleigene LDAP/GOsa). Diese Spec bereitet das nur vor, indem sie die Abhängigkeiten des Moduls zum Rest von Stagedesk sichtbar und klein hält.

## 1. Umbenennung

### 1.1 Backend (komplett, inklusive Datenbank)

- Paket `backend/monitor/` → `backend/signage/`, App-Label `monitor` → `signage`, alle Imports.
- Datenbank: Tabellen `monitor_*` → `signage_*`, Einträge in `django_migrations` und `django_content_type` werden umgeschrieben. Umsetzung als einmaliger, idempotenter Management-Befehl `signage_rename_from_monitor`, der vor `migrate` läuft (in `deploy.sh` eingebaut) und in einer Transaktion arbeitet. Rückweg: derselbe Befehl mit `--reverse`.
- Die bestehenden Migrationen 0001–0046 werden nicht neu geschrieben, nur ihre App-Bezüge (`dependencies`, `apps.get_model('monitor', …)`) auf `signage` umgestellt.
- Rechte: `monitor.view/setup/exams/media/power/onair/emergency/devices` → `signage.*`. Datenmigration in der App `users`, die die Codes in der Tabelle der Rechte umbenennt (Zuordnungen zu Nutzern und Gruppen bleiben erhalten), mit Rückweg.
- Cache-Schlüssel `monitor:*` → `signage:*` (Caches sind flüchtig, keine Übernahme nötig), Logger-Namen `monitor.*` → `signage.*`, Channels-Gruppen entsprechend.
- Management-Befehle `monitor_*` → `signage_*` (`signage_render_media`, `signage_webuntis_check`, `signage_webuntis_record`, `signage_device_watch`); systemd-Timer `stagedesk-device-watch` ruft den neuen Namen auf.
- Bezeichner-Guard `scripts/check-monitor-identifiers.py` → `scripts/check-signage-identifiers.py`.

### 1.2 Frontend

- `frontend/src/components/display/` und `components/monitor-admin/` → `components/signage/display/` und `components/signage/admin/`; `pages/MonitorPage.jsx` → `pages/SignagePage.jsx`. Komponentennamen `Monitor…` → `Signage…`.
- Frontend-Rechteprüfungen `hasPermission('monitor.…')` → `signage.…`.
- Sichtbare Bezeichnungen bleiben deutsch („Monitore“ in der Navigation usw.).

### 1.3 Öffentliche Adressen

Empfehlung: neue Adressen einführen, alte **dauerhaft** weiter bedienen, weil Pis, Lesezeichen und die Installationsanleitung sie nutzen.

| Alt | Neu | Alt bleibt |
|---|---|---|
| `/monitor?screen=…` | `/signage?screen=…` | ja (gleiche Seite) |
| `/monitor-admin/…` | `/signage-admin/…` | ja (Weiterleitung) |
| `/api/monitor/…` | `/api/signage/…` | ja (zweiter Router auf dieselben Endpunkte) |
| `/ws/monitor/pi/<slug>/`, `/ws/monitor/display/<slug>/` | `/ws/signage/…` | ja |
| `curl …/api/monitor/agent/install.sh` | `…/api/signage/agent/install.sh` | ja |

Der Geräte-Agent und die Kiosk-URL aus dem Admin nutzen danach die neuen Adressen; bereits installierte Pis laufen über die alten weiter, bis ihr Selbst-Update sie umstellt. Die Alt-Endpunkte für frühe Pi-Skripte (`/bildschirm/…`, `/notfall`) bleiben unverändert.

## 2. Aufräumen

- **`oepnv.py` (1284 Zeilen) aufteilen** in ein Unterpaket `signage/transit/`: `db.py` (DB Timetables), `nahsh.py` (NAH.SH HAFAS), `disruptions.py` (Störungen NAH.SH und Stadtverkehr), `departures.py` (Zusammenführen, Filter, Sortierung), `search.py` (Haltestellensuche). `print` → `logging`. Veraltete Angaben korrigieren (Kopf nennt „DB REST v6“, tatsächlich Timetables-API).
- **`api.py` (1013 Zeilen) aufteilen** nach Bereichen (Ansichten, Bildschirme, Medien, Klausuren und Termine, Einstellungen, Anzeige, Alt-Endpunkte), wie es `api_setup.py` und `api_devices.py` schon tun.
- **Kommentare:** generisch klingende oder nichtssagende Kommentare ersatzlos löschen; was bleibt, erklärt ein Warum, auf Englisch. Docstrings nur, wo sie etwas sagen, was Name und Signatur nicht sagen.
- **Tote Felder** (`transit_columns`, `transit_disruption_position`) bleiben vorerst, bis die Abfahrten-Diskussion entschieden ist.
- **Doku der Umgebungsvariablen:** `DB_TT_CLIENT_ID`, `DB_TT_API_KEY`, `NAHSH_HAFAS_AID`, `SWHL_STORYBLOK_TOKEN`, `PUBLIC_BASE_URL`, `REDIS_URL` mit Zweck in `DEPLOY.md`; ein Hinweis im Log beim Start, wenn die DB-Zugangsdaten fehlen (statt stiller Übergehung).

## 3. Fehlermeldungen

Alle sichtbaren Fehler- und Zustandstexte in Anzeige und Admin werden kurz und sachlich, wie in einem normalen Programm: was nicht geht, bei Bedarf die Ursache, keine Wegbeschreibungen durch Menüs, keine Floskeln. Sprache bleibt Deutsch (wie die übrige Oberfläche). Beispiele:

| Bisher | Neu |
|---|---|
| „Der Vertretungsplan ist derzeit nicht abrufbar. Im Admin unter Monitore → Einstellungen die WebUntis-Verbindung prüfen.“ | „Vertretungsplan nicht verfügbar.“ |
| „Für den Vertretungsplan fehlt der Bildschirm-Schlüssel in der Kiosk-URL.“ | „Kiosk-URL ohne Schlüssel.“ |

Umfang: Anzeige (`components/signage/display/`), Admin (`components/signage/admin/`, inklusive `errorText.js`), Backend-Meldungen (`HttpError`-Texte, 422-Meldungen), Agent-Meldungen im Kiosk. Spec-Texte der letzten Projekte, die der Nutzer ausdrücklich so wollte (z. B. Hilfetexte der Datenquellen), bleiben.

## 4. Tests und Abnahme

- Alle bestehenden Tests laufen nach der Umbenennung unverändert grün (Backend `signage users`, Agent, Frontend).
- Test für `signage_rename_from_monitor`: vorwärts und rückwärts auf einer Datenbank mit Altdaten (Tabellen, Migrationsverlauf, Content-Types, Rechte-Zuordnungen bleiben erhalten), zweimal ausgeführt ändert nichts.
- Tests, dass alte und neue Adressen (HTTP und WebSocket) dieselben Antworten liefern.
- Probe auf einer Kopie der Produktionsdatenbank (Postgres) vor dem Deploy, in `DEPLOY.md` beschrieben.
