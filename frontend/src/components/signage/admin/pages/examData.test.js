import { describe, it, expect } from 'vitest'
import {
  announcementPayload, announcementProblems, eventDraft, eventPayload, eventProblems, examDraft, examFromTemplate,
  examPayload, examProblems, fromLocalInput, groupItems, scheduleItems, templateFromExam,
} from './examData'

const now = new Date(2026, 9, 20, 10, 0)
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString()

const screens = [{ id: 1, name: 'Glocke' }, { id: 3, name: 'Aula' }]
const views = [{ id: 7, name: 'Info Mensa' }]

describe('scheduleItems', () => {
  it('Klausuren und Termine gemischt, mit Art und betroffenen Bildschirmen', () => {
    const items = scheduleItems(
      [{ id: 1, title: 'Abitur Mathematik', active_from: at(20, 8), active_until: at(20, 12, 30), screen_ids: [3, 99] }],
      [{ id: 2, name: 'Elternabend', active_from: at(21, 18), active_until: at(21, 21), is_active: false,
        assignments: [{ screen_id: 1, view_id: 7, screen_name: 'Glocke', view_name: 'Info Mensa' }] }],
      screens,
    )
    expect(items.map((i) => [i.key, i.type, i.title])).toEqual([
      ['exam-1', 'exam', 'Abitur Mathematik'],
      ['event-2', 'event', 'Elternabend'],
    ])
    expect(items[0].screens).toEqual(['Aula'])
    expect(items[1].screens).toEqual(['Glocke → Info Mensa'])
  })
})

describe('groupItems', () => {
  const item = (key, from, until, extra = {}) => ({ key, from: from ? new Date(from) : null, until: until ? new Date(until) : null, ...extra })

  it('läuft gerade, kommt (aufsteigend) und vergangen (neueste zuerst)', () => {
    const groups = groupItems([
      item('later', at(22, 8), at(22, 9)),
      item('now', at(20, 8), at(20, 12)),
      item('soon', at(20, 11), at(20, 12)),
      item('old', at(19, 8), at(19, 9)),
      item('older', at(18, 8), at(18, 9)),
      item('ended-now', at(20, 9), at(20, 10)),
    ], now)
    expect(groups.running.map((i) => i.key)).toEqual(['now'])
    expect(groups.upcoming.map((i) => i.key)).toEqual(['soon', 'later'])
    expect(groups.past.map((i) => i.key)).toEqual(['ended-now', 'old', 'older'])
  })

  it('manuell aktive Termine laufen, Termine ohne Zeitraum kommen am Ende', () => {
    const groups = groupItems([
      item('manual', null, null, { active: true }),
      item('open', null, null, { active: false }),
      item('next', at(21, 8), at(21, 9)),
      item('manual-old', at(1, 8), at(1, 9), { active: true }),
    ], now)
    expect(groups.running.map((i) => i.key)).toEqual(['manual-old', 'manual'])
    expect(groups.upcoming.map((i) => i.key)).toEqual(['next', 'open'])
    expect(groups.past).toEqual([])
  })

  it('vergangen zeigt nur die letzten 10', () => {
    const many = Array.from({ length: 14 }, (_, i) => item(`p${i}`, at(1 + i, 8), at(1 + i, 9)))
    const { past } = groupItems(many, now)
    expect(past).toHaveLength(10)
    expect(past[0].key).toBe('p13')
    expect(past[9].key).toBe('p4')
  })
})

describe('Klausur-Formular', () => {
  it('neue Klausur: Vollbild, Seite rechts, 90 Minuten ab der nächsten vollen Viertelstunde', () => {
    const d = examDraft(null, new Date(2026, 9, 20, 10, 7))
    expect(d).toMatchObject({ title: '', display_mode: 'fullscreen', split_side: 'right', screen_ids: [] })
    expect(d.active_from).toBe('2026-10-20T10:15')
    expect(d.active_until).toBe('2026-10-20T11:45')
  })

  it('Vorlage: Werte übernehmen, Zeitraum ab jetzt mit der Dauer der Vorlage', () => {
    const d = examFromTemplate({ title: 'Abitur', text: 'Ruhe', display_mode: 'split', split_side: 'left', duration_minutes: 240 }, now)
    expect(d).toMatchObject({ title: 'Abitur', text: 'Ruhe', display_mode: 'split', split_side: 'left' })
    expect(d.active_from).toBe('2026-10-20T10:00')
    expect(d.active_until).toBe('2026-10-20T14:00')
  })

  it('Payload mit ISO-Zeiten, getrimmtem Titel und Bildschirmen', () => {
    const p = examPayload({ title: ' Abitur ', text: '', active_from: '2026-10-20T08:00', active_until: '2026-10-20T12:30',
      screen_ids: [3], display_mode: 'split', split_side: 'right' })
    expect(p).toEqual({ title: 'Abitur', text: '', active_from: at(20, 8), active_until: at(20, 12, 30),
      screen_ids: [3], display_mode: 'split', split_side: 'right' })
  })

  it('Probleme: Titel, Zeiten, Reihenfolge, Bildschirme', () => {
    const ok = { title: 'A', active_from: '2026-10-20T08:00', active_until: '2026-10-20T09:00', screen_ids: [1] }
    expect(examProblems(ok)).toBeNull()
    expect(examProblems({ ...ok, title: ' ' })).toMatch(/Titel fehlt/)
    expect(examProblems({ ...ok, active_until: '' })).toMatch(/Beginn oder Ende fehlt/)
    expect(examProblems({ ...ok, active_until: '2026-10-20T08:00' })).toMatch(/nach dem Beginn/)
    expect(examProblems({ ...ok, screen_ids: [] })).toMatch(/Bildschirm/)
  })

  it('Als Vorlage: Name aus dem Titel, Dauer aus dem Zeitraum', () => {
    const t = templateFromExam({ title: 'Abitur', text: 'x', active_from: '2026-10-20T08:00', active_until: '2026-10-20T12:30',
      display_mode: 'split', split_side: 'right' })
    expect(t).toEqual({ name: 'Abitur', title: 'Abitur', text: 'x', duration_minutes: 270, display_mode: 'split', split_side: 'right' })
  })
})

