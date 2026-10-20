import { describe, it, expect } from 'vitest'
import {
  describeSchedule, exceptionProblems, formatDays, normalizeExceptions, normalizeSchedule, scheduleProblems,
} from './schedule'

describe('normalizeSchedule', () => {
  it('sortiert Tage, entfernt Doppelte und Ungültiges, schneidet Zeiten zu', () => {
    expect(normalizeSchedule([{ days: [4, 0, 2, 2, 9, -1, '1'], from: ' 07:00', until: '17:00 ' }]))
      .toEqual([{ days: [0, 1, 2, 4], from: '07:00', until: '17:00' }])
  })

  it('verwirft Einträge, die keine Objekte sind, und füllt fehlende Felder', () => {
    expect(normalizeSchedule([null, 'x', { from: '08:00' }]))
      .toEqual([{ days: [], from: '08:00', until: '' }])
    expect(normalizeSchedule(undefined)).toEqual([])
  })
})

describe('scheduleProblems', () => {
  it('meldet fehlende Tage, fehlende Zeiten und gleiche Zeiten je Zeile', () => {
    expect(scheduleProblems([
      { days: [0], from: '07:00', until: '17:00' },
      { days: [], from: '07:00', until: '17:00' },
      { days: [1], from: '', until: '17:00' },
      { days: [2], from: '09:00', until: '09:00' },
    ])).toEqual([
      null,
      'Mindestens einen Tag wählen.',
      'Von und bis angeben.',
      'Von und bis dürfen nicht gleich sein.',
    ])
  })

  it('erlaubt Fenster über Mitternacht', () => {
    expect(scheduleProblems([{ days: [4], from: '22:00', until: '02:00' }])).toEqual([null])
  })
})

describe('formatDays', () => {
  it('fasst zusammenhängende Tage ab drei zusammen', () => {
    expect(formatDays([0, 1, 2, 3, 4])).toBe('Mo–Fr')
    expect(formatDays([5, 6])).toBe('Sa, So')
    expect(formatDays([0, 2, 4])).toBe('Mo, Mi, Fr')
    expect(formatDays([0, 1, 2, 4, 5, 6])).toBe('Mo–Mi, Fr–So')
    expect(formatDays([])).toBe('')
  })
})

describe('describeSchedule', () => {
  it('beschreibt den Zeitplan als Text', () => {
    expect(describeSchedule([])).toBe('Ohne Zeitplan')
    expect(describeSchedule([
      { days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00' },
      { days: [5], from: '10:00', until: '14:00' },
    ])).toBe('Mo–Fr 07:00 bis 17:00 · Sa 10:00 bis 14:00')
  })
})

describe('Ausnahmen', () => {
  it('normalizeExceptions setzt ein leeres Enddatum auf das Startdatum', () => {
    expect(normalizeExceptions([{ from_date: '2026-11-03', until_date: '', from: '', until: '', note: ' Tag der offenen Tür ' }]))
      .toEqual([{ from_date: '2026-11-03', until_date: '2026-11-03', from: '', until: '', note: 'Tag der offenen Tür' }])
  })

  it('exceptionProblems prüft Datum, Reihenfolge und Zeitpaar', () => {
    expect(exceptionProblems([
      { from_date: '2026-11-03', until_date: '2026-11-03', from: '', until: '' },
      { from_date: '', until_date: '', from: '', until: '' },
      { from_date: '2026-11-05', until_date: '2026-11-04', from: '', until: '' },
      { from_date: '2026-11-05', until_date: '2026-11-05', from: '08:00', until: '' },
      { from_date: '2026-11-05', until_date: '2026-11-05', from: '08:00', until: '08:00' },
    ])).toEqual([
      null,
      'Datum angeben.',
      'Das Enddatum liegt vor dem Startdatum.',
      'Von und bis angeben oder beide leer lassen.',
      'Von und bis dürfen nicht gleich sein.',
    ])
  })
})
