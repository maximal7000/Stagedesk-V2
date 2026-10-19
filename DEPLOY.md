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

Migrationen: `monitor` 0035 bis 0038, `users` 0015. Alte Pi-Displays laden sich über den Übergangsschlüssel `neu_laden_zeit` innerhalb von ca. 2 Minuten selbst neu. `/bildschirm/power`, `/onair` und `/notfall` bleiben als Aliase bestehen.

1. **Backup:** Backup-Tag setzen, Tarball und DB-Dump nach `~/stagedesk-backups/` (`pg_dump`, siehe oben).
2. **`.env`:** In `/opt/stagedesk/backend/.env` die Variablen `NAHSH_HAFAS_AID` und `SWHL_STORYBLOK_TOKEN` eintragen (Werte nie committen).
3. **Probelauf:** Produktions-Dump in eine Test-DB einspielen, `python manage.py migrate` ausführen, Stichprobe: eine Ansicht, ein Bildschirm, eine Klausur, eine Version.
4. **Deploy:** `ssh -o BatchMode=yes root@t410.de "bash /opt/stagedesk/scripts/deploy.sh"`.
   Hinweis: `deploy.sh` führt `migrate` vor Build und Neustart aus. Im Deploy-Fenster können `/display`, ATEM `/onair` und die Pi-Power-Abfragen kurz Fehler liefern. Während des Deploys den ATEM nicht schalten; die Displays erholen sich von selbst.
5. **Prüfen:** `/api/monitor/display?screen=glocke` und `?screen=mensa` laden, ATEM On-Air einmal ein- und ausschalten. Sichtprüfung: glocke und mensa haben sich innerhalb von ca. 2 Minuten in die neue Oberfläche neu geladen.
   Das alte `GET /bildschirm/power` behält seine Schlüssel der obersten Ebene, die Zeitplan-Einträge darin nutzen aber jetzt `days`/`from`/`until`. Die Pi-Skripte im Repo nutzen den WebSocket; relevant nur für eigene Cron-Skripte.
6. **Rollback (Reihenfolge):** Zuerst beide Migrationen zurückfahren, bevor der Code zurückgesetzt wird: `python manage.py migrate monitor 0034` und `python manage.py migrate users 0014`. Erst danach Code auf den Backup-Tag zurücksetzen und `tag-backend.service` neu starten.

---

## V1-Backup

`/srv/t-ag/` wurde in `/srv/t-ag-backup/` verschoben. Wird nicht mehr von einem Service angefasst.
