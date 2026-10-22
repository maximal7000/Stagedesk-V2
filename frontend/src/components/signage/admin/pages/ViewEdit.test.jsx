import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const VIEWS = {
  1: {
    id: 1, name: 'Abfahrten Halle', slug: 'departures-hall', kind: 'departures', layout: 'auto', is_default: false,
    on_air_behavior: 'fullscreen', on_air_split_side: 'right', show_weather: false, show_qr_code: false,
    transit_stops: [
      { id: 'a', name: 'Katharineum', walk_minutes: 1, max_departures: 10 },
      { id: 'b', name: 'Kohlmarkt', walk_minutes: 4, max_departures: 10 },
      { id: 'c', name: 'Sandstraße', walk_minutes: 3, max_departures: 10 },
    ],
    transit_disruption_rail: true, transit_disruption_bus: true, rotation_items: [], media_items: [],
  },
  2: {
    id: 2, name: 'Vertretungsplan', slug: 'substitutions-plan', kind: 'substitutions', layout: 'auto', is_default: false,
    on_air_behavior: 'fullscreen', webuntis_url: '', webuntis_url_next_day: '', webuntis_link_id: 5,
    webuntis_link_next_day_id: null, page_seconds: 15, substitutions_source: 'embed', substitutions_next_day_from: '16:00', transit_stops: [], rotation_items: [], media_items: [],
  },
  6: {
    id: 6, name: 'Aushänge', slug: 'notices', kind: 'media', layout: 'auto', is_default: false, on_air_behavior: 'fullscreen',
    media_items: [], media_seconds: 10, pdf_per_screen: 1, pdf_mode: 'cycle', transit_stops: [], rotation_items: [],
  },
  4: {
    id: 4, name: 'Wechsel Mensa', slug: 'rotation-canteen', kind: 'rotation', layout: 'auto', is_default: false,
    on_air_behavior: 'fullscreen', rotation_items: [{ view_id: 1, seconds: 20 }, { view_id: 2, seconds: 30 }], transit_stops: [], media_items: [],
  },
}
const LIST = [
  { id: 1, name: 'Abfahrten Halle', kind: 'departures' },
  { id: 2, name: 'Vertretungsplan', kind: 'substitutions' },
  { id: 3, name: 'Alter Wechsel', kind: 'rotation' },
  { id: 4, name: 'Wechsel Mensa', kind: 'rotation', rotation_items: [{ view_id: 1, seconds: 20 }, { view_id: 2, seconds: 30 }] },
]

vi.mock('../shared/api', () => ({
  getView: vi.fn((id) => Promise.resolve(structuredClone(VIEWS[id]))),
  getViews: vi.fn(() => Promise.resolve(LIST)),
  getScreens: vi.fn(() => Promise.resolve([{ id: 9, name: 'Glocke', default_view_id: 1, orientation: 'landscape', schedule: [] }])),
  updateView: vi.fn((id, body) => Promise.resolve({ ...structuredClone(VIEWS[id]), ...body })),
  previewView: vi.fn(() => new Promise(() => {})),
  createView: vi.fn(),
  deleteView: vi.fn(),
  getFiles: vi.fn(() => Promise.resolve([
    { id: 11, name: 'Speiseplan', kind: 'pdf' }, { id: 12, name: 'Plakat', kind: 'image' },
    { id: 13, name: 'Schullogo', kind: 'logo' }, { id: 14, name: 'Hintergrund Aula', kind: 'background' },
  ])),
  searchStops: vi.fn(() => Promise.resolve([])),
  getDisruptions: vi.fn(() => Promise.resolve([
    { id: 'm1', kind: 'disruption', title: 'RE8 fällt aus', lines: ['RE8'] },
    { id: 'm2', kind: 'construction', title: 'Linie 5 Umleitung', lines: ['5'] },
  ])),
  getWebuntisLinks: vi.fn(() => Promise.resolve([{ id: 5, name: 'Untis zwei Tage', url: 'https://untis.example/2' }])),
}))

const api = await import('../shared/api')
const { toast } = await import('sonner')
const { default: ViewEdit } = await import('./ViewEdit')

let root, container
async function mount(path) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] },
      createElement(Routes, null,
        createElement(Route, { path: '/signage-admin/views/new', element: createElement(ViewEdit) }),
        createElement(Route, { path: '/signage-admin/views/:id', element: createElement(ViewEdit) }))))
  })
}
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (name) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === name || b.getAttribute('aria-label') === name)
const stopNames = () => [...container.querySelectorAll('[data-stop-row]')].map((r) => r.getAttribute('data-stop-row'))

function dragEvent(type) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { setData() {}, effectAllowed: '', dropEffect: '' } })
  return event
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  if (root) act(() => root.unmount())
  container?.remove()
  root = undefined
})

