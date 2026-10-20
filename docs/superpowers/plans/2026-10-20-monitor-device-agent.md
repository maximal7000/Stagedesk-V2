# Geräte-Agent (Teilprojekt C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein `stagedesk-agent` auf jedem Monitor-Pi (Kopplung per Code, Telemetrie, Befehle, Power, Kiosk, Updates, Selbst-Update) und die Server- und Admin-Seite dazu (Geräte, Ampel, Benachrichtigungen, Protokoll).

**Architecture:**
- **Etappe 1, Backend** (Tasks 1–5): Modelle und Migration, Kopplung, erweiterter Pi-Consumer, Geräte-API, Überwachung.
- **Etappe 2, Agent** (Tasks 6–10): Python-Paket `agent/stagedesk_agent/` nur mit Standardbibliothek plus `websocket-client`; alle Systemaufrufe laufen über einen austauschbaren `Runner`, damit Tests ohne Pi laufen. Auslieferung und Ende-zu-Ende-Test in Task 10.
- **Etappe 3, Admin** (Tasks 11–13) unter `frontend/src/components/monitor-admin/`, Abschluss (Task 14) mit Doku.

**Tech Stack:** Django 5 + Ninja 1.1, Channels (Tests `InMemoryChannelLayer`); Agent: Python 3.11 (Bookworm), `websocket-client` (apt `python3-websocket`), `unittest`; React 19, Tailwind v4, vitest, playwright-core.

**Spec:** `docs/superpowers/specs/2026-10-20-monitor-device-agent-design.md` (Kapitelverweise §x beziehen sich darauf).

## Global Constraints

