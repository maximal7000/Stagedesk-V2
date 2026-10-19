# Bühnenschwarz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Stagedesk-App-Oberfläche (ohne Monitore) von der blaustichigen Tailwind-Grau-Skala auf semantische Bühnenschwarz-Tokens umstellen und dabei Karten-Wildwuchs, Einheitsrundung, Rahmen-Gitter, Icon-Kacheln und Akzent-Tönungen entfernen.

**Architecture:** Tokens als CSS-Variablen in `frontend/src/index.css` (`:root` / `:root.light`), per Tailwind-v4 `@theme inline` als Klassen verfügbar. Ein Node-Skript `frontend/scripts/check-tokens.mjs` verbietet Alt-Muster außerhalb einer Ausnahmeliste und ist der Test jeder Aufgabe. Danach Bausteine, Gerüst und acht unabhängige Modulpakete, die parallel in eigenen Git-Worktrees laufen.

**Tech Stack:** React 19, Vite, Tailwind CSS v4 (`@theme` in `src/index.css`, keine `tailwind.config.js`), lucide-react, Node ≥ 20 (`node:test`).

**Spec:** `docs/superpowers/specs/2026-10-19-buehnenschwarz-design.md` (Werte, Regeln und Ersetzungstabelle stehen dort; jede Aufgabe liest die Spec mit).

## Global Constraints

- Nur Optik und Copy: geändert werden dürfen `className`-Strings, Farb-Werte in `style`, sichtbare Texte und reine Wrapper-Elemente (`div`/`span` ohne Handler). Keine Änderungen an Hooks, State, Handlern, API-Aufrufen, Routen, Berechtigungsprüfungen, Props-Signaturen.
- Props der Bausteine in `frontend/src/components/ui/` bleiben stabil (Button: `variant size icon as className`; PageHeader: `eyebrow title meta actions`; StatTile: `icon label value tone`; StatusBadge: `label tone dot`; EmptyState: `icon title description action`).
- Akzent `#da1f3d`, Display-Schrift `font-display` (Barlow Semi Condensed), UI-Sprache Deutsch.
- Manifest: keine Lila-Verläufe, keine Pill-Buttons, keine Emoji-Icons (lucide-react), keine Em-Dashes im sichtbaren Text, keine Floskeln, keine Fake-Metriken.
- Nicht anfassen: `pages/admin/MonitorAdminPage.jsx`, `pages/MonitorPage.jsx`, `pages/AufgabenMonitorPage.jsx`, `components/monitor/**`, `pages/DesignTestPage.jsx`.
- Fachfarben aus Daten (Kalender-Kategorien, Kompetenz-Kategorie-Farben, Veranstaltungsfarben, Inline-`style` aus DB-Werten) bleiben unverändert.
- `rounded-full` nur für Avatare, Statuspunkte, Schalter.
- `text-white` nur auf `bg-accent` (und `bg-bad` im Bestätigungsdialog).
- Commit-Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01D7nDH9UeEyBKSeRzQw1WpF`.

## Review Focus

1. **Hell-Modus:** Wer Light Mode aktiviert hat, erwartet weiterhin lesbaren dunklen Text auf hellem Grund. Jede Aufgabe prüft, dass nur Token-Klassen (keine festen `text-white`/`bg-black`-Werte auf Flächen) genutzt werden; Task 1 legt die Light-Werte an und der Wächter verbietet Alt-Grau.
2. **Versteckte Logikänderung:** Ein Diff, der beim Klassen-Umbau ein Attribut, einen Handler oder eine Bedingung verändert. Jede Aufgabe führt den Diff-Scope-Check (unten) aus; Reviewer lehnen jede Nicht-Optik-Zeile ab.
3. **Fachfarben überschrieben:** Kategorie-/Veranstaltungsfarben aus der DB (Inline-`style`, Maps wie `KATEGORIE_STRICH`, `FARBE_SWATCH`) dürfen nicht auf Status-Tokens umgebogen werden. Reviewer prüfen jede geänderte `style`-Zeile.
4. **Fokus unsichtbar:** Nach dem Entfernen von Rahmen muss jede interaktive Fläche weiterhin `focus-visible:ring-2 ring-accent` (oder Bausteinfokus) haben. Reviewer prüfen neue/umgebaute Buttons und Zeilen-Links.
5. **Monitore verändert:** Monitor-Anzeigen und Monitor-Admin müssen identisch bleiben. Task 12 vergleicht Screenshot von `/aufgaben-monitor` und prüft `git diff --stat` auf die Ausnahmedateien (leer).

### Diff-Scope-Check (in jeder Aufgabe)

```bash
git diff -U0 <base>..HEAD -- <paket-pfade> | grep -E '^[+-][^+-]' \
  | grep -vE 'className=|class=|style=\{\{|^\s*[+-]\s*$|>[^<{]*<|^[+-]\s*[A-Za-zÄÖÜäöüß„"]' | head -50
