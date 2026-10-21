# Stagedesk V2 — Deployment (t410.de)

Produktions-Setup auf `stagedesk.t410.de`:

- Code: `/opt/stagedesk/`
- DB: PostgreSQL 16 (lokal auf Server)
- ASGI: Daphne via Unix-Socket `/run/t-ag.sock`
- Systemd: `tag-backend.service`
- Nginx: `/etc/nginx/sites-enabled/tag` (TLS via Certbot)
- Keycloak: `https://auth.t410.de/realms/technik-ag`

## Einmaliges Setup

### 1. Postgres

```bash
sudo -u postgres psql <<SQL
CREATE USER stagedesk WITH PASSWORD 'DEIN-PASSWORT';
CREATE DATABASE stagedesk OWNER stagedesk;
SQL
```

### 2. Code + .env

```bash
cd /opt/stagedesk
# Altes SQLite sichern, falls vorhanden
mv backend/db.sqlite3 backend/db.sqlite3.bak-$(date +%F) 2>/dev/null || true

cp backend/.env.example backend/.env
$EDITOR backend/.env   # SECRET_KEY, DB_PASSWORD, Realm etc. setzen

python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
# Output in DJANGO_SECRET_KEY in backend/.env einfügen
```

### 3. Keycloak-Realm `technik-ag`

In der Admin-Console `https://auth.t410.de/admin`:

1. **Create Realm** → Name `technik-ag`.
2. **Clients → Create client**:
   - Client ID: `stagedesk`
   - Client authentication: OFF (public)
   - Standard flow ON
   - Valid redirect URIs: `https://stagedesk.t410.de/*`, `https://tag.t410.de/*`
   - Valid post logout redirect URIs: analog
   - Web origins: `+`
3. **Realm settings → Login**: „Login with email" aktivieren.
4. **Users**: mindestens einen Admin-User anlegen mit Passwort. Nach erstem Login im Backend unter `/admin` oder über Django-Shell `is_admin` im UserProfile setzen.

### 4. Systemd & Nginx

```bash
# Service (falls noch nicht vorhanden, sonst nur prüfen)
cp /opt/stagedesk/scripts/stagedesk-backend.service.example /etc/systemd/system/tag-backend.service
systemctl daemon-reload
systemctl enable tag-backend

# Nginx-Config vergleichen; bestehende ist bereits kompatibel
diff /etc/nginx/sites-available/tag /opt/stagedesk/scripts/nginx-stagedesk.conf.example
```

### 5. Erster Deploy

```bash
chmod +x /opt/stagedesk/scripts/deploy.sh
bash /opt/stagedesk/scripts/deploy.sh
```

---

## Updates (nachdem Setup steht)

```bash
bash /opt/stagedesk/scripts/deploy.sh
```

Das Script macht: `git pull` → `pip install` → `migrate` → `collectstatic` → `npm ci && build` → `systemctl restart tag-backend && reload nginx`.

---

## Rollback

```bash
cd /opt/stagedesk
git log --oneline -10
git checkout <commit-sha>
bash scripts/deploy.sh
```

Bei DB-Migrationsproblemen: pg_dump vorher sichern.

```bash
pg_dump -U stagedesk stagedesk > /root/stagedesk-$(date +%F).sql
```

---

## Frontend-.env

`frontend/.env.production` ist in `.gitignore`. Vorlage: `frontend/.env.production.example`.
Das Deploy-Script kopiert beim ersten Lauf die Vorlage nach `.env.production`. Für Änderungen entweder die Vorlage committen und löschen der realen Datei auf dem Server (wird beim nächsten Deploy neu erstellt), oder direkt auf dem Server editieren.

---

## Monitore wiederherstellen

Nach dem ersten Deploy mit frischer DB:

1. Login als Admin auf `https://stagedesk.t410.de`.
2. `/admin/monitor` → Profile neu anlegen.
3. Bildschirme neu anlegen (Name + Slug).
4. Power-Zeitplan / Ferienmodus / Ausnahmen setzen.
5. Monitor-URL: `https://stagedesk.t410.de/monitor?screen=<slug>` (alt: `?bildschirm=`, funktioniert weiter).
6. Raspberry-Pi-Power-Script pollt `https://stagedesk.t410.de/api/monitor/screen/power?slug=<slug>`.

---

## Monitor Schritt 0 (englische Umbenennung)

