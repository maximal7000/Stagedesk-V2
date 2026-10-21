# Änderungswünsche Anzeige und Admin (Gruppen 2, 3, 4)

Stand: 21.10.2026 · Status: im Gespräch abgestimmt, wartet auf Review der Spec

Gruppe 1 (Kopplungscode, Hinweistexte, Uhr mit Sekunden, helle Uhr-Box, lokale Entwicklungsumgebung) ist umgesetzt (Commits e39ede5..c88e2e6). Diese Spec beschreibt die übrigen drei Gruppen. Danach folgt als eigenes Projekt die englische Benennung im Backend-Modul `monitor`.

Vorschaubilder aus dem Gespräch (Beispieldaten) liegen nur im Chat, nicht im Repo.

## 1. Vertretungsplan (Gruppe 4)

### 1.1 Datenquellen

Drei Quellen, im Editor der Vertretungsplan-Ansicht wählbar unter **Datenquelle**:

| Auswahl | Hilfetext | Technik |
|---|---|---|
| **WebUntis-Vertretungsplan** (Standard) | „Die Vertretungen, wie WebUntis sie für Bildschirme bereitstellt. Kein Konto nötig.“ | öffentliche Monitor-Schnittstelle (§1.2) |
| **WebUntis-Konto** | „Abfrage mit Benutzername und Passwort aus den Einstellungen. Nur nötig, wenn der Vertretungsplan in WebUntis nicht freigegeben ist.“ | bisherige JSON-RPC-Abfrage (`webuntis.py`) |
| **WebUntis-Seite einbetten** | „Zeigt die Originalseite von WebUntis statt der eigenen Darstellung.“ | iframe (bisherige Rückfall-URL) |

Bei „WebUntis-Vertretungsplan“ zusätzlich **Ausgabe**: „Schüler, 2 Tage“ (`vplan-schueler`), „Schüler, 1 Tag“ (`vplan-schueler-1`), „Lehrkräfte“ (`vplan-lehrer`), „Eigenes Format“ (Textfeld für einen weiteren Formatnamen aus WebUntis). Die Formatnamen sind nur beim eigenen Format sichtbar.

**Ausweichen:** Liefert die gewählte Quelle nichts (Fehler, Zeitüberschreitung), nimmt die Anzeige automatisch die nächste in der Reihenfolge Vertretungsplan → Konto (nur wenn Zugangsdaten eingerichtet) → Seite einbetten. Unten in der Fußzeile steht dann klein „Ersatzquelle“. Die bisherige Zwischenspeicherung (letzte gültige Daten bis 24 h) gilt pro Quelle weiter.

### 1.2 Monitor-Schnittstelle (Hauptquelle)

- Format laden: `POST https://<server>/WebUntis/monitor/substitution/format?school=<schule>&formatName=<format>` mit `{"formatName", "schoolName"}`. Liefert die in WebUntis eingestellten Format-Optionen (u. a. `groupBy`, `numberOfDays`, `showOnlyFutureSub`, `showBreakSupervisions`, `showExamSupervision`, `showUnitTime`, `showAbsentElements`, `showAffectedElements`, `strikethrough`, `hideCancelWithSubstitution`, `showEvent`, `showTeacher`/`showClass`/`showRoom`/`showSubject`/`showInfo`/`showSubstText`).
- Daten laden: `POST https://<server>/WebUntis/monitor/substitution/data?school=<schule>` mit `formatName`, `schoolName`, `date` (YYYYMMDD), `dateOffset` und den Optionen aus dem Format. Liefert `rows`, `absentElements`, `affectedElements`, `messageData`, `lastUpdate`, `date`, `nextDate`, `weekDay`.
- Server und Schule kommen aus den bestehenden WebUntis-Einstellungen; Benutzer und Passwort werden für diese Quelle nicht gebraucht.
- Das Format wird zwischengespeichert (1 h), die Daten wie bisher (Abfrageintervall der Anzeige, Single-Flight-Sperre, Frist 20 s).
- Unsere Darstellung übernimmt die Format-Optionen (welche Spalten, Gruppierung, Aufsichten, nur kommende Vertretungen). Ändert die Schule das Format in WebUntis, zieht die Anzeige mit.
- Das genaue Zellformat von `rows` wird an einem Schultag mit echten Daten festgestellt (Testdaten aus der Entwicklungsumgebung) und als Test-Fixture abgelegt; der Parser ist gegen dieses Fixture getestet.

### 1.3 Darstellung

**Schüleransicht** (Gruppierung nach Klasse), Spalten: Klasse · Std. · Fach · Lehrkraft · Raum · Art · Hinweis. Lehrkraft und Raum bei Änderung mit durchgestrichenem Altwert (~~HRT~~ KLM).

**Lehrkräfte-Ansicht** (Gruppierung nach Lehrkraft), Spalten: Kürzel · Std. · Klasse · Fach · Lehrkraft · Raum · Art · Hinweis. Die übrigen Spalten sind identisch mit der Schüleransicht.