```
Erwartung: Jede verbleibende Zeile ist eine reine Klassen-/Text-/Wrapper-Änderung (manuell begründbar). Alles andere wird zurückgenommen.

---

## File Structure

- Modify `frontend/src/index.css`: Token-Variablen, `@theme inline`, `shadow-overlay`.
- Create `frontend/scripts/check-tokens.mjs`: Wächter (CLI, `--only <pfad...>`).
- Create `frontend/scripts/check-tokens.test.mjs`: `node:test`-Tests des Wächters.
- Modify `frontend/package.json`: Scripts `check:tokens`, `test:tokens`.
- Modify `frontend/src/components/ui/{Button,PageHeader,StatTile,StatusBadge,EmptyState}.jsx`.
- Modify Gerüst- und Modul-Dateien laut Task 3–11 (nur Klassen/Texte).

---

### Task 1: Tokens und Token-Wächter

**Files:**
- Modify: `frontend/src/index.css`
- Create: `frontend/scripts/check-tokens.mjs`, `frontend/scripts/check-tokens.test.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: Tailwind-Klassen für alle Spec-Tokens: `bg-|text-|border-|divide-|ring-` × `canvas surface raised overlay hover line-subtle line line-strong fg fg-muted fg-subtle fg-disabled accent accent-hover accent-fg ok warn bad info`; `shadow-overlay`.
- Produces: `npm run check:tokens [-- --only <pfad> ...]` → exit 0 sauber, exit 1 mit Liste `datei:zeile: muster`.
- Produces: exportierte Funktion `findViolations(source: string, filePath: string): Array<{line: number, match: string}>` und Konstante `EXCLUDE: string[]` in `check-tokens.mjs`.

- [ ] **Step 1: Failing tests schreiben** in `check-tokens.test.mjs` mit `node:test` + `node:assert`:
  - `findViolations('<div className="bg-gray-900">', 'a.jsx')` → Länge 1, `match` enthält `bg-gray-900`.
  - `findViolations('<div className="rounded-xl rounded-2xl">', 'a.jsx')` → Länge 2.
  - `findViolations('<div className="bg-accent/10 ring-accent/25 border-accent/40">', 'a.jsx')` → Länge 3.
  - `findViolations('<div className="bg-surface text-fg-muted rounded-lg bg-accent">', 'a.jsx')` → Länge 0.
  - `findViolations('// bg-gray-900 im Kommentar', 'a.jsx')` → Länge 0 (Zeilen, die nach Trim mit `//` oder `*` beginnen, ignorieren).
  - `EXCLUDE` enthält `src/pages/admin/MonitorAdminPage.jsx`, `src/pages/MonitorPage.jsx`, `src/pages/AufgabenMonitorPage.jsx`, `src/components/monitor/`, `src/pages/DesignTestPage.jsx`.
- [ ] **Step 2:** `cd frontend && node --test scripts/check-tokens.test.mjs` → FAIL (Modul fehlt).
- [ ] **Step 3: `check-tokens.mjs` implementieren.** Muster exakt aus Spec §5: `/\b(?:bg|text|border|ring|divide|from|to|via|placeholder|outline|fill|stroke)-gray-\d{2,3}\b/`, `/\brounded-(?:xl|2xl|3xl)\b/`, `/\b(?:bg|ring|border)-accent\/\d+\b/` (global, alle Treffer je Zeile). CLI: läuft rekursiv über `src/**/*.{js,jsx,css}` relativ zu `frontend/`, überspringt `EXCLUDE`-Präfixe; `--only` begrenzt auf angegebene Datei-/Ordnerpräfixe; `src/index.css` wird nur außerhalb des Blocks `/* legacy-gray:start */ … /* legacy-gray:end */` geprüft.
- [ ] **Step 4:** Tests → PASS. `node scripts/check-tokens.mjs` auf den Ist-Stand → exit 1 mit vielen Treffern (Beweis, dass der Wächter greift).
- [ ] **Step 5: Tokens in `index.css`.** Werte exakt aus Spec §1 (Dunkel in `:root`, Hell in `:root.light`, Variablen-Präfix `--sd-`), `@theme inline { --color-canvas: var(--sd-canvas); … }` für alle Tokens, `--shadow-overlay` aus Spec. Bestehende `:root.light .bg-gray-*`-Overrides in `/* legacy-gray:start */ … /* legacy-gray:end */` einklammern. `body` auf `background-color: var(--sd-canvas); color: var(--sd-fg)`; `* { border-color: var(--sd-line-subtle) }`. Bestehende Browser-Flächen-Regeln (Selection, caret, scrollbar) auf Tokens umstellen.
- [ ] **Step 6:** `package.json`: `"check:tokens": "node scripts/check-tokens.mjs"`, `"test:tokens": "node --test scripts/check-tokens.test.mjs"`. `npm run test:tokens` → PASS, `npm run build` → exit 0, `npm run check:tokens -- --only src/index.css` → exit 0.
- [ ] **Step 7: Commit** `feat(design): Bühnenschwarz-Tokens und Token-Wächter`.

