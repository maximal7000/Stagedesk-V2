import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import SubstitutionsView from './SubstitutionsView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const LONG_NOTE = 'Klausur unter Aufsicht im Raum 062, Materialien bitte vorab im Sekretariat abholen und nach der 9. Stunde dort wieder abgeben'

const row = (over) => ({
  classes: ['5c'], classes_label: '5c', grade: '5', group: '5c', periods: '1.', subject: 'De',
  teacher: 'ROT', teacher_old: 'ÖLZ', room: '179', room_old: '', kind: 'substitution', kind_label: 'Vertretung',
  note: '', ...over,
})

const ALL_COLUMNS = { class: true, subject: true, teacher: true, room: true, note: true }

// Times without offset: local time of the test run, as on the device
function view(data) {
  return {
    id: 3, kind: 'substitutions', layout: 'wide', page_seconds: 15,
    data: {
      source: 'monitor', fallback: false, group_by: 'class', columns: ALL_COLUMNS, news: null,
      updated_at: '2026-10-21T07:42:00', fetched_at: '2026-10-21T07:45:00', embed_url: null, mode: 'live',
      days: [{
        date: '2026-10-21', label: 'Heute', absent: [], affected: { classes: [], teachers: [] }, messages: [],
        rows: [row()],
      }],
      ...data,
    },
  }
}

let root
function render(element) {
  const host = document.createElement('div')
  root = createRoot(host)
  act(() => { root.render(element) })
  return host
}

// Visible table (without the hidden measuring layer)
const visible = (el) => el.querySelector('[data-substitutions-table]')
const headers = (el) => [...el.querySelectorAll('[data-column-head]')].map((h) => h.textContent)

afterEach(() => {
  act(() => root.unmount())
})

