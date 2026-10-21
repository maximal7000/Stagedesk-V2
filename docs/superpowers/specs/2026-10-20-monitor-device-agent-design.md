# Teilprojekt C: Geräte-Agent für die Monitor-Pis

Stand: 20.10.2026 · Status: im Brainstorming abgestimmt, wartet auf Review der Spec

Grundlage: Gesamtentwurf `2026-10-19-monitor-overhaul-design.md` §5. Teilprojekte 0, B und A sind auf `main` (6ddd3c0). Ferien, „Alle bis Tagesende aus" und die Power-Regeln (`backend/monitor/power.py`) stammen schon aus B+A und werden hier nur genutzt.

## 1. Ziele und Entscheidungen

Vom Nutzer entschieden:

- **Ein Agent statt vier Skripte:** `stagedesk-agent` ersetzt `scripts/stagedesk-power{,-hdmi,-hybrid,-ddc}.py` und übernimmt auch den Kiosk-Browser (Kiosk-URL, Neustart, Kopplungscode auf dem Bildschirm).
- **Auslieferung über den Stagedesk-Server:** Installation per `curl -fsSL https://stagedesk.t410.de/api/monitor/agent/install.sh | sudo bash`, Selbst-Update vom Server. Kein Git und keine Zugangsdaten auf dem Pi.
- **Verbindung:** der bestehende WebSocket `wss://…/ws/monitor/pi/<slug>/`, jetzt mit Geräte-Token. Alte Skripte ohne Token bleiben bis zur Umstellung erlaubt.
- **Benachrichtigungen:** an alle Nutzer mit `monitor.devices`, wenn ein Bildschirm, der laut Zeitplan an sein soll, länger als 10 Minuten (einstellbar) offline ist, wenn er wieder online ist, bei jeder Warnung und bei fehlgeschlagenen Updates.
- **Updates:** wöchentlich, Standard Sonntag 03:00–05:00, pro Bildschirm einstellbar. Neustart nur wenn nötig und nicht während Termin, Klausur, Notfall oder On-Air.

Rahmen: alle Pis sind Raspberry Pi 4 mit Raspberry Pi OS (Bookworm) und `cage` + Chromium als Kiosk (`docs/raspberry-pi-monitor.md`). Der Server erreicht die Pis nicht, die Pis bauen die Verbindung auf. Bekannte Geräte: glocke (iiyama LH4341UHS, CEC) und mensa.

**Später, nicht Teil von C:** MQTT-Broker statt WebSocket; eigenes Debian-Paket mit Paketquelle statt `install.sh`.

## 2. Bausteine

### 2.1 Agent auf dem Pi

Ordner im Repo: `agent/` (Python 3, nur Standardbibliothek plus `python3-websocket` aus apt). Auf dem Pi unter `/opt/stagedesk-agent/`, Konfiguration und Token unter `/etc/stagedesk-agent/` (Rechte 600, Besitzer root). Der Dienst `stagedesk-agent.service` läuft als root, weil er Pakete aktualisiert, neu startet und Dienste steuert. Der Kiosk läuft weiter als Benutzer `pi`.

| Modul | Aufgabe |
|---|---|
| `connection` | WebSocket mit `Authorization: Bearer <token>`, Backoff 5–60 s, Heartbeat (ping/pong wie heute) |
| `telemetry` | jede Minute sammeln und senden (§4.1) |
| `power` | Bildschirm schalten per CEC, HDMI (wlr-randr + Watchdog), Hybrid (SICP-Aus über LAN, CEC-Ein) oder DDC/CI; Methode und Parameter kommen vom Server; Logik aus den vier alten Skripten übernommen |
| `kiosk` | schreibt `/etc/stagedesk-agent/kiosk.env` (URL) und startet `stagedesk-kiosk.service` (cage + Chromium als `pi`) neu; lokale Seiten über einen HTTP-Server auf `127.0.0.1:8765` für Kopplungscode, Testbild und „Keine Verbindung zum Server" |
| `commands` | Befehle ausführen und quittieren (§5) |
| `updater` | apt-Updates im Zeitfenster, Neustart-Regel, Selbst-Update mit Rückfall (§6) |
| `pairing` | Kopplung vor dem ersten Token (§3) |