### Task 2: Bausteine `components/ui`

**Files:** Modify `frontend/src/components/ui/{Button,PageHeader,StatTile,StatusBadge,EmptyState}.jsx`

**Interfaces:**
- Consumes: Token-Klassen aus Task 1.
- Produces: unveränderte Props (siehe Global Constraints); Optik laut Spec §2 „Buttons“, „Badges“, „Weitere Bausteine“.

- [ ] **Step 1:** `npm run check:tokens -- --only src/components/ui` → FAIL (Alt-Klassen vorhanden).
- [ ] **Step 2:** Button nach Spec-Tabelle (`primary bg-accent text-white hover:bg-accent-hover`, `secondary bg-raised text-fg hover:bg-hover`, `ghost text-fg-muted hover:bg-raised hover:text-fg`, `danger text-bad hover:bg-raised`, alle `rounded-md`, Fokus `ring-offset-canvas`, deaktiviert `disabled:text-fg-disabled disabled:pointer-events-none` statt Opacity). StatusBadge: `bg-raised rounded-sm`, Text in Statusfarbe (Ton-Mapping aus Spec §2), Punkt nur bei `dot` (Farbe `bg-<status>`, bei `neutral` `bg-fg-subtle`), kein Ring. StatTile: `bg-surface rounded-lg` ohne Rahmen, Werttöne → `text-fg|ok|warn|bad`. EmptyState: Icon frei (24 px, `text-fg-subtle`), keine Kachel. PageHeader: `text-fg`, Eyebrow/Meta `text-fg-subtle`. JSDoc-Kommentare an neue Optik anpassen.
- [ ] **Step 3:** `npm run check:tokens -- --only src/components/ui` → exit 0; `npm run build` → exit 0; Diff-Scope-Check → nur Klassen/Kommentare.
- [ ] **Step 4: Commit** `feat(design): UI-Bausteine auf Bühnenschwarz`.

### Task 3: App-Gerüst

**Files:** Modify `frontend/src/components/{DashboardLayout,GlobalSearchModal,NotificationBell,ShortcutsModal,SessionTimeoutGuard,ProtectedRoute,PermissionRoute,Markdown,AutocompleteInput,QRScanner,SignatureModal,MaintenanceBanner}.jsx`, `frontend/src/pages/LoginPage.jsx`, `frontend/src/App.jsx`

**Interfaces:** Consumes Tokens (Task 1) und Bausteine (Task 2). Produces das Shell-Muster, an dem sich Module orientieren: Seitenleiste `bg-surface` ohne rechten Rahmen auf `bg-canvas`; aktiver Nav-Eintrag `bg-raised text-fg` + 2 px `accent`-Strich links innen; Topbar ohne Unterstrich-Rahmen, durch Fläche getrennt; Modals laut Spec „Modals“.

- [ ] **Step 1:** `npm run check:tokens -- --only <Dateien dieser Aufgabe>` → FAIL.
- [ ] **Step 2:** Umbau nach Spec §2/§3 (Ebenen, Zustände, Eingabefelder, Modals). Login: `bg-canvas`, Karte `bg-surface rounded-lg` ohne Rahmen, Spotlights bleiben.
- [ ] **Step 3:** Wächter für diese Dateien → exit 0; `npm run build` → exit 0; Diff-Scope-Check sauber.
- [ ] **Step 4: Commit** `feat(design): App-Gerüst auf Bühnenschwarz`.

### Tasks 4–11: Modulpakete (parallel, je eigener Worktree)

Jedes Paket folgt demselben Ablauf; die Regeln stehen in Spec §2 (Ebenen, Icons, Zustände, Badges, Buttons, Eingabefelder, Modals) und §3 (Ersetzungstabelle, Fachfarben bleiben).

**Interfaces (alle Pakete):** Consumes Tokens (Task 1), Bausteine (Task 2), Shell-Muster (Task 3). Produces: keine neuen Exporte.