describe('SubstitutionsView', () => {
  it('Schüleransicht: Spalten Klasse bis Hinweis', () => {
    const el = render(<SubstitutionsView view={view()} />)
    expect(headers(el)).toEqual(['Klasse', 'Std.', 'Fach', 'Lehrkraft', 'Raum', 'Art', 'Hinweis'])
  })

  it('Lehrkräfte-Ansicht: Kürzel vorn, Klasse nach der Stunde', () => {
    const data = { group_by: 'teacher', days: [{
      date: '2026-10-21', label: 'Heute', absent: [], affected: { classes: [], teachers: [] }, messages: [],
      rows: [row({ group: 'JOR', classes: ['Q1c', 'Q1d', 'Q2a'], classes_label: 'Q1c, d, Q2a', grade: undefined })],
    }] }
    const el = render(<SubstitutionsView view={view(data)} />)
    expect(headers(el)).toEqual(['Kürzel', 'Std.', 'Klasse', 'Fach', 'Lehrkraft', 'Raum', 'Art', 'Hinweis'])
    const cells = [...visible(el).querySelectorAll('[data-substitution-row] > *')].map((c) => c.textContent)
    expect(cells.slice(0, 3)).toEqual(['JOR', '1.', 'Q1c, d, Q2a'])
  })

  it('Hinweis wird nie abgeschnitten', () => {
    const data = { days: [{
      date: '2026-10-21', label: 'Heute', absent: [], affected: { classes: [], teachers: [] }, messages: [],
      rows: [row({ note: LONG_NOTE })],
    }] }
    const el = render(<SubstitutionsView view={view(data)} />)
    const note = visible(el).querySelector('[data-column="note"]')
    expect(note.textContent).toBe(LONG_NOTE)
    expect(note.className).not.toMatch(/truncate|line-clamp|nowrap/)
    expect(note.className).toContain('whitespace-normal')
    const cls = visible(el).querySelector('[data-column="class"]')
    expect(cls.className).not.toMatch(/truncate|nowrap/)
  })

  it('kurze Werte brechen nicht mitten im Wert um', () => {
    const data = { days: [{
      date: '2026-10-21', label: 'Heute', absent: [], affected: { classes: [], teachers: [] }, messages: [],
      rows: [row({ periods: '8.–9.', room: '015', room_old: '113', teacher: 'KLM, HRT', teacher_old: 'BEC' })],
    }] }
    const el = render(<SubstitutionsView view={view(data)} />)
    const cell = (key) => visible(el).querySelector(`[data-column="${key}"]`)
    expect(cell('periods').className).toContain('whitespace-nowrap')
    expect(cell('kind').className).toContain('whitespace-nowrap')
    const pair = cell('room').querySelector('.whitespace-nowrap')
    expect(pair.textContent).toBe('113 015')
    const teacher = [...cell('teacher').querySelectorAll('.whitespace-nowrap')].map((s) => s.textContent)
    expect(teacher).toEqual(['BEC KLM', 'HRT'])
    expect(cell('teacher').textContent).toBe('BEC KLM, HRT')
  })

  it('zeigt Altwerte durchgestrichen und die Art nach kind_label', () => {
    const data = { days: [{
      date: '2026-10-21', label: 'Heute', absent: [], affected: { classes: [], teachers: [] }, messages: [],
      rows: [row({ room: '204', room_old: '209', kind: 'room_change', kind_label: 'Raumänderung' }),
        row({ kind: 'cancelled', kind_label: 'Entfall' })],
    }] }
    const el = render(<SubstitutionsView view={view(data)} />)
    const teacher = visible(el).querySelector('[data-column="teacher"]')
    expect(teacher.querySelector('s').textContent).toBe('ÖLZ')
    expect(teacher.textContent).toBe('ÖLZ ROT')
    const kinds = [...visible(el).querySelectorAll('[data-column="kind"]')]
    expect(kinds.map((k) => k.textContent)).toEqual(['Raumänderung', 'Entfall'])
    expect(kinds[0].className).toContain('text-(--d-info)')
    expect(kinds[1].className).toContain('text-(--d-red)')
  })

  it('Kopf zeigt Abwesend und Betroffen', () => {
    const data = { days: [{
      date: '2026-10-21', label: 'Heute',
      absent: [{ name: 'ZEB', kind: 'teacher', periods: '' }, { name: 'BEC', kind: 'teacher', periods: '3.–4.' },
        { name: '8b', kind: 'class', periods: '5.' }],
      affected: { classes: ['5c', '7a'], teachers: ['ROT', 'FEN'] },
      messages: [{ subject: 'Aula', body: 'Ab der 5. Stunde gesperrt.' }],
      rows: [row()],
    }] }
    const el = render(<SubstitutionsView view={view(data)} />)
    const head = el.querySelector('[data-day-head]')
    expect(head.textContent).toContain('Abwesend')
    expect(head.textContent).toContain('ZEB, BEC (3.–4.), 8b (5.)')
    expect(head.textContent).toContain('Betroffen')
    expect(head.textContent).toContain('5c, 7a, ROT, FEN')
    expect(el.textContent).toContain('Ab der 5. Stunde gesperrt.')
  })

  it('ohne Abwesenheiten kein Kopf', () => {
    const el = render(<SubstitutionsView view={view()} />)
    expect(el.querySelector('[data-day-head]')).toBeNull()
    expect(el.textContent).not.toContain('Abwesend')
  })

  it('blendet Spalten aus, die das Format abschaltet', () => {
    const el = render(<SubstitutionsView view={view({ columns: { ...ALL_COLUMNS, room: false, note: false } })} />)
    expect(headers(el)).toEqual(['Klasse', 'Std.', 'Fach', 'Lehrkraft', 'Art'])
    expect(visible(el).querySelector('[data-column="room"]')).toBeNull()
  })

  it('Fußzeile mit Stand WebUntis und Ersatzquelle', () => {
    const Footer = SubstitutionsView.Footer
    let el = render(<Footer view={view({ fallback: true })} />)
    expect(el.textContent).toContain('Stand WebUntis · 21.10. 07:42')
    expect(el.textContent).toContain('Ersatzquelle')
    act(() => root.unmount())
    el = render(<Footer view={view({ source: 'substitutions', updated_at: null })} />)
    expect(el.textContent).toContain('Stand 07:45')
    expect(el.textContent).not.toContain('WebUntis ·')
    expect(el.textContent).not.toContain('Ersatzquelle')
  })

  it('Einbetten zeigt iframe', () => {
    const url = 'https://webuntis.example.org/WebUntis/monitor?school=katharineum&monitorType=subst'
    const el = render(<SubstitutionsView view={view({ mode: 'embed', source: 'unavailable', days: [], embed_url: url })} />)
    expect(el.querySelector('iframe').getAttribute('src')).toBe(url)
  })

  it('ohne Schlüssel und ohne Einbett-Adresse der bisherige Hinweis', () => {
    const el = render(<SubstitutionsView view={view({ mode: 'embed', source: null, days: [] })} />)
    expect(el.textContent).toContain('Für den Vertretungsplan fehlt der Bildschirm-Schlüssel in der Kiosk-URL.')
  })

  it('in schmalen Flächen ein Tag nach dem anderen', () => {
    vi.useFakeTimers()
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0 })
    try {
      const days = ['2026-10-21', '2026-10-22'].map((date, i) => ({
        date, label: i ? 'Morgen' : 'Heute', absent: [], affected: { classes: [], teachers: [] }, messages: [],
        rows: [row({ subject: i ? 'Ph' : 'De' })],
      }))
      const el = render(<SubstitutionsView view={view({ days })} />)
      expect(el.querySelectorAll('section')).toHaveLength(1)
      expect(el.textContent).toContain('Heute')
      act(() => { vi.advanceTimersByTime(15000) })
      expect(el.textContent).toContain('Morgen')
      expect(el.textContent).not.toContain('Heute')
    } finally {
      rect.mockRestore()
      vi.useRealTimers()
    }
  })
})
