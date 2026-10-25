# Power Method Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins find out which power method works for a screen (probe without switching, then a real off/on test with confirmation), and a screen without power control is set up as "Keine Steuerung" instead of failing on every schedule change.

**Architecture:** The Pi agent gets a `none` power method, a read-only probe (`power_probe`) and a timed off/on test (`power_test`, `power_test_end`) as device commands; results travel as JSON in the existing `DeviceCommand.result`. The backend allows the new command kinds with `params`, adds `none` (default for new screens) and refuses on/off for `none`. The admin shows the probe list, the recommendation and the test dialog in the screen detail's power section.

**Tech Stack:** Python 3 stdlib agent (`unittest`), Django 5 + Ninja, React 19 + Vite + Tailwind v4 (vitest, jsdom).

**Spec:** `docs/superpowers/specs/2026-10-25-power-method-check-design.md`

## Global Constraints

- Commit messages and the PR in English; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (CLAUDE.md).
- Code in English: file names, identifiers, and comments. Comments only where needed (a non-obvious reason or constraint); no generic or restating comments ("This function does X", "Handle edge cases", section banners). `python3 -I scripts/check-signage-identifiers.py` must exit 0. Only UI copy and user-facing result texts are German.
- Design manifest (CLAUDE.md): no purple gradients, no pill buttons (rounded-lg), no emoji (lucide-react), no em-dashes in visible text, no filler copy, no fake metrics. Accent red sparingly. `npm run check:tokens` must report "Sauber".
- UI tasks (Task 5) must load and follow the `impeccable` and `ui-ux-pro-max` skills before writing markup.
- The system is not live: no data migration of existing screens beyond the schema change, no old-agent gating.
- Command results stay under 2000 characters (`devices.finish_command` truncates).
- Exact copy from the spec: "Keine Steuerung"; "Das Display bleibt an und zeigt außerhalb des Zeitplans einen dunklen Bildschirm mit Uhr."; "Für diesen Bildschirm ist keine Power-Steuerung eingerichtet."; "Es läuft schon ein Test."; "Kein Test aktiv"; "Ist der Bildschirm aus- und wieder angegangen?"; "Nur „Ja“, wenn er wirklich dunkel war, nicht nur „Kein Signal“ gezeigt hat."; "Nein, nächste Methode testen"; "Ja, <Methode> übernehmen"; "Abbrechen und einschalten"; "Erneut prüfen"; "Geprüft um HH:MM · ohne den Bildschirm auszuschalten"; "Die Prüfung braucht den Geräte-Agent"; "Bildschirm ist offline".

## Review Focus

