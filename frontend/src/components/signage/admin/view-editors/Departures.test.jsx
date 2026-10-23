import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../shared/api', () => ({ getDisruptions: vi.fn(() => Promise.resolve([])) }))
vi.mock('../shared/StopSearch', () => ({ default: () => null }))
vi.mock('../shared/StopFilterDialog', () => ({ default: () => null }))

const api = await import('../shared/api')
const { default: DeparturesEditor } = await import('./Departures')

let container
let root
const stop = (id, name, extra = {}) => ({
  id, name, walk_minutes: 0, max_departures: 10, filter_lines: [], filter_direction: '', filter_via: '',
  show_bus: true, show_rail: true, show_long_distance: true, ...extra,
})
const BASE = {
  transit_stops: [stop('1', 'Wahmstraße', { column: 1 }), stop('2', 'Sandstraße', { column: 1 }), stop('3', 'Hauptbahnhof', { column: 3 })],
  transit_columns: 4, transit_time_format: 'minutes', transit_show_disruptions: true, transit_strip_city: true,
  transit_duration: 60, transit_disruption_hidden: [], transit_disruption_manual: [],
}

async function mount(overrides = {}, viewId = null) {
  const calls = []
  const draft = { ...BASE, ...overrides }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(createElement(DeparturesEditor, { draft, set: (k, v) => calls.push([k, v]), viewId })) })
  return calls
}
const text = () => container.textContent
const radio = (group, label) => [...container.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)].find((b) => b.textContent.trim() === label)
const checkbox = (label) => [...container.querySelectorAll('label')].find((l) => l.textContent.trim() === label)?.querySelector('input')
const click = (el) => act(async () => { el.click() })

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

describe('DeparturesEditor Spalten', () => {
  it('schreibt die Spaltenzahl', async () => {
    const calls = await mount()
    await click(radio('Spalten', '2'))
    expect(calls).toEqual([['transit_columns', 2]])
    expect(container.querySelectorAll('[role="radiogroup"][aria-label="Spalten"] [role="radio"]').length).toBe(5)
  })

  it('schreibt die Spalte einer Haltestelle', async () => {
    const calls = await mount()
    const select = container.querySelector('select[aria-label="Spalte Sandstraße"]')
    expect([...select.options].map((o) => o.value)).toEqual(['1', '2', '3', '4'])
    expect(select.value).toBe('1')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '2')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(calls[0][0]).toBe('transit_stops')
    expect(calls[0][1].map((s) => s.column)).toEqual([1, 2, 3])
  })

  it('schreibt split_modes je Haltestelle', async () => {
    const calls = await mount()
    const boxes = [...container.querySelectorAll('input[type="checkbox"][aria-label^="Busse und Züge getrennt"]')]
    expect(boxes.length).toBe(3)
    expect(boxes.every((b) => b.checked)).toBe(true)
    await click(boxes[1])
    expect(calls[0][0]).toBe('transit_stops')
    expect(calls[0][1].map((s) => s.split_modes)).toEqual([undefined, false, undefined])
  })

  it('zeigt Haltestellen ohne Spalte nach der Reihenfolge verteilt', async () => {
    await mount({ transit_stops: [stop('1', 'A'), stop('2', 'B'), stop('3', 'C')], transit_columns: 2 })
    expect(container.querySelector('[data-column-overview]').textContent).toBe('Spalte 1: A, C · Spalte 2: B · Störungen: eigene Spalte rechts')
  })

  it('gruppiert die Übersicht und schiebt zu große Spalten unter die letzte', async () => {
    await mount()
    expect(container.querySelector('[data-column-overview]').textContent)
      .toBe('Spalte 1: Wahmstraße, Sandstraße · Spalte 2: leer · Spalte 3: Hauptbahnhof · Spalte 4: leer · Störungen: eigene Spalte rechts')
    act(() => root.unmount())
    container.remove()
    await mount({ transit_columns: 2, transit_show_disruptions: false })
    expect(container.querySelector('[data-column-overview]').textContent)
      .toBe('Spalte 1: Wahmstraße, Sandstraße · Spalte 2: Hauptbahnhof')
  })
})

