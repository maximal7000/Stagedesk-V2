import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import DeparturesView from './DeparturesView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const bus = (departure, line, direction, extra) => ({
  line, direction, departure, departure_actual: departure, delay: 0, platform: '', kind: 'bus', kind_icon: 'bus',
  cancelled: false, realtime: true, remarks: [], ...extra,
})
const train = (departure, line, direction, platform, extra) => ({
  line, direction, departure, departure_actual: departure, delay: 0, platform, kind: 'regionalExpress', kind_icon: 're',
  cancelled: false, realtime: true, remarks: [], ...extra,
})
const station = (index, name, departures, extra) => ({
  station_name: name, station_id: String(8000000 + index), index, column: null, split_modes: true,
  walk_minutes: 3, departures, max_departures: 10, ...extra,
})

function view(data, extra) {
  return {
    id: 2, kind: 'departures', layout: 'wide', page_seconds: 15, show_weather: false, weather: null,
    data: {
      stations: [], disruptions: [], columns: 4, time_format: 'minutes', show_disruptions: true, strip_city: true,
      status: { fetched_at: '2026-10-22T22:11:00', sources: { db: 'ok', nahsh: 'ok' } },
      ...data,
    },
    ...extra,
  }
}

let root
function render(element) {
  const host = document.createElement('div')
  root = createRoot(host)
  act(() => { root.render(element) })
  return host
}

const rows = (el) => [...el.querySelectorAll('[data-departure-row]')]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 9, 22, 22, 11, 18))
})

