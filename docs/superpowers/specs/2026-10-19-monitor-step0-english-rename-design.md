# Monitor Schritt 0: Englische Benennung, Streichungen, Zugangsdaten

Stand: 19.10.2026 · Status: wartet auf Review · Gesamtentwurf: `2026-10-19-monitor-overhaul-design.md`

## 1. Ziel

Das Monitor-Modul (Backend `backend/monitor/`, Frontend `MonitorPage.jsx`, `MonitorAdminPage.jsx`, `components/monitor/`) wird vollständig englisch benannt. Das betrifft Models, Felder, gespeicherte Auswahlwerte, JSON-Schlüssel, API-Routen, Schemas, Rechte und Frontend-Bezeichner. Die Oberfläche bleibt deutsch.

Im selben Schritt passiert zweierlei:
- Die im Gesamtentwurf beschlossenen Funktionen werden entfernt. So muss niemand Code umbenennen, der danach ohnehin gelöscht wird.
- Die Zugangsdaten aus `oepnv.py` ziehen in die Server-`.env`.

**Erfolgskriterium:** Nach dem Deploy funktionieren Anzeige, Admin, ATEM und Pi-Power exakt wie vorher, bis auf die gestrichenen Funktionen. Alle Daten sind erhalten.

## 2. Nicht-Ziele

- Keine neue Gestaltung, keine neuen Funktionen, keine Layout-Zusammenlegung. Das passiert in B und A.
- Das Pi-WebSocket-Protokoll (Nachrichtentypen `power_command`, `cec_status`, `ping`, `pong`) bleibt unverändert. Es ist schon englisch.
- Andere Module (Aufgaben, Inventar usw.) werden nicht angefasst.
- Die feine Rechte-Aufteilung (`monitor.power`, `monitor.exams` …) kommt erst in A.

## 3. Namensregeln (Glossar)

Für alle Bezeichner gelten diese Regeln: Python `snake_case`, JS `camelCase` für Variablen, API-JSON `snake_case`.

| Deutsch | Englisch |
|---|---|
| zeige_X | show_X |
| ist_X | is_X |
| X_am (Zeitpunkt) | X_at (`erstellt_am`→`created_at`, `aktualisiert_am`→`updated_at`, `geloescht_am`→`deleted_at`) |
| aktiv_von / aktiv_bis | active_from / active_until |
| aktiv (Bool) | is_active |
| titel, untertitel, text, name, notiz, beschreibung | title, subtitle, text, name, note, description |
| farbe | color |
| reihenfolge, sortierung | sort_order |
| zeitplan | schedule |
| tage / von / bis (in Zeitplänen) | days / from / until |
| intervall, dauer, seiten, spalten | interval, duration, pages, columns |
| profil | view |
| bildschirm(e) | screen(s) |
| klausur(en) | exam(s) |
| ankuendigung(en) | announcement(s) |
| oepnv | transit |
| station(en) | stop(s) |
| abfahrten | departures |
| stoerung(en) | disruption(s) |
| linien / typen | lines / types |
| uhr | clock |
| wetter / stadt | weather / city |
| bild / hintergrundbild | image / background_image |
| vollbild | fullscreen |
| links / rechts | left / right |
| prozent | percent |
| groesse / schriftgroesse | size / font_size |
| blinken | blink |
| notfall | emergency |
| ferien | holiday |
| ausnahmen | exceptions |
| papierkorb | trash |
| vorlage | template |

Fachbegriffe, die schon englisch oder Eigennamen sind, bleiben: WebUntis, slug, layout, split, api_token, power, cec.

## 4. Streichungen (in diesem Schritt entfernt)

Entfernt werden Backend-Felder, Frontend-Code und Admin-Bedienelemente für:

| Funktion | Felder (`MonitorConfig`) | Frontend |
|---|---|---|
| Baukasten | `layout_widgets`, `baukasten_spalten`, `baukasten_zeilenhoehe`, Layout-Wert `baukasten` | `components/monitor/Baukasten*` (inkl. freier iframe) |
| Bildschirmschoner | `zeige_bildschirmschoner`, `bildschirmschoner_timeout` | `MonitorPage.jsx:379-407`, `:533-560` |
| Kamera-Stream | `zeige_kamera`, `kamera_url`, `kamera_titel`, `kamera_typ` | `components/monitor/CameraStream*` |
| Laufschrift | `zeige_ticker`, `ticker_text`, `ticker_geschwindigkeit` | Ticker in `MonitorPage.jsx` |
| Raumplan-Widget | `zeige_raumplan`, `raumplan_server`, `raumplan_schule`, `raumplan_raum`, `raumplan_benutzername`, `raumplan_passwort`, `raumplan_cache`, `raumplan_cache_zeit` | Raumplan-Anzeige |