describe('Termin-Formular', () => {
  it('Entwurf aus Termin und Payload mit vollständigen Zuordnungen', () => {
    const d = eventDraft({ name: 'Konzert', description: '', active_from: at(22, 18), active_until: at(22, 21),
      assignments: [{ screen_id: 1, view_id: 7, screen_name: 'Glocke', view_name: 'Info Mensa' }] }, now)
    expect(d).toEqual({ name: 'Konzert', description: '', active_from: '2026-10-22T18:00', active_until: '2026-10-22T21:00',
      assignments: [{ screen_id: 1, view_id: 7 }] })
    const p = eventPayload({ ...d, assignments: [...d.assignments, { screen_id: 3, view_id: null }] })
    expect(p.assignments).toEqual([{ screen_id: 1, view_id: 7 }])
    expect(p.active_from).toBe(at(22, 18))
    expect(views).toHaveLength(1)
  })

  it('Probleme: Name, Zeiten, unvollständige Zuordnung', () => {
    const ok = { name: 'K', active_from: '2026-10-22T18:00', active_until: '2026-10-22T21:00', assignments: [{ screen_id: 1, view_id: 7 }] }
    expect(eventProblems(ok)).toBeNull()
    expect(eventProblems({ ...ok, name: '' })).toMatch(/Name fehlt/)
    expect(eventProblems({ ...ok, active_from: '2026-10-22T22:00' })).toMatch(/nach dem Beginn/)
    expect(eventProblems({ ...ok, assignments: [{ screen_id: 1, view_id: null }] })).toMatch(/Zuordnung/)
    expect(eventProblems({ ...ok, assignments: [] })).toMatch(/Zuordnung/)
  })
})

describe('Ankündigung', () => {
  it('Zeitraum optional, Titel Pflicht', () => {
    expect(announcementProblems({ title: '' })).toMatch(/Titel fehlt/)
    expect(announcementProblems({ title: 'A', active_from: '2026-10-22T18:00', active_until: '2026-10-22T08:00' })).toMatch(/nach dem Beginn/)
    expect(announcementProblems({ title: 'A', active_from: '2026-10-22T18:00', active_until: '' })).toBeNull()
    expect(announcementPayload({ title: ' A ', text: 't', priority: 'important', is_active: true, active_from: '', active_until: '' }))
      .toEqual({ title: 'A', text: 't', priority: 'important', is_active: true, active_from: null, active_until: null })
  })
})

describe('fromLocalInput', () => {
  it('Ortszeit zu ISO, leer und ungültig zu null', () => {
    expect(fromLocalInput('2026-10-20T08:00')).toBe(at(20, 8))
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('kaputt')).toBeNull()
  })
})

describe('Termine ohne Zeitraum (nur manuell)', () => {
  it('Zeitraum zählt nur mit Beginn und Ende, wie DisplayEvent.is_active_now', () => {
    const [onlyFrom, none] = scheduleItems([], [
      { id: 5, name: 'Nur Beginn', active_from: at(20, 8), active_until: null, is_active: false, assignments: [] },
      { id: 6, name: 'Manuell', active_from: null, active_until: null, is_active: true, assignments: [] },
    ], screens)
    expect([onlyFrom.from, onlyFrom.until]).toEqual([null, null])
    expect(none.active).toBe(true)
    const groups = groupItems([onlyFrom, none], now)
    expect(groups.running.map((i) => i.key)).toEqual(['event-6'])
    expect(groups.upcoming.map((i) => i.key)).toEqual(['event-5'])
  })

  it('Formular: beide Zeiten leer ist erlaubt, nur eine nicht', () => {
    const ok = { name: 'K', active_from: '', active_until: '', assignments: [{ screen_id: 1, view_id: 7 }] }
    expect(eventProblems(ok)).toBeNull()
    expect(eventProblems({ ...ok, active_from: '2026-10-22T18:00' })).toBe('Nur Beginn oder nur Ende angegeben.')
    expect(eventPayload(ok)).toMatchObject({ active_from: null, active_until: null })
  })
})
