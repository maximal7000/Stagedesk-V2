# Screenshots der Anzeige (2026-10-19)

Erzeugt mit `cd frontend && node scripts/shoot-display.mjs` (3840x2160, Hochformat 2160x3840). Testdaten: `frontend/tests/display-fixtures/`.

Namensschema: `display-<testdatei>[-<stil>][-portrait].png`. Ohne Stilangabe gilt der Stil der Testdatei; `-ci`, `-dense`, `-dark` überschreiben `view.style`. Vollflächige Sondermodi (Notfall, Klausur, On-Air) sehen in allen Stilen gleich aus; bei Splitscreen-Sondermodi gilt der Stil für die Ansicht daneben. Ruhemodus und Zustandsbilder sind stilunabhängig und nur einmal vorhanden.

| Bild | Zeigt |
|---|---|
| `display-departures-ci-portrait.png` | Abfahrten, Stil ci, Hochformat |
| `display-departures-ci.png` | Abfahrten, Stil ci |
| `display-departures-dark-portrait.png` | Abfahrten, Stil dark, Hochformat |
| `display-departures-dark.png` | Abfahrten, Stil dark |
| `display-departures-dense-portrait.png` | Abfahrten, Stil dense, Hochformat |
| `display-departures-dense.png` | Abfahrten, Stil dense |
| `display-departures.png` | Abfahrten |
| `display-idle.png` | Ruhemodus (Power aus) |
| `display-info-ci-portrait.png` | Info, Stil ci, Hochformat |
| `display-info-ci.png` | Info, Stil ci |
| `display-info-dark-portrait.png` | Info, Stil dark, Hochformat |
| `display-info-dark.png` | Info, Stil dark |
| `display-info-dense-portrait.png` | Info, Stil dense, Hochformat |
| `display-info-dense.png` | Info, Stil dense |
| `display-info.png` | Info |
| `display-long-departures-ci.png` | Abfahrten, 6 Haltestellen, Stil ci |
| `display-long-departures-dark.png` | Abfahrten, 6 Haltestellen, Stil dark |
| `display-long-departures-dense.png` | Abfahrten, 6 Haltestellen, Stil dense |
| `display-long-departures.png` | Abfahrten, 6 Haltestellen |
| `display-long-info-ci-portrait.png` | Info mit 12 Ankündigungen und 14 Terminen (Seitenwechsel), Stil ci, Hochformat |
| `display-long-info-ci.png` | Info mit 12 Ankündigungen und 14 Terminen (Seitenwechsel), Stil ci |
| `display-long-info-dark-portrait.png` | Info mit 12 Ankündigungen und 14 Terminen (Seitenwechsel), Stil dark, Hochformat |
| `display-long-info-dark.png` | Info mit 12 Ankündigungen und 14 Terminen (Seitenwechsel), Stil dark |
| `display-long-info-dense-portrait.png` | Info mit 12 Ankündigungen und 14 Terminen (Seitenwechsel), Stil dense, Hochformat |
| `display-long-info-dense.png` | Info mit 12 Ankündigungen und 14 Terminen (Seitenwechsel), Stil dense |
| `display-long-info.png` | Info mit 12 Ankündigungen und 14 Terminen (Seitenwechsel) |
| `display-long-substitutions-ci.png` | Vertretungsplan, viele Zeilen (Seitenwechsel), Stil ci |
| `display-long-substitutions-dark.png` | Vertretungsplan, viele Zeilen (Seitenwechsel), Stil dark |
| `display-long-substitutions-dense.png` | Vertretungsplan, viele Zeilen (Seitenwechsel), Stil dense |
| `display-long-substitutions.png` | Vertretungsplan, viele Zeilen (Seitenwechsel) |
| `display-lost.png` | Zustand Verbindung verloren |
| `display-media-landscape-ci.png` | Medien Querformat, Stil ci |
| `display-media-landscape-dark.png` | Medien Querformat, Stil dark |
| `display-media-landscape-dense.png` | Medien Querformat, Stil dense |
| `display-media-landscape.png` | Medien Querformat |
| `display-media-portrait-ci-portrait.png` | Medien, Hochformat-Seiten auf Hochformat-Bildschirm, Stil ci |
| `display-media-portrait-ci.png` | Medien, Hochformat-Seiten auf Querformat-Bildschirm, Stil ci |
| `display-media-portrait-dark-portrait.png` | Medien, Hochformat-Seiten auf Hochformat-Bildschirm, Stil dark |
| `display-media-portrait-dark.png` | Medien, Hochformat-Seiten auf Querformat-Bildschirm, Stil dark |
| `display-media-portrait-dense-portrait.png` | Medien, Hochformat-Seiten auf Hochformat-Bildschirm, Stil dense |
| `display-media-portrait-dense.png` | Medien, Hochformat-Seiten auf Querformat-Bildschirm, Stil dense |
| `display-media-portrait.png` | Medien, Hochformat-Seiten auf Querformat-Bildschirm |
| `display-mode-emergency-ci.png` | Sondermodus Notfall, Stil ci |
| `display-mode-emergency-dark.png` | Sondermodus Notfall, Stil dark |
| `display-mode-emergency-dense.png` | Sondermodus Notfall, Stil dense |
| `display-mode-emergency-lost.png` | Sondermodus Notfall, Verbindung verloren (Notfall bleibt stehen) |
| `display-mode-emergency.png` | Sondermodus Notfall |
| `display-mode-exam-full-ci.png` | Klausur vollflächig, Stil ci |
| `display-mode-exam-full-dark.png` | Klausur vollflächig, Stil dark |
| `display-mode-exam-full-dense.png` | Klausur vollflächig, Stil dense |
| `display-mode-exam-full.png` | Klausur vollflächig |
| `display-mode-exam-split-ci.png` | Klausur im Splitscreen, Stil ci |
| `display-mode-exam-split-dark.png` | Klausur im Splitscreen, Stil dark |
| `display-mode-exam-split-dense.png` | Klausur im Splitscreen, Stil dense |
| `display-mode-exam-split.png` | Klausur im Splitscreen |
| `display-mode-onair-full-ci.png` | On-Air vollflächig, Stil ci |
| `display-mode-onair-full-dark.png` | On-Air vollflächig, Stil dark |
| `display-mode-onair-full-dense.png` | On-Air vollflächig, Stil dense |
| `display-mode-onair-full-stale.png` | On-Air vollflächig, Daten veraltet (Stand HH:MM) |
| `display-mode-onair-full.png` | On-Air vollflächig |
| `display-mode-onair-split-ci.png` | On-Air im Splitscreen, Stil ci |
| `display-mode-onair-split-dark.png` | On-Air im Splitscreen, Stil dark |
| `display-mode-onair-split-dense.png` | On-Air im Splitscreen, Stil dense |
| `display-mode-onair-split.png` | On-Air im Splitscreen |
| `display-rotation-ci.png` | Wechsel (Unteransicht Info), Stil ci |
| `display-rotation-dark.png` | Wechsel (Unteransicht Info), Stil dark |
| `display-rotation-dense.png` | Wechsel (Unteransicht Info), Stil dense |
| `display-rotation.png` | Wechsel (Unteransicht Info) |
| `display-screen-not-found.png` | Unbekannter Bildschirm |
| `display-split-ci.png` | Splitscreen Vertretungsplan und Abfahrten, Stil ci |
| `display-split-dark.png` | Splitscreen Vertretungsplan und Abfahrten, Stil dark |
| `display-split-dense.png` | Splitscreen Vertretungsplan und Abfahrten, Stil dense |
| `display-split.png` | Splitscreen Vertretungsplan und Abfahrten |
| `display-stale.png` | Zustand Daten veraltet (Stand HH:MM) |
| `display-substitutions-ci-portrait.png` | Vertretungsplan, Stil ci, Hochformat |
| `display-substitutions-ci.png` | Vertretungsplan, Stil ci |
| `display-substitutions-dark-portrait.png` | Vertretungsplan, Stil dark, Hochformat |
| `display-substitutions-dark.png` | Vertretungsplan, Stil dark |
| `display-substitutions-dense-portrait.png` | Vertretungsplan, Stil dense, Hochformat |
| `display-substitutions-dense.png` | Vertretungsplan, Stil dense |
| `display-substitutions-fallback-ci.png` | Vertretungsplan, WebUntis-iframe als Ausweichseite, Stil ci |
| `display-substitutions-fallback-dark.png` | Vertretungsplan, WebUntis-iframe als Ausweichseite, Stil dark |
| `display-substitutions-fallback-dense.png` | Vertretungsplan, WebUntis-iframe als Ausweichseite, Stil dense |
| `display-substitutions-fallback.png` | Vertretungsplan, WebUntis-iframe als Ausweichseite |
| `display-substitutions.png` | Vertretungsplan |

