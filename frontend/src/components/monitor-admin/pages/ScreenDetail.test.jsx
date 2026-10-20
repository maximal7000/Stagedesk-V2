import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const perms = new Set()
vi.mock('../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: (p) => perms.has(p) }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../shared/api', () => ({
  getScreens: vi.fn(),
  getViews: vi.fn(() => Promise.resolve([{ id: 1, name: 'Abfahrten' }])),
  updateScreen: vi.fn(),
  regenerateScreenKey: vi.fn(),
  reloadScreen: vi.fn(),
}))

const api = await import('../shared/api')
const { toast } = await import('sonner')
const { default: ScreenDetail } = await import('./ScreenDetail')

const glocke = () => ({
  id: 1, name: 'Glocke', slug: 'glocke', location: 'Eingangshalle', default_view_id: 1, scale: 'auto',
  orientation: 'landscape', access_key: 'alt-key', power_mode: 'auto', off_during_holidays: true, off_until: null,
  power_schedule: [{ days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00' }], power_exceptions: [],
  cec_status: 'on', cec_status_at: null,
})

let root, container
async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/monitor-admin/screens/1'] },
      createElement(Routes, null, createElement(Route, { path: '/monitor-admin/screens/:id', element: createElement(ScreenDetail) }))))
  })
}

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const byLabel = (text) => [...container.querySelectorAll('label')].find((l) => l.textContent === text)?.control
  ?? container.querySelector(`[aria-label="${text}"]`)
const button = (text, scope = container) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const click = async (el) => { await act(async () => { el.click() }) }

beforeEach(() => {
  perms.clear()
  vi.clearAllMocks()
  api.getScreens.mockImplementation(() => Promise.resolve([glocke()]))
  api.updateScreen.mockImplementation((id, body) => Promise.resolve({ ...glocke(), ...body }))
})
afterEach(() => {
  if (root) act(() => root.unmount())
  container?.remove()
  root = undefined
})

describe('ScreenDetail', () => {
  it('speichert jeden geänderten Abschnitt mit nur seinen Feldern', async () => {
    perms.add('monitor.setup').add('monitor.power')
    await mount()
    await act(async () => { typeInto(byLabel('Ort'), 'Eingangshalle Nord') })
    const saturday = [...container.querySelectorAll('[data-schedule-editor] button[aria-pressed]')].find((b) => b.textContent === 'Sa')
    await click(saturday)
    expect(container.textContent).toContain('2 ungespeicherte Änderungen')

    await click(button('Speichern'))
    expect(api.updateScreen).toHaveBeenCalledTimes(2)
    const [displayCall, powerCall] = api.updateScreen.mock.calls
    expect(displayCall[1]).toEqual({ name: 'Glocke', location: 'Eingangshalle Nord', default_view_id: 1, scale: 'auto', orientation: 'landscape' })
    expect(Object.keys(powerCall[1]).sort()).toEqual(['off_during_holidays', 'power_exceptions', 'power_mode', 'power_schedule'])
    expect(powerCall[1].power_schedule).toEqual([{ days: [0, 1, 2, 3, 4, 5], from: '07:00', until: '17:00' }])
    expect(container.textContent).not.toContain('ungespeicherte')
  })

  it('ohne Recht für Ein- und Ausschalten ist der Abschnitt nur lesend', async () => {
    perms.add('monitor.setup')
    await mount()
    expect(container.textContent).toContain('Nur lesend')
    expect(button('Zeile hinzufügen')).toBeUndefined()
    expect(button('Immer aus').disabled).toBe(true)
  })

  it('hält das Speichern bei unvollständigem Zeitplan an', async () => {
    perms.add('monitor.setup').add('monitor.power')
    await mount()
    const fromInput = container.querySelector('[data-schedule-editor] input[aria-label="Von"]')
    await act(async () => { typeInto(fromInput, '') })
    expect(container.textContent).toContain('Von und bis angeben.')
    await click(button('Speichern'))
    expect(api.updateScreen).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('erzeugt nach Bestätigung einen neuen Schlüssel und zeigt die neue URL', async () => {
    perms.add('monitor.setup')
    api.regenerateScreenKey.mockResolvedValue({ ...glocke(), access_key: 'neu-key' })
    await mount()
    expect(byLabel('Kiosk-URL').value).toBe(`${window.location.origin}/monitor?screen=glocke&key=alt-key`)
    await click(button('Neu erzeugen'))
    const dialog = container.querySelector('[role="alertdialog"]')
    expect(dialog.textContent).toContain('Der alte Link funktioniert danach nicht mehr für den Vertretungsplan.')
    await click(button('Neu erzeugen', dialog))
    expect(api.regenerateScreenKey).toHaveBeenCalledWith(1)
    expect(byLabel('Kiosk-URL').value).toContain('key=neu-key')
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
