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
})
