# Substitutions Full Width on Busy Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When today's substitution plan has more than x pages on a screen, today takes both halves (pages side by side in pairs) instead of "Morgen" or a media/announcements side.

**Architecture:** A view field `substitutions_expand_pages` (0 = off, 2 to 4) travels in the substitutions data as `expand_pages`. The display decides from its own page count: `DayCard` reports its page count; `DayColumns` (substitutions view) and `SplitView` (split with a media/info side) switch to a two-column "pair" rendering of today and back.

**Tech Stack:** Django 5 + Ninja, React 19, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-substitutions-expand-design.md`

## Global Constraints

- Values: `substitutions_expand_pages` ∈ {0, 2, 3, 4}, default 0; payload key `expand_pages`.
- Migration `signage` 0056; rollback `migrate signage 0055`.
- Admin copy (exact): label „Bei vielen Vertretungen ganze Breite für heute“, options „Aus“, „ab 2 Seiten“, „ab 3 Seiten“, „ab 4 Seiten“; help „Hat heute mehr Seiten, bekommt heute beide Hälften. Abfahrten bleiben immer stehen.“
- A departures side is never overlaid. Split width is ignored while expanded (two equal columns).
- Expand only where two areas exist: two days side by side or stacked; split with media/info. Not for one day alone, not for one-by-one.
- Decide on the page count currently shown (no flicker).

## Review Focus

- Odd page count: the last pair's second card shows the day heading but no rows and no page count.
- `expand_pages` 0 or missing (old payloads): never expands.
- Expanded split collapses again when the reported count drops to ≤ x (test: rerender with fewer rows).
- Split with departures + substitutions and `expand_pages` set: no change.
- Both cards of a pair flip together (one pager drives both).

---

### Task 1: Backend field and payload

**Files:** `backend/signage/models.py`, `schemas.py` (out + update), `validation.py`, `display.py` (`_substitutions_data`), migration `0056_substitutions_expand_pages.py`; test `backend/signage/tests_display.py`, `tests_api.py` (validation).

**Interfaces:** Produces `DisplayView.substitutions_expand_pages: IntegerField(default=0)`; substitutions data key `expand_pages: int` (also in the split side data, which uses `_substitutions_data`).

- [ ] **Step 1: Tests:** `DATA_KEYS['substitutions']` gains `'expand_pages'`; `test_substitutions_carry_expand_pages`: view with `substitutions_expand_pages=3` → `data['expand_pages'] == 3`, split side substitutions data too. Validation test: PUT `substitutions_expand_pages: 5` → 422, `3` → 200.
- [ ] **Step 2:** Run `python manage.py test signage.tests_display signage.tests_api` → FAIL.
- [ ] **Step 3:** Implement; validation rejects values outside {0, 2, 3, 4} with „Ganze Breite: Aus oder ab 2 bis 4 Seiten.“
- [ ] **Step 4:** `python manage.py test signage` OK; `makemigrations --check` clean.
- [ ] **Step 5:** Commit.

### Task 2: Display: pairs of today and overlay

**Files:** `frontend/src/components/signage/display/views/SubstitutionsView.jsx`, `views/SplitView.jsx`; tests `views/SubstitutionsView.test.jsx`, `DisplayRoot.test.jsx`.

**Interfaces:**
- Consumes `data.expand_pages`.
- Produces: `export function expandWanted(pageCount: number, expandPages: number): boolean` (true when `expandPages >= 2 && pageCount > expandPages`); `SubstitutionsView` props `onPageCount?: (n) => void` (today's page count) and `twoColumns?: boolean` (render today as a pair); `DayCard` prop `pair: 0 | 1 | null`.

- [ ] **Step 1: Tests** (page count is forced by mocking `paginateByHeight` / `useChildHeights` in the test, or by a test seam the implementer picks):
  - `expandWanted`: `(5, 3)` true, `(3, 3)` false, `(9, 0)` false, `(9, undefined)` false.
  - `SubstitutionsView` two days side by side, `expand_pages: 2`, today 5 pages → two cards, both headed with today's date, page counts „Seite 1 / 5“ and „Seite 2 / 5“, no tomorrow card.
  - Same with `expand_pages: 0` → today and tomorrow as before.
  - Odd count, last pair: second card has no `[data-substitution-row]` and no page count.
  - Split substitutions + media, `expand_pages: 2`, 5 pages → no `[data-media-pane]`, two substitution cards, both sides 50 %; rerender with 2 pages → media back.
  - Split substitutions + departures, same data → departures stay, no pair.
- [ ] **Step 2:** Run `npx vitest run src/components/signage/display` → FAIL.
- [ ] **Step 3:** Implement: `DayCard` reports `pages.length` via `onPageCount`; with `pair` set it pages over pairs (`usePager` over `ceil(n/2)` pairs) and shows page `2*pairIndex + pair`; one pager per pair rendering, shared by both cards (lift the pager into the pair wrapper). `DayColumns` keeps `expanded` state from `expandWanted(todayCount, expand_pages)` and renders the pair instead of the days when two areas exist. `SplitView`: when one side is substitutions and the other `media` or `info` and `expandWanted(count, side.data.expand_pages)`, render the substitutions side across the full width with `twoColumns`.
- [ ] **Step 4:** Full `npx vitest run` green; `npm run check:tokens` clean.
- [ ] **Step 5:** Commit.

### Task 3: Admin, docs, screenshots

**Files:** `frontend/src/components/signage/admin/view-editors/Substitutions.jsx`, `pages/viewData.js` (`EDITABLE_FIELDS`, `INT_FIELDS`), `CLAUDE.md`, fixtures `frontend/tests/signage/display-fixtures/` (long list split with media and full view); test `pages/ViewEdit.test.jsx`.

- [ ] **Step 1: Test** `Vertretungsplan: ganze Breite ab 3 Seiten speichert substitutions_expand_pages`: open view 2, choose „ab 3 Seiten“, save → `updateView(2, { substitutions_expand_pages: 3 })`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Select with the exact copy from Global Constraints (values 0, 2, 3, 4); fields lists; CLAUDE.md sentence under „Vertretungsplan-Quellen“ (behaviour, migration 0056, rollback 0055).
- [ ] **Step 4:** Full vitest, backend tests, identifier guard; shoot the two fixtures and check them.
- [ ] **Step 5:** Commit, push, open the PR.
