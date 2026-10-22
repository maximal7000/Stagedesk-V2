import { describe, it, expect } from 'vitest'
import {
  COLOR_SCHEME_OPTIONS, DEVICE_FIELDS, POWER_CONFIG_DEFAULTS, deviceDefaults, deviceProblems, devicePayload, DISPLAY_FIELDS, OVERRIDE_CLEAR, POWER_FIELDS, activeOverride, cecLabel, kioskUrl, lastReport, overridePayload, overrideProblem,
  pickFields, powerSummary, sectionPayload,
} from './screenData'

const glocke = {
  id: 1, name: 'Glocke', slug: 'glocke', location: 'Eingangshalle', default_view_id: 1, scale: 'auto',
  orientation: 'landscape', access_key: 'k1/+?', power_mode: 'auto', off_during_holidays: true,
  schedule: [{ days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00', view_id: null }], power_exceptions: [], color_scheme: 'inherit',
}

describe('kioskUrl', () => {
  it('baut die URL mit Bildschirm und Schlüssel, ohne zoom', () => {
    const url = kioskUrl('https://stagedesk.t410.de', glocke)
    expect(url).toBe('https://stagedesk.t410.de/signage?screen=glocke&key=k1%2F%2B%3F')
    expect(url).not.toContain('zoom')
  })
})

describe('Abschnitte', () => {
  it('pickFields nimmt nur die Felder des Abschnitts', () => {
    expect(pickFields(glocke, DISPLAY_FIELDS)).toEqual({
      name: 'Glocke', location: 'Eingangshalle', default_view_id: 1, scale: 'auto', orientation: 'landscape', color_scheme: 'inherit',
    })
    expect(Object.keys(pickFields(glocke, POWER_FIELDS)).sort())
      .toEqual(['off_during_holidays', 'power_exceptions', 'power_mode', 'schedule'])
  })

  it('sectionPayload normalisiert Zeitplan und Ausnahmen und kürzt Texte', () => {
    expect(sectionPayload('display', { ...pickFields(glocke, DISPLAY_FIELDS), name: ' Glocke 2 ', default_view_id: '' }))
      .toEqual({ name: 'Glocke 2', location: 'Eingangshalle', default_view_id: null, scale: 'auto', orientation: 'landscape', color_scheme: 'inherit' })
    expect(sectionPayload('display', { ...pickFields(glocke, DISPLAY_FIELDS), color_scheme: undefined }).color_scheme).toBe('inherit')
    expect(sectionPayload('power', {
      power_mode: 'auto', off_during_holidays: false,
      schedule: [{ days: [2, 0], from: '07:00', until: '17:00', view_id: '2' }, { days: [5], from: '10:00', until: '14:00', view_id: '' }],
      power_exceptions: [{ from_date: '2026-11-03', until_date: '', from: '', until: '', note: '' }],
    })).toEqual({
      power_mode: 'auto', off_during_holidays: false,
      schedule: [{ days: [0, 2], from: '07:00', until: '17:00', view_id: 2 }, { days: [5], from: '10:00', until: '14:00', view_id: null }],
      power_exceptions: [{ from_date: '2026-11-03', until_date: '2026-11-03', from: '', until: '', note: '' }],
    })
  })
})

describe('Farbschema', () => {
  it('bietet die drei Schemata pro Bildschirm', () => {
    expect(COLOR_SCHEME_OPTIONS).toEqual([
      { value: 'inherit', label: 'Wie eingestellt' },
      { value: 'light', label: 'Immer hell' },
      { value: 'dark', label: 'Immer dunkel' },
    ])
  })
})

describe('powerSummary', () => {
  it('nennt Modus und Zeitplan', () => {
    expect(powerSummary(glocke)).toBe('Mo–Fr 07:00 bis 17:00')
    expect(powerSummary({ ...glocke, schedule: [] })).toBe('Ohne Zeitplan')
    expect(powerSummary({ ...glocke, schedule: [...glocke.schedule, { days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00', view_id: 2 }] }))
      .toBe('Mo–Fr 07:00 bis 17:00')
    expect(powerSummary({ ...glocke, power_mode: 'manual_on' })).toBe('Manuell immer an')
    expect(powerSummary({ ...glocke, power_mode: 'manual_off' })).toBe('Manuell immer aus')
  })
})

describe('Gerät', () => {
  const now = new Date(2026, 9, 20, 10, 0)
  it('lastReport nennt heute nur die Uhrzeit, sonst Tag und Uhrzeit', () => {
    expect(lastReport(new Date(2026, 9, 20, 9, 58, 30).toISOString(), now)).toBe('heute 09:58')
    expect(lastReport(new Date(2026, 9, 19, 17, 2).toISOString(), now)).toBe('Mo 19.10., 17:02')
    expect(lastReport(null, now)).toBe('noch nie')
  })
  it('cecLabel übersetzt den CEC-Status', () => {
    expect(cecLabel('on')).toBe('an')
    expect(cecLabel('standby')).toBe('Standby')
    expect(cecLabel('')).toBe('unbekannt')
  })
})

describe('activeOverride', () => {
  const now = new Date('2026-10-20T10:00:00')
  it('liefert die Ansicht nur, solange sie gilt', () => {
    expect(activeOverride({ override_view_id: null }, now)).toBeNull()
    expect(activeOverride({ override_view_id: 3, override_until: null }, now)).toEqual({ viewId: 3, until: null })
    const until = new Date('2026-10-20T14:00:00')
    expect(activeOverride({ override_view_id: 3, override_until: until.toISOString() }, now)).toEqual({ viewId: 3, until })
    expect(activeOverride({ override_view_id: 3, override_until: '2026-10-20T09:00:00' }, now)).toBeNull()
  })
  it('wertet eine Ansicht im Papierkorb oder eine gelöschte als nicht aktiv (wie das Backend)', () => {
    const views = [{ id: 4, name: 'Info' }]
    expect(activeOverride({ override_view_id: 3, override_until: null }, now, views)).toBeNull()
    expect(activeOverride({ override_view_id: 4, override_until: null }, now, views)).toEqual({ viewId: 4, until: null })
    expect(activeOverride({ override_view_id: 3, override_until: null }, now, [])).toEqual({ viewId: 3, until: null })
  })
})

describe('overridePayload / overrideProblem', () => {
  const now = new Date('2026-10-20T10:00:00')
  it('sendet die Ansicht und den Zeitpunkt, leer heißt bis auf Weiteres', () => {
    expect(overridePayload('4', '')).toEqual({ override_view_id: 4, override_until: null })
    expect(overridePayload(4, '2026-10-20T14:00')).toEqual({
      override_view_id: 4, override_until: new Date('2026-10-20T14:00').toISOString(),
    })
  })
  it('Aufheben leert beide Felder', () => {
    expect(OVERRIDE_CLEAR).toEqual({ override_view_id: null, override_until: null })
  })
  it('meldet fehlende Ansicht und vergangene Zeit', () => {
    expect(overrideProblem('', '', now)).toMatch(/Ansicht/)
    expect(overrideProblem(4, '2026-10-20T09:00', now)).toMatch(/Zukunft/)
    expect(overrideProblem(4, '2026-10-20T14:00', now)).toBe('')
    expect(overrideProblem(4, '', now)).toBe('')
  })
})

describe('Geräte-Felder', () => {
  const orig = {
    power_method: 'cec', power_config: { cec_device: '0' }, auto_updates: true,
    update_window: { weekday: 6, from: '03:00', until: '05:00' }, daily_reboot: true,
  }
  const screen = { ...glocke, ...orig }

  it('DEVICE_FIELDS und pickFields', () => {
    expect(DEVICE_FIELDS).toEqual(['power_method', 'power_config', 'auto_updates', 'update_window', 'daily_reboot'])
    expect(pickFields(screen, DEVICE_FIELDS)).toEqual(orig)
  })

  it('Standardwerte je Methode (Ruling R4)', () => {
    expect(POWER_CONFIG_DEFAULTS).toEqual({
      cec: { cec_device: '0' },
      hdmi: { output: 'HDMI-A-1' },
      hybrid: { display_ip: '', display_port: 5000, monitor_id: 0, cec_device: '0' },
      ddc: { vcp_on: '01', vcp_off: '04' },
    })
    expect(deviceDefaults({}).update_window).toEqual({ weekday: 6, from: '03:00', until: '05:00' })
  })

  it('sendet nur geänderte Felder', () => {
    expect(devicePayload(orig, orig)).toEqual({})
    expect(devicePayload({ ...orig, auto_updates: false }, orig)).toEqual({ auto_updates: false })
    expect(devicePayload({ ...orig, daily_reboot: false, update_window: { weekday: 2, from: '01:00', until: '02:30' } }, orig))
      .toEqual({ daily_reboot: false, update_window: { weekday: 2, from: '01:00', until: '02:30' } })
  })

  it('Methodenwechsel sendet Methode und passende Konfiguration zusammen', () => {
    const draft = { ...orig, power_method: 'hybrid', power_config: { display_ip: ' 192.0.2.30 ', display_port: '5000', monitor_id: '1', cec_device: '0', alt: 'x' } }
    expect(devicePayload(draft, orig)).toEqual({
      power_method: 'hybrid',
      power_config: { display_ip: '192.0.2.30', display_port: 5000, monitor_id: 1, cec_device: '0' },
    })
  })

  it('nur Konfiguration geändert: Methode wird mitgeschickt, fehlende Werte erhalten den Standard', () => {
    expect(devicePayload({ ...orig, power_config: { cec_device: '1' } }, orig))
      .toEqual({ power_method: 'cec', power_config: { cec_device: '1' } })
    expect(devicePayload({ ...orig, power_method: 'ddc', power_config: {} }, orig))
      .toEqual({ power_method: 'ddc', power_config: { vcp_on: '01', vcp_off: '04' } })
  })

  it('prüft das Zeitfenster: von muss vor bis liegen', () => {
    const bad = { ...orig, update_window: { weekday: 6, from: '05:00', until: '03:00' } }
    expect(deviceProblems(bad, orig).window).toMatch(/„Von“ muss vor „Bis“ liegen/)
    expect(deviceProblems({ ...orig, update_window: { weekday: 6, from: '03:00', until: '03:00' } }, orig).window).not.toBe('')
    expect(deviceProblems({ ...orig, update_window: { weekday: 6, from: '', until: '03:00' } }, orig).window).toMatch(/Von oder bis ungültig/)
    expect(deviceProblems(orig, orig).window).toBe('')
    expect(deviceProblems(bad, bad).window).toBe('')
  })

  it('Hybrid braucht die SICP-IP, Port und Monitor-ID liegen im Bereich', () => {
    const hybrid = (cfg) => ({ ...orig, power_method: 'hybrid', power_config: { display_ip: '', display_port: 5000, monitor_id: 0, cec_device: '0', ...cfg } })
    expect(deviceProblems(hybrid({}), orig).config.display_ip).toMatch(/SICP-IP/)
    expect(deviceProblems(hybrid({ display_ip: '192.0.2.30' }), orig).config).toEqual({})
    expect(deviceProblems(hybrid({ display_ip: '192.0.2.30', display_port: '70000' }), orig).config.display_port).toMatch(/1 bis 65535/)
    expect(deviceProblems(hybrid({ display_ip: '192.0.2.30', monitor_id: '300' }), orig).config.monitor_id).toMatch(/0 bis 255/)
    expect(deviceProblems({ ...orig, power_config: { cec_device: ' ' } }, orig).config.cec_device).toMatch(/CEC-Gerät/)
  })

  it('sectionPayload device nutzt das Original', () => {
    expect(sectionPayload('device', { ...orig, auto_updates: false }, orig)).toEqual({ auto_updates: false })
  })
})
