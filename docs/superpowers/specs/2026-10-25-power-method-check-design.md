# Power-Steuerung prüfen und testen

Stand: 25.10.2026 · Status: Entwurf, wartet auf Review

Ziel: Beim Einrichten eines Bildschirms soll man ohne Vorwissen herausfinden, welche Power-Methode (CEC, Netzwerk/SICP, DDC, HDMI-Signal) am angeschlossenen Display funktioniert. Gibt es keine, wird das sauber als „Keine Steuerung“ eingerichtet statt mit Fehlern bei jedem Zeitplanwechsel. Grundlage ist das abgestimmte Mockup vom 25.10.2026 (Abschnitt „Ein- und Ausschalten“ mit Ampelliste und Empfehlung, Testfenster mit Countdown und Rückfrage).

## 1. Methode „Keine Steuerung“

- Neuer Wert `none` in `Screen.POWER_METHOD_CHOICES` (Label „Keine Steuerung“). Migration `signage` 0049: neue Auswahl und **Standard `none` für neue Bildschirme**; bestehende Bildschirme behalten ihre Methode.
- Agent: `NonePower` in `power.py` schaltet nichts; `set()` und `status()` liefern „keine Steuerung“ ohne Fehler. Die Anzeige zeigt außerhalb des Zeitplans weiter den dunklen Ruhebildschirm mit Uhr (`IdleScreen`, gibt es schon).
- Admin: Bei „Keine Steuerung“ steht unter der Auswahl „Das Display bleibt an und zeigt außerhalb des Zeitplans einen dunklen Bildschirm mit Uhr.“ Die Knöpfe „Einschalten“/„Ausschalten“ der Gerätebox sind dann ausgeblendet; das Backend lehnt `power_on`/`power_off` für `none` mit 422 „Für diesen Bildschirm ist keine Power-Steuerung eingerichtet.“ ab.
- Agents vor diesem Update kennen `none` nicht und melden „unbekannte Power-Methode“; das Selbst-Update behebt das. Steht im Rollout in `DEPLOY.md`.

## 2. Automatische Prüfung

Neuer Gerätebefehl `power_probe` (Agent, nur gekoppelte Geräte mit Agent; Recht `signage.devices`). Schaltet nichts, dauert wenige Sekunden.

| Methode | Prüfung | Ergebnis (`ok` / `warn` / `fail` / `skip`) |
|---|---|---|
| CEC | `cec-client -l` (Adapter da?), dann `scan` und `pow 0` | `ok`: Display auf Adresse 0 gefunden und Status lesbar, mit Hersteller/Name (OSD-Name, Vendor) falls gemeldet. `warn`: Display gefunden, Status nicht lesbar. `fail`: kein Adapter oder kein Display. |
| Netzwerk (SICP) | nur wenn `display_ip` eingetragen: TCP auf `display_ip:display_port` (2 s), Statusabfrage `0x19` | `ok`: Antwort. `fail`: keine Verbindung. `skip`: keine IP eingetragen. |
| DDC | `ddcutil detect --brief`, dann `ddcutil getvcp D6` | `ok`: Display gefunden und D6 lesbar. `fail`: sonst. |
| HDMI-Signal | `wlr-randr` (Ausgänge) | immer `warn`, wenn ein Ausgang da ist: „Display bleibt an und zeigt ‚Kein Signal‘.“ |

- Ergebnis als JSON im `result` des Befehls (unter 2000 Zeichen): `{"checked_at": ISO, "methods": [{"method": "cec", "state": "ok", "text": "…", "detail": {...}}], "recommended": "cec"}`. Texte deutsch, wie im Mockup.
- **Empfehlung** in dieser Reihenfolge: CEC `ok` → `cec`; CEC gefunden (ok/warn) und SICP `ok` → `hybrid`; DDC `ok` → `ddc`; sonst `none`. HDMI-Signal wird nie empfohlen, bleibt aber wählbar.
- Jede einzelne Prüfung hat ein eigenes Zeitlimit (CEC 20 s, DDC 15 s, sonst 5 s); ein fehlendes Programm ergibt `fail` mit „Programm fehlt: …“, die Prüfung bricht nicht ab.

## 3. Echter Test

Neue Befehle `power_test` (Parameter `method`, `config`, `seconds`, Standard 15) und `power_test_end`.

- `power_test`: Agent schaltet mit der **übergebenen** Methode aus (nicht mit der gespeicherten), merkt sich den Test und plant das Einschalten nach `seconds`. Antwort sofort: `ok` mit `{"off_at": ISO, "seconds": 15}` oder `failed` mit Fehlertext (dann kein Countdown).
- Nach Ablauf schaltet er mit derselben Methode ein. Danach gilt wieder der Zeitplan: Ist der Bildschirm laut Zeitplan aus, wendet der Agent den Sollzustand mit der gespeicherten Methode an. Zeitplanwechsel während des Tests werden erst danach angewendet.
- `power_test_end` beendet einen laufenden Test sofort mit Einschalten („Abbrechen und einschalten“). Ohne laufenden Test: `ok`, „Kein Test aktiv“.
- Läuft schon ein Test, lehnt der Agent einen zweiten `power_test` ab („Es läuft schon ein Test.“).

