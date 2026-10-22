import { describe, it, expect } from 'vitest'
import {
  activeRow, describeSchedule, exceptionProblems, formatDays, normalizeExceptions, normalizeSchedule, overlapHints, powerWeek,
  scheduleProblems, seriesSlots, weekBars,
} from './schedule'

const row = (days, from, until, view_id = null) => ({ days, from, until, view_id })
const minutes = (h, m = 0) => h * 60 + m

describe('normalizeSchedule', () => {
  it('sortiert Tage, entfernt Doppelte und Ungültiges, schneidet Zeiten zu', () => {
    expect(normalizeSchedule([{ days: [4, 0, 2, 2, 9, -1, '1'], from: ' 07:00', until: '17:00 ' }]))
      .toEqual([{ days: [0, 1, 2, 4], from: '07:00', until: '17:00', view_id: null }])
  })

  it('verwirft Einträge, die keine Objekte sind, und füllt fehlende Felder', () => {
    expect(normalizeSchedule([null, 'x', { from: '08:00' }]))
      .toEqual([{ days: [], from: '08:00', until: '', view_id: null }])
    expect(normalizeSchedule(undefined)).toEqual([])
  })

  it('behält die Ansicht als Zahl, leer heißt Standard-Ansicht', () => {
    expect(normalizeSchedule([row([0], '07:00', '13:00', '3'), row([0], '13:00', '15:00', ''), row([0], '15:00', '16:00', 4)])
      .map((e) => e.view_id)).toEqual([3, null, 4])
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

  it('meldet eine Ansicht, die es nicht mehr gibt', () => {
    const views = [{ id: 1, name: 'Abfahrten' }]
    expect(scheduleProblems([row([0], '07:00', '13:00', 1), row([0], '13:00', '15:00', 9), row([0], '15:00', '16:00')], views))
      .toEqual([null, 'Die gewählte Ansicht gibt es nicht mehr. Bitte eine andere wählen.', null])
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

describe('overlapHints', () => {
  it('nennt die erste frühere Zeile, aneinanderstoßend ist keine Überschneidung', () => {
    expect(overlapHints([row([0], '07:00', '13:00'), row([0], '12:00', '15:00'), row([0], '15:00', '18:00')]))
      .toEqual([null, 'Überschneidet sich mit Zeile 1, Zeile 1 hat Vorrang.', null])
  })

  it('nur an gemeinsamen Tagen, auch über Mitternacht in den Folgetag', () => {
    expect(overlapHints([row([4], '22:00', '06:00'), row([5], '05:00', '09:00'), row([4], '05:00', '09:00')]))
      .toEqual([null, 'Überschneidet sich mit Zeile 1, Zeile 1 hat Vorrang.', null])
  })

  it('Sonntag über Mitternacht reicht in den Montag', () => {
    expect(overlapHints([row([6], '23:00', '01:00'), row([0], '00:30', '02:00')]))
      .toEqual([null, 'Überschneidet sich mit Zeile 1, Zeile 1 hat Vorrang.'])
  })

  it('nennt die erste, nicht die letzte überschneidende Zeile', () => {
    expect(overlapHints([row([1], '08:00', '09:00'), row([1], '07:00', '12:00'), row([1], '10:00', '11:00')]))
      .toEqual([null, 'Überschneidet sich mit Zeile 1, Zeile 1 hat Vorrang.', 'Überschneidet sich mit Zeile 2, Zeile 2 hat Vorrang.'])
  })
})

describe('weekBars', () => {
  it('teilt Zeilen über Mitternacht: der Teil nach 0 Uhr gehört zum Folgetag', () => {
    expect(weekBars([row([4], '22:00', '06:00', 2)])).toEqual([
      { day: 4, start: minutes(22), end: 1440, viewId: 2 },
      { day: 5, start: 0, end: minutes(6), viewId: 2 },
    ])
    expect(weekBars([row([6], '22:00', '06:00')])).toEqual([
      { day: 0, start: 0, end: minutes(6), viewId: null },
      { day: 6, start: minutes(22), end: 1440, viewId: null },
    ])
  })

  it('die obere Zeile gewinnt, die untere füllt nur den Rest', () => {
    expect(weekBars([row([0], '07:00', '13:00', 2), row([0], '12:00', '15:00')])).toEqual([
      { day: 0, start: minutes(7), end: minutes(13), viewId: 2 },
      { day: 0, start: minutes(13), end: minutes(15), viewId: null },
    ])
    expect(weekBars([row([0], '10:00', '11:00', 2), row([0], '07:00', '15:00')])).toEqual([
      { day: 0, start: minutes(7), end: minutes(10), viewId: null },
      { day: 0, start: minutes(10), end: minutes(11), viewId: 2 },
      { day: 0, start: minutes(11), end: minutes(15), viewId: null },
    ])
  })

  it('fasst aneinanderstoßende Zeilen derselben Ansicht zusammen, 23:59 zählt bis Mitternacht', () => {
    expect(weekBars([row([2], '07:00', '13:00'), row([2], '13:00', '23:59')]))
      .toEqual([{ day: 2, start: minutes(7), end: 1440, viewId: null }])
  })

  it('wie das Backend: nur Zahlen als Tage, fehlende Zeiten 00:00 bzw. 23:59', () => {
    expect(weekBars([
      { days: ['1'], from: '07:00', until: '08:00' },
      { days: [2], from: '', until: '' },
      { days: [3], from: '20:00', until: '' },
      'kaputt',
    ])).toEqual([
      { day: 2, start: 0, end: 1440, viewId: null },
      { day: 3, start: minutes(20), end: 1440, viewId: null },
    ])
  })
})

describe('powerWeek', () => {
  const auto = (schedule) => ({ power_mode: 'auto', schedule })

  it('ohne Zeitplan immer an, manuell an oder aus', () => {
    expect(powerWeek(auto([]))).toEqual({ mode: 'always', days: Array(7).fill([{ start: 0, end: 1440 }]) })
    expect(powerWeek({ power_mode: 'manual_on', schedule: [row([0], '07:00', '08:00')] }).mode).toBe('on')
    expect(powerWeek({ power_mode: 'manual_off', schedule: [] })).toEqual({ mode: 'off', days: Array(7).fill([]) })
  })

  it('an ist die Vereinigung aller Zeilen, unabhängig von der Ansicht', () => {
    const { mode, days } = powerWeek(auto([row([0], '07:00', '13:00', 2), row([0], '13:00', '17:00'), row([4], '22:00', '02:00')]))
    expect(mode).toBe('schedule')
    expect(days[0]).toEqual([{ start: minutes(7), end: minutes(17) }])
    expect(days[4]).toEqual([{ start: minutes(22), end: 1440 }])
    expect(days[5]).toEqual([{ start: 0, end: minutes(2) }])
  })
})

describe('activeRow', () => {
  it('wie screen_schedule.row_matches: Enden zählen mit, über Mitternacht am Folgetag, obere Zeile zuerst', () => {
    const rows = [row([1], '08:00', '13:00', 2), row([1], '07:00', '17:00'), row([4], '22:00', '02:00', 3)]
    expect(activeRow(rows, 1, '10:00')).toBe(rows[0])
    expect(activeRow(rows, 1, '13:00')).toBe(rows[0])
    expect(activeRow(rows, 1, '14:00')).toBe(rows[1])
    expect(activeRow(rows, 5, '01:30')).toBe(rows[2])
    expect(activeRow(rows, 4, '01:30')).toBeNull()
  })
})

describe('seriesSlots', () => {
  it('Farbe folgt der Ansicht: Standard-Ansicht zuerst, dann nach id, unabhängig von der Zeilenfolge', () => {
    const rows = [{ view_id: 7 }, { view_id: null }, { view_id: 3 }, { view_id: 7 }]
    expect([...seriesSlots(rows, 6)]).toEqual([[null, 0], [3, 1], [7, 2]])
    expect([...seriesSlots([...rows].reverse(), 6)]).toEqual([[null, 0], [3, 1], [7, 2]])
  })

  it('ab der sechsten Ansicht beginnt die Reihe von vorn', () => {
    expect(seriesSlots([1, 2, 3, 4, 5, 6].map((view_id) => ({ view_id })), 6).get(6)).toBe(0)
  })
})
