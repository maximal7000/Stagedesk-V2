# Ruhige Uhr mit Sekunden und Schalter „Sekunden anzeigen“

## Warum
Die Uhr auf den Signage-Bildschirmen rutscht im Sekundentakt, weil Cabin keine gleich breiten Ziffern hat
(„1“ 0,30 em, „0“ 0,61 em). Die Sekunden sollen bleiben und normal aussehen; die Uhr soll ruhig stehen.
Manche Ansichten brauchen keine Sekunden.

## Ziele
- Uhrzeit mit Sekunden, normale Ziffernabstände (kein Auseinanderziehen einzelner Ziffern).
- Kein Springen im Sekundentakt: davor stehende Ziffern bewegen sich nicht, wenn die letzte Sekunde wechselt.
- In allen Kästen (Uhr im Fußzeilen-Kasten bei Vertretungsplan, Abfahrten, Geteilt, Wechsel, Hochformat)
  steht die Uhrzeit mittig.
- Pro Ansicht ein Schalter „Sekunden anzeigen“, Standard an.

## Nicht-Ziele
- Keine eigene Schriftvariante, kein Schriftwechsel (CI bleibt Cabin).
- Sonderbildschirme (Klausur, On-Air, Notfall, Verbindung verloren) bleiben wie sie sind.

## Ansätze (gewählt: 1)
1. **Uhrzeit links in einem fest breiten Block verankern** (gewählt): Der Block ist so breit wie die breiteste
   mögliche Uhrzeit, die Uhrzeit beginnt darin immer an derselben Stelle. Wechselt die letzte Ziffer, bewegt
   sich davor nichts; nur alle 10 s rückt die letzte Ziffer minimal nach. Kaum Aufwand.
2. Cabin-Kopie mit gleich breiten Ziffern: nichts springt, aber „1“ bekommt Luft; mehr Aufwand.
3. Alle Ziffern in gleich breiten Feldern per Layout: Optik wie 2, unsauberer.

## Entwurf
- **Fester Block:** `.d-clock` bekommt eine feste Breite statt einer Mindestbreite: mit Sekunden so breit wie
  „00:00:00“ (breiteste Ziffer „0“, rund 4,05 em), ohne Sekunden wie „00:00“ (rund 2,6 em). Text darin
  linksbündig.
- **Ausrichtung des Blocks:** In Kästen (Box-Uhr) wird der Block mittig gesetzt, also steht die Uhrzeit mittig
  im Kasten und springt trotzdem nicht. Die große Kopf-Uhr bleibt links, die kompakte Uhr (Medien) rechts
  ausgerichtet, jeweils als ganzer Block.
- **Feste Sekundenfelder aus PR #35 (`ClockDigits`) entfallen.** Die Medien-Uhr ohne grauen Kasten bleibt.
- **Schalter:** neues Feld `DisplayView.clock_seconds` (Boolean, Standard an, Migration `signage` 0055,
  Rückweg `migrate signage 0054`: Sekunden wieder überall). Im Anzeige-Vertrag am Ansichtsobjekt
  (`view.clock_seconds`); Rahmen und Uhren zeigen dann „HH:MM“ statt „HH:MM:SS“. Bei Wechsel- und geteilten
  Ansichten gilt der Schalter der Ansicht, die der Bildschirm gerade zeigt (Wechsel: die jeweils gezeigte).
- **Admin:** Schalter „Sekunden anzeigen“ im Abschnitt „Allgemein“ jeder Ansicht, unter „Wetter anzeigen“.

## Dem Umsetzer überlassen
- Genaue Blockbreiten (an Cabin messen, mit kleinem Puffer).
- Wo die Uhr den Schalter herbekommt (Prop durch Frame/ClockBox).
- Tests und Screenshots.

## Nachtrag (nach dem ersten Screenshot)
Der fest breite Block für die ganze Uhrzeit ließ schmale Zeiten wie „10:42:00“ sichtbar links von der Mitte
der Kästen stehen. Jetzt hat nur das Sekundenpaar ein festes Feld (1,22 em wie „00“, linksbündig); der Rest
der Uhrzeit hat seine natürliche Breite und wird zentriert. Beim Sekundenwechsel bewegt sich weiter nichts
davor; die Abweichung von der Mitte ist höchstens das halbe ungenutzte Sekundenfeld (rund 0,3 em).