Datenmigration für die Streichungen:
- Ansichten mit Layout `baukasten` werden auf `standard` gesetzt.
- Steht in `MonitorGlobalSettings` kein WebUntis-Zugang, aber in einer Ansicht schon, werden Server, Schule, Benutzername und Passwort der ersten solchen Ansicht in die globalen Einstellungen übernommen.
- Den WebUntis-JSON-RPC-Client (`api.py:160-262`) behält B für den Vertretungsplan. Er wandert in ein eigenes Modul `backend/monitor/webuntis.py`, ohne Verhaltensänderung, und hat danach keinen Aufrufer mehr in der Anzeige.

## 5. Models und Felder

Die Tabellennamen ändern sich mit (Djangos Standard `monitor_<model>`). Felder und Models werden per `RenameModel`/`RenameField` umbenannt, damit die Daten erhalten bleiben.

### 5.1 Models

| Alt | Neu |
|---|---|
| MonitorDatei | MediaFile |
| WebUntisLink | WebUntisLink |
| MonitorConfig | DisplayView |
| Bildschirm | Screen |
| Klausur | Exam |
| Ankuendigung | Announcement |
| MonitorEvent | DisplayEvent |
| EventBildschirm | DisplayEventScreen |
| KlausurVorlage | ExamTemplate |
| MonitorGlobalSettings | MonitorSettings |
| MonitorConfigVersion | DisplayViewVersion |

### 5.2 Felder

Alle `related_name` werden nach dem Glossar mit umbenannt, zum Beispiel `als_aktives_logo`→`as_active_logo`, `klausuren`→`exams`, `zuweisungen`→`assignments`.

**MediaFile:** `datei`→`file`, `typ`→`kind`, `reihenfolge`→`sort_order`, `geloescht_am`→`deleted_at`, `erstellt_am`→`created_at`.

**WebUntisLink:** `notiz`→`note`, `erstellt_am`→`created_at`.

**DisplayView (bisher MonitorConfig):**