1. A schedule change arrives while a test runs: it must not switch the display mid-test; it applies after the test (Task 2 test `test_power_command_during_test_applies_after`).
2. The test fails to switch off (e.g. CEC error): no countdown, the error is shown, no "on" is scheduled (Task 2 `test_start_failure_schedules_nothing`; Task 5 dialog test "Fehler beim Ausschalten").
3. A probe tool hangs or is missing: that row is `fail` with a reason, the other rows still run (Task 1 `test_missing_tool_and_timeout_do_not_stop_probe`).
4. The admin closes the dialog or leaves the page during a running test: the display must come back on (Task 5: closing the dialog sends `power_test_end`; the agent's deferred "on" still fires if the page is gone).
5. Probe result that is not JSON (old agent: "Unbekannter Befehl"): shown as text instead of the list, no crash (Task 4 `parseProbe` test, Task 5 rendering).

---

### Task 1: Agent `none` method and power probe

**Files:**
- Modify: `agent/stagedesk_agent/power.py` (add `NonePower`, register `"none"` in `METHODS`)
- Create: `agent/stagedesk_agent/power_probe.py`
- Modify: `agent/stagedesk_agent/commands.py` (handler `power_probe`)
- Create: `agent/tests/samples/cec_list.txt`, `cec_list_none.txt`, `cec_scan.txt`, `ddc_detect.txt`, `ddc_getvcp_d6.txt`
- Test: `agent/tests/test_power.py`, create `agent/tests/test_power_probe.py`, `agent/tests/test_commands.py`

**Interfaces:**
- Produces: `NonePower(config, runner, **kw)`; `set(on)` and `status()` return `"keine Steuerung"` and never raise.
- Produces: `power_probe.probe(runner, config: dict, connect=socket.create_connection, root="/") -> dict` returning `{"methods": [{"method": "cec"|"sicp"|"ddc"|"hdmi", "state": "ok"|"warn"|"fail"|"skip", "text": str}], "recommended": "cec"|"hybrid"|"ddc"|"none"}`; `power_probe.recommend(methods: list[dict]) -> str`.
- Produces: command `power_probe` returns `(True, json.dumps({**probe(...), "checked_at": <ISO seconds, local time>}, ensure_ascii=False))`.

- [ ] **Step 1: Sample files** (realistic libCEC/ddcutil output; adjust after the glocke check)

`cec_list.txt`: `Found devices: 1\n\ndevice:              1\ncom port:            Linux\nvendor id:           2708\nproduct id:          1001\ntype:                Raspberry Pi\n`
`cec_list_none.txt`: `Found devices: NONE\n`
`cec_scan.txt`: `CEC bus information\n===================\ndevice #0: TV\naddress:       0.0.0.0\nactive source: no\nvendor:        Unknown\nosd string:    LH4341UHS\nCEC version:   1.4\npower status:  on\nlanguage:      eng\n`
`ddc_detect.txt`: `Display 1\n   I2C bus:  /dev/i2c-20\n   Monitor:  IVM:PL4341UH:1234\n`
`ddc_getvcp_d6.txt`: `VCP code 0xd6 (Power mode                    ): DPM: On,  DPMS: Off (sl=0x01)\n`

- [ ] **Step 2: Write the failing tests** (`test_power_probe.py`, using `FakeRunner` and the samples; `connect` is a fake)

```python
def test_cec_ok_with_display_name(self):      # -l → cec_list, scan → cec_scan
    row = by_method(probe(runner, {}), "cec")
    self.assertEqual(row["state"], "ok"); self.assertIn("LH4341UHS", row["text"])
def test_cec_no_adapter_fails(self):          # -l → cec_list_none
    self.assertEqual(by_method(probe(...), "cec")["state"], "fail")
def test_cec_found_but_power_unreadable_warns(self):   # scan without "power status"
def test_sicp_skipped_without_ip(self):       # config {} → state "skip", text "Keine Display-IP eingetragen."
def test_sicp_ok_when_port_answers(self):     # config {"display_ip": "10.0.0.5"}, fake connect answers
def test_ddc_ok_and_fail(self):               # detect+getvcp ok → "ok"; detect "No displays found." code 1 → "fail"
def test_hdmi_is_warn_with_output_name(self): # wlr_randr.txt sample → "warn", text mentions output and "Kein Signal"
def test_missing_tool_and_timeout_do_not_stop_probe(self):  # cec-client code 127, ddcutil code 124 → both "fail" with reason; hdmi row still present
def test_recommendation_order(self):
    self.assertEqual(recommend([cec("ok"), sicp("ok")]), "cec")
    self.assertEqual(recommend([cec("warn"), sicp("ok")]), "hybrid")
    self.assertEqual(recommend([cec("fail"), sicp("ok"), ddc("ok")]), "ddc")
    self.assertEqual(recommend([cec("fail"), sicp("skip"), ddc("fail"), hdmi("warn")]), "none")
```
Plus in `test_power.py`: `test_none_method_never_switches` (`make_power("none", {}, runner)`, `set(False)` → `"keine Steuerung"`, no runner calls). In `test_commands.py`: `test_power_probe_returns_json_under_2000_chars` (result parses as JSON, has `checked_at`, `len < 2000`).

- [ ] **Step 3: Run** `cd agent && python3 -m unittest discover -s tests` → the new tests FAIL (import/attribute errors).

- [ ] **Step 4: Implement.** Time limits per spec: CEC 20 s, DDC 15 s, others 5 s (runner `timeout=`; code 124 = timeout, 127 = missing → `"Programm fehlt: <name>"`). CEC: `cec-client -l` via `runner.run(["cec-client", "-l"])`; scan and `pow 0` via `CEC_CLIENT` with input `"scan\n"`; the display is the `device #0` block; text `"Display gefunden: <osd string> (<vendor>)"` (vendor omitted when "Unknown") plus `" Status lesbar: an."`/`"standby."`. SICP: reuse `HybridPower._frame` logic (`0x19` query) with 2 s timeout on `display_ip:display_port` (default 5000). DDC: `ddcutil detect --brief`, then `ddcutil getvcp D6`. HDMI: `wayland_command(["wlr-randr"], root)` as user `pi`, first output name. German texts as in the spec table.

- [ ] **Step 5: Run** the agent suite → PASS.

- [ ] **Step 6: Commit** `feat(agent): "none" power method and read-only power probe`

---

### Task 2: Agent power test

**Files:**
- Create: `agent/stagedesk_agent/power_test.py`
- Modify: `agent/stagedesk_agent/agent.py` (own a `PowerTest`, remember the wanted power state, hold power commands during a test, expose to `CommandContext`)
- Modify: `agent/stagedesk_agent/commands.py` (`CommandContext.power_test`, handlers `power_test`, `power_test_end`)
- Modify: `agent/VERSION` → `1.1.0`
- Test: create `agent/tests/test_power_test.py`, extend `agent/tests/test_agent.py`

**Interfaces:**
- Consumes: `make_power(method, config, runner)` (Task 1 registers `none`).
- Produces: `PowerTest(power_factory, runner, defer, on_finished)`: `start(method: str, config: dict, seconds: int) -> tuple[bool, str]` (ok text is JSON `{"off_at": ISO, "seconds": n}`), `end() -> tuple[bool, str]`, property `active: bool`. `defer(delay, fn, key="power_test")` is the agent's existing keyed defer; `end()` replaces the pending timer with `delay=0`. `on_finished()` is called after the "on" step.
- Produces: commands `power_test` (params `method`, `config`, `seconds`, default 15) and `power_test_end`.
- Agent: `_on_power_command` stores `self._wanted_power`; while `power_test.active` it does not switch. `on_finished` re-applies `_wanted_power` with the saved method when it is `False`.

- [ ] **Step 1: Write the failing tests**

```python
def test_start_switches_off_with_given_method_and_schedules_on(self):   # factory records ("hdmi", cfg); set(False) called; defer(15, fn, key="power_test")
def test_on_after_delay_uses_same_method_then_calls_on_finished(self):
def test_second_start_is_refused(self):        # → (False, "Es läuft schon ein Test.")
def test_end_switches_on_now(self):            # end() → defer(0, …, key="power_test"); after run: set(True)
def test_end_without_test(self):               # → (True, "Kein Test aktiv")
def test_start_failure_schedules_nothing(self):   # set(False) raises PowerError → (False, "<Fehlertext>"), defer not called, active False
def test_power_command_during_test_applies_after(self):   # test_agent: power_command off during test → no switch; after on_finished → apply_power(False)
def test_power_test_command_validates_params(self):       # unknown method or seconds outside 5..60 → (False, "Ungültige Testparameter")
```

- [ ] **Step 2: Run** the agent suite → new tests FAIL.
- [ ] **Step 3: Implement** `PowerTest` (own lock; controller built with `power_factory`, stopped after the test via `controller.stop()`), the agent wiring and the two handlers; bump `agent/VERSION` to `1.1.0`.
- [ ] **Step 4: Run** `cd agent && python3 -m unittest discover -s tests` → PASS.
- [ ] **Step 5: Commit** `feat(agent): timed power test with the method under test`

---

### Task 3: Backend: `none`, new command kinds, params

**Files:**
- Modify: `backend/signage/models.py` (`Screen.POWER_METHOD_CHOICES` + `('none', 'Keine Steuerung')`, default `'none'`; `DeviceCommand.KIND_CHOICES` + `power_probe`, `power_test`, `power_test_end`)
- Create: `backend/signage/migrations/0049_power_method_none.py` (AlterField both)
- Modify: `backend/signage/schemas.py` (`DEVICE_COMMAND_KINDS` + the three kinds; `DeviceCommandCreateSchema.params: dict = {}`)
- Modify: `backend/signage/api/devices.py` (`POWER_COMMANDS` + `power_test`, `power_test_end`; refuse `power_on`/`power_off` when `screen.power_method == 'none'` with 422 and the spec text; validate `power_test` params)
- Modify: `backend/signage/devices.py` (`create_command(..., params=None)` stores params; `COMMAND_LABELS` + `'power_probe': 'Steuerung prüfen'`, `'power_test': 'Steuerung testen'`, `'power_test_end': 'Test beenden'`)
- Modify: `backend/signage/validation.py` (power-config validation accepts `none` with an empty config)
- Modify: `CLAUDE.md`, `DEPLOY.md` (one line each: method `none`, probe/test commands, agent 1.1.0)
- Test: `backend/signage/tests_devices.py`, `tests_api.py` or `tests_models.py`, `tests_migrations.py`

**Interfaces:**
- Produces: `POST /api/signage/devices/{id}/commands` body `{"kind": "power_probe"|"power_test"|"power_test_end", "params": {...}}`; `power_test` params validated: `method` in `cec|hdmi|hybrid|ddc`, `config` dict (hybrid needs `display_ip`), `seconds` int 5..60 (default 15) → 422 `"Ungültige Testparameter."` otherwise. Response `DeviceCommandSchema` unchanged (result holds the agent's JSON text).

- [ ] **Step 1: Write the failing tests**

```python
def test_new_screen_defaults_to_none(self):          # Screen.objects.create(...).power_method == 'none'
def test_power_on_refused_for_none(self):            # 422, detail == "Für diesen Bildschirm ist keine Power-Steuerung eingerichtet."
def test_power_test_needs_power_permission(self):     # without signage.power → 403
def test_power_test_params_validated(self):           # method "foo" / seconds 3 / hybrid without display_ip → 422; valid → 200, command.params stored
def test_power_probe_allowed_with_devices_permission(self):
def test_command_message_carries_params(self):        # devices.command_message(cmd)["params"] == params
def test_migration_0049_forward_backward(self):       # tests_migrations pattern: none survives forward; backward maps none → cec
```
- [ ] **Step 2: Run** `cd backend && source venv/bin/activate && python manage.py test signage` → new tests FAIL.
- [ ] **Step 3: Implement**; migration backward step maps `none` to `cec` (RunPython) before altering choices back.
- [ ] **Step 4: Run** `python manage.py test signage users` and `python3 -I scripts/check-signage-identifiers.py` → PASS / exit 0; `python manage.py makemigrations signage --check` → "No changes detected".
- [ ] **Step 5: Commit** `feat(signage): "none" power method and power probe/test commands`

---

### Task 4: Admin data layer

**Files:**
- Modify: `frontend/src/components/signage/admin/pages/screenData.js` (`POWER_METHOD_OPTIONS` + `{ value: 'none', label: 'Keine Steuerung' }` first; `POWER_CONFIG_DEFAULTS.none = {}`; default method `'none'` where `'cec'` was the fallback)
- Modify: `frontend/src/components/signage/admin/pages/ScreenDetail.jsx` only for `METHOD_HELP.none` (spec sentence) and `CONFIG_FIELDS.none = []`
- Modify: `frontend/src/components/signage/admin/shared/deviceCommands.js` (`commandsFor(device, can, powerMethod)` hides `power_on`/`power_off` when `powerMethod === 'none'`)
- Modify: `frontend/src/components/signage/admin/shared/api.js` (`sendDeviceCommand(id, kind, params)` sends `{ kind, params }` when params given)
- Create: `frontend/src/components/signage/admin/shared/powerCheck.js`
- Test: create `powerCheck.test.js`; extend `deviceCommands` and `screenData` tests

**Interfaces:**
- Produces (`powerCheck.js`):
  - `PROBE_LABELS = { cec: 'CEC', sicp: 'Netzwerk (SICP)', ddc: 'DDC', hdmi: 'HDMI-Signal' }`
  - `PROBE_TO_METHOD = { cec: 'cec', sicp: 'hybrid', ddc: 'ddc', hdmi: 'hdmi' }`
  - `parseProbe(command) -> { checkedAt: Date|null, methods: [{ probe, method, state, text, testable }], recommended } | { error: string }` (`testable` = state `ok` or `warn`; non-JSON or failed command → `{ error: command.result || 'Prüfung fehlgeschlagen.' }`)
  - `testOrder(parsed) -> string[]` power methods: recommended first (unless `none`), then the other testable ones in order cec, hybrid, ddc, hdmi, no duplicates
  - `nextMethod(order, current) -> string|null`
  - `methodLabel(method)` from `POWER_METHOD_OPTIONS`

- [ ] **Step 1: Write the failing tests** (`powerCheck.test.js`)

```js
it('parst das Prüfergebnis', () => { const p = parseProbe({ status: 'ok', result: JSON.stringify(SAMPLE) }); expect(p.methods.map((m) => m.method)).toEqual(['cec', 'hybrid', 'ddc', 'hdmi']); expect(p.recommended).toBe('cec') })
it('kein JSON wird zum Fehlertext', () => expect(parseProbe({ status: 'failed', result: 'Unbekannter Befehl' })).toEqual({ error: 'Unbekannter Befehl' }))
it('Testreihenfolge: Empfehlung zuerst, dann übrige testbare', () => expect(testOrder(withStates({ cec: 'warn', sicp: 'ok', ddc: 'fail', hdmi: 'warn' }, 'hybrid'))).toEqual(['hybrid', 'cec', 'hdmi']))
it('nächste Methode und Ende', () => { expect(nextMethod(['cec', 'hdmi'], 'cec')).toBe('hdmi'); expect(nextMethod(['cec', 'hdmi'], 'hdmi')).toBeNull() })
```
Plus: `commandsFor(device, can, 'none')` has no `power_on`/`power_off`; `deviceDefaults({}).power_method === 'none'`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/signage` → new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** vitest → PASS; `npm run check:tokens` → Sauber.
- [ ] **Step 5: Commit** `feat(signage-admin): power check data helpers and "Keine Steuerung"`

---

### Task 5: Admin UI: probe list, recommendation, test dialog

Load the `impeccable` and `ui-ux-pro-max` skills first and follow them; the spec mockup (`docs/superpowers/specs/2026-10-25-power-method-check-design.md` §4) is the direction.

**Files:**
- Create: `frontend/src/components/signage/admin/shared/PowerCheck.jsx` (list + recommendation + "Erneut prüfen" + "Testen")
- Create: `frontend/src/components/signage/admin/shared/PowerTestDialog.jsx`
- Modify: `frontend/src/components/signage/admin/pages/ScreenDetail.jsx` (render `PowerCheck` in `PowerMethodBlock` above the method select for paired agent devices; mark the recommended option "(empfohlen)"; "Ja" sets `power_method` + `power_config` in the device draft)
- Modify: `frontend/scripts/shoot-admin.mjs` + `frontend/tests/signage/admin-fixtures/` (scenes `screen-power-check`, `screen-power-none`, `screen-power-test`)
- Test: create `PowerCheck.test.jsx`, `PowerTestDialog.test.jsx`

**Interfaces:**
- Consumes: `parseProbe`, `testOrder`, `nextMethod`, `PROBE_LABELS`, `methodLabel` (Task 4); `api.sendDeviceCommand(id, kind, params)`, `api.getDeviceCommand`, `watchCommand` (existing).
- Produces: `<PowerCheck device screen config canTest onAdopt(method, config) />`, `<PowerTestDialog device screen method config order onAdopt onClose />`.

- [ ] **Step 1: Write the failing tests**

```js
it('prüft beim Öffnen und zeigt Ampel, Text und Empfehlung')        // sendDeviceCommand(5, 'power_probe'); rows with data-state; "Empfehlung: CEC"; "Geprüft um 10:42 · ohne den Bildschirm auszuschalten"
it('Empfehlung Keine Steuerung mit Erklärsatz')
it('ohne Agent / offline / Fehlertext statt Liste')                 // "Die Prüfung braucht den Geräte-Agent", "Bildschirm ist offline", "Unbekannter Befehl"
it('Testen: Countdown, dann Rückfrage; Ja übernimmt')               // fake timers; power_test params { method, config, seconds: 15 }; after 15 s question; "Ja, CEC übernehmen" → onAdopt('cec', config)
it('Nein springt zur nächsten Methode, am Ende Keine Steuerung')
it('Abbrechen und einschalten und Schließen senden power_test_end')
it('Fehler beim Ausschalten: kein Countdown, Fehlertext')
```
- [ ] **Step 2: Run** vitest → FAIL.
- [ ] **Step 3: Implement** following the skills; semantic colors for states (`ok` green, `warn` yellow, `fail` red, `skip` neutral), status not by color alone (text label per row), keyboard and focus handling like `PairDialog` (Escape closes and ends the test, focus on the primary action).
- [ ] **Step 4: Run** `npx vitest run`, `npm run build`, `npm run check:tokens` → all green; `node scripts/shoot-admin.mjs --only screen-power-check,screen-power-none,screen-power-test` and look at the images (dark and light).
- [ ] **Step 5: Commit** `feat(signage-admin): power probe list and test dialog in the screen detail`
