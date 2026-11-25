import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// jsdom has no layout: every row counts as one, two rows make a page
// A fresh card is unmeasured on its first render (like in the browser), measured from the second on
vi.mock('../lib/pager', async (importOriginal) => {
  const real = await importOriginal()
  const { useEffect, useState } = await import('react')
  return {
    ...real,
    useChildHeights: (ref, deps) => {
      const [ready, setReady] = useState(false)
      useEffect(() => { setReady(true) }, [])
      return ready ? deps[0].map(() => 1) : []
    },
    paginateByHeight: (heights) => real.paginate(heights.map((_, i) => i), 2),
    // A pair: 2 rows on the first card of a pair, 3 on the second (it has no head lines, so more room)
    paginatePair: (heights) => {
      const pages = []
      let start = 0
      while (start < heights.length) {
        const size = pages.length % 2 === 0 ? 2 : 3
        pages.push(heights.slice(start, start + size).map((_, i) => start + i))
        start += size
      }
      return pages
    },
  }
})

// Cards have a size in the test (jsdom has no layout)
vi.mock('../lib/fit', async (importOriginal) => ({
  ...(await importOriginal()),
  useBoxSize: () => ({ width: 2400, height: 1000, remPx: 16 }),
}))

const { default: SubstitutionsView } = await import('./SubstitutionsView')
const { expandWanted, staysExpanded } = await import('../lib/expand')
const { default: DisplayRoot } = await import('../DisplayRoot')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const row = (cls) => ({ classes: [cls], classes_label: cls, group: cls, periods: '1.', subject: 'De', teacher: 'ROT',
  teacher_old: '', room: '1', room_old: '', kind: 'substitution', kind_label: 'Vertretung', note: '' })
const rows = (n) => Array.from({ length: n }, (_, i) => row(`${i + 5}a`))
const day = (date, label, count) => ({ date, label, absent: [], affected: { classes: [], teachers: [] }, messages: [], rows: rows(count) })
const data = (days, expand) => ({
  source: 'monitor', fallback: false, group_by: 'class', columns: {}, news: null, updated_at: null, fetched_at: null,
  embed_url: null, mode: 'live', days, expand_pages: expand,
})
const TODAY = '2026-10-19'
const TOMORROW = '2026-10-20'

let root
function render(element) {
  const host = document.createElement('div')
  root = createRoot(host)
  act(() => { root.render(element) })
  return host
}
afterEach(() => {
  if (root) act(() => root.unmount())
  root = undefined
})

const cards = (el) => [...el.querySelectorAll('section')]
const counts = (el) => cards(el).map((c) => (c.textContent.match(/Seite [\d–]+ \/ \d+/) ?? [''])[0])

describe('expandWanted', () => {
  it('erst ab mehr Seiten als eingestellt, nie bei aus', () => {
    expect(expandWanted(5, 3)).toBe(true)
    expect(expandWanted(3, 3)).toBe(false)
    expect(expandWanted(9, 0)).toBe(false)
    expect(expandWanted(9, undefined)).toBe(false)
  })
})

describe('staysExpanded', () => {
  it('eine schmale Seite (unter der Hälfte) rechnet die Seiten der halben Spalte auf ihre Breite hoch, damit nichts hin und her springt', () => {
    // 30 % wide before: 3 pages in a half column were about 5 pages at 30 %
    expect(staysExpanded(3, 3, 0.3)).toBe(true)
    expect(staysExpanded(1, 3, 0.3)).toBe(false)
    // At least half wide before: the half column has at least as many pages, no estimate needed
    expect(staysExpanded(3, 3, 0.6)).toBe(false)
    expect(staysExpanded(4, 3, 0.6)).toBe(true)
    // Observed growth beats the width estimate: 2 pages at the side became 1 in the half column -> factor 2
    expect(staysExpanded(2, 3, 0.45, 2)).toBe(true)
    expect(staysExpanded(2, 3, 0.45)).toBe(false)
  })
})

