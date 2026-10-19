# Bühnenschwarz: semantisches Design-System für Stagedesk

Stand: 2026-10-19 · Branch: `claude/dashboard-craft-ux-wave-2-1cj1jw`

## Ziel

Stagedesk soll nicht mehr nach generischem Tailwind-/KI-Look aussehen. Der auffälligste Grund ist die blaustichige Tailwind-Grau-Skala (`gray-950 #0a0e14`, `gray-900 #111827`, `gray-800 #1f2937`), dazu fünf Muster:

- A: Karten überall (`bg-gray-900 border rounded-xl` als Standardcontainer, Karten in Karten)
- B: eine große Rundung für alles
- C: Rahmen statt Flächen (Ebenen per `border-gray-700/800` getrennt)
- D: getönte Icon-Kacheln
- E: weiches Leuchten (`bg-accent/10`, `ring-accent/25`, halbtransparente Status-Tönungen)

Die App-Oberfläche wird komplett auf semantische Tokens umgestellt („Weg 2“). Die Monitore (Anzeige-Seiten und Monitor-Admin) kommen später.

## Feste Rahmenbedingungen

- Dunkles Theme, Akzent TUES-Rot `#da1f3d`, Display-Schrift Barlow Semi Condensed, UI-Sprache Deutsch.
- Design-Manifest aus `CLAUDE.md`: keine Lila-Verläufe, keine Pill-Buttons, keine Emoji-Icons, keine Em-Dashes im sichtbaren Text, keine Floskeln, keine Fake-Metriken.
- Nur Optik und Copy. Keine Änderungen an Logik, Datenfluss, API-Aufrufen, Routen oder Berechtigungen.
- Props der Bausteine in `frontend/src/components/ui/` bleiben stabil.
- Kein Deploy.

## Nicht im Umfang

- `frontend/src/pages/MonitorPage.jsx`, `frontend/src/pages/AufgabenMonitorPage.jsx`, `frontend/src/components/monitor/**` (nutzen keine Tailwind-Grautöne, bleiben unberührt).
- `frontend/src/pages/admin/MonitorAdminPage.jsx` (bleibt auf der alten Grau-Skala, eigener späterer Durchgang).
- `frontend/src/pages/DesignTestPage.jsx`.
- Neugestaltung des Hell-Modus: Er bekommt passende Token-Werte, damit nichts bricht, wird aber nicht separat gestaltet.

## 1. Tokens

### Mechanik

In `frontend/src/index.css`:

- Farbwerte als CSS-Variablen auf `:root` (Dunkel, Standard) und `:root.light` (Hell).
- `@theme inline { --color-canvas: var(--sd-canvas); … }` erzeugt die Tailwind-Klassen (`bg-canvas`, `text-fg-muted`, `border-line` usw.).
- Die alte Tailwind-Grau-Skala bleibt unverändert, damit nicht migrierte Dateien (Monitor-Admin) weiter funktionieren.
- Die bisherigen `:root.light .bg-gray-*`-Overrides bleiben bestehen. Sie greifen nur auf alte `gray-*`-Klassen und betreffen nach der Migration nur noch die Monitor-Admin.

### Flächen

| Token | Dunkel | Hell | Verwendung |
|---|---|---|---|
| `canvas` | `#0d0c0b` | `#f6f4f1` | App-Hintergrund |
| `surface` | `#151412` | `#ffffff` | Seitenleiste, Panels, Tabellen, Listen |
| `raised` | `#1e1c1a` | `#efece8` | Eingabefelder, Chips, Badges, Hover auf `surface`, ausgewählter Zustand |
| `overlay` | `#211f1c` | `#ffffff` | Modals, Dropdowns, Popover |
| `hover` | `#2a2825` | `#e6e2dc` | Hover auf `raised` |

### Linien

| Token | Dunkel | Hell | Verwendung |
|---|---|---|---|
| `line-subtle` | `#24221f` | `#ebe7e2` | Trennlinien in Listen und Tabellen, Abschnittstrenner |
| `line` | `#35322e` | `#d9d4cd` | Rahmen von Eingabefeldern und Overlays |
| `line-strong` | `#4b4742` | `#b8b1a8` | Hover-/Fokus-Rahmen an Eingabefeldern |

