import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const perms = vi.hoisted(() => ({ allow: () => true }))
vi.mock('../../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: (p) => perms.allow(p) }) }))
vi.mock('../shared/api', () => ({
  getScreens: vi.fn(),
  getDevices: vi.fn(() => Promise.resolve([])),
  pairDevice: vi.fn(),
  getSettings: vi.fn(() => Promise.resolve({ on_air_active: false })),
  getViews: vi.fn(() => Promise.resolve([])),
  getExams: vi.fn(() => Promise.resolve([])),
  getEvents: vi.fn(() => Promise.resolve([])),
  getHolidays: vi.fn(() => Promise.resolve([])),
  getDisplay: vi.fn(() => Promise.resolve(null)),
  updateScreen: vi.fn((id, body) => Promise.resolve({ id, ...body })),
}))

const api = await import('../shared/api')
const { default: Overview } = await import('./Overview')

const screen = (name) => ({ id: 1, name, slug: 's', location: '', power_mode: 'auto', off_until: null, cec_status_at: null })

let root, container
afterEach(() => {
  api.getDevices.mockImplementation(() => Promise.resolve([]))
  if (root) act(() => root.unmount())
  root = undefined
  vi.useRealTimers()
  perms.allow = () => true
})

describe('Overview', () => {
  it('verlinkt den Bildschirmnamen auch nur mit Strom-Recht', async () => {
    perms.allow = (p) => p === 'signage.view' || p === 'signage.power'
    api.getScreens.mockImplementation(() => Promise.resolve([screen('Glocke')]))
    container = document.createElement('div')
    root = createRoot(container)
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Glocke'))
    expect(link?.getAttribute('href')).toBe('/monitor-admin/screens/1')
  })

  it('verwirft eine ältere Antwort, die nach einer neueren ankommt', async () => {
    vi.useFakeTimers()
    let resolveFirst
    api.getScreens
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementation(() => Promise.resolve([screen('Neu')]))
    container = document.createElement('div')
    root = createRoot(container)
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
    // Zweites Laden (Aktualisierung nach 60 s) überholt das erste
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000) })
    expect(container.textContent).toContain('Neu')
    await act(async () => { resolveFirst([screen('Alt')]) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(container.textContent).toContain('Neu')
    expect(container.textContent).not.toContain('Alt')
  })

  it('zeigt On-Air und Notfall auch, wenn die Bildschirme nicht laden', async () => {
    api.getScreens.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { response: { status: 503, data: {} } })))
    container = document.createElement('div')
    root = createRoot(container)
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
    expect(container.querySelector('[data-admin-page="overview"]').dataset.state).toBe('error')
    expect(container.textContent).toContain('Bildschirme konnten nicht geladen werden.')
    expect(container.querySelector('[role="switch"][aria-label="On-Air"]')).not.toBeNull()
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Auslösen…')).toBe(true)
  })

  it('On-Air und Notfall: Unterzeilen nennen nur den Zustand', async () => {
    const mountOverview = async () => {
      container = document.createElement('div')
      root = createRoot(container)
      await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
      return container.textContent
    }
    api.getSettings.mockImplementation(() => Promise.resolve({ on_air_active: false, emergency_active: false }))
    let text = await mountOverview()
    expect(text).toContain('Aus')
    expect(text).not.toContain('ATEM')
    expect(text).not.toContain('Brandmeldeanlage')
    act(() => root.unmount())
    api.getSettings.mockImplementation(() => Promise.resolve({
      on_air_active: true, on_air_since: '2026-10-21T08:05:00Z', emergency_active: true, emergency_since: '2026-10-21T09:10:00Z', emergency_text: 'Evakuierung',
    }))
    text = await mountOverview()
    expect(text).toMatch(/An seit \d{2}:\d{2}/)
    expect(text).toMatch(/Aktiv seit \d{2}:\d{2}/)
    expect(text).not.toContain('ATEM')
    api.getSettings.mockImplementation(() => Promise.resolve({ on_air_active: false }))
  })

  it('hebt eine manuelle Ansicht über das Zeilenmenü auf und bietet Rückgängig', async () => {
    const until = '2099-01-01T12:00:00Z'
    api.getScreens.mockImplementation(() => Promise.resolve([{ ...screen('Glocke'), override_view_id: 3, override_until: until }]))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
    const menuButton = container.querySelector('[aria-label="Weitere Aktionen"]')
    await act(async () => { menuButton.click() })
    const item = [...container.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === 'Manuelle Ansicht aufheben')
    expect(item).toBeDefined()
    await act(async () => { item.click() })
    expect(api.updateScreen).toHaveBeenCalledWith(1, { override_view_id: null, override_until: null })
    const undo = container.querySelector('[data-undo-toast]')
    expect(undo.textContent).toContain('Glocke zeigt wieder die geplante Ansicht')
    await act(async () => { [...undo.querySelectorAll('button')].find((b) => b.textContent === 'Rückgängig').click() })
    expect(api.updateScreen).toHaveBeenLastCalledWith(1, { override_view_id: 3, override_until: until })
    container.remove()
  })
  it('zeigt Geräte-Ampel, Kennzahlen und die Platzhalter für Bildschirme ohne Gerät', async () => {
    api.getScreens.mockImplementation(() => Promise.resolve([
      { ...screen('Glocke'), id: 1, slug: 'g' }, { ...screen('Aula'), id: 2, slug: 'a' }, { ...screen('Mensa'), id: 3, slug: 'm' },
    ]))
    api.getDevices.mockImplementation(() => Promise.resolve([
      { id: 5, screen_id: 1, status: 'warning', status_text: 'Warnung · Temperatur 83 °C', agent_version: '1.0.0', legacy: false, warnings: [{ code: 'temperature', text: 'Temperatur 83 °C' }],
        telemetry: { network: { kind: 'wifi', signal_dbm: -58 }, system: { temperature_c: 83 } } },
      { id: null, screen_id: 2, status: 'legacy', status_text: 'Altes Skript', agent_version: '', legacy: true, warnings: [], telemetry: {} },
    ]))
    container = document.createElement('div')
    root = createRoot(container)
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
    const cell = (slug) => container.querySelector(`[data-screen="${slug}"] [data-device-state]`)
    // Gerät zeigt nur Hardware-Fakten; die Ampel steht allein in "Status"
    expect(cell('g').textContent).toBe('Agent 1.0.0WLAN -58 dBm · 83 °C')
    expect(cell('g').textContent).not.toContain('Warnung')
    expect(cell('g').querySelector('.text-warn').textContent).toBe('83 °C')
    expect(container.querySelector('[data-screen="g"] [data-screen-state]').textContent).toContain('Warnung')
    expect(cell('a').textContent).toBe('Altes SkriptAgent installieren')
    expect(cell('m').textContent).toBe('Kein Gerät gekoppelt')
    expect(container.textContent).not.toContain('Kopplung folgt')
  })

  it('Koppeln-Knopf nur mit signage.devices', async () => {
    api.getScreens.mockImplementation(() => Promise.resolve([screen('Glocke')]))
    const buttons = () => [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Bildschirm koppeln')
    perms.allow = (p) => p !== 'signage.devices'
    container = document.createElement('div')
    root = createRoot(container)
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
    expect(buttons()).toHaveLength(0)
    act(() => root.unmount())
    perms.allow = () => true
    root = createRoot(container)
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
    expect(buttons()).toHaveLength(1)
    expect(buttons()[0].disabled).toBe(false)
  })

  it('meldet, wenn die Gerätedaten nicht laden, und fällt auf den CEC-Status zurück', async () => {
    api.getScreens.mockImplementation(() => Promise.resolve([screen('Glocke')]))
    api.getDevices.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { response: { status: 503, data: {} } })))
    container = document.createElement('div')
    root = createRoot(container)
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Overview))) })
    expect(container.querySelector('[data-devices-error]').textContent).toContain('Gerätedaten nicht verfügbar')
    expect(container.querySelector('[data-screen="s"]')).not.toBeNull()
    expect(container.querySelector('[data-device-state="unknown"]').textContent).toBe('Unbekannt')
    expect(container.textContent).not.toContain('Kein Gerät gekoppelt')
    expect(container.querySelector('[data-devices-error]').textContent).toContain('Der Status stammt aus der letzten Meldung des Bildschirms.')
  })
})
