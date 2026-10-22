import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../shared/api', () => ({ getDisruptions: vi.fn(() => Promise.resolve([])) }))
vi.mock('../shared/StopSearch', () => ({ default: () => null }))
vi.mock('../shared/StopFilterDialog', () => ({ default: () => null }))

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

async function mount(overrides = {}) {
  const calls = []
  const draft = { ...BASE, ...overrides }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(createElement(DeparturesEditor, { draft, set: (k, v) => calls.push([k, v]), viewId: null })) })
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
    expect(container.querySelector('[data-column-overview]').textContent).toBe('Spalte 1: A, C · Spalte 2: B')
  })

  it('gruppiert die Übersicht und schiebt zu große Spalten unter die letzte', async () => {
    await mount()
    expect(container.querySelector('[data-column-overview]').textContent)
      .toBe('Spalte 1: Wahmstraße, Sandstraße · Spalte 2: leer · Spalte 3: Hauptbahnhof · Spalte 4: leer')
    act(() => root.unmount())
    container.remove()
    await mount({ transit_columns: 2 })
    expect(container.querySelector('[data-column-overview]').textContent)
      .toBe('Spalte 1: Wahmstraße, Sandstraße · Spalte 2: Hauptbahnhof')
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

  it('erklärt den Fußweg', async () => {
    await mount()
    expect(text()).toContain('Abfahrten, die man zu Fuß nicht mehr schafft, werden ausgeblendet.')
  })
})
