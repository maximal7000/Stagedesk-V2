import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const perms = new Set()
vi.mock('../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: (p) => perms.has(p) }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../shared/api', () => ({
  getScreens: vi.fn(() => Promise.resolve([{
    id: 1, name: 'Glocke', slug: 'glocke', location: '', default_view_id: null, power_mode: 'auto',
    power_schedule: [], off_during_holidays: true, cec_status_at: null,
  }])),
  getViews: vi.fn(() => Promise.resolve([])),
  createScreen: vi.fn(),
}))

const { default: Screens } = await import('./Screens')

let root, container
async function mount() {
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Screens))) })
}
beforeEach(() => perms.clear())
afterEach(() => {
  if (root) act(() => root.unmount())
  root = undefined
})

describe('Screens', () => {
  it('zeigt "Neuer Bildschirm" nur mit Recht für die Einrichtung', async () => {
    perms.add('monitor.power')
    await mount()
    expect(container.textContent).toContain('Glocke')
    expect(container.textContent).not.toContain('Neuer Bildschirm')
    act(() => root.unmount())
    perms.add('monitor.setup')
    await mount()
    expect(container.textContent).toContain('Neuer Bildschirm')
  })

  it('beschreibt einen Bildschirm ohne Zeitplan ohne Widerspruch', async () => {
    perms.add('monitor.setup')
    await mount()
    expect(container.textContent).toContain('Ohne Zeitplan')
    expect(container.textContent).toContain('In den Ferien aus')
    expect(container.textContent).not.toContain('immer an')
  })
})
