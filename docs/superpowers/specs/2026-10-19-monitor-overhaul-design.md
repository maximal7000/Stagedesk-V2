# Monitor-Überarbeitung: Gesamtentwurf

Stand: 19.10.2026 · Status: abgestimmt im Brainstorming, wartet auf Review der Spec

Dieses Dokument hält alle Entscheidungen aus der Diskussion fest und teilt die Arbeit in vier Teilprojekte. Jedes Teilprojekt bekommt eine eigene Detail-Spec, einen eigenen Umsetzungsplan und eine eigene Ausführung (superpowers: Spec, Plan, Subagents mit Review-Agents). Die erste Detail-Spec ist `2026-10-19-monitor-step0-english-rename-design.md`.

Entwürfe (Mockups) liegen unter `assets/2026-10-19-monitor/`. Alle Inhalte darin sind Beispieldaten.

## 1. Ziele

Vom Nutzer gesagt:

- Das Monitor-Admin soll ohne Vorwissen bedienbar sein.
- Der Code soll englisch benannt sein, die Oberfläche bleibt deutsch.
- Die Anzeige soll zum Schuldesign passen (katharineum.de, CI-Hintergründe), gut auf 4K aussehen und echte Zustandsbildschirme haben (zum Beispiel "Verbindung verloren").
- Raspberry Pis sollen professionell verwaltet werden: WLAN-Stärke, wöchentliche automatische Updates und was zu einer Geräteverwaltung gehört.
- Die Skalierung (bisher `?zoom=` im Pi-Skript) soll im Admin einstellbar sein.
- Keine KI-generisch wirkende Gestaltung und keine KI-Floskeln in Texten.

Hauptnutzung der Bildschirme: WebUntis-Vertretungsplan, Busabfahrten mit Störungsmeldungen, gelegentlich Info-PDFs bei Veranstaltungen.

## 2. Rahmenbedingungen

- **Hardware:** alle Pis sind Raspberry Pi 4. Bildschirme sind 4K. Bekannt: glocke (iiyama LH4341UHS, CEC) und ein Gerät mit Slug `mensa` (laut `scripts/stagedesk-power.py`).
- **Netz:** Die Pis stehen im Schulnetz (172.22.x), der Server unter t410.de. Der Server erreicht die Pis nicht direkt, deshalb bauen die Pis die Verbindung auf.
- **Bestehende externe Aufrufer bleiben kompatibel:** Kiosk-URLs (`/monitor?bildschirm=`, `?profil=`, `?zoom=`), ATEM (`POST /api/monitor/onair`, `POST /api/monitor/notfall` mit Feld `aktiv`), Pi-WebSocket `wss://…/ws/monitor/pi/<slug>/`.
- **Keine Zugangsdaten im Repo.** Die NAH.SH-Kennung und der Storyblok-Token in `oepnv.py` ziehen in die Server-`.env` um.
- **Bedienung:** Das Admin nutzt nur die Technik-AG. Die Rechte werden so fein angelegt, dass später etwa Hausmeister oder Sekretariat einzelne Teile bekommen können.

## 3. Teilprojekte und Reihenfolge

| Schritt | Inhalt | Sichtbar für Nutzer |
|---|---|---|
| **0. Umbenennung** | Englische Bezeichner in Backend (Models, Felder, Routen, Schemas, Rechte, JSON-Schlüssel) und Frontend, mit Datenbank-Migrationen und Aliasen für externe Aufrufer. Beschlossene Streichungen fallen weg. Zugangsdaten aus `oepnv.py` in die `.env`. | Nein, außer dass gestrichene Funktionen fehlen |
| **B. Anzeige** | Schuldesign (Stile A/B/C), CI-Hintergründe als SVG, Zustandsbildschirme, Abfahrten, Vertretungsplan über die WebUntis-API, Medien, Sondermodi, Skalierung aus dem Admin, Performance für den Pi 4 | Ja |
| **C. Pi-Verwaltung** | `stagedesk-agent` mit Geräte-Token, Telemetrie, Befehlen, wöchentlichen Updates, Kopplung per Code, Ferien- und Power-Steuerung | Ja |
| **A. Admin** | Neue Struktur mit 7 Unterseiten, Übersicht, Bearbeitungsseiten mit Live-Vorschau, ein Speichermodell, feine Rechte | Ja |