# Screenshots des Monitor-Admin (2026-10-19)

Erzeugt mit `cd frontend && node scripts/shoot-admin.mjs` (1440x900, lange Seiten höher). Testdaten: `frontend/tests/admin-fixtures/`, Varianten in Unterordnern (`override`, `empty`, `error`, `offline`, `missing`, `view-only`, `onair-only`, `power-only`, `day-off`, `emergency`, `media-processing`, `schedules`). Zeitpunkt: Di 20.10.2026, 10:00.

| Bild | Zeigt |
|---|---|
| `admin-overview.png` | Übersicht: On-Air, Notfall, laufende Klausur, Bildschirm-Tabelle mit „Zeigt gerade“, Datenquellen, Demnächst |
| `admin-overview-view-only.png` | Übersicht nur lesend (nur `monitor.view`): keine Schalter, Sidebar nur mit Übersicht |
| `admin-overview-empty.png` | Übersicht ohne Bildschirme (leerer Zustand) |
| `admin-overview-error.png` | Übersicht, Bildschirm-Liste antwortet mit 503: Fehlertext mit Ursache und nächstem Schritt, On-Air und Notfall bleiben schaltbar |
| `admin-overview-emergency-dialog.png` | Dialog „Notfall auslösen“ mit Vorlagen |
| `admin-overview-emergency-menu.png` | Notfall aktiv, Menü „Weitere Aktionen“ einer Zeile |
| `admin-overview-day-off.png` | Bildschirme „bis Tagesende aus“ |
| `admin-overview-override-menu.png` | Glocke mit manueller Ansicht bis 14:00, Zeilenmenü mit „Manuelle Ansicht aufheben“ |
| `admin-overview-undo.png` | On-Air geschaltet, Meldung mit „Rückgängig“ |
| `admin-overview-pair-dialog.png` | Dialog "Bildschirm koppeln": Code vom Bildschirm eingeben, vorhandenen Bildschirm wählen |
| `admin-overview-pair-new-screen.png` | Dialog "Bildschirm koppeln", neuen Bildschirm anlegen (Name, Ort) |
| `admin-screens.png` | Bildschirm-Liste |
| `admin-screens-empty.png` | Bildschirm-Liste ohne Einträge |
| `admin-screen-detail.png` | Bildschirm-Detail: Anzeige, Andere Ansicht vorübergehend, Ein- und Ausschalten, Gerät mit Befehlen, Kiosk-URL, Protokoll, Löschen |
| `admin-screen-detail-override.png` | Bildschirm-Detail mit aktiver vorübergehender Ansicht („Zeigt „Abfahrten“ bis …“, Aufheben) |
| `admin-screen-delete-dialog.png` | Bestätigung „Glocke löschen?“ (endgültig, ohne Papierkorb) |
| `admin-screen-detail-dirty.png` | Bildschirm-Detail mit ungespeicherten Änderungen (SaveBar) |
| `admin-screen-detail-power-only.png` | Bildschirm-Detail nur mit `monitor.power`: Anzeige lesend, keine Kiosk-URL |
| `admin-screen-detail-key.png` | Bestätigung „Schlüssel neu erzeugen“ |
| `admin-screen-detail-device.png` | Bildschirm-Detail, Box "Gerät": Telemetrie in Gruppen, Befehle, letzter Screenshot, Entkoppeln |
| `admin-screen-detail-device-offline.png` | Box "Gerät" bei einem Gerät ohne Verbindung (Befehle bleiben 5 Minuten offen) |
| `admin-screen-detail-log.png` | Abschnitt "Protokoll": Ereignisse und Befehle mit Filter |
| `admin-screen-detail-reboot-confirm.png` | Bestätigung "Pi neu starten" |
| `admin-views.png` | Ansichten-Liste mit „Verwendet auf“ |
| `admin-views-empty.png` | Ansichten-Liste ohne Einträge |
| `admin-view-new.png` | Neue Ansicht: Typ-Wahl, Typ Abfahrten gewählt |
| `admin-view-edit-departures.png` | Ansicht Abfahrten mit Live-Vorschau, Stil Dunkel, Störungsfilter |
| `admin-view-edit-rotation.png` | Ansicht Wechsel |
| `admin-view-edit-info.png` | Ansicht Info |
| `admin-view-edit-split.png` | Ansicht Splitscreen |
| `admin-view-edit-media.png` | Ansicht Medien |
| `admin-view-edit-missing.png` | Ansicht nicht gefunden (404) |
| `admin-view-delete-dialog.png` | Bestätigung „Ansicht löschen?“ mit Hinweis auf betroffene Bildschirme |
| `admin-stop-filter-dialog.png` | Filter-Dialog einer Haltestelle |
| `admin-exams.png` | Klausuren & Termine: Läuft gerade, Kommt, Vergangen, Ankündigungen |
| `admin-exams-empty.png` | Klausuren & Termine ohne Einträge |
| `admin-exams-offline.png` | Klausuren & Termine ohne Verbindung zum Server |
| `admin-exam-form.png` | Seitenpanel „Klausur bearbeiten“ |
| `admin-exam-template-menu.png` | Menü „Aus Vorlage“ |
| `admin-event-form.png` | Seitenpanel Termin mit Zuordnung Bildschirm zu Ansicht |
| `admin-media.png` | Medien: Kacheln mit erster Seite, Status |
| `admin-media-empty.png` | Medien ohne Dateien |
| `admin-media-processing.png` | Medien, eine Datei wird vorbereitet, eine fehlgeschlagen |
| `admin-media-detail.png` | Detailpanel einer Datei: Verwendet in, alle Seiten |
| `admin-schedules.png` | Ferien & Zeitpläne: Ferientabelle, Wochenübersicht je Bildschirm |
| `admin-schedules-empty.png` | Ferien & Zeitpläne ohne Ferien und Bildschirme |
| `admin-settings.png` | Einstellungen: WebUntis mit Testergebnis, Notfall-Vorlagen, On-Air, Wetter |
| `admin-settings-onair-only.png` | Einstellungen nur mit `monitor.onair`: WebUntis lesend, On-Air bearbeitbar |
| `admin-settings-devices.png` | Einstellungen, Abschnitt Geräte: Warnschwellen, Offline-Minuten, "Nur Geräte mit Token zulassen", Installationsbefehl |