### Text

| Token | Dunkel | Hell | Verwendung |
|---|---|---|---|
| `fg` | `#f2efe9` | `#1a1816` | Haupttext, Überschriften |
| `fg-muted` | `#b3ada4` | `#57524b` | Sekundärtext |
| `fg-subtle` | `#8a847b` | `#767067` | Meta, Hinweise, Icons (≥ 4,5:1 auf `surface`) |
| `fg-disabled` | `#5f5a53` | `#a59f96` | nur deaktivierte Elemente |

### Akzent und Status

| Token | Dunkel | Hell | Verwendung |
|---|---|---|---|
| `accent` | `#da1f3d` | `#da1f3d` | Primär-Button, aktive Indikatoren, Ungelesen-Punkt |
| `accent-hover` | `#bd1a34` | `#bd1a34` | Hover Primär-Button |
| `accent-fg` | `#f0475f` | `#b8152f` | roter Text/Icon auf Fläche (≥ 4,5:1) |
| `ok` | `#5fca8b` | `#1f7a47` | positiv, verfügbar, anwesend |
| `warn` | `#e5b14a` | `#93630c` | Warnung, bald fällig, krank |
| `bad` | `#ef5d5d` | `#b42323` | Gefahr, überfällig, abwesend, löschen |
| `info` | `#6fa8dc` | `#235f96` | Info, Status, teilweise |

`--color-accent` und `--color-accent-hover` existieren bereits und behalten ihre Werte.

### Rundung

| Klasse | Wert | Verwendung |
|---|---|---|
| `rounded-sm` | 4 px | Chips, Badges, kbd, kleine Icon-Buttons |
| `rounded-md` | 6 px | Buttons, Eingabefelder, Selects, gefüllte Tabs |
| `rounded-lg` | 8 px | Panels, Modals, Dropdowns, klickbare Objekt-Karten |
| `rounded-full` | – | nur Avatare, Statuspunkte, Schalter |

`rounded-xl`, `rounded-2xl`, `rounded-3xl` kommen in der App-Oberfläche nicht mehr vor. Die Werte entsprechen den Tailwind-v4-Standards, es sind keine eigenen Radius-Tokens nötig. `rounded` ohne Suffix wird zu `rounded-sm` vereinheitlicht.

### Schatten

Nur Overlays bekommen einen Schatten, mit Versatz und weichem Blur: `--shadow-overlay: 0 12px 32px -8px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.4)` (Klasse `shadow-overlay`). Keine Schatten auf Panels oder Karten.

## 2. Form, Ebenen, Zustände

### Ebenen

- Flächen trennen sich durch Helligkeit (`canvas` → `surface` → `raised`), nicht durch Rahmen.
- Rahmen nur an: Eingabefeldern (`border-line`), Overlays (`border-line` plus `shadow-overlay`) und Trennlinien in Listen/Tabellen/zwischen Abschnitten (`border-line-subtle`, `divide-line-subtle`).
- Keine Karten als Standardcontainer. Eine Seite ist eine Fläche mit Abschnitten (Überschrift + Trennlinie). Karten nur für eigenständige, klickbare Objekte (z.B. Veranstaltung, Haushalt, Anwesenheitsliste in Übersichten): `bg-surface rounded-lg`, ohne Rahmen, Hover `bg-raised`.
- Nie Karten in Karten.
- Listen (Teilnehmer, Benachrichtigungen, Mitglieder, Berechtigungen, Sitzungen …) sind eine `surface`-Fläche mit Zeilen und `divide-line-subtle`.

### Icons

- Keine getönten Icon-Kacheln (`w-9 h-9 rounded-lg bg-…`). Icons stehen frei, Farbe `text-fg-subtle`, außer sie tragen Status (dann Statusfarbe).
- Leerzustand: freistehendes Icon (24 px, `fg-subtle`), Titel, ein Satz, optional eine Aktion.

### Zustände