Die Kiosk-URL ist `https://stagedesk.t410.de/monitor?screen=<slug>&key=<key>` ohne `zoom` (Skalierung kommt aus dem Admin). Slug und Schlüssel liefert der Server nach der Kopplung und bei Änderungen (z. B. „Neu erzeugen" des Schlüssels).

### 2.2 Server

- **Modelle** (App `monitor`, englische Namen):
  - `Device`: Bildschirm (OneToOne, nullable), `token_hash`, `token_created_at`, Seriennummer, Modell, `agent_version`, `last_seen_at`, `last_telemetry` (JSON), `last_screenshot` (Datei) + Zeitpunkt, `active_warnings` (JSON, für die Einmal-Benachrichtigung), `offline_notified_at`, `revoked_at`.
  - `PairingRequest`: 6-stelliger Code, geheime `pairing_id` (Hash), Seriennummer, Modell, `expires_at`, `confirmed_device` (FK nullable), `token_delivered` (bool).
  - `DeviceCommand`: Gerät, Art, Parameter, angelegt von (keycloak_id + Name), `created_at`, Status (`pending`, `sent`, `ok`, `failed`, `expired`), Ergebnistext, `finished_at`.
  - `DeviceEvent`: Gerät/Bildschirm, Art (`online`, `offline`, `warning`, `warning_cleared`, `update`, `update_failed`, `paired`, `unpaired`, `token_revoked`, `command`, `agent_updated`), Text, Daten (JSON), Zeitpunkt. Aufbewahrung 90 Tage.
- **Screen-Felder:** `power_method` (`cec`, `hdmi`, `hybrid`, `ddc`, Standard `cec`), `power_config` (JSON: CEC-Gerät, HDMI-Ausgang, SICP-IP/Port/Monitor-ID, DDC-VCP-Werte), `auto_updates` (bool, Standard an), `update_window` (JSON: Wochentag, von, bis; Standard So 03:00–05:00), `daily_reboot` (bool, Standard an, 04:00).
- **MonitorSettings-Felder:** `device_offline_minutes` (10), `warn_temperature_c` (80), `warn_disk_percent` (90), `warn_wifi_dbm` (-75), `warn_reboot_days` (7), `require_device_token` (aus).
- **Consumer:** `ScreenPiConsumer` prüft den Token beim Verbinden (§3.3) und verarbeitet die neuen Nachrichtentypen (§4.2).
- **Überwachung:** Management-Command `monitor_device_watch`, jede Minute per systemd-Timer auf dem Server (Muster wie `stagedesk-erinnerungen.timer`).
- **Auslieferung:** öffentliche Routen `/api/monitor/agent/install.sh`, `/api/monitor/agent/version` (Version + SHA-256), `/api/monitor/agent/stagedesk-agent-<version>.tar.gz` (Pfad unter `/api/`, damit nginx unverändert bleibt; dort geht `/` an die SPA). Das Paket wird beim ersten Abruf aus `agent/` gebaut und im Cache gehalten; Version aus `agent/VERSION`. Keine Geheimnisse darin.
- **API** unter `/api/monitor/` (Ninja, Root-Routen mit `""`): Kopplung, Geräte, Befehle, Protokoll, Screenshot-Upload (§3, §5, §7).

## 3. Kopplung und Sicherheit

### 3.1 Ablauf

1. Installationsbefehl auf dem Pi. Der Agent hat keinen Token und ruft `POST /api/monitor/agent/pair/start` mit Seriennummer und Modell auf.
2. Der Server legt einen `PairingRequest` an: 6-stelliger Code (Ziffern, ohne führende 0) und zufällige `pairing_id` (32 Byte). Gültig 15 Minuten. Der Agent zeigt über die lokale Seite groß „Kopplungscode 482 913" und darunter „Im Stagedesk-Admin unter Monitore → Übersicht → Bildschirm koppeln eingeben." Läuft der Code ab, holt der Agent einen neuen.
3. Im Admin gibt eine Person mit `monitor.devices` den Code ein (`POST /api/monitor/devices/pair` mit Code und `screen_id` oder Daten für einen neuen Bildschirm).
4. Der Agent fragt alle 5 s `POST /api/monitor/agent/pair/poll` mit der `pairing_id`. Nach der Bestätigung bekommt er **einmal** Geräte-Token, Slug und Schlüssel. Danach ist der Request verbraucht.
5. Der Agent speichert alles unter `/etc/stagedesk-agent/`, setzt die Kiosk-URL und verbindet den WebSocket.

### 3.2 Schutz

- Der Code allein liefert keinen Token; nur der Pi mit der passenden `pairing_id`.
- Codeeingabe: höchstens 5 Fehlversuche pro Minute und Person (Cache-Zähler), danach „Zu viele Versuche. Bitte eine Minute warten."
- `pair/start` ist öffentlich, aber begrenzt (höchstens 10 offene Requests insgesamt, 3 pro Seriennummer); alte Requests werden verworfen.
- Der Server speichert Token und `pairing_id` nur als SHA-256-Hash.
- **Entkoppeln** löst Gerät und Bildschirm, **Token zurückziehen** sperrt den Token. In beiden Fällen schließt der Server die Verbindung mit Code 4003; der Agent verwirft seinen Token und startet die Kopplung neu.
- Wird ein Bildschirm mit einem neuen Gerät gekoppelt, verliert das alte Gerät seinen Zugang (Ereignis im Protokoll).

### 3.3 WebSocket-Anmeldung

- Mit gültigem Token: volles Protokoll (§4.2). Der Slug in der URL muss zum Gerät passen, sonst Abbruch mit 4003.
- Ohne Token: bisheriger Power-Betrieb (power_command, cec_status, ping/pong). Das Admin zeigt beim Bildschirm „Altes Skript, bitte Agent installieren".
- Ist `require_device_token` an, werden Verbindungen ohne Token mit 4001 abgelehnt.
- Ungültiger oder zurückgezogener Token: Abbruch mit 4003.

### 3.4 Rechte

- Koppeln, Entkoppeln, Token zurückziehen, Befehle, Screenshot, Protokoll lesen: `monitor.devices`.
- „Bildschirm an/aus" als Befehl: zusätzlich `monitor.power`.
- Power-Methode, Update-Fenster, täglicher Neustart pro Bildschirm: `monitor.devices`.
- Einstellungen → Geräte: `monitor.setup`.
- Telemetrie und Ampel lesen: `monitor.view` (ohne Seriennummer, MAC und IP; diese nur mit `monitor.devices`).

## 4. Telemetrie und Protokoll

### 4.1 Telemetrie (jede Minute)

| Gruppe | Felder | Quelle |
|---|---|---|
| Netz | Verbindungsart (LAN/WLAN), SSID, WLAN-Stärke dBm, IP, MAC | `iw dev wlan0 link`, `ip -j addr` |
| System | CPU-Temperatur, Drosselung (Unterspannung/Hitze, aktuell und seit Start), Speicher belegt %, RAM belegt %, Laufzeit, Modell, Seriennummer, OS-Version, Agent-Version | `vcgencmd measure_temp`, `vcgencmd get_throttled`, `shutil.disk_usage`, `/proc/meminfo`, `/proc/uptime`, `/proc/device-tree/model`, `/etc/os-release` |
| Anzeige | Auflösung, Browser läuft, Bildschirm an/aus (Power-Status) | `wlr-randr`, `systemctl is-active stagedesk-kiosk`, Power-Modul |
| Updates | letztes Update (Zeit, Ergebnis), ausstehende Pakete, Neustart nötig seit | apt-Listen, `/var/run/reboot-required` |

Fehlt eine Quelle, ist das Feld `null`; der Agent bricht nicht ab.

### 4.2 Nachrichten über den WebSocket

Server → Agent:
- `hello`: Slug, Schlüssel, Kiosk-URL, Power-Methode und -Konfiguration, Update-Fenster, `auto_updates`, `daily_reboot`, aktuelle Agent-Version und SHA-256. Gesendet nach Verbindung und bei Änderungen.
- `power_command` (wie heute).
- `command`: `id`, `kind`, Parameter.
- `update_gate`: Antwort auf `update_gate_request`, `allowed` + Grund.
- `ping`.

Agent → Server:
- `telemetry`: Daten nach §4.1.
- `command_result`: `id`, `ok`, Text.
- `update_result`: Zeit, Pakete, Neustart, Fehler.
- `update_gate_request`.
- `power_status` (ersetzt `cec_status`, der weiter angenommen wird).
- `pong`.

Der Server setzt bei jeder Nachricht `last_seen_at` und schreibt Telemetrie gedrosselt (höchstens einmal pro 30 s).

## 5. Befehle

| Befehl | Ausführung | Nachfrage im Admin |
|---|---|---|
| Neu laden | Display-WebSocket `reload` (wie bisher), zusätzlich an den Agent, der bei fehlender Display-Verbindung den Kiosk neu startet | nein |
| Browser neu starten | `systemctl restart stagedesk-kiosk` | nein |
| Pi neu starten | `systemctl reboot` nach Quittung | ja |
| Bildschirm an / aus | Power-Modul, setzt **keinen** Dauerzustand (der Zeitplan gilt beim nächsten Tick wieder); dauerhaft schalten bleibt `power_mode` im Admin | nein |
| Jetzt aktualisieren | Update-Ablauf sofort, ohne Termin-Sperre, ohne automatischen Neustart | ja |
| Screenshot | `grim` als `pi` im cage-Wayland, Upload per `POST /api/monitor/agent/screenshot` mit Token (PNG, höchstens 15 MB); nur das letzte Bild pro Bildschirm bleibt | nein |
| Testbild | lokale Seite 60 s: Bildschirmname, Auflösung, Farbbalken, Raster, dann zurück | nein |

- Ein Befehl an ein Gerät ohne Verbindung bleibt 5 Minuten `pending` und wird beim Verbinden gesendet; danach `expired`.
- Jeder Befehl landet als `DeviceCommand` und als `DeviceEvent` (Person, Zeit, Ergebnis) im Protokoll.

## 6. Updates

- **Zeitfenster** pro Bildschirm (Standard So 03:00–05:00) oder „keine automatischen Updates". Der Agent plant den Lauf selbst (systemd-Timer, den er aus dem `hello` neu schreibt).
- **Sperre:** vor Start und vor Neustart fragt der Agent per `update_gate_request`. Der Server lehnt ab, wenn auf diesem Bildschirm ein Termin, eine Klausur, Notfall oder On-Air aktiv ist (gleiche Regeln wie `display.py`). Abgelehnt → nächstes Fenster, Ereignis im Protokoll.
- **Ablauf:** `apt-get update`, `DEBIAN_FRONTEND=noninteractive apt-get -y full-upgrade` mit Zeitlimit 60 Minuten. Neustart nur, wenn `/var/run/reboot-required` existiert und die Sperre frei ist.
- **Ergebnis** als `update_result` → Protokoll und Admin. Fehlgeschlagen → Benachrichtigung.
- **Selbst-Update:** meldet `hello` eine neuere Version, lädt der Agent das Paket, prüft SHA-256, entpackt nach `/opt/stagedesk-agent.new`, tauscht atomar mit `/opt/stagedesk-agent` (alte Version nach `.prev`) und startet sich neu. Meldet sich die neue Version nicht innerhalb von 2 Minuten erfolgreich beim Server, stellt ein Rückfall-Timer `.prev` wieder her.
- **Täglicher Neustart** 04:00 als eigener Timer, pro Bildschirm abschaltbar, mit derselben Sperre.

## 7. Überwachung und Benachrichtigungen

### 7.1 Ampel

| Zustand | Bedingung | Text |
|---|---|---|
| Online | Nachricht in den letzten 2 min, keine Warnung | „Online" |
| Warnung | online, mindestens eine Warnung | „Warnung · <erste Warnung>" |
| Offline | über 2 min nichts, Bildschirm sollte an sein | „Offline · zuletzt gesehen HH:MM" |
| Aus | über 2 min nichts, laut `compute_power_state` ohnehin aus | „Aus · zuletzt gesehen HH:MM" |
| Altes Skript | verbunden ohne Token | „Altes Skript" |
| Nicht gekoppelt | kein Gerät | „Kein Gerät gekoppelt" |

Die bisherige Status-Ableitung aus `cec_status_at` (Admin, T15) wird durch diese Ampel ersetzt; für Bildschirme mit altem Skript bleibt sie als Rückfall.

### 7.2 Warnungen

Temperatur über `warn_temperature_c`, Drosselung aktiv, Speicher über `warn_disk_percent`, WLAN schwächer als `warn_wifi_dbm` (nur bei WLAN), Browser läuft nicht, letztes Update fehlgeschlagen, Neustart seit mehr als `warn_reboot_days` nötig.

### 7.3 Benachrichtigungen

Über `core.notify.notify_many` (Kategorie `system`, Link auf das Bildschirm-Detail) an alle Nutzer mit `monitor.devices`:
- „Bildschirm Glocke ist seit 10 Minuten offline.": einmal pro Ausfall, nur wenn er laut Zeitplan an sein soll.
- „Bildschirm Glocke ist wieder online.": nur nach einer Offline-Meldung.
- „Glocke: Temperatur 83 °C." (bzw. passende Warnung): einmal pro Warnung, erneut erst nach `warning_cleared`.
- „Update auf Glocke fehlgeschlagen: <Grund>."

`monitor_device_watch` (jede Minute) berechnet Ampel und Warnungen, schreibt Ereignisse und verschickt Benachrichtigungen. Er ist idempotent (Zustand in `Device`), damit doppelte Läufe nichts doppelt melden.

## 8. Admin

- **Übersicht:** „Bildschirm koppeln" wird aktiv (Recht `monitor.devices`). Dialog: Code eingeben → vorhandenen Bildschirm wählen oder neuen anlegen (Name, Ort) → „Koppeln". Die Spalte „Status" zeigt die Ampel (eine Anzeige, für Bildschirme mit altem Skript oder ohne Gerät mit CEC-Rückfall). Die Spalte „Gerät" zeigt nur Hardware-Fakten: Agent-Version, WLAN-Stärke, Temperatur (eine Warnung darf ihren Messwert einfärben). Der Platzhalter für Bildschirme ohne Gerät ist „Kein Gerät gekoppelt" (mit altem Skript „Altes Skript"); Ruling R12.
- **Bildschirm-Detail, Box „Gerät":**
  - Telemetrie in Gruppen (Netz, System, Anzeige, Updates) mit „Stand HH:MM".
  - Befehlsknöpfe nach §5; Neustart und Update mit `ConfirmDialog`; Ergebnis als Toast und im Protokoll.
  - Letzter Screenshot mit Zeitpunkt, „Screenshot aufnehmen".
  - „Entkoppeln" und „Token zurückziehen" (danger, mit Nachfrage).
  - Abschnitt „Ein- und Ausschalten" bekommt die Power-Methode mit ihren Feldern; Abschnitt „Updates" mit automatischen Updates, Zeitfenster und täglichem Neustart.
