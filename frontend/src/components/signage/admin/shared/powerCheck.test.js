import { describe, it, expect } from 'vitest'
import { PROBE_LABELS, PROBE_TO_METHOD, methodLabel, nextMethod, parseProbe, testOrder } from './powerCheck'

const SAMPLE = {
  methods: [
    { method: 'cec', state: 'ok', text: 'CEC antwortet' },
    { method: 'sicp', state: 'warn', text: 'Keine IP gesetzt' },
    { method: 'ddc', state: 'fail', text: 'Nicht erreichbar' },
    { method: 'hdmi', state: 'skip', text: 'Übersprungen' },
  ],
  recommended: 'cec',
  checked_at: '2026-10-25T10:00:00Z',
}

const withStates = (states, recommended) => parseProbe({
  status: 'ok',
  result: JSON.stringify({
    methods: Object.entries(states).map(([method, state]) => ({ method, state, text: '' })),
    recommended,
    checked_at: '2026-10-25T10:00:00Z',
  }),
})

describe('powerCheck', () => {
  it('parst das Prüfergebnis', () => {
    const p = parseProbe({ status: 'ok', result: JSON.stringify(SAMPLE) })
    expect(p.methods.map((m) => m.method)).toEqual(['cec', 'hybrid', 'ddc', 'hdmi'])
    expect(p.methods.map((m) => m.probe)).toEqual(['cec', 'sicp', 'ddc', 'hdmi'])
    expect(p.methods.map((m) => m.testable)).toEqual([true, true, false, false])
    expect(p.recommended).toBe('cec')
    expect(p.checkedAt).toEqual(new Date('2026-10-25T10:00:00Z'))
  })

  it('kein JSON wird zum Fehlertext', () => {
    expect(parseProbe({ status: 'failed', result: 'Unbekannter Befehl' })).toEqual({ error: 'Unbekannter Befehl' })
    expect(parseProbe({ status: 'failed', result: '' })).toEqual({ error: 'Prüfung fehlgeschlagen.' })
    expect(parseProbe({ status: 'failed', result: JSON.stringify(SAMPLE) })).toEqual({ error: JSON.stringify(SAMPLE) })
  })

  it('Testreihenfolge: Empfehlung zuerst, dann übrige testbare', () => {
    expect(testOrder(withStates({ cec: 'warn', sicp: 'ok', ddc: 'fail', hdmi: 'warn' }, 'hybrid'))).toEqual(['hybrid', 'cec', 'hdmi'])
  })

  it('Testreihenfolge ohne Empfehlung und ohne Duplikate', () => {
    expect(testOrder(withStates({ cec: 'ok', sicp: 'fail', ddc: 'ok', hdmi: 'fail' }, 'none'))).toEqual(['cec', 'ddc'])
    expect(testOrder(withStates({ cec: 'ok', sicp: 'ok', ddc: 'ok', hdmi: 'ok' }, 'cec'))).toEqual(['cec', 'hybrid', 'ddc', 'hdmi'])
  })

  it('nächste Methode und Ende', () => {
    expect(nextMethod(['cec', 'hdmi'], 'cec')).toBe('hdmi')
    expect(nextMethod(['cec', 'hdmi'], 'hdmi')).toBeNull()
    expect(nextMethod(['cec', 'hdmi'], 'ddc')).toBeNull()
  })

  it('Beschriftungen', () => {
    expect(PROBE_LABELS.sicp).toBe('Netzwerk (SICP)')
    expect(PROBE_TO_METHOD.sicp).toBe('hybrid')
    expect(methodLabel('hybrid')).toBe('Hybrid (SICP aus, CEC an)')
    expect(methodLabel('none')).toBe('Keine Steuerung')
  })
})
