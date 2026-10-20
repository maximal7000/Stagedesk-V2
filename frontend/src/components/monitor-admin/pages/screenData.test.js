import { describe, it, expect } from 'vitest'
import { DISPLAY_FIELDS, POWER_FIELDS, cecLabel, kioskUrl, lastReport, pickFields, powerSummary, sectionPayload } from './screenData'

const glocke = {
  id: 1, name: 'Glocke', slug: 'glocke', location: 'Eingangshalle', default_view_id: 1, scale: 'auto',
  orientation: 'landscape', access_key: 'k1/+?', power_mode: 'auto', off_during_holidays: true,
  power_schedule: [{ days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00' }], power_exceptions: [],
}

describe('kioskUrl', () => {
  it('baut die URL mit Bildschirm und Schlüssel, ohne zoom', () => {
    const url = kioskUrl('https://stagedesk.t410.de', glocke)
    expect(url).toBe('https://stagedesk.t410.de/monitor?screen=glocke&key=k1%2F%2B%3F')
    expect(url).not.toContain('zoom')
  })
})

describe('Abschnitte', () => {
  it('pickFields nimmt nur die Felder des Abschnitts', () => {
    expect(pickFields(glocke, DISPLAY_FIELDS)).toEqual({
      name: 'Glocke', location: 'Eingangshalle', default_view_id: 1, scale: 'auto', orientation: 'landscape',
    })
    expect(Object.keys(pickFields(glocke, POWER_FIELDS)).sort())
      .toEqual(['off_during_holidays', 'power_exceptions', 'power_mode', 'power_schedule'])
  })

  it('sectionPayload normalisiert Zeitplan und Ausnahmen und kürzt Texte', () => {
    expect(sectionPayload('display', { ...pickFields(glocke, DISPLAY_FIELDS), name: ' Glocke 2 ', default_view_id: '' }))
      .toEqual({ name: 'Glocke 2', location: 'Eingangshalle', default_view_id: null, scale: 'auto', orientation: 'landscape' })
    expect(sectionPayload('power', {
      power_mode: 'auto', off_during_holidays: false,
      power_schedule: [{ days: [2, 0], from: '07:00', until: '17:00' }],
      power_exceptions: [{ from_date: '2026-11-03', until_date: '', from: '', until: '', note: '' }],
    })).toEqual({
      power_mode: 'auto', off_during_holidays: false,
      power_schedule: [{ days: [0, 2], from: '07:00', until: '17:00' }],
      power_exceptions: [{ from_date: '2026-11-03', until_date: '2026-11-03', from: '', until: '', note: '' }],
    })
  })
})

describe('powerSummary', () => {
  it('nennt Modus und Zeitplan', () => {
    expect(powerSummary(glocke)).toBe('Mo–Fr 07:00 bis 17:00')
    expect(powerSummary({ ...glocke, power_schedule: [] })).toBe('Ohne Zeitplan')
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