- **Abschnitt „Protokoll"** im Bildschirm-Detail: Ereignisse und Befehle der letzten 90 Tage, neueste zuerst, Filter nach Art, je Zeile Zeit, Art, Text, Person.
- **Einstellungen → Geräte:** Warnschwellen, Offline-Minuten, Standard-Update-Fenster für neue Bildschirme, Schalter „Nur Geräte mit Token zulassen" (mit Hinweis, welche Bildschirme noch ein altes Skript nutzen), Installationsbefehl mit „Kopieren".
- Alle Texte deutsch, nach den Copy-Regeln (keine Em-Dashes, keine Floskeln), Bühnenschwarz-Tokens, vorhandene Bausteine aus `components/monitor-admin/shared/`.

## 9. Installationsskript

`install.sh` (idempotent, `set -euo pipefail`):
1. Prüft root, Raspberry Pi OS Bookworm ("Raspberry Pi OS (Legacy, Bookworm)"; der Imager-Standard ist inzwischen Trixie) und den Benutzer `pi` mit ID 1000.
2. Installiert Pakete: `python3-websocket`, `cage`, `chromium` (`chromium-browser` hat auf Bookworm keinen Installationskandidaten, nur Rückfall), `cec-utils`, `ddcutil`, `wlr-randr`, `grim`, `iw`.
3. Lädt und prüft das Agent-Paket, legt `/opt/stagedesk-agent` an.
4. Legt `stagedesk-agent.service`, `stagedesk-kiosk.service` und die Timer an; übernimmt Gruppen und Getty-Einstellungen aus der heutigen Doku.
5. Stoppt und deaktiviert die alten Dienste `stagedesk-power.service`, `kiosk.service` und den alten 04:00-Neustart, falls vorhanden (Dateien bleiben liegen).
6. Startet Agent und Kiosk. Der Bildschirm zeigt den Kopplungscode.

