# Abfahrten-Monitor: Layout, Zeitangabe, Störungsspalte

Stand: 22.10.2026 · Status: Entwurf, wartet auf Review

Setzt auf der Umbenennung `monitor` → `signage` auf (Spec `2026-10-22-signage-rename-cleanup-design.md`); Pfade und Namen unten gelten nach der Umbenennung. Grundlage ist der Screenshot der Abfahrten-Ansicht vom 21.10.2026 und die Abstimmung im Gespräch.

## 1. Layout

### 1.1 Feste Spalten

- **Spaltenzahl pro Ansicht** einstellbar, 1 bis 5 (Feld `transit_columns`, gibt es schon, wird wieder benutzt; Standard 4).
- **Jede Haltestelle hat eine feste Spalte** (neues Feld `column` im Haltestellen-Eintrag von `transit_stops`, 1 bis Spaltenzahl). Ohne Angabe: der Reihe nach verteilt wie bisher; liegt die Spalte über der Spaltenzahl, landet die Haltestelle in der letzten Spalte.
- **Mehrere Haltestellen in einer Spalte** stehen untereinander in der Reihenfolge der Liste und teilen sich die Höhe **gleich**. Was nicht passt, wird abgeschnitten (keine Seiten, kein Blättern).
- Eine Haltestelle ohne Abfahrten zeigt „Keine Abfahrten“ in ihrem Feld (das ist kein Fehler, z. B. Linienfilter oder spät abends).

### 1.2 Hauptbahnhof

- Neue Einstellung **pro Haltestelle: „Busse und Züge getrennt“** (Feld `split_modes`, Standard an). An: innerhalb der Haltestelle oben ein Abschnitt „Busse“, darunter „Züge“, die Höhe gleich verteilt. Aus: alle Abfahrten gemischt nach Zeit.
- Am ZOB stehen so in **einer Spalte oben die Busse, unten die Züge**. Damit die Züge Gleise bekommen, kann der Bahnhof alternativ als zwei Einträge in derselben Spalte angelegt werden: oben „ZOB/Hauptbahnhof“ nur mit Bussen (NAH.SH), darunter „Lübeck Hbf“ nur mit Zügen (DB).

### 1.3 Störungsspalte

- Störungen stehen **immer in einer eigenen Spalte rechts**, mit Bildern; pro Ansicht ein- und ausblendbar (Schalter „Störungen anzeigen“, ersetzt `transit_disruption_position`; Übernahme: bisher „Eigene Spalte“ oder „Unten“ → an).
- Die Spalte zählt nicht zur Spaltenzahl der Abfahrten. Passen nicht alle Meldungen, blättert die Spalte seitenweise (Blättertakt der Ansicht).
- Der Streifen unten entfällt.

### 1.4 Kasten links neben der Uhr

Zeigt **Datum, Wetter und Stand der Daten** nebeneinander, z. B. „Mittwoch, 22. Oktober · 12 °C Regen · Stand 22:11“. Wetter nur, wenn in der Ansicht eingeschaltet und ein Wetter-Schlüssel eingerichtet ist. (Nachtrag: Kein Hinweis auf ausgefallene Quellen in der Fußzeile; auf Wunsch entfernt.)

## 2. Abfahrtszeilen

### 2.1 Zeitangabe

- Nur **eine** Zeitangabe, **vorn**, direkt dahinter die Verspätung („+6“, Warnfarbe). Die Minutenspalte rechts entfällt.
- Einstellung pro Ansicht „Zeitangabe“: **Minuten** („3 min +6“, unter 1 min „jetzt“), **Uhrzeit** („22:08 +6“), **Gemischt** (bis 20 min Minuten, danach Uhrzeit). Standard: Minuten.
- Gerechnet ab der **geplanten** Abfahrt; die Verspätung steht als Zahl dahinter.
- Ausfall: Zeit durchgestrichen, dahinter „fällt aus“ in Rot (wie bisher).

### 2.2 Welche Abfahrten erscheinen

- **Erreichbarkeit:** Nur Abfahrten, deren tatsächliche Abfahrt (geplant + Verspätung) frühestens jetzt + Fußweg der Haltestelle liegt. Nicht erreichbare werden nicht angezeigt.
- **Abgefahrene ohne Echtzeit:** Abfahrten ohne Echtzeitdaten verschwinden 1 Minute nach der geplanten Zeit.

### 2.3 Gleis

- Bei Zügen steht das Gleis („Gl. 5“) wie früher. Bei Gleiswechsel: neues Gleis in Warnfarbe, altes durchgestrichen davor („~~Gl. 5~~ Gl. 7“).
- Voraussetzung: DB-Zugangsdaten `DB_TT_CLIENT_ID` und `DB_TT_API_KEY` auf dem Server.

### 2.4 Linie und Ziel

- **Linien-Plakette** wächst mit dem Text, damit „SEV RE83“ oder „SEV X85“ ganz hineinpassen; ab 7 Zeichen etwas kleinere Schrift.
- **Busfarbe:** Busse ohne eigene Linienfarbe bekommen Bus-Lila `#95276E` mit weißer Schrift (Stadt- und Regionalbusse).
- **Ortsname:** Ein Ortsname, der vor allen Haltestellen der Ansicht steht („Lübeck “), wird im Kopf weggelassen („Wahmstraße“). Schalter pro Ansicht „Ortsnamen kürzen“, Standard an.

## 3. Admin

Im Abfahrten-Editor:
- Spaltenzahl (1 bis 5), pro Haltestelle Auswahl „Spalte“ und Schalter „Busse und Züge getrennt“.
- „Zeitangabe“ (Minuten, Uhrzeit, Gemischt), „Störungen anzeigen“, „Ortsnamen kürzen“.
- Fußweg pro Haltestelle (gibt es schon) mit Hinweis „Abfahrten, die man zu Fuß nicht mehr schafft, werden ausgeblendet.“
- Eine kleine Spaltenübersicht im Editor zeigt, welche Haltestellen in welcher Spalte stehen.

## 4. Nicht Teil dieser Spec

- Schulstunde im Footer (abgelehnt).
- Automatische Spaltenverteilung nach Abfahrtszahl (abgelehnt zugunsten fester Spalten).

## 5. Tests

- Backend: Erreichbarkeitsfilter (Fußweg, Verspätung, Ausfall), Ausblenden ohne Echtzeit, Spaltenzuordnung im Payload, Übernahme `transit_disruption_position` → Schalter, Stand je Quelle.
- Frontend: Zeitformat (alle drei, Grenze 20 min, „jetzt“), Plakettenbreite, Buslila nur ohne Linienfarbe, Ortsname kürzen (gemeinsamer Präfix, abschaltbar), gleiche Höhenaufteilung, Gleiswechsel-Darstellung; Screenshots mit 7 Haltestellen in 4 Spalten plus Störungsspalte, Hell und Dunkel.