**Ablauf je Paket:**
- [ ] **Step 1:** `npm run check:tokens -- --only <paket-pfade>` → FAIL (Ausgangslage dokumentieren: Anzahl Treffer).
- [ ] **Step 2:** Datei für Datei umbauen: Karten-Wrapper entfernen oder zu Liste/Abschnitt machen, Rahmen → Fläche/Trennlinie, Icon-Kacheln entfernen, Tönungen → `bg-raised` + Punkt/Statusfarbe, Rundung nach Hierarchie, Text-Grau → `fg-*`, Status → `ok|warn|bad|info`, `text-accent` → `text-accent-fg`.
- [ ] **Step 3:** Wächter für das Paket → exit 0; `npx vite build --outDir /tmp/claude-0/build-<paket> --emptyOutDir` → exit 0; Diff-Scope-Check sauber.
- [ ] **Step 4: Commit** `feat(design): <Modul> auf Bühnenschwarz`.

| Task | Paket | Pfade (relativ zu `frontend/`) |
|---|---|---|
| 4 | Dashboard | `src/pages/DashboardPage.jsx`, `src/components/dashboard/` |
| 5 | Veranstaltungen | `src/pages/veranstaltung/`, `src/components/VeranstaltungTemplateModal.jsx` |
| 6 | Inventar | `src/pages/inventar/` |
| 7 | Kalender | `src/pages/kalender/`, `src/components/kalender/` |
| 8 | Anwesenheit | `src/pages/anwesenheit/` |
| 9 | Kompetenzen | `src/pages/kompetenzen/` |
| 10 | Haushalte | `src/pages/haushalte/`, `src/components/ArtikelModal.jsx`, `src/components/ArtikelDetailsPanel.jsx`, `src/components/CreateHaushaltModal.jsx`, `src/components/EditHaushaltModal.jsx`, `src/components/SammelQuittungModal.jsx` |
| 11 | Admin + Konto | `src/pages/admin/` ohne `MonitorAdminPage.jsx`, `src/pages/SettingsPage.jsx`, `src/pages/NotificationsPage.jsx` |

Paketspezifische Hinweise:
- **4 Dashboard:** Widgets sind Abschnitte auf `surface`, nicht Karten-in-Karte; StatTile kommt aus Task 2.
- **5 Veranstaltungen:** Übersichtskarten bleiben (klickbare Objekte) als `bg-surface rounded-lg` ohne Rahmen; `CollapsibleSection` wird Abschnitt mit Trennlinie statt Karte; Veranstaltungsfarben aus Daten bleiben.
- **7 Kalender:** Kategorie- und Ressourcenfarben aus Daten bleiben exakt; nur Chrom wird umgestellt.
- **8 Anwesenheit:** Statusfarben über `ok` (anwesend), `info` (teilweise), `bad` (abwesend), `warn` (krank), `fg-subtle` (ausstehend); Fortschrittsbalken-Segmente `bg-ok|info|bad|warn`.
- **9 Kompetenzen:** `KATEGORIE_STRICH`/`FARBE_SWATCH` sind Fachfarben und bleiben.
- **10 Haushalte:** Konsumtiv/Investiv-Akzente orange/grün sind Kategoriefarben: orange bleibt `orange-*`, grün → `ok`.
- **11 Admin:** `MonitorAdminPage.jsx` nicht anfassen.

### Task 12: Abschluss und Gesamtprüfung

**Files:** keine neuen; ggf. Korrekturen aus dem Review.

- [ ] **Step 1:** `cd frontend && npm run test:tokens && npm run check:tokens && npm run build` → alle exit 0.
- [ ] **Step 2:** `git diff --stat <base>..HEAD -- frontend/src/pages/admin/MonitorAdminPage.jsx frontend/src/pages/MonitorPage.jsx frontend/src/pages/AufgabenMonitorPage.jsx frontend/src/components/monitor` → leer.
- [ ] **Step 3:** Impeccable-Detektor einmal: `.claude/skills/impeccable/scripts/impeccable detect --json <alle geänderten frontend/src-Dateien>`; echte Funde beheben.
- [ ] **Step 4:** Screenshots `/login` und `/aufgaben-monitor` (vite preview, Chromium headless=new); Aufgaben-Monitor unverändert gegenüber vorher.
- [ ] **Step 5:** Whole-branch Review (Subagent) gegen Spec §6 Erfolgskriterien; Funde beheben, erneut Step 1.
- [ ] **Step 6: Push** `git push -u origin claude/dashboard-craft-ux-wave-2-1cj1jw`.

## Ausführung

- Tasks 1 → 2 → 3 sequentiell (Fundament), je Implementer-Subagent + Spec-Review + Code-Quality-Review.
- Tasks 4–11 parallel, je ein Implementer-Subagent in eigenem Git-Worktree (`isolation: worktree`, `node_modules` per Symlink auf `/home/user/Stagedesk-V2/frontend/node_modules`), danach je Spec-Review + Code-Quality-Review, dann Merge in den Branch (Pfade disjunkt).
- Task 12 durch den Koordinator plus finalen Review-Subagent.
