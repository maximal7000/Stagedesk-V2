# Monitor Anzeige und Admin (Teilprojekte B + A)

Stand: 19.10.2026 · Status: wartet auf Review · Gesamtentwurf: `2026-10-19-monitor-overhaul-design.md` · Voraussetzung: Schritt 0 (englische Benennung) ist auf `main`.

Entwürfe: `assets/2026-10-19-monitor/`. Alle Inhalte darin sind Beispieldaten.

## 1. Ziel und Umfang

Die öffentliche Monitor-Anzeige und das Monitor-Admin werden in **einem** Projekt neu gebaut:

- Die Anzeige bekommt das Schuldesign (Stile A/B/C), CI-Hintergründe, Zustandsbildschirme, neue Ansichtstypen und einen Vertretungsplan direkt aus WebUntis. Sie läuft performant auf dem Raspberry Pi 4 und skaliert auf 4K.
- Das Admin bekommt eine neue Struktur mit 7 Unterseiten, Live-Vorschau, ein einheitliches Speichermodell und feine Rechte.
- Aus Teilprojekt C wird vorgezogen, was ohne Pi-Agent funktioniert: Ferienzeiträume, "Alle bis Tagesende aus" und "Notfall schaltet Bildschirme ein". Alle drei laufen über die bestehende Power-Steuerung per WebSocket.

**Erfolgskriterien:**
- Jede Ansicht, jeder Stil, jeder Sondermodus und jeder Zustand ist als Screenshot in 3840×2160 abgenommen.
- Ein Erstnutzer kann ohne Erklärung einen Bildschirm anpassen, eine Ansicht bearbeiten, eine Klausur eintragen, ein PDF zeigen und den Notfall auslösen.
- Bestehende Daten und Kiosk-URLs funktionieren weiter.

**Nicht-Ziele:**
- Pi-Agent, Telemetrie, Gerätebefehle, automatische Updates und Kopplung per Code (Teilprojekt C).
- Kopplung an die Brandmeldeanlage.
- Neugestaltung des Aufgaben-Monitors.
- Die öffentliche WebUntis-Monitor-JSON (Weg 2). Sie wird erst gebaut, wenn Weg 3 scheitert.

## 2. Begriffe

| Oberfläche | Code | Bedeutung |
|---|---|---|
| Bildschirm | `Screen` | Gerät an der Wand |
| Ansicht | `DisplayView` | Was ein Bildschirm zeigt |
| Sondermodus | On-Air, Notfall, Klausur | Überlagert eine Ansicht zeitweise |
| Termin | `DisplayEvent` | Schaltet Bildschirme zeitweise auf eine andere Ansicht |
| Ansichten-Wechsel | `DisplayView` mit `kind='rotation'` | Zeigt mehrere Ansichten nacheinander |

**Vorrang beim Anzeigen:** Notfall > Klausur > On-Air > Ansicht. Die Ansicht selbst ergibt sich aus der Regel Override > Termin > Zeitplan > Standard; diese Regel ist unverändert.

## 3. Datenmodell

### 3.1 DisplayView

| Feld | Werte | Bedeutung |
|---|---|---|
| `kind` | `departures`, `substitutions`, `split`, `media`, `info`, `rotation` | ersetzt `layout` |
| `style` | `auto`, `ci`, `dense`, `dark` | `auto`: `departures`, `substitutions` und `split` bekommen `dense`, alle anderen `ci` |
| `on_air_behavior` | `fullscreen`, `split`, `none` (Standard `fullscreen`) | was bei aktivem On-Air passiert |
| `on_air_split_side` | `left`, `right` (Standard `right`) | Seite des Sondermodus im Split |
| `rotation_items` | JSON `[{"view_id": int, "seconds": int}]` | nur bei `rotation` |
| `split_left`, `split_right` | `substitutions`, `departures` | nur bei `split` |
| `split_left_percent` | 20–80 | bleibt |
| `media_items` | JSON `[int]` (MediaFile-IDs in Reihenfolge) | nur bei `media` |
| `media_seconds` | int, Standard 10 | Anzeigedauer pro Seite oder Bild |
| `substitutions_next_day` | bool, Standard true | zweite Spalte "Morgen" |
| `page_seconds` | int, Standard 15 | Blättertakt langer Listen |

