# Vertretungsplan: bei vielen Vertretungen ganze Breite für heute

## Warum
An Tagen mit vielen Vertretungen blättert der heutige Plan durch viele Seiten, während daneben „Morgen“ oder
Medien stehen. Schüler warten zu lange auf ihre Klasse. Dann soll der heutige Plan beide Hälften bekommen.
Konkreter Fall: ein Bildschirm mit geteilter Ansicht, links Vertretungsplan, rechts Medien.

## Ziele
- Hat der heutige Plan auf diesem Bildschirm mehr als x Seiten, zeigt er heute in zwei Spalten nebeneinander:
  links Seite 1, rechts Seite 2, dann 3 und 4 und so weiter, gemeinsam im Blättertakt.
- Dafür entfallen „Morgen“ (Vertretungsplan-Ansicht) bzw. die Medien- oder Ankündigungen-Seite (geteilte
  Ansicht). Sind es wieder höchstens x Seiten, kommt das Vorherige von selbst zurück.
- Einstellbar pro Ansicht im Abschnitt Vertretungsplan:
  „Bei vielen Vertretungen ganze Breite für heute: Aus / ab 2 Seiten / ab 3 Seiten / ab 4 Seiten“, Standard Aus.

## Nicht-Ziele / Anti-Ziele
- Eine Abfahrten-Seite wird nie überlagert (zeitkritisch).
- Keine Regel nach Anzahl der Einträge auf dem Server: die Seitenzahl entsteht erst auf dem Bildschirm.
- Kein Flackern zwischen beiden Darstellungen.

## Ansätze (gewählt: A)
- **A. Der Bildschirm entscheidet nach seiner echten Seitenzahl** (gewählt): die Anzeige zählt die Seiten
  ohnehin; „x“ passt genau zu dem, was man sieht, auch in der Vorschau.
- B. Der Server entscheidet nach Anzahl der Vertretungen: einfacher, aber die Zahl passt je nach Bildschirm
  nicht zur sichtbaren Seitenzahl.

## Entwurf
- **Feld:** `DisplayView.substitutions_expand_pages` (Ganzzahl, 0 = aus, sonst 2 bis 4; Standard 0).
  Migration `signage` 0056, Rückweg `migrate signage 0055` (Verhalten wie bisher). Im Anzeige-Vertrag in den
  Vertretungsplan-Daten als `expand_pages`, auch in der Vertretungsplan-Seite einer geteilten Ansicht.
- **Vertretungsplan-Ansicht:** stehen zwei Tage nebeneinander oder untereinander (Hochformat) und hat heute
  mehr als `expand_pages` Seiten, zeigen beide Felder heute: das erste die ungeraden Seiten (1, 3, …), das
  zweite die jeweils folgende (2, 4, …), mit derselben Überschrift und eigener Seitenangabe („Seite 2 / 5“).
  Bei ungerader Seitenzahl bleibt das zweite Feld auf der letzten Doppelseite ohne Zeilen.
  Zeigt die Ansicht ohnehin nur heute über die ganze Breite (vor der „Morgen“-Uhrzeit) oder blättert sie die
  Tage nacheinander (schmale Fläche), ändert sich nichts.
- **Geteilte Ansicht:** ist eine Seite Vertretungsplan und die andere Medien oder Ankündigungen, übernimmt der
  Vertretungsplan bei mehr als `expand_pages` Seiten die ganze Breite in zwei gleich breiten Spalten (die
  eingestellte Breite zählt dann nicht), wie oben. Abfahrten als andere Seite: nichts ändert sich.
- **Kein Flackern:** entschieden wird nach der Seitenzahl, die gerade gezeigt wird. Die zwei Spalten sind nie
  breiter als das Feld vorher, haben also mindestens so viele Seiten; ein Zurückschalten passiert erst, wenn
  auch in zwei Spalten höchstens `expand_pages` Seiten übrig sind.
- **Admin:** Auswahl im Abschnitt Vertretungsplan (Ansicht Vertretungsplan und geteilte Ansicht mit
  Vertretungsplan-Seite), Hilfetext: „Hat heute mehr Seiten, bekommt heute beide Hälften. Abfahrten bleiben
  immer stehen.“

## Dem Umsetzer überlassen
- Wie die Seitenzahl von der Vertretungsplan-Seite an die geteilte Ansicht gemeldet wird.
- Tests (Seitenzahl im Test vorgeben) und Screenshots mit langer Testliste.
