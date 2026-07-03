# Stagedesk-Monitor auf einem Raspberry Pi einrichten

Komplette Anleitung von der SD-Karte bis zum fertigen Wand-Monitor, der
nach dem Einschalten (auch nach Stromausfall) automatisch im Vollbild die
Stagedesk-Monitorseite anzeigt – **ohne Mauszeiger**, mit automatischem
Neuladen bei WLAN-Aussetzern und optionaler TV-An/Aus-Steuerung per HDMI-CEC.

> Getestet auf Raspberry Pi OS **Bookworm/Trixie Lite (64-bit)** mit
> `cage` als Kiosk-Compositor und `chromium`.

---

## 0. Voraussetzungen

- Raspberry Pi (3/4/5) + Netzteil
- microSD-Karte **mind. 16 GB** (8 GB läuft beim Update voll, 4 GB reicht nicht)
- HDMI-Monitor/TV, der **eingeschaltet** ist (sonst findet `cage` keinen Ausgang)
- Die öffentliche Stagedesk-URL, z. B. `https://stagedesk.t410.de`
  - Aufgaben-Monitor: `…/aufgaben-monitor`
  - Allgemeiner Monitor: `…/monitor`

---

## 1. SD-Karte mit dem Imager schreiben

1. **Raspberry Pi Imager** öffnen.
2. OS wählen: **Raspberry Pi OS Lite (64-bit)** (kein Desktop nötig).
3. Vor dem Schreiben auf das Zahnrad / „Einstellungen bearbeiten":
   - **Hostname**: z. B. `rpi-monitor-mensa`
   - **SSH aktivieren** (Passwort oder Public-Key)
   - **Benutzer**: `pi` + Passwort
   - **WLAN**: SSID + Passwort + Land `DE`
   - **Zeitzone**: `Europe/Berlin`
4. Karte schreiben, in den Pi stecken, Strom dran.

---

## 2. Erstes Login & System aktualisieren

```bash
ssh pi@rpi-monitor-mensa.local      # oder per IP, z. B. ssh pi@192.168.x.x
sudo apt update && sudo apt full-upgrade -y
```

> **Host-Key-Warnung nach Neu-Flashen?** Auf dem PC einmal
> `ssh-keygen -R <IP-oder-Hostname>` ausführen, dann neu verbinden.

### Kiosk-Pakete installieren

```bash
sudo apt install -y --no-install-recommends cage chromium x11-apps
```

