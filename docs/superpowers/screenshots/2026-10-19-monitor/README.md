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