- Code englisch, Oberfläche deutsch; neue Bezeichner bestehen `python3 -I scripts/check-monitor-identifiers.py` (Default-Bereich um `agent/` erweitern, Task 6).
- Copy: keine Em-Dashes, keine Floskeln, Fehler nennen Ursache und nächsten Schritt; Texte aus der Spec wörtlich.
- Admin: Bühnenschwarz-Tokens, Bausteine aus `frontend/src/components/ui/` und `components/monitor-admin/shared/`, `rounded-lg`, lucide-react, `npm run check:tokens` grün.
- Ninja-Routen `""` statt `"/"`; Rechte über `_require_perm` (`backend/monitor/permissions.py`), Frontend `hasPermission`.
- Keine Zugangsdaten, Tokens oder Server-IPs im Repo (Repo öffentlich).
- Token und `pairing_id` nur als SHA-256-Hash speichern; Vergleich mit `hmac.compare_digest`.
- Agent: läuft als root, Dateien unter `/etc/stagedesk-agent/` mit Modus 600; Kiosk als `pi`.
- Bestehende Aufrufer bleiben: Pi-WebSocket ohne Token (Altbetrieb mit `power_command`, `cec_status`, ping/pong), solange `require_device_token` aus ist.
- **Pfad-Entscheidung (Abweichung von Spec §2.2/§9):** Die Auslieferung liegt unter `/api/monitor/agent/…` statt `/agent/…`, damit nginx unverändert bleibt (dort geht `/` an die SPA). Installationsbefehl: `curl -fsSL https://stagedesk.t410.de/api/monitor/agent/install.sh | sudo bash`.
- Commit-Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01D7nDH9UeEyBKSeRzQw1WpF`.
- Checks: Backend `cd backend && source venv/bin/activate && python manage.py test monitor users`; Agent `cd agent && python3 -m unittest discover -s tests`; Frontend `cd frontend && npx vitest run && npm run build && npm run check:tokens`.

## Review Focus

1. **Pi verliert das Netz mitten im Betrieb oder startet ohne Netz:** Agent verbindet sich mit Backoff neu, Kiosk zeigt weiter die letzte Anzeige; ohne Token zeigt die lokale Seite „Keine Verbindung zum Server. Netzwerk prüfen." → Test in Task 6 (Backoff-Folge, Seite bei fehlendem Server), Task 10 (E2E: Server weg und wieder da).
2. **Token zurückgezogen, während der Pi verbunden ist:** Server schließt mit 4003, Agent löscht Token und zeigt neuen Code → Test in Task 3 (Close-Code) und Task 6 (Agent-Reaktion auf 4003).
3. **Zwei Geräte mit demselben Bildschirm / neuer Pi ersetzt alten:** alter Token wird ungültig, offene Verbindung des alten Geräts wird geschlossen → Test in Task 2.
4. **Befehl an ein offline Gerät:** bleibt 5 min `pending`, wird beim Verbinden gesendet, danach `expired`, Admin zeigt den Status → Test in Task 3 und Task 4.
5. **Doppelt laufender Überwachungs-Lauf oder Neustart des Servers:** keine doppelten Benachrichtigungen, keine Offline-Meldung für Bildschirme, die laut Zeitplan aus sind → Test in Task 5.

---

## Etappe 1: Backend

### Task 1: Datenmodell und Migration

**Files:**
- Modify: `backend/monitor/models.py` (neue Modelle, Screen- und MonitorSettings-Felder)
- Create: `backend/monitor/migrations/0043_device_agent.py`
- Modify: `backend/monitor/schemas.py` (Screen- und Settings-Schemas um die neuen Felder)
- Test: `backend/monitor/tests_devices.py`

**Interfaces — Produces:**
- `Device(screen: OneToOne[Screen] null, token_hash: str(64) unique null, token_created_at, serial: str(64), model: str(120), agent_version: str(20), last_seen_at: datetime null, last_telemetry: JSON {}, last_screenshot: ImageField upload_to 'monitor/screenshots/' null, last_screenshot_at, active_warnings: JSON [], offline_notified_at: datetime null, revoked_at: datetime null, created_at)`; Methode `Device.issue_token() -> str` (erzeugt `secrets.token_urlsafe(32)`, speichert Hash, gibt Klartext einmal zurück); Klassenmethode `Device.for_token(raw: str) -> Device | None` (nicht widerrufen).
- `PairingRequest(code: str(6), pairing_id_hash: str(64) unique, serial, model, expires_at, confirmed_device: FK Device null, token_delivered: bool, created_at)`.
- `DeviceCommand(device: FK, kind: choices reload|restart_browser|reboot|power_on|power_off|update_now|screenshot|test_pattern, params: JSON {}, created_by_id: str(64), created_by_name: str(150), status: choices pending|sent|ok|failed|expired, result: str, created_at, finished_at null)`.
- `DeviceEvent(device: FK null, screen: FK null, kind: choices online|offline|warning|warning_cleared|update|update_failed|paired|unpaired|token_revoked|command|agent_updated, text: str(300), data: JSON {}, created_at)`, ordering `-created_at`.
- Screen: `power_method` choices `cec|hdmi|hybrid|ddc` Standard `cec`; `power_config` JSON {}; `auto_updates` bool True; `update_window` JSON Standard `{"weekday": 6, "from": "03:00", "until": "05:00"}` (0=Montag wie `power.py`); `daily_reboot` bool True.
- MonitorSettings: `device_offline_minutes` 10, `warn_temperature_c` 80, `warn_disk_percent` 90, `warn_wifi_dbm` -75, `warn_reboot_days` 7, `require_device_token` False.

- [ ] **Step 1: Failing tests** in `tests_devices.py`: `test_issue_token_stores_only_hash` (Klartext ≠ `token_hash`, `token_hash == sha256(raw)`), `test_for_token_ignores_revoked`, `test_screen_defaults` (`power_method == 'cec'`, `update_window == {"weekday": 6, "from": "03:00", "until": "05:00"}`, `daily_reboot is True`), `test_settings_defaults` (10/80/90/-75/7/False).
- [ ] **Step 2:** `python manage.py test monitor.tests_devices` → FAIL (Import).
- [ ] **Step 3:** Modelle, `makemigrations monitor -n device_agent` (ergibt 0043), Schemas ergänzen (Settings-Update-Schema: neue Felder optional; Screen-Update-Schema: `power_method`, `power_config`, `auto_updates`, `update_window`, `daily_reboot`).
- [ ] **Step 4:** Tests grün, `makemigrations --check --dry-run` meldet nichts.
- [ ] **Step 5: Commit** `feat(monitor): Datenmodell für Geräte-Agent`

### Task 2: Kopplung und Token-Verwaltung

**Files:**
- Create: `backend/monitor/devices.py` (Fachlogik), `backend/monitor/api_devices.py` (Router `devices_router`, eingebunden in `api.py` wie `setup_router`)
- Test: `backend/monitor/tests_devices.py`

**Interfaces — Produces:**
- `devices.start_pairing(serial: str, model: str) -> tuple[PairingRequest, str]` (zweiter Wert: Klartext-`pairing_id`, `secrets.token_urlsafe(32)`); Code: 6 Ziffern, erste nicht 0, eindeutig unter offenen Requests; `expires_at = now + 15 min`; verwirft abgelaufene; höchstens 10 offene insgesamt, 3 pro Seriennummer (älteste verwerfen).
- `devices.poll_pairing(pairing_id: str) -> dict | None`: `None` solange offen; nach Bestätigung einmal `{"token", "slug", "key", "screen_id"}`, setzt `token_delivered`; danach 410.
- `devices.confirm_pairing(code: str, screen: Screen) -> Device`: erstellt Device, ersetzt ein vorhandenes Device des Bildschirms (altes: `revoked_at`, Ereignis `token_revoked`, `close_device_sockets(old)`), Ereignis `paired`.
- `devices.unpair(device)`, `devices.revoke_token(device)`: Ereignisse `unpaired` / `token_revoked`, `close_device_sockets(device)`.
- `push.close_device_sockets(device: Device) -> None`: Gruppen-Nachricht `device_{id}` Typ `device_close` mit Code 4003 (Consumer aus Task 3 behandelt sie).
- Routen (Prefix `/api/monitor`):
  - `POST /agent/pair/start` (öffentlich, `auth=None`) Body `{serial, model}` → `{code, pairing_id, expires_at}`.
  - `POST /agent/pair/poll` (öffentlich) Body `{pairing_id}` → 202 `{status:"waiting"}` | 200 `{status:"paired", token, slug, key}` | 404 unbekannt/abgelaufen | 410 schon ausgeliefert.
  - `POST /devices/pair` (`monitor.devices`) Body `{code, screen_id?, new_screen?: {name, location}}` → Device-Schema. Falsch: 400 „Der Code ist ungültig oder abgelaufen. Den Code auf dem Bildschirm prüfen." Ab 6. Fehlversuch pro Person und Minute: 429 „Zu viele Versuche. Bitte eine Minute warten."
  - `POST /devices/{id}/unpair`, `POST /devices/{id}/revoke` (`monitor.devices`).

- [ ] **Step 1: Failing tests:** `test_pairing_code_format_and_expiry`, `test_poll_waiting_then_token_once_then_410`, `test_wrong_code_rate_limited_after_five` (6. Versuch 429), `test_start_limits_open_requests` (11. offener Request verdrängt den ältesten; 4. pro Seriennummer verdrängt), `test_confirm_replaces_previous_device` (altes `revoked_at` gesetzt, `Device.for_token(old_raw) is None`, Ereignis `token_revoked`), `test_pair_requires_devices_permission` (403), `test_new_screen_created_on_pair`.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen (Rate-Limit über Django-Cache-Zähler `monitor:pair-fail:<keycloak_id>` mit 60 s). **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(monitor): Kopplung per Code und Geräte-Token`