**Bleiben:**
- `name`, `slug`, `is_default`, `sort_order`, `schedule`, `deleted_at`, `api_token`
- Wetter-, QR-, Countdown- und Ankündigungs-/Termin-Schalter
- alle `transit_*`-Felder
- `webuntis_url`/`webuntis_link` (+ `_next_day`) als iframe-Rückfall
- `pdf_mode`, `pdf_pages`, `pdf_static_page`, `pdf_per_screen` (Seiten nebeneinander, 1–3)

**Entfallen** (nach Migration, §3.6):
- `layout`, `fullscreen_header`
- `title`, `subtitle`, `background_color`, `accent_color`, `theme_preset`
- `show_logo`, `logo_url`, `active_logo`
- `show_slideshow`, `slideshow_interval`
- `show_background_image`, `active_background_image`
- `show_free_text`, `free_text_*`
- `show_page_rotation`, `page_rotation_*`
- `show_on_air`, `is_on_air`, `on_air_text`, `on_air_since`, `on_air_size`, `on_air_position`, `on_air_blink`, `on_air_color`, `on_air_fullscreen`, `on_air_split`
- `emergency_active`, `emergency_text`
- `show_pdf`, `active_pdf`, `active_image`, `pdf_interval`
- `image_fit`, `image_focus_x`, `image_focus_y`
- `show_webuntis`, `webuntis_dark_mode`, `refresh_interval`

**Validierung beim Speichern:**
- `rotation_items` verweist nur auf existierende, nicht gelöschte Ansichten, die selbst nicht `rotation` sind. Es braucht mindestens einen Eintrag, `seconds` liegt zwischen 5 und 600.
- `media_items` enthält nur MediaFiles mit Status `ready` oder `processing`.

### 3.2 Screen

| Feld | Werte | Bedeutung |
|---|---|---|
| `location` | Text | Ort, zum Beispiel "Eingangshalle" |
| `scale` | `auto`, `100`, `150`, `200` (Standard `auto`) | Skalierung der Anzeige |
| `orientation` | `landscape`, `portrait` | Ausrichtung |
| `access_key` | 32 Zeichen, zufällig, eindeutig | Schlüssel in der Kiosk-URL; wird beim Anlegen erzeugt, per Admin neu erzeugbar |
| `off_during_holidays` | bool, Standard true | in Ferienzeiträumen aus |
| `off_until` | DateTime, nullable | "bis Tagesende aus" |

Der Schalter `holiday_mode` entfällt. **Migration:** Ein Bildschirm mit `holiday_mode=True` bekommt `power_mode='manual_off'`. Das Verhalten ist gleich, bis jemand den Bildschirm im Admin wieder auf "Automatisch" stellt.

**Power-Regel `get_power_state()`**, in dieser Reihenfolge:
1. Notfall aktiv → an
2. `power_mode` `manual_on`/`manual_off`
3. `off_until` in der Zukunft → aus
4. Datums-Ausnahme (wie bisher)
5. Heute liegt in einem `HolidayPeriod` und `off_during_holidays` → aus
6. Wochenzeitplan (wie bisher; leer heißt immer an)

**"Bis Tagesende aus":** setzt `off_until` auf den Beginn des nächsten Zeitplan-Fensters, das nicht mehr heute liegt. Gibt es keinen Zeitplan, gilt der nächste Tag 05:00.

### 3.3 Neue Models

- `HolidayPeriod`: `name`, `start_date`, `end_date` (inklusive), `created_at`.
- `EmergencyTemplate`: `title`, `text`, `note`, `sort_order`.
- `MediaPage`:
  - `file` (FK MediaFile, `related_name='pages'`), `index`, `image`
  - `width`, `height`, `orientation` (`landscape`/`portrait`)

  Der Upload-Pfad bleibt unter `monitor/`, im Unterordner `pages/`.
- **MediaFile** bekommt dazu:
  - `status`: `processing`, `ready` oder `failed`
  - `page_count`
  - `error`: Text

