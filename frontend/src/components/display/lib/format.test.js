import { describe, it, expect } from 'vitest'
import {
  formatDayMonth, formatLongDate, formatShortDate, formatTime, formatTimeSeconds, formatWeekday, parseLocalDate,
} from './format'

describe('Formate', () => {
  it('formatiert gültige Werte', () => {
    const d = new Date(2026, 9, 22, 9, 5, 7)
    expect(formatTime(d)).toBe('09:05')
    expect(formatTimeSeconds(d)).toBe('09:05:07')
    expect(formatWeekday(d)).toBe('Donnerstag')
    expect(formatShortDate(d)).toBe('Do 22.10.')
    expect(formatDayMonth(d)).toBe('22.10.')
  })

  it('liefert bei ungültigen oder fehlenden Werten einen leeren Text statt zu werfen', () => {
    for (const value of ['kaputt', null, undefined, '', NaN, new Date('x')]) {
      expect(formatTime(value)).toBe('')
      expect(formatTimeSeconds(value)).toBe('')
      expect(formatWeekday(value)).toBe('')
      expect(formatLongDate(value)).toBe('')
      expect(formatDayMonth(value)).toBe('')
      expect(formatShortDate(value)).toBe('')
    }
  })

  it('liest ISO-Daten als lokales Datum, Ungültiges bleibt ungültig', () => {
    const d = parseLocalDate('2026-10-19')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 19, 0])
    expect(formatWeekday(parseLocalDate('19.10.2026'))).toBe('')
    expect(formatWeekday(parseLocalDate(null))).toBe('')
  })
})
