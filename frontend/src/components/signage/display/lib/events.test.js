import { describe, it, expect } from 'vitest'
import { daysUntil, eventDetail } from './events'
import { formatDayMonth, formatShortDate, parseLocalDate } from './format'

// All values are local times of the test environment
const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()

describe('Termine', () => {
  it('zählt Kalendertage bis zum Ziel', () => {
    const now = new Date(2026, 9, 19, 23, 50)
    expect(daysUntil(local(2026, 10, 22, 18), now)).toBe(3)
    expect(daysUntil(local(2026, 10, 19, 23, 55), now)).toBe(0)
    expect(daysUntil(local(2026, 10, 18, 12), now)).toBe(-1)
  })

  it('beschreibt Uhrzeit, ganztägige, mehrtägige und laufende Termine', () => {
    expect(eventDetail({ date_from: local(2026, 10, 22, 18), date_until: local(2026, 10, 22, 21) })).toBe('18:00')
    expect(eventDetail({ date_from: local(2026, 10, 23), date_until: local(2026, 10, 23, 23, 59) })).toBe('ganztägig')
    expect(eventDetail({ date_from: local(2026, 10, 23), date_until: local(2026, 10, 24) })).toBe('ganztägig')
    expect(eventDetail({ date_from: local(2026, 10, 23), date_until: local(2026, 10, 25, 23, 59) })).toBe('bis So 25.10.')
    expect(eventDetail({ date_from: local(2026, 10, 23, 9), date_until: local(2026, 10, 24, 15) })).toBe('09:00, bis Sa 24.10.')
    expect(eventDetail({ date_from: local(2026, 10, 19, 9), date_until: local(2026, 10, 19, 21), is_running: true })).toBe('läuft bis 21:00')
    expect(eventDetail({ date_from: local(2026, 10, 22, 18), date_until: null })).toBe('18:00')
  })

  it('formatiert kurze Daten', () => {
    expect(formatDayMonth(new Date(2026, 9, 19))).toBe('19.10.')
    expect(formatShortDate(new Date(2026, 9, 22))).toBe('Do 22.10.')
    expect(parseLocalDate('2026-10-20').getDate()).toBe(20)
  })
})