describe('ViewEdit', () => {
  it('speichert nur das geänderte Feld und blendet die SaveBar danach aus', async () => {
    await mount('/signage-admin/views/1')
    expect(container.textContent).not.toContain('Typ: Abfahrten')
    expect(container.textContent).toContain('Glocke')
    await act(async () => button('Breit').click())
    expect(container.textContent).toContain('1 ungespeicherte Änderung')
    await act(async () => button('Speichern').click())
    expect(api.updateView).toHaveBeenCalledWith(1, { layout: 'wide' })
    expect(container.textContent).not.toContain('ungespeicherte Änderung')
  })

  it('sortiert Haltestellen per Ziehen und speichert die neue Reihenfolge', async () => {
    await mount('/signage-admin/views/1')
    expect(stopNames()).toEqual(['a', 'b', 'c'])
    const rows = () => container.querySelectorAll('[data-stop-row]')
    await act(async () => rows()[0].dispatchEvent(dragEvent('dragstart')))
    await act(async () => rows()[2].dispatchEvent(dragEvent('dragover')))
    await act(async () => rows()[2].dispatchEvent(dragEvent('drop')))
    expect(stopNames()).toEqual(['b', 'c', 'a'])
    const handle = button('Kohlmarkt verschieben')
    await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(stopNames()).toEqual(['c', 'b', 'a'])
    await act(async () => button('Speichern').click())
    const body = api.updateView.mock.calls[0][1]
    expect(Object.keys(body)).toEqual(['transit_stops'])
    expect(body.transit_stops.map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('Wetter anzeigen: Hinweis, wo es erscheint', async () => {
    const weatherHelp = () => [...container.querySelectorAll('label')].find((l) => l.textContent === 'Wetter anzeigen')
      ?.parentElement.querySelector('p')?.textContent
    await mount('/signage-admin/views/1')
    expect(container.textContent).not.toContain('Wetter in der Uhr-Box')
    expect(weatherHelp()).toBe('Erscheint unten neben dem Datum.')
    act(() => root.unmount())
    container.remove()
    await mount('/signage-admin/views/2')
    expect(weatherHelp()).toBe('Erscheint in der Uhr-Box.')
  })

  it('bietet im Wechsel keine Wechsel-Ansichten an', async () => {
    await mount('/signage-admin/views/4')
    const select = container.querySelector('#rotation-view-0')
    const options = [...select.options].map((o) => o.textContent)
    expect(options).toEqual(['Ansicht wählen', 'Abfahrten Halle', 'Vertretungsplan'])
  })

  it('speichert nicht ohne Namen', async () => {
    await mount('/signage-admin/views/1')
    const input = container.querySelector('input[aria-invalid]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(input, '  ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Speichern').click())
    expect(api.updateView).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Name fehlt.')
  })

  it('beginnt eine neue Ansicht mit der Wahl des Typs', async () => {
    await mount('/signage-admin/views/new')
    const tiles = [...container.querySelectorAll('[data-kind-tiles] [role="radio"]')]
    expect(tiles.map((t) => t.querySelector('.font-semibold').textContent))
      .toEqual(['Abfahrten', 'Vertretungsplan', 'Geteilt', 'Medien', 'Info', 'Wechsel'])
    expect(container.textContent).not.toContain('Anlegen')
    await act(async () => tiles[5].click())
    expect(container.textContent).toContain('Anlegen')
  })

  it('nimmt beim Verschieben im Wechsel den Fokus mit der Zeile mit', async () => {
    await mount('/signage-admin/views/4')
    const handle = button('Abfahrten Halle verschieben')
    handle.focus()
    await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Abfahrten Halle verschieben')
    expect(container.querySelector('#rotation-view-1').value).toBe('1')
  })

  it('speichert nicht mit leerer Zahl und nennt den Bereich', async () => {
    await mount('/signage-admin/views/1')
    await act(async () => typeInto(container.querySelector('input[aria-label="Max. Zeilen Kohlmarkt"]'), ''))
    await act(async () => button('Speichern').click())
    expect(api.updateView).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Haltestelle „Kohlmarkt“: Max. Zeilen ungültig (ganze Zahl von 1 bis 50).')
  })

  it('zeigt den gespeicherten WebUntis-Link und löst ihn, wenn die Adresse bearbeitet wird', async () => {
    await mount('/signage-admin/views/2')
    expect(container.textContent).toContain('Aktiv ist der gespeicherte Link „Untis zwei Tage“')
    await act(async () => typeInto(container.querySelector('input[type="url"]'), 'https://eigen.example'))
    expect(container.textContent).not.toContain('Aktiv ist der gespeicherte Link')
    await act(async () => button('Speichern').click())
    expect(api.updateView).toHaveBeenCalledWith(2, { webuntis_url: 'https://eigen.example', webuntis_link_id: null })
  })

  it('bietet in der Medien-Ansicht nur PDFs und Bilder an', async () => {
    await mount('/signage-admin/views/6')
    const select = container.querySelector('[data-editor-section="media"] select')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Datei wählen', 'Speiseplan', 'Plakat'])
  })

  it('Abfahrten: blendet eine aktuelle Meldung aus und speichert die Vorausschau', async () => {
    await mount('/signage-admin/views/1')
    expect(api.getDisruptions).toHaveBeenCalledWith(1)
    await act(async () => button('RE8 fällt aus ausblenden').click())
    await act(async () => typeInto(container.querySelector('[data-editor-section="transit-advanced"] input[type="number"]'), '90'))
    await act(async () => button('Speichern').click())
    expect(api.updateView).toHaveBeenCalledWith(1, { transit_duration: 90, transit_disruption_hidden: ['m1'] })
  })

  it('Abfahrten: Vorausschau außerhalb des Bereichs wird nicht gespeichert', async () => {
    await mount('/signage-admin/views/1')
    await act(async () => typeInto(container.querySelector('[data-editor-section="transit-advanced"] input[type="number"]'), '5'))
    await act(async () => button('Speichern').click())
    expect(api.updateView).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Vorausschau ungültig (ganze Zahl von 10 bis 240).')
  })

  describe('Typ ändern', () => {
    const kindSelect = () => container.querySelector('select[aria-label="Typ"]')
    async function pick(value) {
      const select = kindSelect()
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      await act(async () => {
        setter.call(select, value)
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }

    it('tauscht beim Wechsel sofort den Editor und die Vorschau, Zurückwechseln zeigt die alten Werte', async () => {
      await mount('/signage-admin/views/6')
      expect(kindSelect().value).toBe('media')
      expect([...kindSelect().options].map((o) => o.textContent))
        .toEqual(['Abfahrten', 'Vertretungsplan', 'Geteilt', 'Medien', 'Info', 'Wechsel'])
      expect(container.querySelector('[data-editor-section="media"]')).not.toBeNull()
      await pick('info')
      expect(container.querySelector('[data-editor-section="media"]')).toBeNull()
      expect(container.querySelector('[data-view-kind]').getAttribute('data-view-kind')).toBe('info')
      await pick('media')
      expect(container.querySelector('[data-editor-section="media"]')).not.toBeNull()
      expect(container.textContent).not.toContain('ungespeicherte Änderung')
    })

    it('speichert den neuen Typ ohne Nachfrage, wenn die Ansicht auf keinem Bildschirm läuft', async () => {
      await mount('/signage-admin/views/6')
      await pick('info')
      await act(async () => button('Speichern').click())
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
      expect(api.updateView).toHaveBeenCalledWith(6, { kind: 'info' })
    })

    it('fragt bei einem Bildschirm vor dem Speichern nach', async () => {
      await mount('/signage-admin/views/1')
      await pick('info')
      await act(async () => button('Speichern').click())
      expect(api.updateView).not.toHaveBeenCalled()
      const dialog = container.querySelector('[role="alertdialog"]')
      expect(dialog.textContent).toContain('Die Ansicht läuft auf einem Bildschirm. Nach dem Speichern zeigt er den neuen Typ.')
      await act(async () => [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Abbrechen').click())
      expect(api.updateView).not.toHaveBeenCalled()
      await act(async () => button('Speichern').click())
      await act(async () => [...container.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent === 'Typ ändern').click())
      expect(api.updateView).toHaveBeenCalledWith(1, { kind: 'info' })
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    })

    it('nennt bei mehreren Bildschirmen die Zahl', async () => {
      api.getScreens.mockImplementationOnce(() => Promise.resolve([
        { id: 9, name: 'Glocke', default_view_id: 1, orientation: 'landscape', schedule: [] },
        { id: 10, name: 'Aula', default_view_id: 1, orientation: 'landscape', schedule: [] },
      ]))
      await mount('/signage-admin/views/1')
      await pick('info')
      await act(async () => button('Speichern').click())
      expect(container.querySelector('[role="alertdialog"]').textContent)
        .toContain('Die Ansicht läuft auf 2 Bildschirmen. Nach dem Speichern zeigen sie den neuen Typ.')
    })

    it('sperrt Wechsel für ein Mitglied eines Wechsels mit Meldung und speichert nicht', async () => {
      await mount('/signage-admin/views/1')
      await pick('rotation')
      expect(container.textContent).toContain('Diese Ansicht ist Teil des Wechsels „Wechsel Mensa“. Erst dort entfernen.')
      await act(async () => button('Speichern').click())
      expect(api.updateView).not.toHaveBeenCalled()
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
      expect(toast.error).toHaveBeenCalledWith('Diese Ansicht ist Teil des Wechsels „Wechsel Mensa“. Erst dort entfernen.')
    })
  })
})