Migrationen: `monitor` 0035 bis 0038, `users` 0015. Alte Pi-Displays luden sich damals über den Übergangsschlüssel `neu_laden_zeit` selbst neu; der Schlüssel ist mit "Monitor Anzeige und Admin" entfallen. Neu laden geht jetzt über "Neu laden" im Monitor-Admin (WebSocket `ws/monitor/display/<slug>/`, ältere Anzeigen über `reload_requested_at` in `/display`). `/bildschirm/power`, `/onair` und `/notfall` bleiben als Aliase bestehen.

1. **Backup:** Backup-Tag setzen, Tarball und DB-Dump nach `~/stagedesk-backups/` (`pg_dump`, siehe oben).
2. **`.env`:** In `/opt/stagedesk/backend/.env` die Variablen `NAHSH_HAFAS_AID` und `SWHL_STORYBLOK_TOKEN` eintragen (Werte nie committen).
3. **Probelauf:** Produktions-Dump in eine Test-DB einspielen, `python manage.py migrate` ausführen, Stichprobe: eine Ansicht, ein Bildschirm, eine Klausur, eine Version.
4. **Deploy:** `ssh -o BatchMode=yes root@t410.de "bash /opt/stagedesk/scripts/deploy.sh"`.
   Hinweis: `deploy.sh` führt `migrate` vor Build und Neustart aus. Im Deploy-Fenster können `/display`, ATEM `/onair` und die Pi-Power-Abfragen kurz Fehler liefern. Während des Deploys den ATEM nicht schalten; die Displays erholen sich von selbst.
5. **Prüfen:** `/api/monitor/display?screen=glocke` und `?screen=mensa` laden, ATEM On-Air einmal ein- und ausschalten. Sichtprüfung: glocke und mensa haben sich innerhalb von ca. 2 Minuten in die neue Oberfläche neu geladen.
   Das alte `GET /bildschirm/power` behält seine Schlüssel der obersten Ebene, die Zeitplan-Einträge darin nutzen aber jetzt `days`/`from`/`until`. Die Pi-Skripte im Repo nutzen den WebSocket; relevant nur für eigene Cron-Skripte.
6. **Rollback (Reihenfolge):** Zuerst beide Migrationen zurückfahren, bevor der Code zurückgesetzt wird: `python manage.py migrate monitor 0034` und `python manage.py migrate users 0014`. Erst danach Code auf den Backup-Tag zurücksetzen und `tag-backend.service` neu starten.

---

## Monitor Anzeige und Admin

Neue Anzeige unter `/monitor` und neues Admin unter `/monitor-admin`. Migrationen: `monitor` 0039 bis 0042, `users` 0016. Neue Python-Abhängigkeit `pypdfium2` (PDF-Seiten rendern); `deploy.sh` installiert sie über `pip install -r requirements.txt`.

### Rechte

`monitor.edit` wird durch Migration `users` 0016 aufgeteilt. Gruppen und Nutzer, die `monitor.edit` hatten, bekommen `monitor.setup`, `monitor.exams`, `monitor.media` und `monitor.power`; danach entfällt `monitor.edit`. `monitor.view`, `monitor.onair` und `monitor.emergency` bleiben unverändert.

| Recht | Erlaubt |
|---|---|
| `monitor.view` | Übersicht ansehen (Voraussetzung für alle Admin-Seiten) |
| `monitor.setup` | Ansichten, Bildschirme, Einstellungen, Vorschau, Neu laden |
| `monitor.exams` | Klausuren, Klausur-Vorlagen, Termine, Ankündigungen |
| `monitor.media` | Medien hochladen und löschen |
| `monitor.power` | An/aus, "bis Tagesende aus", Ferien, Zeitpläne |
| `monitor.onair` | On-Air |
| `monitor.emergency` | Notfall und Notfall-Vorlagen |
| `monitor.devices` | Geräte koppeln, Geräte-Befehle, Warnschwellen (siehe "Geräte-Agent") |

Die Aufteilung erlaubt es, später etwa Hausmeister (`view` + `power`) oder Sekretariat (`view` + `exams`) einzelne Teile zu geben, ohne Zugriff auf die Einrichtung. Nach der Migration ändert sich für Bestandsnutzer nichts.

### Ablauf