### 3.4 MonitorSettings

**Neu:**
- **On-Air:**
  - `on_air_active`, `on_air_since`, `on_air_text` (Standard "ON AIR")
  - `on_air_animation`: `still`, `pulse` oder `blink`
  - `on_air_show_clock`
- **Notfall:** `emergency_active`, `emergency_text`, `emergency_note`, `emergency_since`.
- **WebUntis:**
  - `webuntis_source`: `substitutions`, `timetable`, `unavailable` oder leer; wird automatisch erkannt
  - `webuntis_checked_at`

**Bleiben:** Wetter-Key und WebUntis-Zugang.

### 3.5 Rechte

**Neu:** `monitor.setup`, `monitor.exams`, `monitor.media`, `monitor.power`, `monitor.devices` (für C vorgesehen, noch ohne Funktion).

**Migration:** Gruppen und Nutzer mit `monitor.edit` bekommen `setup`, `exams`, `media` und `power`. Danach wird `monitor.edit` entfernt. `monitor.view`, `monitor.onair` und `monitor.emergency` bleiben.

| Bereich | Recht |
|---|---|
| Übersicht ansehen | `view` |
| On-Air | `onair` |
| Notfall und Notfall-Vorlagen | `emergency` |
| An/aus, "bis Tagesende aus", Ferien, Zeitpläne | `power` |
| Klausuren, Klausur-Vorlagen, Termine, Ankündigungen | `exams` |
| Medien | `media` |
| Ansichten, Bildschirme, Einstellungen, Vorschau | `setup` |

### 3.6 Datenmigration

**Ansichtstyp aus dem alten Layout:**

| Altes Layout | Neuer Typ |
|---|---|
| `standard` mit `show_webuntis` | `substitutions` |
| `standard` sonst | `info` |
| `timetable` | `substitutions` |
| `departures` | `departures` |
| `pdf_fullscreen`, `image_fullscreen` | `media` (`media_items` aus `active_pdf` bzw. `active_image`) |
| `split` mit einer Seite `webuntis` | `substitutions` |
| `split` sonst | `info` |
| `on_air` | wird gelöscht (Soft Delete); vorher gehen Text, Uhr und Blinken (wird `blink`, sonst `pulse`) in `MonitorSettings` |

**Weitere Felder:**
- `style` ist überall `auto`.
- `on_air_behavior`: `on_air_fullscreen` ergibt `fullscreen`, `on_air_split` ergibt `split`, sonst `none`.
- **Freitext:** Eine Ansicht mit `show_free_text` und Inhalt wird zu einer aktiven Ankündigung (Titel, Text, Priorität `normal`, ohne Zeitraum).
- **Seitenrotation:** Eine Ansicht mit `show_page_rotation` und mindestens zwei Seiten bekommt eine neue Ansicht `<Name> (Wechsel)` vom Typ `rotation`, mit der Ursprungsansicht im Intervall der Rotation. Bildschirme, deren Standard-Ansicht das war, zeigen auf die neue Wechsel-Ansicht.
- **Global:** On-Air- und Notfall-Status gehen vom ersten Datensatz in `MonitorSettings`.

**Schnappschüsse** (`DisplayViewVersion.data`) werden mit derselben Abbildung umgeschrieben, wie in Schritt 0.

**Medien:** Die Datenmigration rendert keine Dateien. Nach dem Deploy erzeugt `manage.py monitor_render_media` die Seitenbilder für vorhandene Dateien (idempotent).

**Rückwärts:** Jede Migration hat einen Rückweg. Rückwärts gilt: aus `info` wird `standard`, aus `substitutions` wird `timetable`, aus `media` wird `pdf_fullscreen` bzw. `image_fullscreen`, `rotation`-Ansichten werden gelöscht, und die Rechte werden zurückgeführt.

## 4. Backend

### 4.1 Display-Daten