afterEach(() => {
  act(() => root.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('DeparturesView', () => {
  it('feste Spalten: Haltestellen landen in ihrer Spalte, Ortsname gekürzt', () => {
    const stations = [
      station(0, 'Lübeck Wahmstraße', [], { column: 1 }),
      station(1, 'Lübeck Sandstraße', [], { column: 1 }),
      station(2, 'Lübeck Hbf', [], { column: 4 }),
    ]
    const el = render(<DeparturesView view={view({ stations })} />)
    const columns = [...el.querySelectorAll('[data-station-column]')]
    expect(columns).toHaveLength(4)
    const names = columns.map((c) => [...c.querySelectorAll('h2')].map((h) => h.textContent))
    expect(names).toEqual([['Wahmstraße', 'Sandstraße'], [], [], ['Lübeck Hbf']])
    expect(columns[0].style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))')
    expect(el.textContent).toContain('Keine Abfahrten')
  })

  it('Ortsnamen bleiben ohne strip_city', () => {
    const stations = [station(0, 'Lübeck Wahmstraße', []), station(1, 'Lübeck Sandstraße', [])]
    const el = render(<DeparturesView view={view({ stations, strip_city: false })} />)
    expect([...el.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Lübeck Wahmstraße', 'Lübeck Sandstraße'])
  })

  it('getrennt: Busse oben, Züge unten; ohne Trennung gemischt nach Zeit', () => {
    const deps = [train('22:14', 'RE8', 'Hamburg Hbf', '5'), bus('22:15', '11', 'Schlutup'), train('22:20', 'RB84', 'Kiel Hbf', '4')]
    let el = render(<DeparturesView view={view({ stations: [station(0, 'Lübeck Hbf', deps)] })} />)
    const sections = [...el.querySelectorAll('[data-section]')]
    expect(sections.map((s) => s.dataset.section)).toEqual(['bus', 'train'])
    expect(sections.map((s) => s.querySelector('[data-section-label]').textContent)).toEqual(['Busse', 'Züge'])
    expect(sections[1].querySelectorAll('[data-departure-row]')).toHaveLength(2)
    act(() => root.unmount())

    el = render(<DeparturesView view={view({ stations: [station(0, 'Lübeck Hbf', deps, { split_modes: false })] })} />)
    expect(el.querySelector('[data-section-label]')).toBeNull()
    expect(rows(el).map((r) => r.querySelector('[data-chip]').textContent)).toEqual(['RE 8', '11', 'RB 84'])
  })

  it('eine Zeitangabe vorn mit Verspätung, keine Minutenspalte rechts', () => {
    const deps = [bus('22:14', '5', 'Eichholz', { departure_actual: '22:20', delay: 6 }), bus('22:40', '8710', 'Mölln')]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Katharineum', deps)], time_format: 'mixed' })} />)
    const [first, second] = rows(el)
    expect(first.children).toHaveLength(3)
    expect(first.firstChild.textContent).toBe('3 min+6')
    expect(first.querySelector('[data-delay]').className).toContain('text-(--d-warn)')
    expect(second.firstChild.textContent).toBe('22:40')
    expect(second.lastChild.textContent).toBe('Mölln')
    expect(second.querySelector('[data-chip]').style.background).toBe('rgb(149, 39, 110)')
  })

  it('Ausfall: Zeit durchgestrichen, „fällt aus“ in Rot', () => {
    const deps = [bus('22:14', '30', 'Travemünde', { cancelled: true, delay: 3 })]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Katharineum', deps)] })} />)
    const [row] = rows(el)
    expect(row.firstChild.textContent).toBe('3 min')
    expect(row.firstChild.className).toContain('line-through')
    const label = row.querySelector('[data-cancelled]')
    expect(label.textContent).toBe('fällt aus')
    expect(label.className).toContain('text-(--d-red)')
  })

  it('Gleis bei Zügen, Gleiswechsel mit altem Gleis durchgestrichen', () => {
    const deps = [
      train('22:23', 'RE8', 'Hamburg Hbf', '6', { platform_planned: '5' }),
      train('22:30', 'RB84', 'Kiel Hbf', '4'),
    ]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Lübeck Hbf', deps)] })} />)
    const [changed, plain] = rows(el).map((r) => r.querySelector('[data-platform]'))
    const old = changed.querySelector('s')
    expect(old.textContent).toBe('Gl. 5')
    expect(old.className).toContain('text-(--d-muted)')
    expect(old.className).not.toContain('text-[0.8em]')
    expect(changed.querySelector('[data-platform-new]').className).toContain('text-(--d-warn)')
    expect(changed.textContent).toBe('Gl. 5 Gl. 6')
    expect(plain.textContent).toBe('Gl. 4')
    expect(plain.querySelector('s')).toBeNull()
    expect(plain.querySelector('[data-platform-prefix]').className).toContain('@max-[16rem]:hidden')
  })

  it('Ziel behält Mindestbreite: Gleis steht pro Zeile im Zielfeld, nicht in einer gemeinsamen Spalte', () => {
    const deps = [
      train('22:23', 'SEV RE83', 'Lübeck-Travemünde Strand', ''),
      train('22:30', 'RE8', 'Hamburg Hbf', '6', { platform_planned: '5' }),
    ]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Lübeck Hbf', deps)] })} />)
    const list = el.querySelector('[data-departure-list]')
    const tracks = list.style.gridTemplateColumns
    expect(tracks).toContain('minmax(6em, 1fr)')
    expect(tracks.trim().endsWith('minmax(6em, 1fr)')).toBe(true)
    const [, changed] = rows(el)
    expect(changed.children).toHaveLength(3)
    expect(changed.querySelector('[data-destination] [data-platform]')).not.toBeNull()
  })

  it('abgefahrene Fahrten (mehr als 1 min vorbei) verschwinden bis zum nächsten Abruf', () => {
    const deps = [
      bus('22:08', '5', 'Eichholz'),
      bus('22:10', '11', 'Schlutup'),
      train('22:03', 'RE8', 'Travemünde', '7', { departure_actual: '22:12', delay: 9 }),
    ]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Lübeck Hbf', deps, { split_modes: false })] })} />)
    expect(rows(el).map((r) => r.querySelector('[data-chip]').textContent)).toEqual(['11', 'RE 8'])
  })

  it('alle Fahrten abgefahren: „Keine Abfahrten“ statt einer leeren Karte', () => {
    const deps = [bus('22:05', '5', 'Eichholz'), train('22:08', 'RE8', 'Hamburg Hbf', '5')]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Lübeck Hbf', deps)] })} />)
    expect(rows(el)).toHaveLength(0)
    expect(el.querySelector('section').textContent).toContain('Keine Abfahrten')
  })

  it('zu niedrige Liste zeigt trotzdem eine Zeile', () => {
    const real = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      return this.hasAttribute('data-departure-list') ? { width: 300, height: 10 } : real.call(this)
    })
    const deps = [bus('22:14', '5', 'Eichholz'), bus('22:20', '11', 'Schlutup')]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Katharineum', deps)] })} />)
    expect(rows(el)).toHaveLength(1)
  })

  it('Störungsspalte blättert im Takt der Ansicht', () => {
    const real = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (this.parentElement?.hasAttribute('data-disruptions')) return { width: 400, height: 250 }
      if (this.tagName === 'ARTICLE') return { width: 400, height: 120 }
      return real.call(this)
    })
    const disruptions = ['A', 'B', 'C'].map((t) => ({ id: t, kind: 'disruption', title: `Meldung ${t}`, text: '', lines: ['5'] }))
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Katharineum', [])], disruptions })} />)
    const column = el.querySelector('[data-disruptions]')
    const shown = () => [...column.querySelectorAll('article')].filter((a) => !a.closest('[aria-hidden]'))
      .map((a) => a.textContent.replace('Störung · Linie 5', ''))
    expect(column.textContent).toContain('1 / 2')
    expect(shown()).toEqual(['Meldung A', 'Meldung B'])
    act(() => { vi.advanceTimersByTime(15000) })
    expect(column.textContent).toContain('2 / 2')
    expect(shown()).toEqual(['Meldung C'])
  })

  it('Haltestellen ohne index bekommen trotzdem eindeutige Schlüssel', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stations = [
      { ...station(0, 'Katharineum', []), index: undefined, column: 1 },
      { ...station(0, 'Katharineum', []), index: undefined, column: 1 },
    ]
    const el = render(<DeparturesView view={view({ stations })} />)
    expect(el.querySelectorAll('h2')).toHaveLength(2)
    expect(spy.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
    spy.mockRestore()
  })

  it('lange Linien bekommen kleinere Schrift', () => {
    const deps = [train('22:15', 'SEV RE83', 'Büchen', ''), train('22:16', 'RE8', 'Hamburg', '5')]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Lübeck Hbf', deps)] })} />)
    const [long, short] = rows(el).map((r) => r.querySelector('[data-chip]'))
    expect(long.textContent).toBe('SEV RE83')
    expect(long.className).toContain('text-[0.8em]')
    expect(short.className).not.toContain('text-[0.8em]')
  })

  it('Störungsspalte nur mit show_disruptions', () => {
    const disruptions = [{ id: 'a', kind: 'disruption', title: 'Umleitung', text: 'Ersatzhalt Possehlstraße.', lines: ['5'], image: '/media/x.png' }]
    let el = render(<DeparturesView view={view({ stations: [station(0, 'Katharineum', [])], disruptions })} />)
    const column = el.querySelector('[data-disruptions]')
    expect(column).not.toBeNull()
    expect(column.textContent).toContain('Störung · Linie 5')
    expect(column.textContent).toContain('Umleitung')
    expect(column.querySelector('img').getAttribute('src')).toBe('/media/x.png')
    act(() => root.unmount())

    el = render(<DeparturesView view={view({ stations: [station(0, 'Katharineum', [])], disruptions, show_disruptions: false })} />)
    expect(el.querySelector('[data-disruptions]')).toBeNull()
  })

  it('Störungen in einer Abfahrten-Spalte: unter den Haltestellen, keine eigene Spalte', () => {
    const disruptions = [{ id: 'a', kind: 'disruption', title: 'Umleitung', text: '', lines: ['5'] }]
    const stations = [station(0, 'Wahmstraße', [], { column: 1 }), station(1, 'Hbf', [], { column: 2 })]
    const el = render(<DeparturesView view={view({ stations, disruptions, columns: 2, disruption_column: 2 })} />)
    const columns = [...el.querySelectorAll('[data-station-column]')]
    expect(columns[1].querySelector('[data-disruptions]')).not.toBeNull()
    expect(columns[1].style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))')
    expect(columns[1].textContent).toContain('Störungen')
    expect(el.querySelectorAll('[data-disruptions]')).toHaveLength(1)
    expect(el.firstChild.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
  })

  it('Störungs-Spalte über der Spaltenzahl landet in der letzten Spalte', () => {
    const stations = [station(0, 'Wahmstraße', [], { column: 1 })]
    const el = render(<DeparturesView view={view({ stations, columns: 2, disruption_column: 5 })} />)
    const columns = [...el.querySelectorAll('[data-station-column]')]
    expect(columns[1].querySelector('[data-disruptions]')).not.toBeNull()
  })

  it('Störungsbild volle Breite, Text ungekürzt', () => {
    const real = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (this.parentElement?.hasAttribute('data-disruptions')) return { width: 400, height: 500 }
      return real.call(this)
    })
    const text = 'Wegen Bauarbeiten fahren die Busse der Linie 5 ab Possehlstraße eine Umleitung. '.repeat(6)
    const disruptions = [{ id: 'a', kind: 'disruption', title: 'Umleitung', text, lines: ['5'], image: '/media/x.png' }]
    const el = render(<DeparturesView view={view({ stations: [station(0, 'Katharineum', [])], disruptions })} />)
    const article = [...el.querySelectorAll('[data-disruptions] article')].find((a) => !a.closest('[aria-hidden]'))
    expect(article.querySelector('p').className).not.toContain('line-clamp')
    const img = article.querySelector('[data-disruption-image]')
    expect(img.className).toContain('w-full')
    expect(img.className).toContain('h-auto')
    expect(img.style.maxHeight).toBe('200px')
  })

  it('Footer: Datum, Wetter und Stand, ohne Hinweis auf ausgefallene Quellen', () => {
    const weather = { temperature: 12.4, description: 'Regen' }
    const status = { fetched_at: '2026-10-22T22:11:00', sources: { db: 'error', nahsh: 'ok' } }
    const el = render(<DeparturesView.Footer view={view({ status }, { show_weather: true, weather })} />)
    const items = [...el.querySelectorAll('[data-footer-part]')].map((p) => p.textContent)
    expect(items).toEqual(['Donnerstag, 22. Oktober', '12 °C Regen', 'Stand 22:11'])
  })

  it('Footer ohne Wetterdaten und ohne Ausfall', () => {
    const status = { fetched_at: '2026-10-22T22:11:00', sources: { db: 'off', nahsh: 'ok' } }
    const el = render(<DeparturesView.Footer view={view({ status }, { show_weather: true, weather: null })} />)
    const items = [...el.querySelectorAll('[data-footer-part]')].map((p) => p.textContent)
    expect(items).toEqual(['Donnerstag, 22. Oktober', 'Stand 22:11'])
  })
})