1. **Backup:** Backup-Tag setzen, Tarball und DB-Dump nach `~/stagedesk-backups/` (`pg_dump`, siehe oben).
2. **Probelauf:** Produktions-Dump in eine Test-DB einspielen und `python manage.py migrate` ausführen. Stichprobe: Ansichten haben einen Typ (Vertretungsplan, Info, Abfahrten, Medien, Wechsel), Bildschirme zeigen auf ihre Standard-Ansicht, Gruppen mit `monitor.edit` haben jetzt `setup`, `exams`, `media` und `power`.
3. **Deploy:** `ssh -o BatchMode=yes root@t410.de "bash /opt/stagedesk/scripts/deploy.sh"`. Wie in Schritt 0 können `/display`, `/onair` und die Pi-Power-Abfragen im Deploy-Fenster kurz Fehler liefern.
Schritte 4 und 5 laufen auf dem Server im venv und als derselbe Nutzer wie `tag-backend.service`, damit die gerenderten Seiten in `media/monitor/pages` dem Dienst gehören. Laut `scripts/stagedesk-backend.service.example` ist das `root` (Gruppe `www-data`), also direkt in der `ssh root@t410.de`-Sitzung; vorher mit `systemctl show -p User -p Group tag-backend.service` gegenprüfen und bei abweichendem Nutzer mit `sudo -u <nutzer>` ausführen:

```bash
cd /opt/stagedesk/backend && source venv/bin/activate
```

4. **Medien rendern:** `python manage.py monitor_render_media`. Die Migration rendert keine Dateien; bis zu diesem Schritt zeigen Medien-Ansichten nichts. Der Befehl ist idempotent und darf erneut laufen.
5. **WebUntis prüfen:** `python manage.py monitor_webuntis_check`. Gibt pro Weg nur "geht" oder "geht nicht" aus, keine Daten.
6. **Sichtprüfung:** glocke und mensa im Admin über "Neu laden" neu laden (sonst geschieht das spätestens beim nächtlichen Neuladen bzw. Neustart gegen 4 Uhr) und vor Ort ansehen. Pis, die noch das alte Frontend geladen haben, reagieren auf das erste "Neu laden" unter Umständen nicht: dann ein zweites Mal drücken oder auf dem Pi `sudo systemctl restart kiosk.service` ausführen.
7. **Kiosk-URL pro Pi:** Im Admin unter Bildschirme den Bildschirm öffnen, die Kiosk-URL (mit `key`) kopieren und in `kiosk.sh` auf dem Pi eintragen, dabei `?zoom=` entfernen. Ein `zoom` in der URL überstimmt die Skalierung aus dem Admin; die Admin-URL enthält deshalb kein `zoom`. Ohne Schlüssel funktioniert die alte URL weiter, der Vertretungsplan erscheint dann nur als iframe wie bisher. Details: `docs/raspberry-pi-monitor.md`.
8. **Rückweg (Reihenfolge):** Vorher im Admin Notfall und On-Air ausschalten: der Rückweg kopiert den globalen Zustand in jede Ansicht, ein aktiver Notfall stünde danach auf allen alten Ansichten. Dann die Migrationen zurückfahren (im venv wie bei Schritt 4): `python manage.py migrate monitor 0038` und `python manage.py migrate users 0015`. Erst danach Code auf den Backup-Tag zurücksetzen und `tag-backend.service` neu starten.

### Nach dem Deploy

- **Geheime Werte:** WebUntis-Passwort und Wetter-Schlüssel lassen sich in den Einstellungen nur noch setzen, nicht auslesen. Das Admin zeigt "Gespeichert" statt des Werts.
- **Notfall:** Wird manuell im Admin ausgelöst und ist nicht mit der Brandmeldeanlage verbunden.
- **Kopplung:** Das Eintragen der Kiosk-URL von Hand entfällt mit dem Geräte-Agent (nächster Abschnitt).

## Geräte-Agent

Agent auf den Pis (`agent/`), Kopplung, Telemetrie, Befehle und Überwachung. Migration `monitor` 0043. Anleitung für die Pis: `docs/raspberry-pi-monitor.md`.

**Server und Agent gemeinsam ausrollen.** Der Server schickt in der Antwort `update_gate` die Anfrage-ID des Agents zurück, und der Agent ordnet die Antwort nur über diese ID zu. Ein Agent und ein Server, die nicht zusammenpassen, bekommen deshalb keine Update-Freigabe.

### Ablauf