Schritt 0 kommt zuerst, weil B, C und A auf den neuen Namen aufbauen.

## 4. Teilprojekt B: Anzeige

### 4.1 Gestaltung

- **Stil A "CI"** (Standard): weiße Fläche, schwarzes Katharinenrad links angeschnitten, roter Streifen rechts. Entwurf: `display-style-a.png`.
- **Stil B "Dicht"**: hellgrau mit weißen flachen Karten, Rad als Wasserzeichen, schmaler roter Streifen. Wird automatisch für dichte Ansichten genutzt (Abfahrten, Vertretungsplan). Entwurf: `display-style-b.png`.
- **Stil C "Dunkel"**: wie A auf Schwarz, für Bühne, Aula und Veranstaltungen. Entwurf: `display-style-c.png`.
- **Schriften:** Oswald für Überschriften und Ziffern, Lato für Fließtext. Beide werden lokal eingebunden (OFL), damit der Pi offline korrekt rendert.
- **CI-Elemente:** kurzer roter Balken vor Überschriften. Rot nur für CI-Elemente und Ausfälle. Ausnahme sind die offiziellen SWL-Linienfarben, die bleiben.
- **Hintergründe:** Rad und Streifen werden als getrennte SVG-Ebenen aus den Vektor-PDFs des CI-Pakets gewonnen. Damit passen sie auf jedes Seitenverhältnis und bleiben auf 4K scharf. Die mitgelieferten PNGs (1754×986) sind für 4K zu klein. "Hintergrund dreifach" (A4 hoch) ist die Vorlage für Bildschirme im Hochformat.
- **Verboten** (Prüfpunkt für Review-Agents und impeccable):
  - Karten mit Schatten und runden Ecken
  - Icons in Kreisen, Verläufe, Leuchteffekte
  - Lade-Spinner
  - Pill-Etiketten
  - Animationen ohne Funktion
  - Titelzeilen wie "Katharineum zu Lübeck · Abfahrten"
- **Kein Titel bei dichten Ansichten.** Die Uhr steht als feste Box unten rechts. Optional steht das Wetter in der Uhr-Box.

### 4.2 Skalierung und Performance (Pi 4)

- **Skalierung:**
  - Die Schriftgrößen skalieren mit der Viewport-Breite (rem-Basis).
  - Skalierung und Ausrichtung werden pro Bildschirm im Admin eingestellt ("Automatisch", 100/150/200 %).
  - `?zoom=` bleibt als Fallback erhalten.
- **Keine Dauer-Bewegung:** Lange Listen blättern seitenweise um ("Seite 1 / 2", etwa alle 15 s) statt zu scrollen.
- **Fehlerbehebung:** Die Uhr wird eine eigene Komponente. Heute zeichnet `MonitorPage` jede Sekunde komplett neu, und `StationBlock`/`DepRow` sind innerhalb des Renders definiert (`MonitorPage.jsx:1058`, `:1168`). Dadurch werden die Blöcke jede Sekunde neu aufgebaut.
- **Push statt Polling:** Daten kommen per WebSocket statt per 30-s-Polling. Vorbild ist der Aufgaben-Monitor.

### 4.3 Zustandsbildschirme

Alle Zustandsbildschirme sind im Stil A.

- **Kurzer Ausfall (unter etwa 2 min):** Der letzte Inhalt bleibt stehen, dazu der Hinweis "Stand 10:42".
- **Längerer Ausfall:** Vollbild "Verbindung verloren". Es zeigt:
  - Bildschirmname
  - seit wann der Server nicht erreichbar ist und den Countdown bis zum nächsten Versuch
  - Zeitpunkt der letzten Daten
  - WLAN-Stärke, Gerät und IP-Adresse
  - die lokal weiterlaufende Uhr

  Entwurf: `state-connection-lost.png`.