| Alt | Neu |
|---|---|
| ist_standard, sortierung, zeitplan | is_default, sort_order, schedule |
| layout_modus, geloescht_am, vollbild_header | layout, deleted_at, fullscreen_header |
| split_links, split_rechts, split_links_prozent | split_left, split_right, split_left_percent |
| titel, untertitel, hintergrund_farbe, akzent_farbe, theme_preset | title, subtitle, background_color, accent_color, theme_preset |
| zeige_logo, logo_url, aktives_logo | show_logo, logo_url, active_logo |
| zeige_uhr, zeige_veranstaltungen, zeige_ankuendigungen, zeige_onair, zeige_countdown | show_clock, show_events, show_announcements, show_on_air, show_countdown |
| notfall_aktiv, notfall_text | emergency_active, emergency_text |
| zeige_wetter, wetter_stadt, wetter_api_key, wetter_cache, wetter_cache_zeit | show_weather, weather_city, weather_api_key, weather_cache, weather_cache_at |
| zeige_slideshow, slideshow_intervall | show_slideshow, slideshow_interval |
| zeige_pdf, aktive_pdf, pdf_modus, pdf_intervall, pdf_pro_ansicht, pdf_seiten, pdf_statische_seite | show_pdf, active_pdf, pdf_mode, pdf_interval, pdf_per_screen, pdf_pages, pdf_static_page |
| aktives_bild, bild_fit, bild_fokus_x, bild_fokus_y | active_image, image_fit, image_focus_x, image_focus_y |
| zeige_webuntis, webuntis_url, webuntis_url_1tag, webuntis_link, webuntis_link_1tag, webuntis_zoom, webuntis_dark_mode | show_webuntis, webuntis_url, webuntis_url_next_day, webuntis_link, webuntis_link_next_day, webuntis_zoom, webuntis_dark_mode |
| zeige_hintergrundbild, aktives_hintergrundbild | show_background_image, active_background_image |
| zeige_qr_code, qr_code_url, qr_code_label | show_qr_code, qr_code_url, qr_code_label |
| zeige_freitext, freitext_titel, freitext_inhalt | show_free_text, free_text_title, free_text_content |
| zeige_eigener_countdown, eigener_countdown_name, eigener_countdown_datum | show_custom_countdown, custom_countdown_name, custom_countdown_date |
| zeige_seitenrotation, seitenrotation_intervall, seitenrotation_seiten | show_page_rotation, page_rotation_interval, page_rotation_pages |
| zeige_oepnv, oepnv_stationen, oepnv_dauer, oepnv_max_abfahrten | show_transit, transit_stops, transit_duration, transit_max_departures |
| oepnv_zeige_bus, oepnv_zeige_bahn, oepnv_zeige_fernverkehr | transit_show_bus, transit_show_rail, transit_show_long_distance |
| oepnv_api_db, oepnv_api_nahsh, oepnv_zeige_via, oepnv_zeige_relativ | transit_source_db, transit_source_nahsh, transit_show_via, transit_show_relative |
| oepnv_farbcodierung, oepnv_highlight_naechste, oepnv_auto_scroll, oepnv_stoerungsbanner | transit_color_coding, transit_highlight_next, transit_auto_scroll, transit_disruption_banner |
| oepnv_schriftgroesse, oepnv_layout_spalten | transit_font_size, transit_columns |
| oepnv_streik_aktiv, oepnv_streik_text, oepnv_streik_linien, oepnv_streik_typen | transit_strike_active, transit_strike_text, transit_strike_lines, transit_strike_types |
| oepnv_cache, oepnv_cache_zeit | transit_cache, transit_cache_at |
| oepnv_stoerung_bahn, oepnv_stoerung_bus, oepnv_stoerung_bahn_linien, oepnv_stoerung_bus_linien | transit_disruption_rail, transit_disruption_bus, transit_disruption_rail_lines, transit_disruption_bus_lines |
| oepnv_stoerung_manuell, oepnv_stoerung_cache, oepnv_stoerung_cache_zeit, oepnv_stoerung_ausgeblendet, oepnv_stoerung_position | transit_disruption_manual, transit_disruption_cache, transit_disruption_cache_at, transit_disruption_hidden, transit_disruption_position |
| ist_on_air, on_air_text, on_air_seit | is_on_air, on_air_text, on_air_since |
| on_air_groesse, on_air_position, on_air_blinken, on_air_farbe | on_air_size, on_air_position, on_air_blink, on_air_color |
| on_air_vollbild, on_air_split, on_air_split_seite | on_air_fullscreen, on_air_split, on_air_split_side |
| api_token, refresh_intervall, aktualisiert_am | api_token, refresh_interval, updated_at |

**Screen (bisher Bildschirm):**

| Alt | Neu |
|---|---|
| default_profil, zeitplan | default_view, schedule |
| override_profil, override_bis | override_view, override_until |
| power_zeitplan, ferien_modus, power_ausnahmen | power_schedule, holiday_mode, power_exceptions |
| neu_laden_zeit, power_modus | reload_requested_at, power_mode |
| cec_status, cec_status_zeit | cec_status, cec_status_at |
| erstellt_am, aktualisiert_am | created_at, updated_at |

**Exam:** `titel`→`title`, `aktiv_von`→`active_from`, `aktiv_bis`→`active_until`, `farbe`→`color`, `bildschirme`→`screens`, `anzeige_modus`→`display_mode`, `split_seite`→`split_side`, `split_prozent`→`split_percent`, `erstellt_am`→`created_at`.

**ExamTemplate:** `dauer_minuten`→`duration_minutes`, sonst wie Exam.

**Announcement:** `titel`→`title`, `prioritaet`→`priority`, `ist_aktiv`→`is_active`, `aktiv_von`→`active_from`, `aktiv_bis`→`active_until`, `erstellt_am`→`created_at`.

**DisplayEvent:** `beschreibung`→`description`, `farbe`→`color`, `aktiv`→`is_active`, `aktiv_von`→`active_from`, `aktiv_bis`→`active_until`, `erstellt_am`→`created_at`, `bildschirme`→`screens`.

**DisplayEventScreen:** `bildschirm`→`screen`, `profil`→`view`.

**MonitorSettings:**
- `wetter_api_key`→`weather_api_key`
- `raumplan_server`→`webuntis_server`, `raumplan_schule`→`webuntis_school`
- `raumplan_benutzername`→`webuntis_username`, `raumplan_passwort`→`webuntis_password`

