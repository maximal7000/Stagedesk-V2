import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-oidc-context', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('./lib/api', () => ({ setAuthContext: vi.fn() }))
vi.mock('./components/MaintenanceBanner', () => ({ MaintenanceBanner: () => null }))
vi.mock('sonner', () => ({ Toaster: () => null }))
vi.mock('./pages/SignagePage', () => ({ default: () => createElement('p', { 'data-signage-page': '' }, 'Anzeige') }))
vi.mock('./pages/AufgabenMonitorPage', () => ({ default: () => null }))
// The protected area only reports where the router ended up.
vi.mock('./components/ProtectedRoute', () => ({
  default: function ProtectedProbe() {
    const { pathname, search } = useLocation()
    return createElement('p', { 'data-protected': `${pathname}${search}` })
  },
}))

const { default: App } = await import('./App')

let root, container
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = container = null
})

async function mount(url) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [url] }, createElement(App)))
  })
}

describe('signage addresses', () => {
  it('redirects /monitor-admin/... to /signage-admin/... with rest of path and query', async () => {
    await mount('/monitor-admin/screens/3?x=1')
    expect(container.querySelector('[data-protected]').getAttribute('data-protected')).toBe('/signage-admin/screens/3?x=1')
  })

  it('redirects bare /monitor-admin to /signage-admin', async () => {
    await mount('/monitor-admin')
    expect(container.querySelector('[data-protected]').getAttribute('data-protected')).toBe('/signage-admin')
  })

  it('keeps /signage-admin in the protected area', async () => {
    await mount('/signage-admin/views/2')
    expect(container.querySelector('[data-protected]').getAttribute('data-protected')).toBe('/signage-admin/views/2')
  })

  it.each(['/monitor?screen=a', '/monitor?bildschirm=a', '/signage?screen=a'])('renders the display on %s without login', async (url) => {
    await mount(url)
    expect(container.querySelector('[data-signage-page]')).not.toBeNull()
    expect(container.querySelector('[data-protected]')).toBeNull()
  })
})