- **Weitere Zustände:**
  - "Bildschirm nicht gefunden" mit Slug und Einrichtungshinweis
  - "Wird geladen"
  - "Ruhemodus": dunkel mit kleiner Uhr, außerhalb des Zeitplans, wenn der Bildschirm nicht abschaltbar ist
- **Erkennung:** `navigator.onLine` plus fehlgeschlagene Abrufe.
- **Zwischenspeicher:** Die letzte gültige Antwort wird gespeichert, damit auch ein Neustart ohne Netz etwas anzeigt.

### 4.4 Ansichtstypen

Bisher gibt es 8 Layouts. Neu sind es diese 5 Typen:

| Typ | Ersetzt | Stil |
|---|---|---|
| Abfahrten | `abfahrten` | B |
| Vertretungsplan | `stundenplan` | B |
| Vertretungsplan + Abfahrten (geteilt) | `split` zum Teil | B |
| Medien (PDF/Bild) | `pdf_vollbild`, `bild_vollbild` | A |
| Info (Uhr, Ankündigungen, Termine, Countdown, Wetter) | `standard` | A |

- **QR-Code** ist ein optionales Eckelement für jede Ansicht.
- **On-Air, Notfall und Klausur** sind Sondermodi, keine Layouts (Abschnitt 4.8).
- **Gestrichen** (Entfernung in Schritt 0):
  - Baukasten mit allen Widgets
  - Bildschirmschoner
  - Kamera-Stream
  - Laufschrift (Ticker)
  - freier iframe
  - Raumplan-Widget
- **In Spec B zu klären:** Was wird aus Slideshow, Seitenrotation, Freitext, Hintergrundbild, Logo, `theme_preset`, `hintergrund_farbe` und `akzent_farbe`? Die Farbfelder werden durch die festen Stile voraussichtlich überflüssig.

### 4.5 Abfahrten

Entwurf: `departures.png`.

- **Ein Block pro Haltestelle** (Variante V1). Hauptbahnhof/ZOB steht in einer eigenen hohen Spalte, Züge und Busse getrennt.
- **Haltestellen:** Katharineum, Wahmstraße, Kohlmarkt, Sandstraße, Hauptbahnhof/ZOB mit Zügen. Ab Ende des Jahres kommt Breite Straße/Stadttheater dazu; die trägt der Nutzer von Hand ein, ohne "gültig ab"-Feld.
- **Zeilen:** Zeit, Linie in SWL-Farbe, Ziel, bei Zügen das Gleis, Minuten. Verspätung steht als "+2", Ausfall wird durchgestrichen und mit "Fällt aus" markiert.
- **Fußweg** steht im Kopf jeder Haltestelle. Der bestehende Filter "Abfahrten innerhalb der Wegzeit ausblenden" bleibt.
- **Zeilenzahl:**
  - Standard ist eine Höchstzahl von 10 Abfahrten pro Haltestelle, im Admin einstellbar.
  - Die Anzeige zeigt so viele, wie bei einer festen Mindestschriftgröße passen, höchstens die Höchstzahl.
  - Referenz: etwa 7 mm Großbuchstabenhöhe auf 43", lesbar aus 3 bis 4 m.
- **Störungsmeldungen:**
  - Leiste unten mit "1 / 3".
  - Gezeigt werden nur Linien der eingerichteten Haltestellen.
  - Der Filter für allgemeine Hinweise (`STOERUNG_GENERIC_RE`) bleibt, ebenso die manuellen und die ausgeblendeten Meldungen.
- **Datenquellen bleiben:** DB Timetables, NAH.SH HAFAS, Stadtwerke Lübeck (Storyblok).

### 4.6 Vertretungsplan (WebUntis)

Entwurf: `substitutions.png`.