**DisplayViewVersion:** `config`→`view`, `daten`→`data`, `erstellt_am`→`created_at`.

### 5.3 Gespeicherte Auswahlwerte (Datenmigration)

| Feld | Alt → Neu |
|---|---|
| MediaFile.kind | bild→image, hintergrund→background (logo, pdf bleiben) |
| DisplayView.layout | stundenplan→timetable, onair→on_air, abfahrten→departures, pdf_vollbild→pdf_fullscreen, bild_vollbild→image_fullscreen, baukasten→standard (standard, split bleiben) |
| split_left / split_right | klausur→exam, onair→on_air, uhr→clock, leer→empty (webuntis bleibt) |
| pdf_mode | durchschalten→cycle, statisch→static, seiten→selection |
| theme_preset | veranstaltung→event, schulbetrieb→school, nacht→night (custom bleibt) |
| transit_font_size | gross→large (normal, 4k bleiben) |
| on_air_size | klein→small, mittel→medium, gross→large, riesig→huge |
| on_air_position | banner-oben→banner-top, banner-unten→banner-bottom, oben-rechts→top-right, oben-links→top-left, oben-mitte→top-center, unten-rechts→bottom-right, unten-links→bottom-left, unten-mitte→bottom-center, mitte→center |
| on_air_split_side, Exam.split_side, ExamTemplate.split_side | links→left, rechts→right |
| Screen.power_mode | manuell_an→manual_on, manuell_aus→manual_off (auto bleibt) |
| Exam/ExamTemplate.display_mode | vollbild→fullscreen (split, standard bleiben) |
| Announcement.priority | wichtig→important, dringend→urgent (normal bleibt) |

### 5.4 JSON-Schlüssel (Datenmigration)

- **Zeitpläne** (`DisplayView.schedule`, `Screen.power_schedule`): `tage`→`days`, `von`→`from`, `bis`→`until`.
- **`Screen.schedule`:** zusätzlich `profil_id`→`view_id`.
- **`Screen.power_exceptions`:** `von_datum`→`from_date`, `bis_datum`→`until_date`, `von`→`from`, `bis`→`until`, `notiz`→`note`.
- **`DisplayView.transit_stops`** (Einträge, gelesen in `oepnv.py:324-346`, `:418-450`, `:488-494` und `MonitorPage.jsx:1024-1196`):

| Alt | Neu |
|---|---|
| id, name | id, name |
| filter_linien, filter_richtung, filter_via | filter_lines, filter_direction, filter_via |
| wegzeit_minuten | walk_minutes |
| api (Werte db, nahsh, beide) | source (Werte db, nahsh, both) |
| zeige_bus, zeige_bahn, zeige_fernverkehr, zeige_sbahn, zeige_ubahn, zeige_tram, zeige_faehre | show_bus, show_rail, show_long_distance, show_suburban, show_subway, show_tram, show_ferry |
| zusatz_id, zusatz_api, zusatz_zeige_* | extra_id, extra_source, extra_show_* |
| spalte, max_abfahrten, trennung, kompakt, max_bus, max_zug | column, max_departures, split_by_type, compact, max_bus, max_train |

- **`transit_disruption_manual`** (Einträge, gelesen in `api.py:329-338`): `titel`→`title`, `bild`→`image` (`text`, `highlighted` bleiben).
- **`transit_disruption_hidden`:** Das ist eine Liste von Störungs-IDs. Die IDs sind Hashes über Quelle, Titel und Text (`oepnv._stoerung_id`, `oepnv.py:1144`). Damit ausgeblendete Meldungen ausgeblendet bleiben, behält die umbenannte Funktion `_disruption_id` exakt dieselben Hash-Eingaben, auch die bisherigen Quellkennungen wie `'manuell'`. Die Liste selbst bleibt unverändert.
- **`transit_strike_lines`, `transit_strike_types`:** Das sind Linienbezeichnungen und Produktkürzel (`re`, `ice`, `bus` …). Sie bleiben unverändert.
- **`page_rotation_pages`** (Werte, gelesen in `MonitorPage.jsx:1465-1673`): veranstaltungen→events, ankuendigungen→announcements, freitext→free_text, wetter→weather (main, slideshow, pdf bleiben). `raumplan` wird entfernt.
- **Die Antwort von `/disruptions` und `/display`** (`quelle`, `typ`, `titel`, `linien`, `von`, `bis`, `bild`, `haltestellen`, `vorschlag`) folgt ebenfalls dem Glossar: source, kind, title, lines, from, until, image, stops, suggestion.
- **Vollständigkeit:** Jeder JSON-Schlüssel, den der Code liest oder schreibt, muss in der Migration bzw. im umbenannten Code vorkommen. Der Umsetzungsplan prüft das per `grep` über alle `.get('…')`- und `['…']`-Zugriffe der betroffenen Felder.
- **Caches** (`transit_cache`, `transit_disruption_cache`, `weather_cache`) werden in der Migration geleert statt umgeschrieben. Sie füllen sich beim nächsten Abruf neu.
- **Versionen (`DisplayViewVersion.data`):** Die gespeicherten Schnappschüsse alter Ansichten werden mit derselben Abbildung (Felder, Auswahlwerte, JSON-Schlüssel) umgeschrieben. Gestrichene Felder fallen dabei weg. Sonst würde "Version wiederherstellen" nach der Umbenennung scheitern.
- **Rückwärts:** Jede Datenmigration bekommt eine Rückwärtsfunktion (`RunPython` mit `reverse_code`), damit ein Rollback per `migrate monitor <alt>` möglich ist. Gestrichene Felder kommen beim Rollback leer zurück.