### Task 3: Pi-Consumer mit Token und Protokoll

**Files:**
- Modify: `backend/monitor/consumers.py` (`ScreenPiConsumer`)
- Modify: `backend/monitor/devices.py` (Nachrichten-Verarbeitung, `hello`-Daten, Befehlswarteschlange, Update-Sperre)
- Modify: `backend/monitor/push.py` (`push_device_hello(screen)`, Aufrufe dort, wo Kiosk-relevante Screen-Felder, Schlüssel oder Power-Methode geändert werden)
- Test: `backend/monitor/tests_device_consumer.py` (Channels `WebsocketCommunicator`)

**Interfaces:**
- Consumes: `Device.for_token`, `close_device_sockets` (Task 2).
- Produces:
  - Anmeldung: Header `Authorization: Bearer <token>` aus `scope["headers"]`. Gültig und Slug passt → `self.device`, Gruppen `screen_{slug}` und `device_{id}`. Ungültig/widerrufen/Slug falsch → close 4003. Kein Header: Altbetrieb; mit `require_device_token` → close 4001.
  - `devices.hello_payload(device) -> dict` mit `{type:"hello", slug, key, kiosk_url, power_method, power_config, update_window, auto_updates, daily_reboot, agent_version, agent_sha256}` (`kiosk_url = f"{settings.PUBLIC_BASE_URL}/monitor?screen={slug}&key={key}"`; `PUBLIC_BASE_URL` neu in settings aus `.env`, Standard `https://stagedesk.t410.de`; Agent-Version/Prüfsumme aus Task 10, bis dahin `agent_package_info()` mit Rückfall `("0.0.0", "")`).
  - Eingehend: `telemetry` (gedrosselt speichern, höchstens alle 30 s, `last_seen_at` bei jeder Nachricht), `command_result {id, ok, text}`, `update_result {at, packages, rebooted, error}` (Ereignis `update` bzw. `update_failed`), `update_gate_request` → `{type:"update_gate", allowed, reason}`, `power_status {status}` (schreibt `cec_status`/`cec_status_at` wie bisher), `cec_status` weiter angenommen, `pong`/`ping` wie bisher.
  - `devices.update_gate(screen, now) -> tuple[bool, str]`: abgelehnt bei aktivem Termin, Klausur, Notfall oder On-Air für diesen Bildschirm (dieselben Funktionen, die `display.build_payload` nutzt); Grund deutsch, z. B. „Termin „Elternabend" läuft".
  - Befehle: `devices.send_pending_commands(device)` beim Verbinden und `push.push_device_command(command)` beim Anlegen; `pending` älter als 5 min → `expired`.

- [ ] **Step 1: Failing tests:** `test_valid_token_receives_hello`, `test_invalid_token_closed_4003`, `test_slug_mismatch_closed_4003`, `test_legacy_without_token_gets_power_command`, `test_require_token_rejects_legacy_4001`, `test_revoke_closes_open_socket_4003`, `test_telemetry_throttled_but_last_seen_updated`, `test_pending_command_sent_on_connect`, `test_command_older_than_5_min_expired`, `test_command_result_sets_status`, `test_update_gate_denied_during_event` und `..._allowed_otherwise`, `test_update_failed_creates_event`.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** grün (inkl. bestehende `tests_push`, `tests_power`).
- [ ] **Step 5: Commit** `feat(monitor): Pi-Verbindung mit Geräte-Token und Agent-Protokoll`

### Task 4: Geräte-API für das Admin

**Files:**
- Modify: `backend/monitor/api_devices.py`, `backend/monitor/schemas.py`
- Test: `backend/monitor/tests_devices.py`

**Interfaces — Produces** (Prefix `/api/monitor`):
- `GET /devices` (`monitor.view`) → Liste `DeviceSchema {id, screen_id, status, status_text, agent_version, last_seen_at, telemetry, warnings, last_screenshot_url, last_screenshot_at, legacy}`; `serial`, `telemetry.network.ip`, `telemetry.network.mac` nur mit `monitor.devices`, sonst `null`. `status` aus `devices.device_status()` (Task 5). Bildschirme mit altem Skript (Verbindung ohne Token, erkennbar an `cec_status_at` jünger als 2 min und keinem Device) erscheinen mit `legacy: true`.
- `POST /devices/{id}/commands` (`monitor.devices`; `power_on`/`power_off` zusätzlich `monitor.power`) Body `{kind}` → `DeviceCommandSchema {id, kind, status, result, created_at, finished_at, created_by_name}`; `reload` ruft zusätzlich `push.notify_reload(slug)`.
- `GET /devices/{id}/commands/{cid}` (`monitor.devices`) für das Nachfragen des Status.
- `GET /screens/{id}/events?kind=&limit=100` (`monitor.devices`) → `DeviceEventSchema {id, kind, text, created_at, person}` (Person aus `data.created_by_name`).
- `POST /agent/screenshot` (Token im Header, `auth=None` + eigene Prüfung) multipart `file` PNG ≤ 15 MB → ersetzt `last_screenshot` (alte Datei löschen), Befehl `screenshot` auf `ok`.
- Screen-Update: `power_method`, `power_config`, `auto_updates`, `update_window`, `daily_reboot` brauchen `monitor.devices`; Validierung (`update_window.weekday` 0–6, Zeiten `HH:MM`, `from < until`; `power_config` je Methode nur bekannte Schlüssel). Danach `push_device_hello`.
- Settings-Update: die sechs Geräte-Felder brauchen `monitor.setup`; Bereiche: Minuten 2–240, Temperatur 50–95, Speicher 50–99, WLAN -95 bis -40, Neustart-Tage 1–60.
- Löschen von Ereignissen älter als 90 Tage passiert in Task 5.