| Zustand | Darstellung |
|---|---|
| Hover | eine Stufe heller: `surface` → `raised`, `raised` → `hover` |
| Ausgewählt/aktiv | `bg-raised`, Text `fg`, Icon `accent-fg`; in Navigation und Tabs zusätzlich 2 px Strich in `accent` (Navigation links innen, Tabs unten) |
| Ungelesen/markiert | Punkt `bg-accent` (6 px) vor dem Text, keine Zeilentönung |
| Fokus | `focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-canvas` |
| Deaktiviert | Text `fg-disabled`, keine Komponenten-Transparenz |
| Fehler im Formular | Rahmen `border-bad`, Hinweistext `text-bad` direkt unter dem Feld |

### Badges (`StatusBadge`)

`bg-raised rounded-sm`, Statuspunkt (`bg-<status>`) und Text in der Statusfarbe (`text-<status>`), kein Ring, keine Tönung. Ton-Mapping: `positive → ok`, `warning → warn`, `danger → bad`, `info → info`, `accent → accent-fg`, `neutral → fg-muted` (Punkt `fg-subtle`).

### Buttons (`Button`)

| Variante | Darstellung |
|---|---|
| `primary` | `bg-accent text-white`, Hover `bg-accent-hover`, einmal pro Ansicht |
| `secondary` | `bg-raised text-fg`, kein Rahmen, Hover `bg-hover` |
| `ghost` | transparent, `text-fg-muted`, Hover `bg-raised text-fg` |
| `danger` | `text-bad`, transparent, Hover `bg-raised`; gefüllt rot nur im Bestätigungsdialog (`className`-Override an dieser Stelle) |

Alle `rounded-md`. Größen bleiben (`sm`, `md`).

### Weitere Bausteine

- `PageHeader`: unverändert in Struktur und Props; Farben auf Tokens (`fg`, `fg-subtle`).
- `StatTile`: keine Karte mehr, sondern Kennzahl auf `surface` ohne Rahmen, `rounded-lg`; Wertfarben über Status-Tokens.
- `EmptyState`: ohne Icon-Kachel (siehe oben).

### Eingabefelder

`bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle`, Hover `border-line-strong`, Fokus `border-accent ring-1 ring-accent`. Label sichtbar über dem Feld (`text-sm font-medium text-fg-muted`).

### Modals

Hintergrund `bg-black/70` (ohne Blur), Fenster `bg-overlay border border-line rounded-lg shadow-overlay`. Kopf ohne Icon-Kachel, Fuß mit Aktionen rechts, getrennt durch `border-line-subtle`.

## 3. Ersetzungstabelle (Startpunkt, nicht mechanisch)

| Alt | Neu (Standardfall) |
|---|---|
| `bg-gray-950` | `bg-canvas` |
| `bg-gray-900` | `bg-surface` (oder ganz weg, wenn es nur ein Karten-Wrapper war) |
| `bg-gray-800`, `bg-gray-800/xx` | `bg-raised` |
| `bg-gray-700`, `hover:bg-gray-700` | `bg-hover` |
| `border-gray-800` | `border-line-subtle` (oft ganz weg, siehe Ebenen) |
| `border-gray-700`, `border-gray-600` | `border-line` (Inputs/Overlays) oder weg |
| `divide-gray-800` | `divide-line-subtle` |
| `text-white` (auf Fläche) | `text-fg` (`text-white` bleibt nur auf `bg-accent`) |
| `text-gray-200`, `text-gray-300` | `text-fg` bzw. `text-fg-muted` |
| `text-gray-400` | `text-fg-muted` |
| `text-gray-500` | `text-fg-subtle` |
| `text-gray-600` | `text-fg-subtle` (Text) bzw. `text-fg-disabled` (deaktiviert) |
| `text-green-*`/`emerald-*` (Status) | `text-ok` |
| `text-amber-*`/`yellow-*` (Status) | `text-warn` |
| `text-red-*` (Status) | `text-bad` |
| `text-sky-*`/`blue-*` (Status) | `text-info` |
| `bg-accent/<n>`, `ring-accent/<n>` | `bg-raised` + `text-accent-fg`/Indikator |
| `bg-<farbe>-500/<n>` + `ring` (Tönung) | `bg-raised` + Punkt/Text in Statusfarbe |
| `rounded-xl`, `rounded-2xl` | `rounded-lg` (Panels/Modals) bzw. `rounded-md` (Controls) |
| `text-accent` (Text auf Fläche) | `text-accent-fg` |