## 6. API

### 6.1 Routen

Alle Routen unter `/api/monitor/`. Die Root-Regel "`""` statt `"/"`" (CLAUDE.md) gilt weiter.

| Alt | Neu | Alias bleibt |
|---|---|---|
| GET /display (`?bildschirm=`, `?profil=`) | GET /display (`?screen=`, `?view=`) | alte Query-Namen werden weiter akzeptiert |
| GET /clock | GET /clock | |
| POST /onair `{on_air}` | POST /on-air `{on_air}` | **ja**, /onair (ATEM) |
| POST /notfall `{aktiv, text}` | POST /emergency `{active, text}` | **ja**, /notfall mit `{aktiv, text}` (ATEM) |
| GET /bildschirm/power | GET /screen/power | **ja** |
| POST /bildschirm/cec-status | POST /screen/cec-status | **ja** |
| /profile, /profile/{id} | /views, /views/{id} | |
| /config, /config/versionen, /config/restore, /config/regenerate-token | /config, /config/versions, /config/restore, /config/regenerate-token | |
| /stoerungen | /disruptions | |
| /dateien, /dateien/{id} | /files, /files/{id} | |
| /papierkorb, /papierkorb/wiederherstellen, /papierkorb/endgueltig | /trash, /trash/restore, /trash/purge | |
| /ankuendigungen[/{id}] | /announcements[/{id}] | |
| /webuntis-links[/{id}] | /webuntis-links[/{id}] | |
| /oepnv/suche | /transit/search | |
| /bildschirme[/{id}], /bildschirme/{id}/reload | /screens[/{id}], /screens/{id}/reload | |
| /klausuren[/{id}] | /exams[/{id}] | |
| /events[/{id}], /events/{id}/aktivieren, /deaktivieren | /events[/{id}], /events/{id}/activate, /deactivate | |
| /klausur-vorlagen[/{id}] | /exam-templates[/{id}] | |
| /global-settings | /settings | |

- **Aliase** gibt es nur für Aufrufer außerhalb dieses Repos (ATEM, Pi-Skripte, Kiosk-URLs). Admin-Routen werden ohne Alias umbenannt, weil das Frontend im selben Commit mitzieht.
- **Alias-Routen** rufen dieselbe Funktion auf. Sie stehen in einem eigenen, kommentierten Block `# Legacy aliases (ATEM, Pi scripts)`.
- **Der WebSocket-Pfad** `ws/monitor/pi/<slug>/` bleibt unverändert.

### 6.2 Schemas und Antworten

Schemas und Antwort-Schlüssel folgen den neuen Feldnamen, zum Beispiel `OnAirSchema`, `EmergencySchema`, `ScreenSchema`, `ExamSchema`.

### 6.3 Übergang für laufende Anzeigen

Laufende Pis haben nach dem Deploy noch das alte JavaScript geladen. Sie verstehen die neuen Antwort-Schlüssel nicht. Das alte JS lädt sich neu, wenn sich `neu_laden_zeit` zwischen zwei Abrufen ändert (`MonitorPage.jsx:343-346`).