**Sortierung der Klassen:** fest 5, 6, 7, 8, 9, 10, E, Q1, Q2, innerhalb einer Stufe a, b, c … (natürliche Sortierung, 10 nie vor 5). Gilt unabhängig von der Reihenfolge, die WebUntis liefert.

**Mehrere Klassen in einer Zeile:**
- Stufe und Buchstabe ohne Leerzeichen; Buchstaben einer Stufe werden zusammengefasst: „Q2a, c, d“, lückenlos „Q2a–d“, „5a–c“.
- In der Schüleransicht steht eine solche Zeile **in jeder betroffenen Stufe genau einmal**, jeweils mit den Klassen dieser Stufe (Griechisch: „Q1c, d“ unter Q1 und „Q2a, b, d“ unter Q2; Förderunterricht: je einmal unter 5, 6, 7, 8, 9).
- In der Lehrkräfte-Ansicht steht die Zeile einmal mit allen Klassen; die Klassenspalte darf umbrechen.

**Hinweis-Spalte:** wird nie abgeschnitten; sie bricht um (beide Ansichten).

**Kopfbereich** (über der Tabelle, je Tag): „Abwesend“ (Lehrkräfte und Klassen, mit Stunden bei Teilabwesenheit, z. B. „BEC (3.–4.)“) und „Betroffen“ (Klassen und Lehrkräfte). Schalter im Editor **„Abwesenheiten anzeigen“** (Standard an). Nur bei der Quelle WebUntis-Vertretungsplan.

**Nachrichten zum Tag** bleiben über der Tabelle.

**Klausuren:** Schalter **„Klausuren anzeigen“**, Standard wie im WebUntis-Format (`showExamSupervision`). Keine besondere Hervorhebung.

**Stand:** „Stand WebUntis · 21.10. 07:42“ aus `lastUpdate`; bei der Konto-Abfrage wie bisher der Abrufzeitpunkt.

**Tage:**
- Ferien und Wochenenden: bei der Monitor-Schnittstelle überspringt WebUntis sie selbst; bei der Konto-Abfrage zusätzlich `getHolidays` aus WebUntis (neben den eigenen Ferien).
- Einstellung **„Nächsten Schultag zeigen ab“** (Uhrzeit, Standard 16:00, abschaltbar). Ab dieser Uhrzeit beginnt die Anzeige mit dem nächsten Schultag.
- In geteilten Ansichten und in den Sondermodi (On-Air, Klausur geteilt) zeigt der Vertretungsplan immer nur **einen Tag**, ohne eigenen Schalter.

### 1.4 Editor (Admin)

Datenquelle, Ausgabe, „Abwesenheiten anzeigen“, „Klausuren anzeigen“, „Nächsten Schultag zeigen ab“, Blättertakt (wie bisher). Die bisherige Auswahl „Morgen zeigen“ und die Rückfall-URL bleiben für „WebUntis-Seite einbetten“. Bestehende Ansichten werden auf „WebUntis-Vertretungsplan“, Ausgabe „Schüler, 2 Tage“ umgestellt; wer bisher bewusst nur die Einbettung nutzte (keine Zugangsdaten), bekommt dieselbe Hauptquelle mit Ausweichen auf die Einbettung.

## 2. Ansichten und Zeitplan (Gruppe 2)

### 2.1 Typ einer Ansicht änderbar

- Im Ansicht-Editor steht rechts neben dem Namensfeld eine Auswahl mit den Typen; die Plakette „Typ: …“ oben entfällt.
- Beim Wechsel tauscht der Editor sofort den typbezogenen Teil, die Live-Vorschau zeigt den neuen Typ; gespeichert wird mit „Speichern“.
- Die Einstellungen des alten Typs bleiben gespeichert (Zurückwechseln stellt sie wieder her).
- Schutzregeln mit Meldung: Eine Ansicht, die in einem Wechsel oder einer geteilten Ansicht verwendet wird, kann nicht zu „Wechsel“ bzw. „Geteilt“ werden („Diese Ansicht ist Teil des Wechsels „…“. Erst dort entfernen.“).
- Läuft die Ansicht gerade auf Bildschirmen: Nachfrage „Die Ansicht läuft auf N Bildschirmen. Nach dem Speichern zeigen sie den neuen Typ.“

### 2.2 Ein gemeinsamer Zeitplan pro Bildschirm

Einschaltzeiten und Ansichten-Zeitplan werden **ein** Abschnitt **„Zeitplan“** auf der Bildschirm-Seite:

- Jede Zeile: Wochentage · von · bis · Ansicht (Auswahl der Ansichten, an erster Stelle „Standard-Ansicht“).
- Hilfetext: „Zu diesen Zeiten ist der Bildschirm an und zeigt die gewählte Ansicht. Außerhalb ist er aus.“
- Ohne Zeilen: Bildschirm immer an mit der Standard-Ansicht (wie bisher ohne Zeitplan).
- Darüber eine Wochenübersicht (Mo–So, 0–24 Uhr) mit farbigen Balken je Ansicht und schraffierten Aus-Zeiten.
- Überschneiden sich Zeilen, gilt die obere; der Editor zeigt „Überschneidet sich mit Zeile N, Zeile N hat Vorrang.“; Reihenfolge per Ziehen.
- **Kein Aus- und Wiedereinschalten beim Ansichtswechsel:** Grenzen aneinander (13:00 bis / 13:00 von) oder überlappen sich Zeilen, gilt die Zeit durchgehend als „an“. Die Power-Auswertung betrachtet die Vereinigung aller Zeilen; nur die Ansicht wechselt.
- Ausnahmen nach Datum, Ferien, „Immer an/aus“, „Bis Tagesende aus“ und die Rangfolge (Andere Ansicht vorübergehend > Termin > Zeitplan > Standard-Ansicht; Notfall, Klausur, On-Air darüber) bleiben unverändert.
- Übernahme bestehender Daten: Jede bisherige Einschaltzeile wird zu einer Zeile mit „Standard-Ansicht“; bestehende Ansichten-Zeitplan-Zeilen werden darüber eingefügt (sie haben Vorrang). Ergibt sich daraus eine Ansicht außerhalb der bisherigen Einschaltzeiten, bleibt der Bildschirm dort wie bisher aus (diese Zeilen werden auf die Einschaltzeiten zugeschnitten).
- Der Abschnitt bleibt kompakt: ohne Zeilen nur „Kein Zeitplan · Zeitplan hinzufügen“.

## 3. Aufteilung und Farbschema (Gruppe 3)

### 3.1 Aufteilung (pro Ansicht)

Ersetzt den bisherigen „Stil“ (CI/Dicht/Dunkel):

- **Normal:** Inhalt rechts neben dem Schullogo, roter Streifen rechts (bisher „CI“).
- **Breit:** Inhalt über die ganze Breite, schmaler roter Streifen rechts (bisher „Dicht“).
- **Automatisch** (Standard): Info und Medien → Normal; Abfahrten, Vertretungsplan, Geteilt, Wechsel → Breit. Kein Umschalten nach Inhaltsmenge.
- Das Schullogo (Rad, `assets/ci/wheel.svg`) liegt in beiden Aufteilungen und beiden Farbschemata **leicht grau** am linken Rand, an derselben Stelle. Bei „Breit“ liegt es **hinter** dem Inhalt; die Kästen sind dafür leicht durchscheinend, sodass das Logo schwach sichtbar bleibt und Text stets darüber lesbar ist.

### 3.2 Farbschema

- In den Einstellungen für alle Bildschirme: **Hell**, **Dunkel**, **Tageslicht** (ab Sonnenuntergang dunkel, ab Sonnenaufgang hell; Sonnenzeiten für Lübeck offline berechnet, ohne Bewölkung), **Zeitplan** (Uhrzeiten für hell, z. B. 07:00–18:00).
- Pro Bildschirm: „Wie eingestellt“ · „Immer hell“ · „Immer dunkel“.
- Kein Schalter auf der Übersicht.
- Der Wechsel geschieht ohne Neuladen (die Anzeige erhält das aktuelle Schema mit den Daten; Umschalten per CSS-Klasse).
- Übernahme: Ansichten mit Stil „CI“ → Normal, „Dicht“ → Breit, „Dunkel“ → Breit; Bildschirme, deren Standard-Ansicht „Dunkel“ war, bekommen „Immer dunkel“. „Automatisch“ bleibt Automatisch.
- Uhr-Kasten und alle Kästen haben dieselbe Hintergrundfarbe des jeweiligen Schemas.

## 4. Nicht Teil dieser Spec

- Englische Benennung im Backend-Modul `monitor` (nächstes Projekt).
- MQTT, Debian-Paket (aus Teilprojekt C notiert).

## 5. Tests

- Backend: Monitor-Schnittstelle (Format und Daten gegen aufgezeichnete Antworten, Ausweichen, Stand, Ferien), Klassen-Zusammenfassung und Sortierung, Tageslogik (16:00, Splitscreen ein Tag), gemeinsamer Zeitplan (Power-Vereinigung, Ansichtsauswahl, Übergänge ohne Aus), Datenübernahme (Migrationen mit Altdaten), Farbschema (Tageslicht-Berechnung an Stichtagen, Zeitplan, Ausnahme pro Bildschirm).
- Frontend: vitest für Formatierung (Klassenlisten), Editor-Logik (Typwechsel, Zeitplan-Überschneidung), Screenshots aller betroffenen Anzeigen in Normal/Breit × Hell/Dunkel und Admin-Seiten.