- **Darstellung:**
  - Heute und morgen nebeneinander, darüber die Nachricht zum Tag.
  - Spalten: Klasse, Stunde, Fach, Lehrkraft, Raum, Art, Hinweis. Ersetztes ist durchgestrichen, Entfall rot, Raumänderung blau.
  - Heute werden nur Stunden ab der laufenden Stunde gezeigt.
- **Datenquelle in dieser Reihenfolge:**
  1. Offizielle WebUntis-JSON-RPC-API mit dem vorhandenen Raumschild-Benutzer, über `python-webuntis` oder den vorhandenen Client aus `api.py:160-262`.
     - Zuerst `getSubstitutions`. Dafür braucht der Benutzer das Leserecht für Vertretungen; fehlt es, kommt Fehler -8509.
     - Sonst wird der Plan aus `getTimetable` pro Klasse abgeleitet: Codes "cancelled"/"irregular", `orgid`, Vertretungstext. Das sind etwa 40 Abrufe, gesammelt alle 5 min, serverseitig zwischengespeichert.
  2. Nur wenn 1 scheitert: die JSON-Daten der öffentlichen WebUntis-Monitorseite. Die Schnittstelle ist undokumentiert.
  3. Rückfall im Betrieb, immer verfügbar: das bisherige iframe, im CI-Rahmen, ohne Farb-Invertierungsfilter. Im Admin erscheint dann eine Warnung.
- **Test am Anfang von B:** ein Skript, das der Nutzer auf dem Server startet. Es prüft `getSubstitutions`, die Stundenplan-Variante und die Tagesnachricht und gibt nur "geht / geht nicht" aus. Danach wird die Datenquelle einmalig festgelegt.
- **Zugangsdaten** bleiben in der Datenbank (`MonitorGlobalSettings`, nach Schritt 0 `MonitorSettings`).
- **Datenschutz:** Plandaten (Lehrerkürzel) bekommen nur gekoppelte Bildschirme (Geräte-Token aus C) und angemeldete Admins. Bis C fertig ist, sichert ein geheimer Schlüssel pro Bildschirm in der Kiosk-URL das ab.

### 4.7 Medien (PDF und Bild)

- **Umwandlung beim Hochladen:**
  - PDFs werden in Seitenbilder in 4K-Auflösung umgewandelt.
  - Bilder werden auf 4K verkleinert und nach EXIF gedreht.
  - Der Pi zeigt nur fertige Bilder.
- **Ein Anzeigeweg:** Das Browser-PDF-iframe entfällt überall.
- **Ausrichtung pro Seite:**
  - Hochformat steht mittig, die Ränder füllt der CI-Hintergrund mit Uhr und optional dem Veranstaltungsnamen.
  - Querformat läuft randlos, ohne Verzerren und ohne Abschneiden.
- **Modi bleiben:** durchschalten, feste Seite, Seitenauswahl, 1 bis 3 Seiten nebeneinander. PDFs und Bilder dürfen gemischt werden.

### 4.8 Sondermodi

- **On-Air:**
  - Gestaltet wie ein Studio-Leuchtschild: rote Fläche, weiße Schrift, Schwarz drumherum. Darunter optional die Uhr. Der Text "auf Sendung" entfällt.
  - Der Text bleibt einstellbar.
  - Animation wählbar: Ruhig / Pulsieren ("atmend", nur Deckkraft, ohne Leuchtschatten) / Blinken (hart). Tempo und Tiefe des Pulsierens werden gemeinsam in der Vorschau festgelegt.
  - Entwurf: `mode-on-air.png`.
- **Notfall:**
  - Weiß mit rotem Balken "NOTFALL" und Uhr, Anweisung in maximaler Größe, optionaler Zusatztext, "Ausgelöst HH:MM".
  - Kein Blinken, kein Pulsieren.
  - Vorlagen im Admin.
  - Schaltet ausgeschaltete Bildschirme ein, auch im Ferienmodus und nach "bis Tagesende aus". Nach dem Ende kehren sie in den vorherigen Zustand zurück.
  - Nur manuell (Admin, ATEM-Token). **Nicht mit der Brandmeldeanlage verbunden**; das steht so auch im Admin. Eine Kopplung wäre ein eigenes Projekt.
  - Entwurf: `mode-emergency.png`.