`GET /api/monitor/display?screen=<slug>&key=<access_key>` (alternativ `?view=<slug>`; die alten Namen `bildschirm`/`profil` gelten weiter). Die Antwort enthält:
- `screen`: `name`, `scale`, `orientation`
- `mode`: `null`, `{kind:'emergency', …}`, `{kind:'exam', display:'fullscreen'|'split', side, …}` oder `{kind:'on_air', display, side, text, animation, show_clock, since}`
- `view`: `kind`, effektiver `style`, die typspezifischen Daten und bei `rotation` die aufgelösten Unteransichten
- `generated_at`

**Daten je Ansichtstyp:**
- `departures`, `disruptions`: wie bisher, mit Höchstzahl pro Haltestelle (Standard 10)
- `substitutions`: §4.3
- `media`: Seitenliste mit `url`, `width`, `height`, `orientation`
- `info`: Ankündigungen (Reihenfolge nach Priorität), Termine, Countdown, Wetter, QR

**Regeln:**
- **Vertretungsdaten** gibt es nur mit gültigem `key` für diesen Bildschirm oder für angemeldete Nutzer mit `monitor.view`. Ohne gültigen Schlüssel enthält `substitutions` nur `fallback_url` (iframe), keine Einträge.
- **Altlasten aus Schritt 0 entfallen:** der Übergangsschlüssel `neu_laden_zeit` und der Fehler, dass die erste Neulade-Anforderung ignoriert wird. `reload_requested_at` wird mit dem Wert beim Seitenstart verglichen, auch wenn dieser leer war.

### 4.2 Display-WebSocket

- **Pfad:** `ws/monitor/display/<slug>/`, ohne Authentifizierung. Er sendet nur `{"type":"changed"}` bzw. `{"type":"reload"}` und keine Daten.
- **Auslöser:** Jede Änderung an Ansichten, Bildschirmen, Klausuren, Terminen, Ankündigungen, Medien, Einstellungen sowie On-Air oder Notfall sendet `changed` an die betroffenen Bildschirme; im Zweifel an alle.
- **Neu laden:** `reload` ersetzt das Polling von `reload_requested_at`. Das Feld bleibt aber als Rückfall erhalten.
- **Rückfall:** Die Anzeige pollt zusätzlich alle 60 s.

### 4.3 WebUntis

Das Modul `monitor/webuntis.py` baut auf dem vorhandenen Client auf.

**Quelle wird automatisch erkannt** und das Ergebnis in `MonitorSettings` gespeichert:
1. `getSubstitutions(heute, nächster Schultag)`. Gelingt der Aufruf, gilt `substitutions`.
2. Bei Fehler -8509 (fehlendes Recht): `getKlassen`, dann pro Klasse `getTimetable` für beide Tage. Stunden mit Code `cancelled` werden zu Entfall, Stunden mit `irregular` bzw. abweichender `orgid` zu Vertretung oder Raumänderung. Dann gilt `timetable`.
3. Sonst gilt `unavailable`. Die Anzeige nutzt dann das iframe, und das Admin zeigt eine Warnung.

**Ausgabe pro Tag:**
```
{date, label ("Heute"/"Morgen"/Wochentag),
 rows: [{class, periods ("5-6"), subject, teacher, teacher_old, room, room_old,
         kind: "substitution"|"cancelled"|"room_change"|"other", note}]}
```
- Stunden werden über `getTimegridUnits` aus Uhrzeiten abgeleitet, aufeinanderfolgende zusammengefasst.
- "Heute" zeigt nur Stunden ab der laufenden Stunde.
- "Nächster Schultag" überspringt Wochenenden und `HolidayPeriod`.

**Nachricht zum Tag:** Wird versucht über `/WebUntis/api/public/news/newsWidgetData` mit der Sitzung aus dem Login. Scheitert das, fällt sie weg, ohne Fehler.

**Cache:** 5 Minuten für die gesamte Antwort, gemeinsam für alle Bildschirme. Fehler werden 60 s zwischengespeichert.

**Diagnose:**
- `manage.py monitor_webuntis_check` gibt nur "geht / geht nicht" pro Weg aus, keine Daten.
- Dasselbe liefert der Admin-Knopf "Verbindung testen".

### 4.4 Medien