1. **Backup:** Backup-Tag, Tarball und DB-Dump wie oben.
2. **`.env`:** `PUBLIC_BASE_URL` in `/opt/stagedesk/backend/.env` setzen, falls abweichend (Standard `https://stagedesk.t410.de`). Der Wert steht im ausgelieferten `install.sh` und in der Kiosk-URL.
3. **Deploy:** `ssh -o BatchMode=yes root@t410.de "bash /opt/stagedesk/scripts/deploy.sh"`. Die Auslieferung des Agents läuft über `/api/monitor/agent/` (`install.sh`, `version`, `stagedesk-agent-<version>.tar.gz`), nginx bleibt unverändert.
4. **Überwachungs-Timer installieren (einmalig):**

```bash
cp /opt/stagedesk/scripts/stagedesk-device-watch.service /opt/stagedesk/scripts/stagedesk-device-watch.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now stagedesk-device-watch.timer
```

   Der Timer ruft jede Minute `python manage.py monitor_device_watch` auf (Ampel, Warnungen, Benachrichtigungen). Prüfen mit `systemctl list-timers stagedesk-device-watch.timer` und `journalctl -u stagedesk-device-watch -n 20`.
5. **Pis umstellen:** auf glocke und mensa per SSH den Installationsbefehl ausführen (Voraussetzung: Raspberry Pi OS (Legacy, Bookworm), Benutzer `pi` mit ID 1000):

```bash
curl -fsSL https://stagedesk.t410.de/api/monitor/agent/install.sh | sudo bash
```

   Das Skript schaltet `stagedesk-power.service`, `kiosk.service` und den alten 04:00-Neustart ab (Dateien bleiben liegen). Danach im Admin unter Übersicht "Bildschirm koppeln", Power-Methode prüfen (glocke: CEC; mensa: laut altem Skript CEC).
6. **Abnahme auf glocke (Hardware):** koppeln; Befehle Neu laden, Browser neu starten, Bildschirm an und aus; Screenshot aufnehmen; Testbild; Jetzt aktualisieren. Dann den Rückfall-Timer des Selbst-Updates prüfen: Beim Scharfstellen darf `stagedesk-agent-rollback.service` **nicht sofort** starten (`systemctl list-timers`), nach einem Neustart des Pi feuert er etwa 2 Minuten später (`journalctl -u stagedesk-agent-rollback`). Meldet sich der Agent bis dahin mit der neuen Version, wird der Timer entfernt.
7. **Erst danach** in den Einstellungen unter Geräte "Nur Geräte mit Token zulassen" einschalten. Der Schalter zeigt, welche Bildschirme noch ein altes Skript nutzen; solange ein Pi ohne Agent läuft, bleibt der Schalter aus, sonst verliert er die Verbindung.
8. **Rückweg:** zuerst die Migration zurückfahren (im venv): `python manage.py migrate monitor 0042`. Dann Code auf den Backup-Tag zurücksetzen und `tag-backend.service` neu starten. Den Timer mit `systemctl disable --now stagedesk-device-watch.timer` abschalten. Pis mit Agent können sich danach nicht mehr melden; die alten Skripte liegen noch auf den Pis und lassen sich mit `systemctl enable --now stagedesk-power.service kiosk.service` wieder starten, nachdem `stagedesk-agent.service` und `stagedesk-kiosk.service` gestoppt und deaktiviert sind.

### Hinweise

- **Selbst-Update** des Agents ersetzt nur den Python-Code. Änderungen an `agent/systemd/*` oder `agent/kiosk/kiosk.sh` erreichen die Pis erst, wenn `install.sh` dort erneut läuft (Kopplung bleibt erhalten).
- **Neue Agent-Version ausliefern:** `agent/VERSION` erhöhen und deployen. Der Server baut das Paket beim ersten Abruf neu, die Pis ziehen es in ihrem Update-Fenster.
- **Alte Skripte** (`scripts/stagedesk-power*.py`, Kiosk-Anleitung ohne Agent) bleiben im Repo, bis alle Pis umgestellt sind. Das Entfernen ist ein eigener Schritt.
- **Tests:** `cd agent && python3 -m unittest discover -s tests`. Der E2E-Test im Backend (`monitor/tests_agent_e2e.py`) braucht `websocket-client`: `pip install -r backend/requirements-dev.txt`.

---

## V1-Backup

`/srv/t-ag/` wurde in `/srv/t-ag-backup/` verschoben. Wird nicht mehr von einem Service angefasst.