- [ ] **Step 1: Failing tests:** `test_devices_list_redacts_serial_ip_mac_for_view_only`, `test_command_needs_power_for_power_off`, `test_reload_command_also_notifies_display`, `test_screenshot_upload_requires_valid_token`, `test_screenshot_rejects_over_15mb`, `test_screenshot_replaces_previous_file`, `test_screen_device_fields_need_devices_permission`, `test_update_window_validation` (weekday 7 → 422 deutsch), `test_settings_device_fields_ranges`.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(monitor): Geräte-API mit Befehlen, Protokoll und Screenshot`

### Task 5: Ampel, Warnungen und Benachrichtigungen

**Files:**
- Modify: `backend/monitor/devices.py`
- Create: `backend/monitor/management/commands/monitor_device_watch.py`, `scripts/stagedesk-device-watch.service`, `scripts/stagedesk-device-watch.timer`
- Test: `backend/monitor/tests_device_watch.py`

**Interfaces — Produces:**
- `devices.device_status(device, screen, settings, now) -> tuple[str, str]`: Status `online|warning|offline|off|legacy|unpaired` und Text nach Spec §7.1 („Online", „Warnung · <erste Warnung>", „Offline · zuletzt gesehen HH:MM", „Aus · zuletzt gesehen HH:MM", „Altes Skript", „Kein Gerät gekoppelt"). Grenze 2 min seit `last_seen_at`; `off` wenn `compute_power_state(screen, now)` False.
- `devices.compute_warnings(telemetry: dict, settings, now) -> list[dict]` mit Einträgen `{code, text}`; Codes `temperature`, `throttled`, `disk`, `wifi`, `browser`, `update_failed`, `reboot_pending`; Texte z. B. „Temperatur 83 °C", „Drosselung aktiv", „Speicher 93 % belegt", „WLAN schwach (-81 dBm)", „Browser läuft nicht", „Letztes Update fehlgeschlagen", „Neustart seit 9 Tagen nötig". Fehlende Werte erzeugen keine Warnung; WLAN nur bei Verbindungsart WLAN.
- `devices.watch(now) -> None`: für jedes Gerät Status und Warnungen berechnen; Übergänge als Ereignisse; Benachrichtigungen über `core.notify.notify_many(recipients, 'system', title, body, link=f'/monitor-admin/screens/{screen.id}')`:
  - offline seit ≥ `device_offline_minutes` und Bildschirm soll an sein, `offline_notified_at` leer → „Bildschirm <Name> ist seit <N> Minuten offline." und `offline_notified_at` setzen.
  - wieder online und `offline_notified_at` gesetzt → „Bildschirm <Name> ist wieder online.", zurücksetzen.
  - neue Warnung (Code nicht in `active_warnings`) → „<Name>: <Text>."; verschwundene → Ereignis `warning_cleared`, kein Hinweis.
  - neues `update_failed`-Ereignis seit letztem Lauf → „Update auf <Name> fehlgeschlagen: <Grund>." Merker: `DeviceEvent.data["notified"] = True` am Ereignis.
  - Ereignisse älter als 90 Tage löschen.
- `devices.notification_recipients() -> list[str]`: keycloak_ids aller `UserProfile`, die `monitor.devices` effektiv haben (`profile.has_permission('monitor.devices', False)`; Admins zählen, soweit am Profil erkennbar, siehe `users/api.py:is_admin`).
- Command `monitor_device_watch` ruft `watch(timezone.now())`; Timer `OnCalendar=*-*-* *:*:00`, `AccuracySec=10s`; Service wie `stagedesk-erinnerungen.service`.

- [ ] **Step 1: Failing tests:** `test_status_online_warning_offline_off_legacy_unpaired`, `test_warnings_thresholds_and_missing_values`, `test_offline_notification_once_after_threshold`, `test_no_offline_notification_when_scheduled_off`, `test_back_online_notification_only_after_offline_notice`, `test_warning_notified_once_until_cleared`, `test_update_failed_notified_once`, `test_watch_twice_no_duplicates`, `test_events_older_than_90_days_deleted`, `test_recipients_only_with_devices_permission`.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(monitor): Geräte-Ampel, Warnungen und Benachrichtigungen`

## Etappe 2: Agent

Alle Agent-Module liegen in `agent/stagedesk_agent/`, Tests in `agent/tests/`. Systembefehle laufen nur über `Runner.run(args: list[str], timeout: float = 30, user: str | None = None) -> RunResult(code: int, out: str, err: str)`; Tests nutzen `FakeRunner(responses: dict[tuple, RunResult])` aus `agent/tests/fakes.py`. Dateipfade (`/etc/stagedesk-agent`, `/opt/stagedesk-agent`, `/proc`, `/sys`) kommen aus `Paths` und werden in Tests auf ein Temp-Verzeichnis gesetzt.

### Task 6: Agent-Kern: Konfiguration, Verbindung, Kopplung, lokale Seiten

**Files:**
- Create: `agent/VERSION` (`1.0.0`), `agent/stagedesk_agent/{__init__.py,__main__.py,runner.py,paths.py,config.py,connection.py,pairing.py,local_pages.py,agent.py}`, `agent/tests/{fakes.py,test_config.py,test_connection.py,test_pairing.py,test_local_pages.py}`
- Modify: `scripts/check-monitor-identifiers.py` (Default-Bereich + `agent/`), `scripts/test_check_monitor_identifiers.py`