- **Upload:** `POST /files` speichert die Datei mit `status='processing'` und startet die Umwandlung in einem Hintergrund-Thread (`threading`, ohne Celery).
- **Umwandlung:**
  - PDF: mit pypdfium2, jede Seite so gerendert, dass die längere Kante 3840 px misst, gespeichert als WebP (Qualität 90).
  - Bild: Pillow, EXIF-Drehung anwenden, längere Kante höchstens 3840 px, gespeichert als WebP (Qualität 90).
- **Ergebnis:** `ready` mit `MediaPage`-Einträgen, oder `failed` mit Fehlertext.
- **Begrenzung:** höchstens 50 Seiten pro PDF und 50 MB pro Datei. Darüber wird der Upload mit einer klaren Meldung abgelehnt.
- **Abhängigkeit:** `pypdfium2` kommt in `requirements.txt`.

### 4.5 Neue und geänderte Endpunkte (`/api/monitor/…`)

| Methode und Pfad | Recht | Zweck |
|---|---|---|
| `POST /views/preview` | setup | Entwurf (Ansicht + optional Bildschirm) → `{token}`, 10 min im Cache |
| `GET /display?preview=<token>` | gültiger Token (32 Zeichen, 10 min) | Display-Daten zum Entwurf; der Token selbst ist die Berechtigung, weil das iframe keinen Login mitschickt |
| `GET/POST/PUT/DELETE /holidays[/{id}]` | power | Ferienzeiträume |
| `GET/POST/PUT/DELETE /emergency-templates[/{id}]` | emergency | Notfall-Vorlagen |
| `POST /emergency` | emergency | Body `{active, text, note}` |
| `POST /on-air` | onair | Body `{on_air}`, unverändert (ATEM) |
| `POST /screens/power-off-today` | power | Body `{screen_ids?: [int]}` (leer = alle) → setzt `off_until` |
| `DELETE /screens/power-off-today` | power | `off_until` wieder leeren (Rückgängig) |
| `POST /screens/{id}/regenerate-key` | setup | neuer `access_key` |
| `GET /files/{id}` | media | mit `status`, `pages[]`, Verwendung |
| `POST /webuntis/check` | setup | Quelle neu erkennen, Ergebnis zurückgeben |
| `GET/PUT /settings` | setup (On-Air-Teil: onair) | inklusive On-Air-Darstellung |

Bestehende Endpunkte bekommen die neuen Felder. Die Rechteprüfung folgt §3.5. Die Legacy-Aliase aus Schritt 0 bleiben unverändert.

## 5. Anzeige (Frontend)

### 5.1 Struktur

`frontend/src/pages/MonitorPage.jsx` liest nur noch die URL, holt Daten und wählt den Baustein. Neu ist `frontend/src/components/display/`:

| Ordner | Dateien |
|---|---|
| `frame/` | `CiFrame` (Stil A), `DenseFrame` (B), `DarkFrame` (C), `PortraitFrame`, `ClockBox` (Uhr + optional Wetter) |
| `views/` | `DeparturesView`, `SubstitutionsView`, `MediaView`, `InfoView`, `SplitView`, `RotationView` |
| `modes/` | `OnAirMode`, `EmergencyMode`, `ExamMode` (Vollbild und Split) |
| `states/` | `ConnectionLost`, `Loading`, `ScreenNotFound`, `IdleScreen` |
| `lib/` | `useDisplayData` (Laden, WebSocket, Polling, Zwischenspeicher), `useScale`, `usePager`, `useClock` |

Die Gestaltung folgt den Entwürfen in `assets/`:
- **Stil A:** `display-style-a.png`
- **Stil B:** `display-style-b.png`
- **Stil C:** `display-style-c.png`
- **Abfahrten:** `departures.png`
- **Vertretungsplan:** `substitutions.png`
- **Info-Ansicht:** `display-info.png`
- **Sondermodi:** `mode-on-air.png`, `mode-emergency.png`, `mode-exam.png`
- **Splitscreens:** `split-on-air.png`, `split-exam.png` (Standardseite ist rechts, anders als im Bild)
- **Zustandsbildschirm:** `state-connection-lost.png`