- `cage` – minimaler Wayland-Kiosk-Compositor (zeigt genau eine Vollbild-App)
- `chromium` – der Browser. **Achtung:** Das Paket heißt `chromium`, **nicht**
  `chromium-browser` (sonst „no installation candidate").
- `x11-apps` – liefert `xcursorgen` (für das unsichtbare Cursor-Theme)

---

## 3. Kiosk-Startskript

```bash
nano /home/pi/kiosk.sh
```

```bash
#!/bin/bash
URL="https://stagedesk.t410.de/aufgaben-monitor"   # <-- eigene URL (4K? siehe Abschnitt 5a: ?zoom=2)

# Auf Netzwerk warten (max ~60s), damit Chromium nicht die Fehlerseite lädt
for i in $(seq 1 30); do
  curl -sf --max-time 3 "$URL" -o /dev/null && break
  sleep 2
done

# "Wiederherstellen?"-Bubble nach Stromausfall verhindern
PREF="$HOME/.config/chromium/Default/Preferences"
[ -f "$PREF" ] && sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PREF"

exec chromium \
  --kiosk "$URL" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --no-first-run \
  --check-for-update-interval=31536000 \
  --ozone-platform=wayland \
  --start-fullscreen
```

Ausführbar machen:

```bash
chmod +x /home/pi/kiosk.sh
```

---

## 4. Autostart per systemd (inkl. Crash-Recovery)

Damit `cage` aus einem systemd-Service Zugriff auf Grafik und „Seat" bekommt,
sind drei Dinge nötig: passende Gruppen, kein konkurrierendes Login-Getty auf
tty1, und die korrekte TTY-Anbindung im Service.

### a) Benutzer in die nötigen Gruppen

```bash
sudo usermod -aG video,render,input,tty pi
```

> Eine `seat`-Gruppe gibt es auf Raspberry Pi OS nicht – die Seat-Verwaltung
> läuft über `logind`. Wenn `usermod` „group 'seat' does not exist" meldet,
> einfach ohne `seat` ausführen (wie oben).

### b) Login-Getty auf tty1 deaktivieren

```bash
sudo systemctl mask getty@tty1.service
```

### c) Service anlegen

```bash
sudo nano /etc/systemd/system/kiosk.service
```

```ini
[Unit]
Description=Stagedesk Kiosk
After=network-online.target systemd-user-sessions.service
Wants=network-online.target
Conflicts=getty@tty1.service

[Service]
User=pi
PAMName=login
TTYPath=/dev/tty1
StandardInput=tty
StandardOutput=journal
StandardError=journal
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
WorkingDirectory=/home/pi
Environment=XCURSOR_THEME=blank
Environment=XCURSOR_PATH=/home/pi/.icons
ExecStart=/usr/bin/cage -s -- /home/pi/kiosk.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### d) Aktivieren

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kiosk.service
sudo systemctl status kiosk.service --no-pager
```

Auf dem **angeschlossenen Monitor** (nicht im SSH-Terminal) sollte jetzt
Stagedesk im Vollbild erscheinen.

> **Debug-Tipp:** `cage` schreibt seine echte Fehlermeldung nicht ins Journal.
> Zum Diagnostizieren die `ExecStart`-Zeile temporär ersetzen durch
> `ExecStart=/bin/sh -c 'exec /usr/bin/cage -s -- /home/pi/kiosk.sh 2>>/tmp/cage.log'`,
> dann `cat /tmp/cage.log` lesen. Typische Meldung
> „Failed to spawn client: Permission denied" = `kiosk.sh` ist nicht
> ausführbar (`chmod +x`).

---

## 5. Mauszeiger ausblenden

Auf einem Wand-Monitor stört der Mauszeiger in der Bildmitte. Zwei Maßnahmen
greifen zusammen – beide einbauen, dann ist er garantiert weg:

### a) Per CSS in der Stagedesk-App (bereits im Code)

Die öffentlichen Monitorseiten (`AufgabenMonitorPage`, `MonitorPage`) setzen
beim Laden `* { cursor: none !important }`. Damit verschwindet Chromiums
eigener Cursor.

### b) Unsichtbares Cursor-Theme für `cage`

Das alte `cage 0.2.0` zeichnet einen eigenen Compositor-Cursor und lädt dafür
das **`default`**-Theme. Wir machen dieses Theme transparent.

```bash
# transparentes 16x16-PNG erzeugen
mkdir -p ~/.icons/blank/cursors
echo "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAE0lEQVR4nGNgGAWjYBSMAgYwAAAEEAABsax5zAAAAABJRU5ErkJggg==" | base64 -d > /tmp/blank.png

# in einen Cursor umwandeln
echo "16 0 0 /tmp/blank.png" > /tmp/blank.cursor
xcursorgen /tmp/blank.cursor ~/.icons/blank/cursors/left_ptr
printf '[Icon Theme]\nName=blank\n' > ~/.icons/blank/index.theme

# als "default"-Theme spiegeln (das nimmt cage zwingend) + viele Cursor-Namen
mkdir -p ~/.icons/default/cursors
cp ~/.icons/blank/cursors/left_ptr ~/.icons/default/cursors/left_ptr
printf '[Icon Theme]\nName=default\n' > ~/.icons/default/index.theme
cd ~/.icons/default/cursors
for n in default arrow top_left_arrow left_ptr_watch watch hand1 hand2 hand \
         pointer pointing_hand xterm text ibeam crosshair cross fleur move \
         all-scroll grabbing closedhand openhand col-resize row-resize \
         sb_h_double_arrow sb_v_double_arrow question_arrow help; do
  ln -sf left_ptr "$n"
done
```

Neu starten und prüfen:

```bash
sudo systemctl restart kiosk.service
```

Der Zeiger ist jetzt verschwunden.

> `unclutter` funktioniert hier **nicht** – das ist X11-only, unter
> Wayland/`cage` wirkungslos.

---

## 5a. Größe / Zoom auf großen & 4K-Fernsehern

Auf einem **4K-Fernseher** rendert Chromium mit echten 3840 Pixeln → alles
wird winzig. `cage 0.2.0` kann die Anzeige **nicht skalieren**, und
`--force-device-scale-factor` verarbeitet das falsch (es zeigt dann nur das
obere linke Viertel und wird mit höherem Faktor immer kleiner).

**Lösung: Seiten-Zoom per URL-Parameter `?zoom=`** (in die Stagedesk-Monitor­-
seiten eingebaut). Der bricht die Seite sauber um und füllt den Schirm.

In `kiosk.sh` die URL um `?zoom=` ergänzen:

```bash
URL="https://stagedesk.t410.de/aufgaben-monitor?zoom=2"
```

- `zoom=2` ist ein guter Startwert für 4K (entspricht ~Full-HD-Größe)
- beliebig feinjustierbar (`1.75`, `2.25`, `2.5` …) – **kein Deploy nötig**,
  wirkt sofort nach `sudo systemctl restart kiosk.service`
- gilt für **beide** Seiten: `…/aufgaben-monitor?zoom=2` und `…/monitor?zoom=2`
- weitere Parameter mit `&` anhängen, z. B. `…/monitor?profil=mensa&zoom=2`

> **Alternativ** kannst du den Pi auch fest auf 1080p ausgeben lassen (dann
> ist alles normal groß ohne Zoom): in `/boot/firmware/cmdline.txt` (eine
> Zeile!) `video=HDMI-A-1:1920x1080@60` anhängen. Den 4K-Look verliert man
> dabei aber.

### Schwarze Balken oben/unten

Kommt meist vom **Fernseher selbst** (Overscan). Im TV-Menü die Bildgröße auf
1:1 stellen: Samsung „An Bildschirm anpassen", LG „Just Scan", Sony „Full",
Philips „Unscaled"/„1:1". Hilft das nicht, am Pi in `/boot/firmware/config.txt`
`disable_overscan=1` setzen und neu starten.

---

## 6. Bildschirm soll nie dunkel werden

```bash
sudo nano /boot/firmware/cmdline.txt
```

Das ist **eine einzige lange Zeile** – keinen Zeilenumbruch einfügen! Am Ende
ein Leerzeichen und anhängen:

```
consoleblank=0
```

---

## 7. Täglicher Neustart (hält den Browser frisch)

```bash
sudo crontab -e
```

Unten anfügen (Neustart jede Nacht um 4 Uhr):

```
0 4 * * * /sbin/shutdown -r now
```

---

## 8. Automatisches Neuladen bei WLAN-Aussetzern

```bash
nano /home/pi/netwatch.sh
```

```bash
#!/bin/bash
URL="https://stagedesk.t410.de/aufgaben-monitor"   # <-- eigene URL
STATE=/tmp/netwatch.offline
if curl -sf --max-time 5 "$URL" -o /dev/null; then
  if [ -f "$STATE" ]; then           # war offline -> jetzt online: neu laden
    rm -f "$STATE"
    systemctl restart kiosk.service
  fi
else
  touch "$STATE"                     # offline merken
fi
```

```bash
chmod +x /home/pi/netwatch.sh
sudo crontab -e
```

Zusätzliche Zeile (Prüfung jede Minute):

```
* * * * * /home/pi/netwatch.sh
```

---

## 9. (Optional) TV per HDMI-CEC an-/ausschalten

Stagedesk kann den Fernseher über den Monitor-Admin bzw. per Zeitplan
ein-/ausschalten. Dafür läuft auf dem Pi ein kleiner WebSocket-Client
(`scripts/stagedesk-power.py`), der per HDMI-CEC schaltet.

> **Wichtig:** CEC muss am Fernseher aktiviert sein – heißt je nach Hersteller
> Anynet+ (Samsung), SimpLink (LG), Bravia Sync (Sony), EasyLink (Philips).

### Dateien auf den Pi kopieren

Auf dem **PC** (im Repo-Ordner):

```bash
scp scripts/stagedesk-power.py scripts/stagedesk-power.service pi@<IP>:~
```

### Auf dem Pi einrichten

```bash
# Abhängigkeiten
sudo apt install -y cec-utils python3-websocket

# Skript nach /opt/stagedesk
sudo mkdir -p /opt/stagedesk
sudo mv ~/stagedesk-power.py /opt/stagedesk/
sudo chown pi:pi /opt/stagedesk/stagedesk-power.py

# Logdatei (pi muss schreiben können)
sudo touch /var/log/stagedesk-power.log
sudo chown pi:pi /var/log/stagedesk-power.log

# Service
sudo mv ~/stagedesk-power.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stagedesk-power.service
sudo systemctl status stagedesk-power.service --no-pager
```

> In `stagedesk-power.py` muss `WS_URL` zum Monitor passen, z. B.
> `wss://stagedesk.t410.de/ws/monitor/pi/mensa/`.

### CEC-Verbindung testen

```bash
echo "scan" | cec-client -s -d 1
```

Taucht der Fernseher in der Liste auf, funktioniert die Verbindung physisch.

---

## 9a. (Alternative) iiyama-Signage-Display per LAN→RS232 (SICP)

Manche Displays **schalten sich per CEC nicht aus** (Einschalten geht, Standby
wird ignoriert) — z. B. iiyama **ProLite LE5540UHS-B1**. Diese Signage-Displays
haben aber eine **RS-232/LAN-Steuerung** (SICP-Protokoll), die zuverlässig ist.
Der Clou: Man braucht **kein** Netzwerkkabel ins LAN — ein **direktes Ethernet-
Kabel vom Pi (`eth0`) zum LAN-Port des Displays** genügt, weil beide nebeneinander
stehen. Das Display bridgt „LAN→RS232".

### 1. Verkabelung + Display-OSD

- **Kabel:** Pi `eth0` ↔ Display-LAN-Port (normales Ethernet, Auto-MDIX)
- **OSD → Advanced Option:** „HDMI with One Wire" (CEC) darf aus bleiben
- **OSD → „RS232 routing":** auf **LAN→RS232**
- **OSD → Netzwerk/Ethernet:** **Static IP** `192.168.100.2`, Maske `255.255.255.0`,
  LAN-Steuerung aktivieren, **Monitor-ID `0`**

### 2. Pi: feste IP auf `eth0` (stört WLAN/Internet nicht)

```bash
sudo nmcli con add type ethernet ifname eth0 con-name tv-link ip4 192.168.100.1/24
sudo nmcli con modify tv-link ipv4.never-default yes ipv4.method manual connection.autoconnect yes
sudo nmcli con up tv-link      # sobald das Kabel steckt
```

### 3. Das SICP-Protokoll

- **TCP-Port:** `5000`  ·  **Frame:** `A6 <id> 00 00 00 <len> 01 <daten…> <XOR>`
- **Power OFF (Standby):** `A6 00 00 00 00 04 01 18 01 BA`
- **Power ON:**            `A6 00 00 00 00 04 01 18 02 B9`
- **Status abfragen (get-power):** Kommando `0x19` → Antwort­byte `02` = an, `01` = Standby

Schnelltest (Skript anlegen, `off`/`on`):

```bash
cat > /home/pi/tv.py <<'PY'
import socket, sys, functools
mode = sys.argv[1] if len(sys.argv) > 1 else "off"
data = [0x18, 0x02 if mode == "on" else 0x01]
pkt  = [0xA6, 0, 0, 0, 0, len(data)+2, 0x01] + data
pkt.append(functools.reduce(lambda a, c: a ^ c, pkt, 0))
s = socket.create_connection(("192.168.100.2", 5000), timeout=5)
s.sendall(bytes(pkt)); print("Antwort:", s.recv(64).hex()); s.close()
PY
python3 /home/pi/tv.py off
python3 /home/pi/tv.py on
```

Antwort, die mit `21` beginnt = ACK vom Display (Befehl angenommen).

### 4. In den Stagedesk-Power-Dienst einbauen

Statt der CEC-Variante (Abschnitt 9) nutzt `/opt/stagedesk/stagedesk-power.py`
hier die **SICP-Klasse** (`SicpDisplay`): identischer WebSocket-Client, aber
`power_on/power_off/get_power_status` schicken die obigen SICP-Frames per TCP an
`DISPLAY_IP:5000`. Konfiguration oben im Skript:

```python
DISPLAY_IP   = "192.168.100.2"
DISPLAY_PORT = 5000
MONITOR_ID   = 0
```

Rest (Service, Log, Autostart) wie in Abschnitt 9. Danach:

```bash
sudo systemctl restart stagedesk-power.service
journalctl -u stagedesk-power.service -f     # "Power-Status: on/standby"
```

> **Protokoll-Quelle:** iiyama „LExx40UHS RS232 & LAN Commands" (Application Note)
> bzw. das Open-Source-Projekt `dersimn/sicp_mqtt`.

---

## 10. Endabnahme

```bash
sudo reboot
```

Nach dem Boot muss **ohne jede Eingabe** der Stagedesk-Monitor im Vollbild
erscheinen – kein Desktop, kein Login, kein Mauszeiger.

**Stromausfall-Test:** Stecker ziehen, wieder rein → der Pi muss von selbst
wieder zur Anzeige hochfahren.

---

## 11. WLAN nachträglich ändern (auch WPA2-Enterprise)

Raspberry Pi OS nutzt **NetworkManager** → am einfachsten mit `nmcli`.

**Normales WLAN (nur Passwort):**

```bash
sudo nmcli device wifi connect "SSID" password "WLAN-PASSWORT"
```

**WPA2-Enterprise (Benutzername + Passwort, z. B. Schul-/Uni-WLAN, PEAP):**

```bash
sudo nmcli connection add type wifi con-name "SchulWLAN" ifname wlan0 ssid "SSID" -- \
  wifi-sec.key-mgmt wpa-eap \
  802-1x.eap peap \
  802-1x.phase2-auth mschapv2 \
  802-1x.identity "BENUTZERNAME" \
  802-1x.password "PASSWORT"
sudo nmcli connection up "SchulWLAN"
```

Bei Zertifikatsfehlern (Validierung deaktivieren – weniger sicher, aber oft nötig):

```bash
sudo nmcli connection modify "SchulWLAN" 802-1x.phase1-peapver 0 802-1x.system-ca-certs no
sudo nmcli connection up "SchulWLAN"
```

Manche Netze brauchen eine anonyme Identität bzw. einen anderen EAP-Typ:

```bash
sudo nmcli connection modify "SchulWLAN" 802-1x.anonymous-identity "anonymous@DOMAIN"
# z. B. TTLS statt PEAP:  802-1x.eap ttls  802-1x.phase2-auth pap
```

**Gespeicherte Verbindungen verwalten:**

```bash
nmcli connection show                      # alle anzeigen
sudo nmcli connection delete "ALTER_NAME"  # altes WLAN löschen
```

### Neue IP nach dem Netzwechsel finden

SSH bricht beim Wechsel ab und die alte IP gilt nicht mehr. Am einfachsten
über den **Hostnamen** verbinden (unabhängig von der IP, per mDNS):

```bash
ssh pi@rpi-monitor-mensa.local
```

Geht das nicht, im Router unter „DHCP-Clients" nachsehen oder vom PC scannen
(eigenes Subnetz via `ip route | grep default` ermitteln):

```bash
nmap -sn 192.168.1.0/24 | grep -i -B2 raspberry
```

---

## Schnelle Fehlersuche

| Symptom | Ursache / Lösung |
|---|---|
| `chromium: no installation candidate` | Paket heißt `chromium`, nicht `chromium-browser` |
| `No space left on device` beim Install | Karte zu klein/voll → `df -h /`, ggf. `sudo raspi-config nonint do_expand_rootfs`, mind. 16 GB nutzen |
| Service-Crashloop, `libseat … Permission denied` | Gruppen fehlen (`video,render,input,tty`) bzw. getty@tty1 nicht maskiert |
| Schwarzer Bildschirm, `Failed to spawn client: Permission denied` | `chmod +x /home/pi/kiosk.sh` |
| Mauszeiger sichtbar | `default`-Cursor-Theme blank machen (Abschnitt 5b) + Service neu starten |
| Seite hängt nach WLAN-Ausfall | `netwatch.sh` (Abschnitt 8) |
| Alles winzig auf 4K-TV | URL-Param `?zoom=2` nutzen (Abschnitt 5a), **nicht** `--force-device-scale-factor` |
| Neue IP nach WLAN-Wechsel unbekannt | über `pi@<hostname>.local` verbinden (Abschnitt 11) |
| CEC schaltet TV **ein** aber nicht **aus** | Panel unterstützt CEC-Standby nicht → LAN→RS232 / SICP nutzen (Abschnitt 9a) |
| `cec-client` → `errno=16` (busy) | `stagedesk-power.service` belegt `/dev/cec0` → vorher `sudo systemctl stop stagedesk-power.service` |
| Host-Key-Warnung nach Neu-Flashen | auf dem PC `ssh-keygen -R <IP>` |