Fachfarben, die Daten sind (Kalender-Kategorien, Kompetenz-Kategorie-Farben, Veranstaltungs-Farben aus der DB, Inline-`style`-Farben), bleiben unverändert.

## 4. Stufen und Arbeitspakete

1. **Tokens und Wächter:** `index.css`, `frontend/scripts/check-tokens.mjs`, `npm run check:tokens`.
2. **Bausteine:** `components/ui/*`.
3. **Gerüst:** `DashboardLayout`, `LoginPage`, `GlobalSearchModal`, `NotificationBell`, `ShortcutsModal`, `SessionTimeoutGuard`, `ProtectedRoute`, `PermissionRoute`, `App.jsx`, `Markdown`, `AutocompleteInput`, `QRScanner`, `SignatureModal`.
4. **Module (parallelisierbar, je ein Paket):**
   - Dashboard: `DashboardPage`, `components/dashboard/*`
   - Veranstaltungen: `pages/veranstaltung/**`, `VeranstaltungTemplateModal`
   - Inventar: `pages/inventar/*`
   - Kalender: `pages/kalender/*`, `components/kalender/*`
   - Anwesenheit: `pages/anwesenheit/*`
   - Kompetenzen: `pages/kompetenzen/*`
   - Haushalte: `pages/haushalte/*`, `ArtikelModal`, `ArtikelDetailsPanel`, `CreateHaushaltModal`, `EditHaushaltModal`, `SammelQuittungModal`
   - Admin + Konto: `pages/admin/*` außer `MonitorAdminPage`, `SettingsPage`, `NotificationsPage`
5. **Abschluss:** Wächter über alles, Detektor, Screenshots (siehe Absicherung).

## 5. Absicherung

- **Token-Wächter** `npm run check:tokens`: schlägt fehl, wenn in `frontend/src` außerhalb der Ausnahmeliste eines dieser Muster vorkommt: `\b(bg|text|border|ring|divide|from|to|via|placeholder|outline|fill|stroke)-gray-\d`, `rounded-(xl|2xl|3xl)`, `(bg|ring|border)-accent/\d`. Ausnahmeliste: `pages/admin/MonitorAdminPage.jsx`, `pages/MonitorPage.jsx`, `pages/AufgabenMonitorPage.jsx`, `components/monitor/**`, `pages/DesignTestPage.jsx`. Mit Parameter `--only <pfade>` prüfbar pro Paket.
- **Nach jedem Paket:** `npm run build` (exit 0) und `npm run check:tokens -- --only <paket-pfade>` (exit 0).
- **Code-Review pro Paket** (Superpowers: Spec-Konformität, dann Code-Qualität): keine Logikänderung im Diff (nur `className`, `style` für Farben, sichtbare Texte), Spec-Regeln eingehalten.
- **Abschluss:** `npm run build`, `npm run check:tokens` ohne Einschränkung, Impeccable-Detektor über alle geänderten Dateien, Screenshots von `/login` und `/aufgaben-monitor` (Letzterer darf sich nicht verändert haben).
- Eingeloggte Seiten prüft der Nutzer auf localhost.

## 6. Erfolgskriterien

- `npm run check:tokens` und `npm run build` laufen ohne Fehler.
- In der App-Oberfläche kommt kein blaustichiges Grau mehr vor; der Hintergrund ist `#0d0c0b`.
- Keine Icon-Kacheln, keine Karten in Karten, keine Akzent-/Status-Tönungen, keine `rounded-xl`+ mehr.
- Monitor-Anzeigen und Monitor-Admin sehen unverändert aus.
- Kein Diff außerhalb von Klassen, Farb-Styles und sichtbaren Texten.