**Gestaltungsregeln** (Gesamtentwurf §4.1 und §7):
- Oswald und Lato kommen über `@fontsource/oswald` und `@fontsource/lato` (lokal gebündelt).
- Rot nur für CI-Elemente und Ausfälle, dazu die SWL-Linienfarben.
- Keine Schatten, Verläufe, Leuchteffekte, Pills, Spinner, Emoji oder Em-Dashes.
- Keine Titelzeile bei dichten Ansichten.

**CI-Grafiken:** `frontend/src/assets/ci/wheel.svg` (Rad aus "Datenhintergrund quer") und `wheel-triple.svg` (aus "Hintergrund dreifach", für Hochformat), beide als Vektor aus den PDFs. Der Streifen ist reines CSS.

### 5.2 Verhalten

- **Zustände:**
  - Fehlt die Verbindung kürzer als 120 s, bleibt der letzte Inhalt stehen, dazu der Hinweis "Stand HH:MM" in der Uhr-Box.
  - Danach erscheint `ConnectionLost`. Es zeigt den Bildschirmnamen, seit wann die Verbindung fehlt, die letzten Daten und den Countdown zum nächsten Versuch. WLAN und IP-Adresse erst mit C.
  - Erkannt wird ein Ausfall über `navigator.onLine` und fehlgeschlagene Abrufe.
- **Zwischenspeicher:** Die letzte gültige Antwort liegt in `localStorage`, pro Bildschirm. Beim Start wird sie sofort gezeigt.
- **Unbekannter Bildschirm:** `ScreenNotFound` zeigt den Slug und den Hinweis "Bildschirm im Admin unter Monitore → Bildschirme anlegen".
- **Ruhemodus:** Liefert `get_power_state` "aus", zeigt die Anzeige `IdleScreen`: ein dunkles CI-Bild mit kleiner Uhr. Schaltet die Power-Steuerung den Bildschirm ab, ist davon nichts zu sehen; ohne Abschaltung bleibt ein ruhiges Bild statt alter Inhalte.
- **Skalierung:**
  - Die rem-Basis ergibt sich aus Viewport-Breite / 1920 × 16 px.
  - `scale` aus dem Admin multipliziert darauf; `?zoom=` aus der URL hat Vorrang.
  - Im Hochformat bezieht sich die Basis auf die Breite / 1080.
- **Blättern:** Listen, die nicht passen, blättern alle `page_seconds` um und zeigen "Seite n / m". Es gibt kein Scrollen.
- **Abfahrten:** Pro Haltestelle so viele Zeilen, wie bei einer Mindestgröße von 0,95 rem Zeilentext passen, höchstens `max_departures` (Standard 10).
- **On-Air:**
  - `pulse` ändert nur die Deckkraft zwischen 1 und 0,72 in 2,4 s.
  - `blink` schaltet hart im 1-s-Takt.
  - Bei `prefers-reduced-motion` gilt `still`.
- **Performance:**
  - Nur `useClock` rendert jede Sekunde neu.
  - Alle Bausteine sind Modul-Komponenten, also nicht innerhalb einer Render-Funktion definiert.
  - Animiert wird nur `opacity` und `transform`.

## 6. Admin (Frontend)

### 6.1 Struktur

**Routen** in `App.jsx`, alle hinter `monitor.view`:
- `/monitor-admin` (Übersicht)
- `/monitor-admin/screens`, `/monitor-admin/screens/:id`
- `/monitor-admin/views`, `/monitor-admin/views/:id`, `/monitor-admin/views/new`
- `/monitor-admin/exams`, `/monitor-admin/media`, `/monitor-admin/schedules`, `/monitor-admin/settings`

Die Sidebar (`DashboardLayout.jsx`) zeigt die Unterpunkte unter "Monitore" je nach Recht.

**Dateien** unter `frontend/src/components/monitor-admin/`:
- `pages/`: `Overview`, `Screens`, `ScreenDetail`, `Views`, `ViewEdit`, `Exams`, `Media`, `Schedules`, `Settings`
- `view-editors/`: `Departures`, `Substitutions`, `Media`, `Info`, `Split`, `Rotation`
- `shared/`: `SaveBar`, `useDraft`, `UnsavedChangesProvider`, `LivePreview`, `StopSearch`, `ConfirmDialog`, `ScheduleEditor`, `ScreenStatus`