## 10. Fehlerfälle

- Server nicht erreichbar: Agent versucht es weiter (Backoff), Kiosk zeigt die zuletzt geladene Anzeige; die Anzeige selbst zeigt nach B ihren Zustand „Verbindung verloren". Ohne Token und ohne Server zeigt die lokale Seite „Keine Verbindung zum Server. Netzwerk prüfen."
- Telemetrie-Quelle fehlt: Feld `null`, keine Warnung daraus.
- Power-Befehl schlägt fehl: `power_status` „Fehler: <Text>", Ereignis im Protokoll.
- Update hängt: Zeitlimit 60 min, dann Abbruch und `update_failed`.
- Selbst-Update kaputt: Rückfall nach 2 min (§6).
- Token gestohlen: im Admin zurückziehen, Gerät neu koppeln.

## 11. Tests

- **Agent:** Unittests (`python3 -m unittest` in `agent/tests/`) mit vorgetäuschten Systembefehlen für Telemetrie-Parser, Warnungsdaten, Power-Methoden, Befehle, Update-Sperre, Selbst-Update mit Rückfall, Kopplung.
- **Backend:** Kopplung inkl. Fehlversuch-Sperre und einmaliger Token-Ausgabe, Token-Prüfung und Altbetrieb, Nachrichten, Befehlswarteschlange und Ablauf, Update-Sperre, `monitor_device_watch` (Ampel, Warnungen, Einmal-Benachrichtigung, Zeitplan-Aus), Rechte, Auslieferung (Version, SHA-256, keine Geheimnisse).
- **Ende-zu-Ende:** simulierter Agent (echter Agent-Code mit vorgetäuschten Systembefehlen) gegen einen lokalen Server: Kopplung → Verbindung → Telemetrie → Befehl → Quittung → Entkoppeln.
- **Frontend:** vitest für Ampel-Logik und Dialoge; Screenshots aller neuen Admin-Zustände mit `scripts/shoot-admin.mjs`.
- **Abnahme auf echter Hardware** (durch den Nutzer): glocke per SSH umstellen, koppeln, Befehle und Update probieren.

## 12. Umstellung

1. Deploy von A+B+C (gemeinsam, nach Abschluss von C).
2. Auf glocke und mensa per SSH den Installationsbefehl ausführen. Die alten Skripte werden dabei abgeschaltet.
3. Im Admin koppeln, Power-Methode prüfen (glocke: CEC; mensa: laut altem Skript CEC).
4. Wenn alle Pis gekoppelt sind: „Nur Geräte mit Token zulassen" einschalten.
5. `docs/raspberry-pi-monitor.md` wird auf diesen Ablauf umgeschrieben; die Handarbeit (Kiosk-Skript, Power-Skript, Cursor-Theme, Neustart-Timer) übernimmt `install.sh`. Die alten Skripte bleiben im Repo, bis alle Pis umgestellt sind, und werden dann in einem eigenen Schritt entfernt.
