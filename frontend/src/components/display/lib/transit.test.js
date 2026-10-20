import { describe, it, expect } from 'vitest'
import { disruptionLabel, isBus, lineColor, lineLabel, minutesUntil, visibleDisruptions } from './transit'

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
})