**Interfaces — Produces:**
- `Config.load(paths) -> Config` / `Config.save()` mit Feldern `server: str` (Standard `https://stagedesk.t410.de`), `token: str | None`, `slug`, `key`, `kiosk_url`, `power_method`, `power_config`, `update_window`, `auto_updates`, `daily_reboot`; Datei `config.json` Modus 600; `Config.clear_pairing()`.
- `backoff_delays() -> Iterator[float]`: 5, 10, 20, 40, 60, 60, … (Jitter ±10 % optional, in Tests abschaltbar).
- `Connection(config, on_message: Callable[[dict], None], on_auth_failed: Callable[[], None])` mit `run_forever()`, `send(msg: dict)`; URL `wss://<host>/ws/monitor/pi/<slug>/`, Header `Authorization: Bearer <token>`; Close-Code 4003 → `on_auth_failed`; antwortet auf `ping` mit `pong`.
- `PairingClient(config, http_post: Callable)`: `start() -> (code, pairing_id, expires_at)`, `poll(pairing_id) -> dict | None`; Schleife holt nach Ablauf neuen Code; Erfolg speichert `token`, `slug`, `key` in `Config`.
- `LocalPages(port=8765)`: HTTP-Server auf `127.0.0.1`; Zustand `show_code(code)`, `show_no_server()`, `show_test_pattern(screen_name, resolution, seconds=60)`, `show_none()`; Seiten-Texte wörtlich aus Spec §3.1/§5/§10 („Kopplungscode 482 913", „Im Stagedesk-Admin unter Monitore → Übersicht → Bildschirm koppeln eingeben.", „Keine Verbindung zum Server. Netzwerk prüfen."); Code mit Leerzeichen nach 3 Ziffern; große Schrift, dunkler Hintergrund, keine externen Ressourcen.
- `Agent` verbindet alles: ohne Token → Kopplungsschleife + `LocalPages.show_code`, Kiosk auf `http://127.0.0.1:8765/`; mit Token → `Connection`; `on_auth_failed` → `Config.clear_pairing()` und zurück zur Kopplung. Einstieg `python3 -m stagedesk_agent`.

- [ ] **Step 1: Failing tests:** `test_config_roundtrip_mode_600`, `test_backoff_sequence` (`[5,10,20,40,60,60]`), `test_auth_failed_4003_clears_token_and_restarts_pairing`, `test_pairing_requests_new_code_after_expiry`, `test_pairing_success_saves_token_slug_key`, `test_local_page_shows_code_grouped` („482 913"), `test_local_page_no_server_text`.
- [ ] **Step 2:** `cd agent && python3 -m unittest discover -s tests` → FAIL. **Step 3:** umsetzen. **Step 4:** grün; Guard-Tests grün.
- [ ] **Step 5: Commit** `feat(agent): Grundgerüst mit Kopplung und Verbindung`

### Task 7: Telemetrie und Power-Methoden

**Files:**
- Create: `agent/stagedesk_agent/{telemetry.py,power.py}`, `agent/tests/{test_telemetry.py,test_power.py}` mit Beispielausgaben in `agent/tests/samples/` (echte Formate von `iw dev wlan0 link`, `ip -j addr`, `vcgencmd measure_temp`, `vcgencmd get_throttled`, `/proc/meminfo`, `/etc/os-release`, `wlr-randr`)

**Interfaces — Produces:**
- `collect(runner, paths, now) -> dict` mit Gruppen `network {kind: "wifi"|"lan"|None, ssid, signal_dbm, ip, mac}`, `system {temperature_c, throttled_now: bool, throttled_since_boot: bool, disk_percent, ram_percent, uptime_s, model, serial, os, agent_version}`, `display {resolution, browser_running, power}`, `updates {last_at, last_ok, last_error, pending_packages, reboot_required_since}`; jede Quelle in eigenem `try`, Fehler → `None`.
- `make_power(method: str, config: dict, runner) -> PowerController` mit `set(on: bool) -> str` (Status-Text) und `status() -> str`:
  - `cec`: `cec-client -s -d 1` mit `on <dev>` / `standby <dev>` / `pow <dev>`; `config.cec_device` Standard `"0"`.
  - `hdmi`: `wlr-randr --output <output> --off|--on` als `pi` mit `WAYLAND_DISPLAY`/`XDG_RUNTIME_DIR=/run/user/1000`; Watchdog-Thread setzt `--off` alle 3 s erneut, solange aus gewünscht; `config.output` Standard `HDMI-A-1`.
  - `hybrid`: Aus per SICP über TCP (`config.display_ip`, `display_port` 5000, `monitor_id` 0; Paket wie in `scripts/stagedesk-power-hybrid.py`), An per CEC `on 0` + `as`.
  - `ddc`: `ddcutil setvcp D6 01|04` (`config.vcp_on`/`vcp_off`).
  Logik aus den alten Skripten übernommen; Status-Texte `an`, `standby`, `aus`, `Fehler: <Text>`.

- [ ] **Step 1: Failing tests:** `test_wifi_signal_and_ssid_parsed` (Beispiel → `-58`, `"KATH-Lehrer"`), `test_lan_has_no_signal`, `test_throttled_flags` (`0x50005` → now True, since True), `test_missing_vcgencmd_gives_none`, `test_reboot_required_since_from_file_mtime`, `test_cec_on_off_commands`, `test_hdmi_watchdog_reasserts_off`, `test_hybrid_off_sends_sicp_packet` (Bytes wie im alten Skript), `test_ddc_values`, `test_power_error_status_text`.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(agent): Telemetrie und Power-Methoden`

### Task 8: Befehle und Kiosk

**Files:**
- Create: `agent/stagedesk_agent/{kiosk.py,commands.py}`, `agent/tests/{test_kiosk.py,test_commands.py}`
- Modify: `agent/stagedesk_agent/agent.py` (`hello` → Kiosk/Power anwenden, `command` → ausführen, Telemetrie-Takt 60 s, `power_command` → Power)

**Interfaces — Produces:**
- `Kiosk(runner, paths)`: `apply(url: str) -> bool` schreibt `kiosk.env` (`KIOSK_URL=...`) nur bei Änderung und startet dann `stagedesk-kiosk` neu; `restart()`; `is_running() -> bool` (`systemctl is-active`).
- `execute(cmd: dict, ctx) -> tuple[bool, str]` für `reload` (wenn die Anzeige seit 2 min keine Display-Verbindung meldet: Kiosk-Neustart; sonst ok „Neu geladen"), `restart_browser`, `reboot` (erst Quittung senden, dann `systemctl reboot` nach 3 s), `power_on`/`power_off` (Power-Modul, kein Dauerzustand), `update_now` (Task 9 `Updater.run(manual=True)`), `screenshot` (`grim -o <output> /tmp/sd-shot.png` als `pi`, Upload `POST {server}/api/monitor/agent/screenshot` mit Bearer-Token), `test_pattern` (`LocalPages.show_test_pattern`, Kiosk 60 s auf lokale Seite, dann zurück auf `kiosk_url`). Unbekannt → `(False, "Unbekannter Befehl")`.
- Jede Ausführung sendet `command_result {id, ok, text}`.

- [ ] **Step 1: Failing tests:** `test_kiosk_apply_writes_and_restarts_only_on_change`, `test_reboot_acknowledged_before_reboot`, `test_screenshot_uploads_with_token`, `test_test_pattern_returns_to_kiosk_url_after_60s` (Uhr gefälscht), `test_power_command_from_server_switches_display`, `test_unknown_command_fails`.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(agent): Befehle und Kiosk-Steuerung`

### Task 9: Updates, täglicher Neustart, Selbst-Update

**Files:**
- Create: `agent/stagedesk_agent/{updater.py,self_update.py,timers.py}`, `agent/tests/{test_updater.py,test_self_update.py,test_timers.py}`

**Interfaces — Produces:**
- `timers.write_timers(update_window, auto_updates, daily_reboot, runner, paths)`: schreibt `stagedesk-agent-update.timer` (`OnCalendar=<Wochentag> <from>`, `RandomizedDelaySec` innerhalb des Fensters) und `stagedesk-agent-reboot.timer` (`04:00`), aktiviert/deaktiviert, `systemctl daemon-reload` nur bei Änderung. Die Timer-Services führen `systemctl kill --signal=SIGUSR1 stagedesk-agent` (Update) bzw. `--signal=SIGUSR2` (täglicher Neustart) aus; der laufende Agent behandelt die Signale und nutzt seine bestehende Verbindung für Sperrabfrage und Ergebnis.
- `Updater.run(manual: bool) -> dict`: ohne `manual` erst `update_gate_request` (abgelehnt → Ergebnis `{"skipped": reason}`); `apt-get update`, dann `DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::=--force-confold full-upgrade` mit Gesamt-Zeitlimit 60 min; Paketzahl aus der Ausgabe; Neustart nur ohne `manual`, wenn `/var/run/reboot-required` existiert und eine zweite Sperrabfrage frei ist; sendet `update_result {at, packages, rebooted, error}`.
- `daily_reboot()`: Sperre fragen, dann `systemctl reboot`.
- `SelfUpdater.check(hello)`: `hello.agent_version` > eigene (Vergleich per Tupel) → Download `{server}/api/monitor/agent/stagedesk-agent-<v>.tar.gz`, SHA-256 gegen `hello.agent_sha256`, entpacken nach `/opt/stagedesk-agent.new`, Tausch (`/opt/stagedesk-agent` → `.prev`, `.new` → aktiv), Datei `pending-confirm` mit Zeitstempel, Neustart des Dienstes. Beim Start mit `pending-confirm`: nach erstem erfolgreichem `hello` Datei löschen und Ereignis per `agent_updated`-Telemetrie-Feld melden. Rückfall: `stagedesk-agent-rollback.timer` (2 min nach Tausch) stellt `.prev` wieder her, wenn `pending-confirm` noch existiert.

- [ ] **Step 1: Failing tests:** `test_timer_oncalendar_from_window` (`{"weekday":6,"from":"03:00"}` → `Sun 03:00`), `test_sigusr1_starts_update_sigusr2_daily_reboot`, `test_auto_updates_off_disables_timer`, `test_sigusr1_starts_update_sigusr2_daily_reboot`, `test_update_skipped_when_gate_denied`, `test_update_reboots_only_if_required_and_allowed`, `test_manual_update_never_reboots`, `test_update_timeout_reports_failure`, `test_self_update_rejects_bad_checksum`, `test_self_update_swaps_and_marks_pending`, `test_rollback_restores_prev_when_unconfirmed`, `test_confirm_clears_pending_after_hello`.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(agent): Updates, Neustart und Selbst-Update`

### Task 10: Installation, Auslieferung und Ende-zu-Ende-Test

**Files:**
- Create: `agent/install.sh`, `agent/systemd/{stagedesk-agent.service,stagedesk-kiosk.service}`, `agent/kiosk/kiosk.sh` (cage + Chromium wie `docs/raspberry-pi-monitor.md` §3, URL aus `/etc/stagedesk-agent/kiosk.env`), `backend/monitor/agent_package.py`, `backend/monitor/tests_agent_package.py`, `backend/monitor/tests_agent_e2e.py`
- Modify: `backend/monitor/api_devices.py` (öffentliche Routen)

**Interfaces — Produces:**
- `agent_package.agent_package_info() -> tuple[str, str]` (Version aus `agent/VERSION`, SHA-256 des Pakets); `build_package() -> bytes` (tar.gz aus `agent/stagedesk_agent/`, `agent/systemd/`, `agent/kiosk/`, `agent/VERSION`; ohne `tests/`, ohne `__pycache__`; deterministisch: feste mtime 0, sortierte Einträge); Ergebnis im Prozess-Cache nach Version.
- Routen (öffentlich): `GET /agent/install.sh` (Text, `install.sh` mit eingesetzter Server-URL aus `PUBLIC_BASE_URL`), `GET /agent/version` → `{version, sha256}`, `GET /agent/stagedesk-agent-{version}.tar.gz` (404 bei anderer Version).
- `install.sh` (idempotent, `set -euo pipefail`): Schritte aus Spec §9 in dieser Reihenfolge; prüft `/etc/os-release` auf `VERSION_CODENAME=bookworm`; Pakete `python3-websocket cage chromium-browser cec-utils ddcutil wlr-randr grim iw`; lädt Paket, prüft SHA-256 aus `/agent/version`; legt Dienste an; deaktiviert `stagedesk-power.service`, `kiosk.service` und einen vorhandenen alten Neustart-Timer/Cron-Eintrag (`/etc/cron.d/stagedesk-reboot` laut Doku §7, falls vorhanden); `systemctl enable --now stagedesk-agent stagedesk-kiosk`; Ausgabe am Ende: „Fertig. Der Bildschirm zeigt jetzt einen Kopplungscode."
- E2E-Test: startet `channels.testing.ChannelsLiveServerTestCase` (oder Daphne in einem Thread), startet den echten `Agent` mit `FakeRunner` in einem Thread gegen diesen Server, koppelt über die API, wartet auf `hello`, prüft Telemetrie in `Device.last_telemetry`, legt Befehl `restart_browser` an und erwartet Status `ok`, entkoppelt und erwartet, dass der Agent wieder einen Code anfordert.

- [ ] **Step 1: Failing tests:** `test_version_endpoint_matches_package_hash`, `test_package_contains_no_tests_or_secrets` (keine Dateien unter `tests/`, kein `.env`, keine Strings `token=`), `test_package_deterministic`, `test_install_script_served_with_base_url`, `test_e2e_pair_hello_telemetry_command_unpair`.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen; `bash -n agent/install.sh` und, falls verfügbar, `shellcheck agent/install.sh agent/kiosk/kiosk.sh`. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(agent): Installationsskript, Auslieferung und Ende-zu-Ende-Test`

## Etappe 3: Admin

### Task 11: Koppeln und Geräte-Spalte in der Übersicht

**Files:**
- Create: `frontend/src/components/monitor-admin/shared/{PairDialog.jsx,deviceStatus.js,deviceStatus.test.js}`
- Modify: `frontend/src/components/monitor-admin/shared/api.js` (`getDevices`, `pairDevice`, `unpairDevice`, `revokeDevice`, `sendDeviceCommand`, `getDeviceCommand`, `getScreenEvents`), `pages/Overview.jsx`, `shared/ScreenTable.jsx`, `shared/ScreenStatus.jsx`, `shared/overviewData.js` (Status kommt aus `GET /devices`; Rückfall auf `cec_status_at` nur bei `legacy`)
- Modify: `frontend/scripts/shoot-admin.mjs`, `frontend/tests/admin-fixtures/` (Geräte-Fixtures)

**Interfaces:**
- Consumes: Routen aus Tasks 2 und 4.
- Produces: `deviceStatusView(device) -> {tone: 'ok'|'warn'|'bad'|'off'|'none', label, detail}` für Ampel-Darstellung (Farben semantisch: grün/gelb/rot/grau).
- `PairDialog`: Schritt 1 Code (6 Ziffern, Eingabe mit Leerzeichen erlaubt), Schritt 2 „Vorhandener Bildschirm" (Auswahl) oder „Neuer Bildschirm" (Name, Ort), „Koppeln"; Fehler über `errorText`; Erfolg: Toast „Bildschirm <Name> ist gekoppelt." und Liste neu laden.
- Knopf „Bildschirm koppeln" aktiv nur mit `monitor.devices`; der Hinweis „Kopplung folgt mit dem Geräte-Agent." entfällt.
- Spalte „Gerät": Ampel + Text, WLAN dBm, Temperatur, Agent-Version; „Kein Gerät gekoppelt" / „Altes Skript".

- [ ] **Step 1: Failing vitest:** `deviceStatusView` je Status (online, warning mit erstem Warnungstext, offline mit „zuletzt gesehen HH:MM", off, legacy, unpaired); `PairDialog` normalisiert „482 913" zu `482913`, blockiert bei weniger als 6 Ziffern.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** vitest/Build/Token grün; Screenshots `overview` (neu), `overview-pair-dialog`, `overview-pair-new-screen` ansehen.
- [ ] **Step 5: Commit** `feat(monitor-admin): Bildschirme koppeln und Gerätestatus`

### Task 12: Geräte-Box, Updates und Protokoll im Bildschirm-Detail

**Files:**
- Create: `frontend/src/components/monitor-admin/shared/{DeviceBox.jsx,DeviceLog.jsx,deviceCommands.js,deviceCommands.test.js}`
- Modify: `frontend/src/components/monitor-admin/pages/ScreenDetail.jsx`, `pages/screenData.js` (+ Tests), `shoot-admin.mjs`, Fixtures

**Interfaces — Produces:**
- `DeviceBox`: Telemetrie-Gruppen „Netz", „System", „Anzeige", „Updates" mit „Stand HH:MM"; Befehle „Neu laden", „Browser neu starten", „Pi neu starten" (Nachfrage „Pi jetzt neu starten? Die Anzeige ist etwa eine Minute weg."), „Bildschirm an", „Bildschirm aus" (nur mit `monitor.power`), „Jetzt aktualisieren" (Nachfrage „Updates jetzt installieren? Ein nötiger Neustart wird danach hier angezeigt und nicht automatisch ausgeführt."), „Screenshot aufnehmen", „Testbild"; nach dem Senden alle 2 s `getDeviceCommand` bis `ok|failed|expired` (höchstens 2 min), Ergebnis als Toast; letzter Screenshot mit Zeitpunkt (Klick öffnet groß); „Entkoppeln" und „Token zurückziehen" (danger, Nachfrage mit Folge: „Der Pi zeigt danach wieder einen Kopplungscode.").
- `deviceCommands.commandsFor(device, perms) -> list` (welche Knöpfe sichtbar/aktiv; offline → Hinweis „Der Befehl wird gesendet, sobald das Gerät wieder verbunden ist (höchstens 5 Minuten).").
- Abschnitt „Ein- und Ausschalten": Feld „Steuerung des Bildschirms" (CEC / HDMI-Ausgang / Hybrid (SICP aus, CEC an) / DDC/CI) mit den Feldern je Methode (CEC-Gerät; HDMI-Ausgang; SICP-IP, Port, Monitor-ID; DDC-Werte an/aus); nur mit `monitor.devices` editierbar; im seitenweiten SaveBar-Modell.
- Abschnitt „Updates": „Automatische Updates" (Schalter), Zeitfenster (Wochentag, von, bis), „Täglicher Neustart um 04:00"; `monitor.devices`.
- Abschnitt „Protokoll" (`DeviceLog`): `getScreenEvents`, Filter nach Art („Alle", „Verbindung", „Warnungen", „Updates", „Befehle", „Kopplung"), Zeilen mit Zeit, Art, Text, Person; leer: „Noch keine Einträge."

- [ ] **Step 1: Failing vitest:** `commandsFor` (Power-Knöpfe nur mit `monitor.power`; ohne `monitor.devices` keine Befehle); `screenData` Abbildung der neuen Felder auf den Payload (nur geänderte, `update_window`-Validierung `from < until`); `DeviceBox` fragt nach Senden bis `ok` nach und stoppt bei Unmount.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** grün; Screenshots `screen-detail-device`, `screen-detail-device-offline`, `screen-detail-log`, `screen-detail-reboot-confirm` ansehen.
- [ ] **Step 5: Commit** `feat(monitor-admin): Geräte-Box, Updates und Protokoll`

### Task 13: Einstellungen → Geräte

**Files:**
- Modify: `frontend/src/components/monitor-admin/pages/Settings.jsx`, `pages/settingsData.js` (+ Tests), `shoot-admin.mjs`, Fixtures

**Interfaces — Produces:** Abschnitt „Geräte" (`monitor.setup`): „Offline melden nach" (Minuten), „Warnung ab Temperatur" (°C), „Warnung ab Speicherbelegung" (%), „Warnung bei WLAN schwächer als" (dBm), „Warnung, wenn Neustart nötig seit" (Tagen), Schalter „Nur Geräte mit Token zulassen" mit Hinweis „Noch mit altem Skript: <Namen>." bzw. „Alle Bildschirme nutzen den Agent.", Installationsbefehl `curl -fsSL https://stagedesk.t410.de/api/monitor/agent/install.sh | sudo bash` mit „Kopieren". Bereiche wie Task 4.

- [ ] **Step 1: Failing vitest:** Bereichsprüfung blockiert Speichern mit deutschem Hinweis; Payload enthält nur geänderte Geräte-Felder.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** grün; Screenshot `settings-devices` ansehen.
- [ ] **Step 5: Commit** `feat(monitor-admin): Geräte-Einstellungen`

### Task 14: Doku und Abschluss

**Files:**
- Modify: `docs/raspberry-pi-monitor.md` (neuer Hauptweg: SD-Karte → `install.sh` → koppeln; Handabschnitte Kiosk/Power/Cursor/Neustart als „Ohne Agent (alt)" ans Ende), `DEPLOY.md` (Abschnitt „Geräte-Agent": Timer `stagedesk-device-watch` installieren, `PUBLIC_BASE_URL` in `.env`, Umstellung glocke/mensa laut Spec §12, „Nur Geräte mit Token zulassen" erst danach), `CLAUDE.md` (Monitor-Abschnitt: `agent/`, Kopplung, Agent-Tests), `docs/superpowers/screenshots/2026-10-19-monitor/README.md`

- [ ] **Step 1:** Doku schreiben (deutsch, keine Em-Dashes, keine Zugangsdaten).
- [ ] **Step 2: Gesamtprüfung:** Backend `python manage.py test` und `makemigrations --check --dry-run`; `migrate monitor 0042 && migrate` auf einer Dev-DB-Kopie; Agent-Tests; Frontend vitest/Build/`check:tokens`/`test:tokens`; Guard + Unittests; `bash -n agent/install.sh`.
- [ ] **Step 3: Commit** `docs(monitor): Geräte-Agent einrichten und betreiben`