- **Übergangsregel:**
  - `/display` liefert deshalb zusätzlich den Schlüssel `neu_laden_zeit` mit der aktuellen Uhrzeit, auf die Minute gerundet.
  - Der Wert ändert sich jede Minute. Alte Anzeigen laden sich so innerhalb von etwa 2 Minuten neu und bekommen das neue JS.
  - Das neue JS ignoriert diesen Schlüssel und liest `reload_requested_at`.
- **Laufzeit:** Der Übergangsschlüssel ist markiert (`# TODO(step-b): remove legacy reload key`) und wird in Teilprojekt B entfernt.
- **Absicherung:** Zusätzlich greift der bestehende nächtliche Reload um 04:00.

## 7. Rechte

- **Umbenennung:** `monitor.notfall` wird `monitor.emergency`, per Datenmigration im `users`-Modul (Feld `Permission.code`). Zuweisungen an Gruppen bleiben erhalten.
- **Bleiben:** `monitor.view`, `monitor.edit`, `monitor.onair`.
- **Mitziehen:** `default_permissions` in `backend/users/api.py` und alle Abfragen im Frontend.

## 8. Zugangsdaten

- **Aus dem Code entfernt:** die NAH.SH-Kennung (`oepnv.py:99-102`) und der Storyblok-Token (`oepnv.py:1086`).
- **Neu in der `.env`:** `NAHSH_HAFAS_AID` und `SWHL_STORYBLOK_TOKEN`, gelesen über `settings.py`.
- **Fehlt eine Variable,** liefert die jeweilige Quelle leere Daten und schreibt eine klare Log-Meldung. Kein Absturz.
- **Deploy-Hinweis:** Beide Werte müssen vor dem Deploy in `/opt/stagedesk/backend/.env` stehen. Die Werte nennt der Umsetzungsplan nicht, sie stehen im alten Code und werden von Hand übertragen.

## 9. Frontend

- **Bezeichner** in `MonitorPage.jsx`, `MonitorAdminPage.jsx` und `components/monitor/*` werden nach dem Glossar englisch, zum Beispiel `bildschirmSlug`→`screenSlug`, `SWL_LINIEN_FARBEN`→`SWL_LINE_COLORS`, `getLinienFarbe`→`getLineColor`.
- **Sichtbare Texte** bleiben deutsch und unverändert.
- **Kiosk-URL-Parameter:** `screen`, `view` und `zoom` sind neu. `bildschirm` und `profil` werden weiter akzeptiert.
- **Keine optischen Änderungen** in diesem Schritt. Die gestrichenen Bedienelemente verschwinden.

## 10. Tests und Abnahme

- **Bestehende Tests:** Die 13 Tests in `backend/monitor/tests.py` werden auf die neuen Namen umgestellt und bleiben grün. Sie decken Vorrangregel, Validierung und Soft Delete ab.
- **Neue Tests:**
  - ATEM-Aliase: `POST /onair {on_air}`, `POST /notfall {aktiv, text}` mit Token
  - `/display?bildschirm=` und `?profil=`
  - `/bildschirm/power`
  - Übergangsschlüssel `neu_laden_zeit` vorhanden und minütlich wechselnd
  - Rechte-Migration `monitor.notfall`→`monitor.emergency`
  - Datenmigration: Testdaten mit allen alten Auswahlwerten, JSON-Schlüsseln und einer Version werden vorwärts und rückwärts migriert und verglichen (Django `MigrationExecutor`)
- **Prüfungen:** `manage.py makemigrations --check` ist sauber, `npm run build` grün, `npm run check:tokens` unverändert.
- **Volltextsuche:** Nach der Umsetzung darf `grep` über die betroffenen Dateien keine deutschen Bezeichner aus dem Glossar mehr finden. Ausgenommen sind sichtbare Texte, Alias-Routen und der Übergangsschlüssel.
- **Probelauf vor dem Deploy:** Den Produktions-Dump in eine Test-Datenbank einspielen, `migrate` ausführen und eine Ansicht, einen Bildschirm, eine Klausur und eine Version stichprobenartig prüfen.

## 11. Deploy (nur nach Freigabe)

1. Backup-Tag plus DB-Dump (`~/stagedesk-backups/`).
2. Die neuen `.env`-Variablen eintragen.
3. Deploy per Skript. Danach `/display` für glocke und mensa prüfen und ATEM On-Air einmal schalten.
4. **Rollback:** `migrate monitor <letzte alte Migration>` plus Code auf den Backup-Tag.