describe('DeparturesEditor Störungen', () => {
  const select = () => container.querySelector('select[aria-label="Störungen in Spalte"]')
  const choose = (el, value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })

  it('wählt die Spalte der Störungen und zeigt sie in der Übersicht', async () => {
    const calls = await mount({ transit_disruption_column: 3 })
    expect([...select().options].map((o) => o.textContent))
      .toEqual(['Eigene Spalte rechts', 'Spalte 1', 'Spalte 2', 'Spalte 3', 'Spalte 4'])
    expect(select().value).toBe('3')
    expect(container.querySelector('[data-column-overview]').textContent).toContain('Spalte 3: Hauptbahnhof, Störungen')
    await choose(select(), '0')
    await choose(select(), '1')
    expect(calls).toEqual([['transit_disruption_column', null], ['transit_disruption_column', 1]])
  })

  it('Störungs-Spalte über der Spaltenzahl zeigt die letzte', async () => {
    await mount({ transit_disruption_column: 5, transit_columns: 2 })
    expect(select().value).toBe('2')
  })

  const MESSAGES = [
    { id: 'm1', kind: 'disruption', title: 'RE8 fällt aus', text: 'Zwischen Lübeck und Bad Oldesloe fallen alle Züge aus.', lines: ['RE8'], image: '' },
    { id: 'm2', kind: 'construction', title: 'Linie 5 Umleitung', text: '', lines: ['5'], image: '/media/karte.png' },
    { id: 'm3', kind: 'disruption', title: 'RB85 verspätet', text: '', lines: ['RB85'], image: '' },
  ]
  const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label)
  const titles = () => [...container.querySelectorAll('[data-disruption-list] li')].map((li) => li.querySelector('.text-sm').textContent)

  it('aktuelle Meldungen: zugeklappt mit Zusammenfassung, aufklappbar mit Text und Bild', async () => {
    api.getDisruptions.mockResolvedValueOnce(MESSAGES)
    await mount({ transit_disruption_hidden: ['m3'] }, 7)
    expect(container.querySelector('[data-disruption-summary]').textContent).toBe('3 aktuelle Meldungen, 1 ausgeblendet')
    expect(container.querySelector('[data-disruption-list]')).toBeNull()
    await click(button('Meldungen anzeigen'))
    expect(titles()).toEqual(['RE8 fällt aus', 'Linie 5 Umleitung', 'RB85 verspätet'])
    expect(container.querySelector('[data-disruption-detail]')).toBeNull()
    await click(container.querySelector('[data-disruption-list] li button[aria-expanded]'))
    expect(container.querySelector('[data-disruption-detail]').textContent).toContain('fallen alle Züge aus')
    await click(container.querySelectorAll('[data-disruption-list] li button[aria-expanded]')[1])
    const detail = container.querySelector('[data-disruption-detail]')
    expect(detail.querySelector('img').getAttribute('src')).toBe('/media/karte.png')
    expect(container.querySelectorAll('[data-disruption-detail]')).toHaveLength(1)
  })

  it('aktuelle Meldungen: Suche und Filter', async () => {
    api.getDisruptions.mockResolvedValueOnce(MESSAGES)
    const calls = await mount({ transit_disruption_hidden: ['m3'] }, 7)
    await click(button('Meldungen anzeigen'))
    await click(radio('Meldungen filtern', 'Baumaßnahmen'))
    expect(titles()).toEqual(['Linie 5 Umleitung'])
    await click(radio('Meldungen filtern', 'Ausgeblendet'))
    expect(titles()).toEqual(['RB85 verspätet'])
    await click(radio('Meldungen filtern', 'Alle'))
    const search = container.querySelector('input[aria-label="Meldungen durchsuchen"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'bad oldesloe')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(titles()).toEqual(['RE8 fällt aus'])
    await click(button('RE8 fällt aus ausblenden'))
    expect(calls).toEqual([['transit_disruption_hidden', ['m3', 'm1']]])
  })
})

describe('DeparturesEditor Darstellung', () => {
  it('schreibt die Zeitangabe und erklärt Gemischt', async () => {
    const calls = await mount()
    expect(text()).toContain('Gemischt: bis 20 Minuten als Minuten, danach als Uhrzeit.')
    expect(radio('Zeitangabe', 'Minuten').getAttribute('aria-checked')).toBe('true')
    await click(radio('Zeitangabe', 'Uhrzeit'))
    await click(radio('Zeitangabe', 'Gemischt'))
    expect(calls).toEqual([['transit_time_format', 'clock'], ['transit_time_format', 'mixed']])
  })

  it('schreibt Ortsnamen kürzen', async () => {
    const calls = await mount()
    expect(text()).toContain('Lässt einen Ortsnamen weg, der vor allen Haltestellen steht.')
    await click(checkbox('Ortsnamen kürzen'))
    expect(calls).toEqual([['transit_strip_city', false]])
  })

  it('schreibt Störungen anzeigen und blendet bei Aus die Quellen aus', async () => {
    const calls = await mount()
    expect(text()).toContain('in der Störungsspalte')
    expect(text()).not.toContain('in der Leiste unten')
    await click(checkbox('Störungen anzeigen'))
    expect(calls).toEqual([['transit_show_disruptions', false]])
    act(() => root.unmount())
    container.remove()
    await mount({ transit_show_disruptions: false })
    expect(text()).not.toContain('Zug-Störungen von NAH.SH')
  })

  it('zeigt die Quelle je Haltestelle', async () => {
    await mount({ transit_stops: [stop('708049', 'Wahmstraße'), stop('8000237', 'Lübeck Hbf'), stop('1', 'Kohlmarkt', { source: 'db' })] })
    const lines = [...container.querySelectorAll('[data-stop-row] .text-xs.truncate')].map((el) => el.textContent)
    expect(lines).toEqual(['Bus, Zug, Fernzug · Quelle: NAH.SH', 'Bus, Zug, Fernzug · Quelle: DB, Ersatz NAH.SH',
      'Bus, Zug, Fernzug · Quelle: DB'])
  })

  it('erklärt den Fußweg', async () => {
    await mount()
    expect(text()).toContain('Abfahrten, die man zu Fuß nicht mehr schafft, werden ausgeblendet.')
  })
})
