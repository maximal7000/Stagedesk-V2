import { describe, it, expect } from 'vitest'
import { explainScreen, describeShown } from './explain'

// Tuesday, 20.10.2026, 10:00 local time (Python weekday 1)
const now = new Date(2026, 9, 20, 10, 0)

const screen = (extra = {}) => ({
  id: 1, name: 'Glocke', default_view_id: 1, override_view_id: null, override_until: null,
  schedule: [], power_exceptions: [], power_mode: 'auto',
  off_during_holidays: true, off_until: null, ...extra,
})
const payload = (extra = {}) => ({ screen: { power: true }, mode: null, view: { id: 1, kind: 'departures' }, ...extra })

describe('explainScreen', () => {
  it('Standard-Ansicht', () => {
    expect(explainScreen(screen(), payload(), { now })).toBe('Standard-Ansicht')
  })

  it('laut Zeitplan bis HH:MM', () => {
    const s = screen({ schedule: [{ view_id: 2, days: [1], from: '08:00', until: '13:00' }] })
    expect(explainScreen(s, payload({ view: { id: 2, kind: 'info' } }), { now })).toBe('laut Zeitplan bis 13:00')
  })

  it('Zeitplan: die obere Zeile gilt, über Mitternacht zählt der Teil nach 0 Uhr zum Folgetag', () => {
    const covered = screen({ schedule: [{ view_id: null, days: [1], from: '07:00', until: '17:00' }, { view_id: 2, days: [1], from: '08:00', until: '13:00' }] })
    expect(explainScreen(covered, payload({ view: { id: 2, kind: 'info' } }), { now })).toBe('Standard-Ansicht')
    const night = screen({ schedule: [{ view_id: 2, days: [0], from: '22:00', until: '11:00' }] })
    expect(explainScreen(night, payload({ view: { id: 2, kind: 'info' } }), { now })).toBe('laut Zeitplan bis 11:00')
  })

  it('weil Termin „X“ läuft', () => {
    const events = [{ name: 'Elternabend', is_active: true, active_from: null, active_until: null,
      assignments: [{ screen_id: 1, view_id: 3 }] }]
    expect(explainScreen(screen(), payload({ view: { id: 3, kind: 'info' } }), { now, events }))
      .toBe('weil Termin „Elternabend“ läuft')
  })

  it('Termin mit Zeitfenster nennt das Ende', () => {
    const events = [{ name: 'Tag der offenen Tür', is_active: false,
      active_from: '2026-10-20T09:00:00', active_until: '2026-10-20T12:30:00',
      assignments: [{ screen_id: 1, view_id: 3 }] }]
    expect(explainScreen(screen(), payload({ view: { id: 3, kind: 'info' } }), { now, events }))
      .toBe('weil Termin „Tag der offenen Tür“ bis 12:30 läuft')
  })

  it('weil Klausur „X“ bis HH:MM läuft', () => {
    const mode = { kind: 'exam', display: 'split', title: 'Abitur Mathematik', active_until: '2026-10-20T12:30:00' }
    expect(explainScreen(screen(), payload({ mode }), { now })).toBe('weil Klausur „Abitur Mathematik“ bis 12:30 läuft')
  })

  it('Notfall aktiv, auch wenn der Bildschirm sonst aus wäre', () => {
    const mode = { kind: 'emergency', text: 'Bitte das Gebäude verlassen' }
    const s = screen({ off_until: '2026-10-21T07:00:00' })
    expect(explainScreen(s, payload({ mode }), { now })).toBe('Notfall aktiv')
  })

  it('aus bis <Tag HH:MM>', () => {
    const s = screen({ off_until: '2026-10-21T07:00:00' })
    expect(explainScreen(s, payload({ screen: { power: false } }), { now })).toBe('aus bis Mi 21.10., 07:00')
  })

  it('in den Ferien aus', () => {
    const holidays = [{ name: 'Herbstferien', start_date: '2026-10-19', end_date: '2026-10-30' }]
    expect(explainScreen(screen(), payload({ screen: { power: false } }), { now, holidays })).toBe('in den Ferien aus')
  })

  it('weitere Aus-Gründe: manuell und laut Zeitplan', () => {
    expect(explainScreen(screen({ power_mode: 'manual_off' }), payload({ screen: { power: false } }), { now }))
      .toBe('manuell aus')
    expect(explainScreen(screen(), payload({ screen: { power: false } }), { now })).toBe('laut Zeitplan aus')
  })

  it('ohne Anzeige-Daten: nur was aus den Bildschirm-Feldern folgt', () => {
    expect(explainScreen(screen({ off_until: '2026-10-21T07:00:00' }), null, { now })).toBe('aus bis Mi 21.10., 07:00')
    expect(explainScreen(screen(), null, { now })).toBe('')
  })
})

describe('describeShown', () => {
  const names = { 1: 'Abfahrten', 2: 'Vertretungsplan' }

  it('Ansichtsname, Sondermodus und aus', () => {
    expect(describeShown(payload(), names)).toBe('Abfahrten')
    expect(describeShown(payload({ mode: { kind: 'exam', display: 'split' }, view: { id: 2 } }), names))
      .toBe('Klausur, geteilt mit Vertretungsplan')
    expect(describeShown(payload({ mode: { kind: 'on_air', display: 'fullscreen' } }), names)).toBe('On-Air')
    expect(describeShown(payload({ mode: { kind: 'emergency' } }), names)).toBe('Notfall')
    expect(describeShown(payload({ screen: { power: false } }), names)).toBe('Aus')
    expect(describeShown(payload({ view: { id: 9, kind: 'media' } }), names)).toBe('Medien')
  })
})