`MonitorAdminPage.jsx` wird gelöscht.

Die Gestaltung folgt `admin-overview.png`, `admin-view-edit.png` und `admin-screen-detail.png`, mit Bühnenschwarz-Tokens und den Bausteinen aus `components/ui/`. Die Dateien unter `monitor-admin/` werden von `check-tokens` erfasst.

### 6.2 Verhalten

- **Speichern:**
  - `useDraft(original)` liefert `{draft, set, changedCount, reset, save}`.
  - `SaveBar` zeigt "N ungespeicherte Änderungen · Verwerfen · Speichern", solange `changedCount > 0`.
  - `UnsavedChangesProvider` fragt bei App-internen Links nach und registriert `beforeunload`.
- **Sofortige Schalter:** On-Air, Bildschirm an/aus und "bis Tagesende aus" speichern direkt und zeigen eine Bestätigung mit "Rückgängig" (8 s).
- **Live-Vorschau:**
  - `LivePreview` schickt den Entwurf (entprellt 600 ms) an `/views/preview` und zeigt `/monitor?preview=<token>` in einem iframe.
  - Das iframe hat die Größe des gewählten Bildschirms (Auflösung, Ausrichtung) und wird mit CSS-`transform` verkleinert.
- **Übersicht:**
  - Oben die Sondermodi: On-Air-Schalter, "Notfall auslösen…", nächste Klausur.
  - Darunter eine Tabelle der Bildschirme: Status in Textform, was gezeigt wird und warum (Vorrangregel als Satz, zum Beispiel "weil Termin ‚Abitur Mathematik' bis 12:30 läuft"), Gerät.
  - Dazu die Kästen "Datenquellen" (Abfahrten, WebUntis, Störungen mit Zeit des letzten Erfolgs) und "Demnächst", sowie der Knopf "Alle bis Tagesende aus".
- **Ansicht bearbeiten:**
  - Neu: zuerst der Typ, dann nur dessen Felder.
  - "Verwendet auf" listet die Bildschirme.
  - Die Haltestellen-Tabelle hat die Spalten Fußweg, Max. Zeilen und Verkehrsmittel und lässt sich per Ziehen sortieren; Filter öffnen sich in einem Dialog.
- **Bildschirm-Detail:**
  - Bereiche: Anzeige (Name, Ort, Standard-Ansicht, Skalierung, Ausrichtung), Ein- und Ausschalten, Kiosk-URL mit Schlüssel (kopierbar, "Neu erzeugen").
  - "Gerät" zeigt CEC-Status, Zeitpunkt der letzten Meldung, "Neu laden" und "Kein Agent installiert".
- **Klausuren & Termine:** Liste "Läuft gerade / Kommt / Vergangen". Vorlagen werden mit einem Klick übernommen; pro Eintrag stehen die betroffenen Bildschirme.
- **Medien:**
  - Ziehen und Ablegen.
  - Kacheln mit der ersten Seite, Seitenzahl, Ausrichtung und Status ("wird vorbereitet", "fertig", "fehlgeschlagen: Grund").
  - "Verwendet in" listet die Ansichten.
- **Ferien & Zeitpläne:** Ferienzeiträume als Tabelle. Dazu eine Wochenübersicht der Ein-/Aus-Zeiten aller Bildschirme. Das Update-Fenster wird als Hinweis angezeigt, aktiv erst mit C.
- **Einstellungen:**
  - WebUntis-Zugang mit "Verbindung testen", das die erkannte Quelle als Satz zeigt.
  - ÖPNV-Grundeinstellungen und Störungsfilter.
  - Notfall-Vorlagen.
  - On-Air (Text, Animation, Uhr).
- **Notfall-Dialog:** Vorlage wählen oder Text frei eingeben, dazu der feste Hinweis "Manuell. Nicht mit der Brandmeldeanlage verbunden." Auslösen erfordert eine zweite Bestätigung.
- **Rechte:** Was jemand nicht darf, wird nicht angezeigt.

### 6.3 Copy