describe('Vertretungsplan: ganze Breite für heute', () => {
  const view = (expand, todayRows = 10) => ({
    id: 2, kind: 'substitutions', layout: 'wide', page_seconds: 15,
    data: data([day(TODAY, 'Heute', todayRows), day(TOMORROW, 'Morgen', 2)], expand),
  })

  it('heute mit 5 Seiten bei „ab 2 Seiten“: Doppelseite, rechts nur Zeilen, kein Morgen', () => {
    const el = render(<SubstitutionsView view={view(2)} />)
    expect(cards(el)).toHaveLength(2)
    const [first, second] = cards(el)
    expect(first.textContent).toContain('19.10.')
    expect(el.textContent).not.toContain('20.10.')
    // 10 rows: pages of 2 | 3 | 2 | 3 rows, the label of the pair on the left
    expect(counts(el)).toEqual(['Seite 1–2 / 4', ''])
    expect(second.getAttribute('data-day-card')).toBe('continuation')
    expect(second.textContent).not.toContain('19.10.')
    expect(second.querySelector('[data-column-head]')).toBeNull()
    expect(first.querySelectorAll('[data-substitutions-table] [data-substitution-row]')).toHaveLength(2)
    expect(second.querySelectorAll('[data-substitutions-table] [data-substitution-row]')).toHaveLength(3)
  })

  it('aus: heute und morgen wie bisher', () => {
    const el = render(<SubstitutionsView view={view(0)} />)
    expect(el.textContent).toContain('19.10.')
    expect(el.textContent).toContain('20.10.')
  })

  it('nicht mehr Seiten als eingestellt: heute und morgen wie bisher', () => {
    const el = render(<SubstitutionsView view={view(3, 6)} />)
    expect(el.textContent).toContain('20.10.')
  })

  it('ungerade Seitenzahl: das zweite Feld der letzten Doppelseite bleibt leer', () => {
    vi.useFakeTimers()
    try {
      const el = render(<SubstitutionsView view={view(2, 6)} />)  // pages of 2 | 3 | 1 rows: (1, 2), (3, -)
      expect(counts(el)).toEqual(['Seite 1–2 / 3', ''])
      act(() => { vi.advanceTimersByTime(15000) })
      expect(counts(el)).toEqual(['Seite 3 / 3', ''])
      expect(cards(el)[1].querySelectorAll('[data-substitutions-table] [data-substitution-row]')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Neue Daten während der Doppelseite', () => {
  it('weniger Zeilen, während eine hintere Doppelseite steht: kein Absturz, gültige Seiten', () => {
    vi.useFakeTimers()
    try {
      const view = (n) => ({ id: 2, kind: 'substitutions', layout: 'wide', page_seconds: 15,
        data: data([day(TODAY, 'Heute', n), day(TOMORROW, 'Morgen', 2)], 2) })
      const el = render(<SubstitutionsView view={view(12)} />)
      act(() => { vi.advanceTimersByTime(15000) })
      expect(counts(el)).toEqual(['Seite 3–4 / 5', ''])
      act(() => { root.render(<SubstitutionsView view={view(6)} />) })
      expect(el.querySelectorAll('[data-substitutions-table] [data-substitution-row]').length).toBeGreaterThan(0)
      expect(cards(el)[0].textContent).toContain('19.10.')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Geteilt: Vertretungsplan überlagert Medien', () => {
  const screen = { slug: 'mensa', name: 'Mensa', orientation: 'landscape', scale: 'auto', power: true }
  const split = (other, todayRows) => ({
    id: 5, kind: 'split', layout: 'wide', page_seconds: 15, show_weather: false, weather: null, qr: null,
    data: {
      left: { kind: 'substitutions', data: data([day(TODAY, 'Heute', todayRows)], 2) },
      right: other,
      left_percent: 60,
    },
  })
  const media = { kind: 'media', data: { seconds: 10, per_screen: 1, pages: [] } }
  const departures = { kind: 'departures', data: { stations: [], disruptions: [], columns: 2, time_format: 'minutes',
    show_disruptions: false, strip_city: true, status: { fetched_at: null, sources: {} } } }
  const show = (v) => <DisplayRoot payload={{ screen, view: v, mode: null }} state="ok" lastOkAt={0} />

  it('viele Seiten: die Medien weichen, heute steht halb-halb in zwei Spalten; wenige Seiten: Medien zurück', () => {
    const el = render(show(split(media, 10)))
    expect(el.textContent).not.toContain('Keine Medien.')
    expect(counts(el)).toEqual(['Seite 1–2 / 4', ''])
    // Overlay: no split halves (their width does not count), today as a pair of equal cards
    expect(el.querySelector('[data-split-overlay="left"] [data-days="pair"]')).not.toBeNull()
    expect(el.querySelectorAll('[data-split-side]')).toHaveLength(0)
    act(() => { root.render(show(split(media, 4))) })
    expect(el.textContent).toContain('Keine Medien.')
  })

  it('fällt die Quelle auf die eingebettete Seite zurück, kommen die Medien zurück', () => {
    const el = render(show(split(media, 10)))
    expect(el.textContent).not.toContain('Keine Medien.')
    const fallback = split(media, 0)
    fallback.data.left.data = { ...fallback.data.left.data, mode: 'embed', embed_url: 'https://untis.example/', days: [] }
    act(() => { root.render(show(fallback)) })
    expect(el.textContent).toContain('Keine Medien.')
  })

  it('schmale Vertretungsplan-Seite (30 %): bleibt in der Doppelseite, solange es viele Seiten sind, und kehrt erst bei wenigen zurück', () => {
    const narrow = (n) => ({ ...split(media, n), data: { ...split(media, n).data, left_percent: 30 } })
    const el = render(show(narrow(6)))  // 3 pages > 2
    expect(el.querySelector('[data-split-overlay]')).not.toBeNull()
    act(() => { root.render(show(narrow(6))) })
    expect(el.querySelector('[data-split-overlay]')).not.toBeNull()
    act(() => { root.render(show(narrow(2))) })  // 1 page
    expect(el.querySelector('[data-split-overlay]')).toBeNull()
    expect(el.textContent).toContain('Keine Medien.')
  })

  it('die Fußzeile steht unter der linken Karte der Doppelseite (halbe Breite), nicht nach der Breite der geteilten Ansicht', () => {
    const v = split(media, 10)
    v.data.left.data = { ...v.data.left.data, source: 'monitor', updated_at: '2026-10-19T07:42:00', fetched_at: '2026-10-19T07:45:00' }
    const el = render(show(v))
    const grid = el.querySelector('.d-footer-row [style*="grid-template-columns"]')
    expect(grid.style.gridTemplateColumns).toBe('calc(50cqw - 0.625rem) minmax(0, 1fr)')
    expect(grid.firstElementChild.textContent).toContain('WebUntis')
  })

  it('Abfahrten als andere Seite bleiben immer stehen', () => {
    const el = render(show(split(departures, 10)))
    expect(cards(el)).toHaveLength(1)
    expect(el.querySelector('[data-split-side="right"]')).not.toBeNull()
  })
})
