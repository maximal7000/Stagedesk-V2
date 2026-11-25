# Steady Clock and Seconds Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The display clock keeps its seconds without shifting every second, sits centred in every clock box, and each view can switch the seconds off.

**Architecture:** The time is drawn left-aligned inside a block of fixed width (the widest possible time); the block itself is placed left (header), centred (box) or right (compact). A new boolean `DisplayView.clock_seconds` travels in the display payload on the view object and reaches every clock through the frame's `clock` prop (and MediaView's `frame` prop).

**Tech Stack:** Django 5 + Ninja, React 19, Tailwind v4, vitest, Django TestCase.

**Spec:** `docs/superpowers/specs/2026-11-25-clock-steady-seconds-design.md`

## Global Constraints

- UI copy German, code English; no em-dashes in visible text.
- Font stays Cabin; no own font file.
- Measured Cabin widths at `font-stretch: 75%`: "0" 0.606 em (widest digit), ":" 0.18 em. Block widths: with seconds `4.1em`, without `2.7em`.
- Migration `signage` 0055; rollback `migrate signage 0054` (seconds everywhere again).
- Default: seconds on.
- Exam, on-air, emergency and connection-lost screens unchanged.

## Review Focus

- A time made of narrow digits ("11:11:11") must not sit off-centre by more than the block's slack: the block, not the text, is centred (test checks the block has the fixed class, text left).
- Rotation views: each shown view uses its own `clock_seconds` (ViewScreen passes it per view).
- Old payloads without `clock_seconds` (cached on the Pi) must show seconds (`!== false`).
- Media view (own frame) must honour the switch too, in both clock spots.
- Preview drafts carry the field (it is in `EDITABLE_FIELDS`, so `previewPayload` sends it).

---

### Task 1: Backend field and payload

**Files:**
- Modify: `backend/signage/models.py` (DisplayView, next to `show_weather`), `backend/signage/schemas.py` (view out schema and update schema), `backend/signage/display.py` (`_view_object`), `backend/signage/validation.py` (`BOOL_FIELDS`)
- Create: `backend/signage/migrations/0055_view_clock_seconds.py` (via `makemigrations signage -n view_clock_seconds`)
- Test: `backend/signage/tests_display.py`

**Interfaces:**
- Produces: `DisplayView.clock_seconds: BooleanField(default=True)`; payload `view.clock_seconds: bool`; API field `clock_seconds` (read and update); `BOOL_FIELDS['clock_seconds'] = 'Sekunden anzeigen'`.

- [ ] **Step 1: Test** in `tests_display.py`: add `'clock_seconds'` to `VIEW_KEYS`; new test `test_view_carries_clock_seconds`: a view created with `clock_seconds=False` yields `payload['view']['clock_seconds'] is False`, a default view `True`.
- [ ] **Step 2:** Run `python manage.py test signage.tests_display` → FAIL (key missing).
- [ ] **Step 3:** Add the field, schemas, `_view_object` entry, `BOOL_FIELDS` entry, migration.
- [ ] **Step 4:** Run `python manage.py test signage` → OK; `makemigrations --check` → no changes.
- [ ] **Step 5:** Commit.

### Task 2: Steady clock block and seconds switch on the display

**Files:**
- Modify: `frontend/src/components/signage/display/frame/ClockBox.jsx`, `display.css` (`.d-clock`), `frame/NormalFrame.jsx`, `frame/WideFrame.jsx`, `frame/PortraitFrame.jsx`, `DisplayRoot.jsx` (`ViewScreen`), `views/MediaView.jsx`
- Test: `frontend/src/components/signage/display/DisplayRoot.test.jsx`

**Interfaces:**
- Consumes: payload `view.clock_seconds` from Task 1.
- Produces: `ClockBox` prop `seconds: boolean = true`; frame `clock` object gains `seconds`; MediaView `frame` gains `seconds`. `ClockDigits` is removed.

- [ ] **Step 1: Tests** in `DisplayRoot.test.jsx`:
  - `Uhr: ohne Sekunden zeigt der Kasten HH:MM`: departures view with `clock_seconds: false` → `[data-clock="box"] .d-clock` text matches `/^\d{2}:\d{2}$/`.
  - `Uhr: Zeit steht links in einem festen Block, der Block mitten im Kasten`: default view → `.d-clock` has classes `d-clock-seconds` and `text-left`, its parent box has `justify-center`.
  - `Uhr: alte Daten ohne clock_seconds zeigen Sekunden`: view without the key → text matches `/^\d{2}:\d{2}:\d{2}$/`.
  - Media test: replace the `.inline-block` assertion (two cells) with: `.d-footer .d-clock` has `d-clock-seconds`; with `clock_seconds: false` it has `d-clock-short`.
- [ ] **Step 2:** Run `npx vitest run src/components/signage/display/DisplayRoot.test.jsx` → FAIL.
- [ ] **Step 3:** Implement:
  - CSS: `.d-clock { display: inline-block; text-align: left; }`, `.d-clock-seconds { width: 4.1em; }`, `.d-clock-short { width: 2.7em; }` (replace `min-width: 4em`); update the comment (the time starts at the same spot, so a changing last digit moves nothing before it).
  - `ClockBox`: `seconds` prop; text via `formatTimeSeconds` or `formatTime`; span classes `d-clock d-clock-seconds|d-clock-short text-left`; box variant centres the block (`justify-center`, no `text-center` on the span); compact keeps the block right (`items-end` on the wrapper, span `text-left`); header unchanged placement. Remove `ClockDigits`.
  - Frames pass `clock.seconds !== false` to `ClockBox`; `ViewScreen` sets `clock.seconds = view.clock_seconds !== false` and `frame.seconds` likewise for own-frame views; MediaView passes `seconds={frame.seconds !== false}` to both compact clocks.
- [ ] **Step 4:** Run full `npx vitest run` → all pass; `npm run check:tokens` clean.
- [ ] **Step 5:** Commit.

### Task 3: Admin switch, docs, screenshots

**Files:**
- Modify: `frontend/src/components/signage/admin/pages/ViewEdit.jsx` (under "Wetter anzeigen"), `frontend/src/components/signage/admin/pages/viewData.js` (`EDITABLE_FIELDS`), `CLAUDE.md`
- Test: `frontend/src/components/signage/admin/pages/ViewEdit.test.jsx`

**Interfaces:**
- Consumes: API field `clock_seconds` from Task 1.

- [ ] **Step 1: Test** `Allgemein: Sekunden anzeigen ausschalten speichert clock_seconds`: open view 1 (fixture gets `clock_seconds: true`), click checkbox "Sekunden anzeigen", save → `updateView(1, { clock_seconds: false })`.
- [ ] **Step 2:** Run the test → FAIL.
- [ ] **Step 3:** Checkbox `label="Sekunden anzeigen"`, `help="Aus: die Uhr zeigt nur Stunden und Minuten."`, `checked={draft.clock_seconds !== false}`; add `'clock_seconds'` to `EDITABLE_FIELDS`. CLAUDE.md: replace the `ClockDigits` sentence with the fixed block (widths 4.1 em / 2.7 em, centred in boxes) and the switch (migration 0055, rollback 0054).
- [ ] **Step 4:** Run full vitest, backend `manage.py test signage`, `python3 -I scripts/check-signage-identifiers.py` (exit 0); rebuild and shoot `media-two-pages`, `departures`, `split` (`node frontend/scripts/shoot-display.mjs --only …`), check the clocks visually.
- [ ] **Step 5:** Commit and push to `claude/dashboard-craft-ux-wave-2-1cj1jw` (open PR #35), update the PR description.