Es gilt der Gesamtentwurf §7:
- Labels sind Substantive oder Verben.
- Hilfetexte stehen in einem Satz unter dem Feld und nennen Wirkung oder Einheit.
- Keine Tooltips als einzige Hilfe, keine Hex-Eingaben.
- Fehler nennen Ursache und nächsten Schritt.

## 7. Tests und Abnahme

**Backend:**
- **Migrationen vorwärts und rückwärts:** alle Fälle aus §3.6, zusätzlich mit unvollständigen Daten. Rechte-Migration mit Gruppen.
- **`get_power_state`:** jede Stufe aus §3.2, dazu die Berechnung von "bis Tagesende aus" mit und ohne Zeitplan.
- **WebUntis** (RPC nachgebaut):
  - Weg `substitutions`, Weg `timetable` bei -8509, `unavailable` bei Totalausfall.
  - Zusammenfassung der Stunden, "ab laufender Stunde", nächster Schultag über Wochenende und Ferien.
  - Cache 5 min.
- **Medien:**
  - Ein erzeugtes PDF mit Hoch- und Querseite ergibt 2 `MediaPage` mit der richtigen Ausrichtung.
  - Ein JPEG mit EXIF-Drehung wird gedreht.
  - Zu viele Seiten bzw. zu große Dateien werden abgelehnt.
  - `monitor_render_media` ist idempotent.
- **Zugriff:**
  - Vertretungsdaten nur mit Schlüssel oder für angemeldete Nutzer.
  - Vorschau nur mit `setup`.
  - Endpunkte gemäß Rechte-Tabelle §3.5.
- **Vertragstest der `/display`-Antwort** je `kind` und `mode`.
- **Push:** Speichern löst `changed` aus (Channels-Testlayer).

**Anzeige:**
- Screenshot-Reihe mit headless Chromium in 3840×2160 und 2160×3840; die `/display`-Antworten kommen aus Testdaten in `frontend/tests/display-fixtures/`.
- Abgedeckt:
  - jeder `kind` in jedem Stil
  - alle Sondermodi voll und geteilt
  - alle Zustände
  - Blättern mit "Seite 2 / 2"
- Die Bilder gehen nach `docs/superpowers/screenshots/2026-10-19-monitor/` und werden vor dem Merge gesichtet.

**Admin:**
- Dieselbe Technik mit nachgebauter API. Der Login wird simuliert, indem ein Testnutzer in den `sessionStorage`-Schlüssel von oidc-client gelegt wird; der Server ist nicht beteiligt.
- Jede Seite ist abfotografiert, dazu die Zustände: ungespeicherte Änderungen, Notfall-Dialog, Medien in Arbeit, Bildschirm offline.

**Prüfungen:**
- `npm run build`, `check:tokens` (inklusive `monitor-admin/`), Bezeichner-Prüfung, impeccable-Detektor auf Anzeige und Admin
- `manage.py test`, `makemigrations --check`

**Manuell (Nutzer):** Live-Klicktest mit echtem Keycloak-Login auf localhost vor dem Merge.

## 8. Rollout

- **Ein Deploy am Ende.** Der Umsetzungsplan arbeitet in Etappen: Backend, dann Anzeige, dann Admin, jede mit eigenen Reviews.
- **Ablauf:**
  1. Backup-Tag und DB-Dump.
  2. Probelauf mit dem Produktions-Dump.
  3. Deploy.
  4. `manage.py monitor_render_media`.
  5. Sichtprüfung von glocke und mensa.
- **Kiosk-URLs bleiben gültig.** Ohne Schlüssel zeigt der Vertretungsplan das iframe wie heute. Mit der URL aus dem Admin (inklusive `key`) erscheint die neue Darstellung. Diese URL wird einmal pro Pi in `kiosk.sh` eingetragen; mit C übernimmt das die Kopplung.
- **Doku:**
  - `docs/raspberry-pi-monitor.md`: Kiosk-URL mit Schlüssel; Zoom jetzt im Admin, `?zoom=` nur noch als Notbehelf.
  - `DEPLOY.md`: Abschnitt mit den Schritten oben und dem Rückweg.