## 4. Admin (Bildschirm-Detail, Abschnitt „Ein- und Ausschalten“)

- **Prüfliste:** beim Öffnen des Abschnitts automatisch, sonst über „Erneut prüfen“. Je Methode eine Zeile: Statuspunkt, Name, Ergebnistext, „Testen“ bei `ok`/`warn`. Darüber „Geprüft um HH:MM · ohne den Bildschirm auszuschalten“. Während der Prüfung ein ruhiger Ladezustand je Zeile, kein Spinner über allem.
- **Empfehlung** als hervorgehobene Zeile unter der Liste; bei `none` mit dem Satz aus §1. In der Methoden-Auswahl ist die empfohlene als „(empfohlen)“ markiert; alle Methoden bleiben wählbar.
- **Testfenster:** Kopf „<Methode> testen“ mit Bildschirmname und Ort; großer Countdown („0:11 bis zum Einschalten“), zwei Schritte (Ausschalten gesendet mit Uhrzeit, Einschalten in N Sekunden); „Abbrechen und einschalten“. Danach die Frage „Ist der Bildschirm aus- und wieder angegangen?“ mit Hinweis „Nur ‚Ja‘, wenn er wirklich dunkel war, nicht nur ‚Kein Signal‘ gezeigt hat.“ und den Knöpfen „Nein, nächste Methode testen“ / „Ja, <Methode> übernehmen“. „Ja“ setzt Methode und Konfiguration in den Entwurf der Gerätebox (gespeichert wird wie bisher über die Speicherleiste). „Nein“ öffnet den Test der nächsten getesteten Methode in Empfehlungsreihenfolge; ist keine mehr übrig, schlägt das Fenster „Keine Steuerung“ vor.
- Geräte ohne Agent (altes Skript) und offline Geräte: statt der Liste ein Hinweis („Die Prüfung braucht den Geräte-Agent“ bzw. „Bildschirm ist offline“).
- **Gestaltung:** mit den Skills `impeccable` und `ui-ux-pro-max` ausarbeiten, auf Basis der vorhandenen Bausteine (`Section`, `Button`, `StatusBadge`, Tokens aus `index.css`, `check:tokens` sauber) und des Design-Manifests in `CLAUDE.md`: keine Floskeln, keine Emoji, keine Pill-Buttons, Akzentrot sparsam (nur Fortschritt/primäre Aktion), semantische Farben für die Ampel. Das Mockup ist die Richtung, nicht die Vorgabe bis aufs Pixel.

## 5. Nicht Teil dieser Spec

- Ausgabe der Prüfung im Install-Skript.
- Automatisches Umschalten der Methode ohne Bestätigung.
- Trixie-Unterstützung des Install-Skripts.

## 6. Tests

- Agent (`python3 -m unittest`): `NonePower`; `power_probe` mit gefälschtem Runner für jede Methode und jeden Zustand inklusive fehlendem Programm und Zeitlimit; Empfehlungsreihenfolge; `power_test` schaltet mit der übergebenen Methode, plant das Einschalten, stellt danach den Zeitplan wieder her, lehnt einen zweiten Test ab; `power_test_end`.
- Backend: Migration 0049 (neue Bildschirme `none`, bestehende unverändert); neue Befehlsarten erlaubt, `power_test` prüft Methode und Konfiguration; `power_on`/`power_off` bei `none` abgelehnt; Rechte.
- Frontend (vitest): Prüfliste aus einem Ergebnis-JSON, Empfehlung inkl. `none`, Testablauf (Countdown, Abbrechen, Ja übernimmt in den Entwurf, Nein springt weiter), Zustände ohne Agent/offline; Screenshots über `shoot-admin.mjs` (neue Szenen) im Hell- und Dunkel-Schema.
- Echte Hardware: einmal an glocke (CEC) durchspielen; das ist manuell und steht im Rollout.

## 7. Rollout

Ein Pull Request (Commits und PR auf Englisch). Nach dem Deploy aktualisieren sich die Agents selbst; bis dahin ist die Prüfung für ein Gerät mit altem Agent ausgegraut („Agent-Update nötig“). Dafür steigt `agent/VERSION` auf die nächste Minor-Version; das Admin vergleicht mit der gemeldeten Agent-Version. Rückweg: `migrate signage 0048` setzt `none` auf `cec` zurück.