- **Klausur:**
  - Stil A mit Titel, Text, Beginn, Ende und Restzeit.
  - Die freie Farbwahl entfällt.
  - Entwurf: `mode-exam.png`.
- **Splitscreen** für On-Air und Klausur: Sondermodus auf der einen Seite, Vertretungsplan oder Abfahrten auf der anderen. **Standard: Sondermodus rechts.** Die Entwürfe `split-on-air.png` und `split-exam.png` zeigen ihn noch links.

## 5. Teilprojekt C: Pi-Verwaltung

- **Ein Agent statt vier Skripte:** Aus `scripts/stagedesk-power*.py` (CEC, HDMI, Hybrid SICP+CEC, DDC) wird ein Dienst `stagedesk-agent`. Die Power-Art wird pro Bildschirm im Admin gewählt.
- **Verbindung:**
  - Der Pi verbindet sich selbst per WebSocket über den bestehenden Pfad, künftig mit **Geräte-Token**. Heute ist der Pi-WebSocket ohne Authentifizierung (`consumers.py:56`).
  - Alte Skripte ohne Token werden nur bis zur Umstellung toleriert.
- **Telemetrie** (etwa jede Minute):
  - Netzwerk: WLAN-Stärke (dBm) und SSID, LAN/WLAN, IP- und MAC-Adresse
  - System: CPU-Temperatur und Drosselung, Speicher, RAM, Laufzeit, Modell, Seriennummer, OS- und Agent-Version
  - Anzeige: erkannte Auflösung, Browser-Zustand, Bildschirm an/aus
  - Updates: letztes Update, ausstehende Pakete, ob ein Neustart nötig ist
- **Befehle** (protokolliert mit Person und Zeit): Browser neu laden, Browser neu starten, Pi neu starten, Bildschirm an/aus, jetzt aktualisieren, Screenshot, Testbild.
- **Updates:**
  - Wöchentlich per systemd-Timer (`apt full-upgrade`), Standard **Sonntag 03:00**.
  - Neustart nur wenn nötig und nicht während eines Termins oder Sondermodus.
  - Zeitfenster und Verhalten pro Bildschirm einstellbar.
  - Das Ergebnis geht ans Admin. Der Agent aktualisiert sich selbst.
- **Kopplung:**
  - Ein Installationsbefehl auf dem Pi, danach zeigt der Bildschirm einen 6-stelligen Code.
  - Im Admin "Bildschirm koppeln" und Code eingeben, Token und Slug werden automatisch gesetzt.
- **Überwachung:**
  - Ampel online / Warnung / offline mit "zuletzt gesehen".
  - Benachrichtigung über das Stagedesk-Notification-System, wenn ein Bildschirm länger als X Minuten offline ist.
  - Geräteprotokoll.
- **Ferien:**
  - Ferienzeiträume werden im Admin eingetragen. In diesem Zeitraum schalten die Bildschirme automatisch in den Ferienmodus und danach zurück.
  - Heute gibt es nur den Schalter `ferien_modus` pro Bildschirm.
  - Ausnahmen pro Bildschirm werden in Spec C geklärt.
- **"Alle Bildschirme bis Tagesende aus":**
  - Knopf auf der Übersicht, wahlweise nur für einzelne Bildschirme.
  - Die Bildschirme sind aus bis zur nächsten regulären Einschaltzeit.
  - Oben erscheint eine Leiste mit "Rückgängig".
- **Umstieg:** Auf glocke und mensa wird der Agent einmal per SSH installiert. Bis dahin laufen die alten Skripte weiter.

## 6. Teilprojekt A: Admin

Entwürfe: `admin-overview.png`, `admin-view-edit.png`, `admin-screen-detail.png`.

- **Begriffe:**
  - Bildschirm (Gerät)
  - Ansicht (was gezeigt wird; bisher "Profil")
  - Sondermodus (On-Air, Notfall, Klausur)
  - Termine (Events und Klausuren)
