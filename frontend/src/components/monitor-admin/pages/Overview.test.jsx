import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: () => true }) }))
vi.mock('../shared/api', () => ({
  getScreens: vi.fn(),
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
  if (root) act(() => root.unmount())
  root = undefined
  vi.useRealTimers()
})

describe('Overview', () => {
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
})
