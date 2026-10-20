import { describe, it, expect } from 'vitest'
import { allOffUntil, dataSources, nextExam, upcoming } from './overviewData'

const now = new Date(2026, 9, 20, 10, 0)

describe('dataSources', () => {
  const departures = { kind: 'departures', data: { stations: [{ station_id: 'a' }], disruptions: [] } }

  it('letzter Erfolg aus generated_at, auch in geteilten Ansichten und Wechseln', () => {
    const payloads = [
      { generated_at: '2026-10-20T09:58:00', view: departures },
      { generated_at: '2026-10-20T09:59:30', view: { kind: 'split', data: { left: { kind: 'substitutions', data: {} }, right: departures } } },
      { generated_at: '2026-10-20T09:59:50', view: { kind: 'info', data: {} } },
    ]
    const s = dataSources(payloads, { webuntis_source: 'substitutions', webuntis_checked_at: '2026-10-20T09:40:00' })
    expect(s.departures).toEqual({ tone: 'ok', text: 'OK · 09:59' })
    expect(s.disruptions).toEqual({ tone: 'ok', text: 'OK · 09:59' })
    expect(s.webuntis).toEqual({ tone: 'ok', text: 'OK · 09:40' })
  })

  it('ohne Daten, ungenutzt, ungeprüft und nicht erreichbar', () => {
    const rotation = { kind: 'rotation', data: { items: [{ seconds: 10, view: { kind: 'departures', data: { stations: [], disruptions: null } } }] } }
    const s = dataSources([{ generated_at: '2026-10-20T09:59:00', view: rotation }], { webuntis_source: 'unavailable', webuntis_checked_at: '2026-10-20T08:00:00' })
    expect(s.departures).toEqual({ tone: 'warn', text: 'keine Daten' })
    expect(s.disruptions).toEqual({ tone: 'warn', text: 'keine Daten' })
    expect(s.webuntis).toEqual({ tone: 'bad', text: 'nicht erreichbar · 08:00' })
    const empty = dataSources([], { webuntis_source: '' })
    expect(empty.departures).toEqual({ tone: 'muted', text: 'nicht verwendet' })
    expect(empty.webuntis).toEqual({ tone: 'muted', text: 'nicht geprüft' })
  })
})

describe('nextExam', () => {
  it('laufende oder nächste Klausur, vergangene nicht', () => {
    const exams = [
      { id: 1, title: 'Alt', active_from: '2026-10-19T08:00:00', active_until: '2026-10-19T12:00:00' },
      { id: 2, title: 'Später', active_from: '2026-10-22T08:00:00', active_until: '2026-10-22T12:00:00' },
      { id: 3, title: 'Jetzt', active_from: '2026-10-20T08:00:00', active_until: '2026-10-20T12:30:00' },
    ]
    expect(nextExam(exams, now).id).toBe(3)
    expect(nextExam([exams[0]], now)).toBeNull()
  })
})

describe('upcoming', () => {
  it('nächste Ferien und nächster Termin', () => {
    const holidays = [
      { name: 'Sommerferien', start_date: '2026-07-01', end_date: '2026-08-10' },
      { name: 'Herbstferien', start_date: '2026-10-26', end_date: '2026-11-06' },
    ]
    const events = [
      { name: 'Vorbei', is_active: false, active_from: '2026-10-01T18:00:00', active_until: '2026-10-01T20:00:00' },
      { name: 'Konzert', is_active: false, active_from: '2026-10-22T18:00:00', active_until: '2026-10-22T21:00:00' },
    ]
    expect(upcoming(holidays, events, now)).toEqual([
      { key: 'holiday', label: 'Herbstferien', value: 'ab Mo 26.10.' },
      { key: 'event', label: 'Termin „Konzert“', value: 'Do 22.10., 18:00' },
    ])
    expect(upcoming([{ name: 'Herbstferien', start_date: '2026-10-19', end_date: '2026-10-30' }], [], now))
      .toEqual([{ key: 'holiday', label: 'Herbstferien', value: 'bis Fr 30.10.' }])
  })
})

describe('allOffUntil', () => {
  it('frühestes Ende, wenn alle Bildschirme bis Tagesende aus sind', () => {
    const screens = [{ off_until: '2026-10-21T07:00:00' }, { off_until: '2026-10-21T05:00:00' }]
    expect(allOffUntil(screens, now).getHours()).toBe(5)
    expect(allOffUntil([...screens, { off_until: null }], now)).toBeNull()
    expect(allOffUntil([], now)).toBeNull()
  })
})
