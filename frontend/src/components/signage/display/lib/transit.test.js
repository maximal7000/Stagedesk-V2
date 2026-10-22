import { describe, it, expect } from 'vitest'
import {
  BUS_FALLBACK_COLOR, assignColumns, delayLabel, disruptionLabel, formatDepartureTime, isBus, lineColor, lineLabel,
  isDeparted, minutesUntil, stripCommonCity, visibleDisruptions,
} from './transit'

const at = (hh, mm) => new Date(2026, 9, 19, hh, mm, 30)

describe('transit', () => {
  it('kürzt Linien-Labels und trennt Zuggattung und Nummer', () => {
    expect(lineLabel({ line: 'Bus 12' })).toBe('12')
    expect(lineLabel({ line: 'RE8' })).toBe('RE 8')
    expect(lineLabel({ line: 'RB 85' })).toBe('RB 85')
    expect(lineLabel({ line: '' })).toBe('?')
  })

  it('nimmt SWL-Farben nur für Busse', () => {
    expect(lineColor({ line: '5', kind_icon: 'bus' })).toBe('#004f9f')
    expect(lineColor({ line: 'RE8', kind_icon: 're' })).toBeNull()
    expect(lineColor({ line: '5', kind_icon: 'bus', line_color: '#123456' })).toBe('#123456')
    expect(isBus({ kind_icon: 're' })).toBe(false)
  })

  it('rechnet Minuten bis zur tatsächlichen Abfahrt, auch über Mitternacht', () => {
    expect(minutesUntil({ departure: '11:08', departure_actual: '11:10', delay: 2 }, at(10, 42))).toBe(28)
    expect(minutesUntil({ departure: '11:08', delay: 2 }, at(10, 42))).toBe(28)
    expect(minutesUntil({ departure: '00:05' }, at(23, 58))).toBe(7)
    expect(minutesUntil({ departure: '23:58' }, at(0, 1))).toBe(-3)
    expect(minutesUntil({ departure: '' }, at(10, 0))).toBeNull()
  })

  it('filtert allgemeine Hinweise und sortiert Streik und hervorgehobene nach vorn', () => {
    const items = [
      { id: 1, kind: 'disruption', title: 'A', lines: ['5'] },
      { id: 2, kind: 'disruption', title: 'Fahrradmitnahme', lines: [] },
      { id: 3, kind: 'disruption', title: 'B', lines: ['7'], highlighted: true },
      { id: 4, kind: 'strike', title: 'Streik', all_lines: true },
    ]
    expect(visibleDisruptions(items).map((d) => d.id)).toEqual([4, 3, 1])
  })

  it('beschriftet Störungen mit Art und Linien', () => {
    expect(disruptionLabel({ kind: 'disruption', lines: ['5'] })).toBe('Störung · Linie 5')
    expect(disruptionLabel({ kind: 'construction', lines: ['11', '31'] })).toBe('Baustelle · Linien 11, 31')
    expect(disruptionLabel({ kind: 'other', all_lines: true, lines: ['5'] })).toBe('Hinweis')
  })

  describe('Zeitangabe', () => {
    const dep = (departure, extra) => ({ departure, departure_actual: departure, delay: 0, ...extra })
    const at = (hms) => {
      const [h, m, sec = 0] = hms.split(':').map(Number)
      return new Date(2026, 9, 22, h, m, sec)
    }

    it('Minuten, Uhrzeit und Gemischt mit Grenze 20 min', () => {
      expect(formatDepartureTime(dep('22:11'), at('22:11:30'), 'minutes')).toBe('jetzt')
      expect(formatDepartureTime(dep('22:14'), at('22:11'), 'minutes')).toBe('3 min')
      expect(formatDepartureTime(dep('22:31'), at('22:11'), 'mixed')).toBe('20 min')
      expect(formatDepartureTime(dep('22:32'), at('22:11'), 'mixed')).toBe('22:32')
      expect(formatDepartureTime(dep('22:14'), at('22:11'), 'clock')).toBe('22:14')
    })

    it('rechnet ab der geplanten Abfahrt, auch über Mitternacht', () => {
      expect(formatDepartureTime(dep('22:03', { departure_actual: '22:12', delay: 9 }), at('22:11'), 'minutes')).toBe('jetzt')
      expect(formatDepartureTime(dep('22:14', { departure_actual: '22:20', delay: 6 }), at('22:11'), 'minutes')).toBe('3 min')
      expect(formatDepartureTime(dep('00:05'), at('23:58'), 'minutes')).toBe('7 min')
      expect(formatDepartureTime(dep('22:14'), at('22:11'), undefined)).toBe('3 min')
    })

    it('abgefahren erst mehr als 1 min nach der tatsächlichen Abfahrt', () => {
      expect(isDeparted(dep('22:10'), at('22:11'))).toBe(false)
      expect(isDeparted(dep('22:09'), at('22:11'))).toBe(true)
      expect(isDeparted(dep('22:03', { departure_actual: '22:12', delay: 9 }), at('22:11'))).toBe(false)
      expect(isDeparted(dep(''), at('22:11'))).toBe(false)
    })

    it('Verspätung als +N, ohne bei 0', () => {
      expect(delayLabel({ delay: 6 })).toBe('+6')
      expect(delayLabel({ delay: 0 })).toBeNull()
      expect(delayLabel({})).toBeNull()
    })
  })

  it('Bus-Lila nur für Busse ohne eigene Linienfarbe', () => {
    expect(BUS_FALLBACK_COLOR).toBe('#95276E')
    expect(lineColor({ kind_icon: 'bus', line: '8710' })).toBe('#95276E')
    expect(lineColor({ kind_icon: 'bus', line: '11', line_color: '#e30613' })).toBe('#e30613')
    expect(lineColor({ kind_icon: 're', line: 'SEV RE83' })).toBeNull()
  })

  it('verteilt Haltestellen auf feste Spalten', () => {
    const st = (index, column) => ({ index, column, station_name: `S${index}` })
    expect(assignColumns([st(0, 1), st(1, 6), st(2, null)], 4).map((c) => c.map((s) => s.index))).toEqual([[0], [], [2], [1]])
    expect(assignColumns([st(3, 2), st(1, 2), st(0, 1)], 2).map((c) => c.map((s) => s.index))).toEqual([[0], [1, 3]])
    expect(assignColumns([{ station_name: 'a' }, { station_name: 'b' }], 2).map((c) => c.map((s) => s.station_name))).toEqual([['a'], ['b']])
  })

  it('kürzt einen gemeinsamen Ortsnamen', () => {
    const strip = stripCommonCity(['Lübeck Wahmstraße', 'Lübeck Hbf'])
    expect(strip('Lübeck Wahmstraße')).toBe('Wahmstraße')
    expect(strip('Lübeck Hbf')).toBe('Lübeck Hbf')
    expect(stripCommonCity(['Lübeck Kohlmarkt'])('Lübeck Kohlmarkt')).toBe('Lübeck Kohlmarkt')
    expect(stripCommonCity(['Lübeck Kohlmarkt', 'Bad Schwartau'])('Lübeck Kohlmarkt')).toBe('Lübeck Kohlmarkt')
    expect(stripCommonCity(['Lübeck Kohlmarkt', 'Lübeck'])('Lübeck Kohlmarkt')).toBe('Lübeck Kohlmarkt')
  })
})