- **7 Unterseiten unter "Monitore":**
  - Übersicht
  - Bildschirme
  - Ansichten
  - Klausuren & Termine
  - Medien
  - Ferien & Zeitpläne
  - Einstellungen (ÖPNV, WebUntis-Zugang, Notfall-Vorlagen, Störungsfilter)
- **Übersicht:**
  - Oben die Sondermodi.
  - Eine Tabelle der Bildschirme mit Status in Textform, aktueller Ansicht und Begründung ("weil Termin … bis 12:30 läuft"; damit wird die Vorrangregel sichtbar) und Gerätezustand.
  - Dazu die Kästen Datenquellen und Demnächst, sowie die Knöpfe "Alle bis Tagesende aus" und "Bildschirm koppeln".
- **Ansicht bearbeiten:**
  - Nur die Felder des jeweiligen Typs.
  - Live-Vorschau mit echten Daten und ungespeicherten Änderungen, über einen eigenen Vorschau-Endpunkt nur für Admins. Bildschirm für die Vorschau wählbar.
  - "Verwendet auf" zeigt die betroffenen Bildschirme.
- **Bildschirm-Detail:**
  - Links: Anzeige (Name, Ort, Standard-Ansicht, Skalierung, Ausrichtung), Ein-/Ausschalten (Steuerung, Zeiten, Ferien, Notfall), Updates.
  - Rechts: Gerät, Befehle, Protokoll.
  - Gefährliche Befehle fragen nach. Ist der Pi offline, sind Befehle gesperrt und nennen den Grund.
- **Speichermodell:**
  - Überall eine feste Leiste "N ungespeicherte Änderungen · Verwerfen / Speichern" mit Warnung beim Verlassen.
  - Ausnahme sind Schalter mit Sofortwirkung (On-Air, Bildschirm an/aus).
- **Geführte Abläufe:** "Bildschirm koppeln" und "Neue Ansicht" (Typ zuerst).
- **Rechte:**
  - `monitor.view`
  - `monitor.onair`, `monitor.emergency`
  - `monitor.power`
  - `monitor.exams`
  - `monitor.media`
  - `monitor.devices`
  - `monitor.setup`

  Was jemand nicht darf, wird nicht angezeigt.
- **Technik:** `MonitorAdminPage.jsx` mit 4554 Zeilen wird in Komponenten unter `components/monitor-admin/` aufgeteilt. Die Seite wird auf die Bühnenschwarz-Tokens umgestellt und fällt aus der Ausnahmeliste von `check-tokens.mjs`.

## 7. Texte (Copy)

Gilt für Admin und Anzeige und ist ein Prüfpunkt im Review.

- **Labels sind Substantive oder Verben:** "Skalierung", "Neu starten".
- **Beschreibungen** nennen in einem Satz Wirkung oder Einheit, zum Beispiel "Wirkt nach dem nächsten Neuladen des Bildschirms."
- **Verboten:** "Tipp:"-Boxen, Duzen in Systemtexten, Begeisterungsfloskeln, Entschuldigungen, Em-Dashes.
- **Fehler** nennen Ursache und nächsten Schritt, zum Beispiel "Bildschirm nicht erreichbar seit 14:02. Netzwerk am Gerät prüfen."
- **Status ist präzise:** "zuletzt gesehen vor 3 min", "−67 dBm".

## 8. Qualitätssicherung

- **Pro Teilprojekt:** Subagents mit Spec- und Qualitäts-Review, zum Schluss ein Gesamt-Review.
- **Werkzeuge:** impeccable-Detektor, ui-ux-pro-max-Checks, Token-Guard.
- **Anzeige:** Abnahme per Screenshot in 3840×2160 mit headless Chromium. Das geht, weil die Anzeige öffentlich ist.
- **Backend:** Die bestehenden 13 Tests bleiben grün, neue Tests pro Teilprojekt.
- **Kein Deploy ohne Freigabe.** Vor Schritt 0 und vor C gibt es Backup-Tag plus DB-Dump.
