import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const perms = new Set()
vi.mock('../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: (p) => perms.has(p) }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../shared/api', () => ({
  getScreens: vi.fn(),
  getViews: vi.fn(() => Promise.resolve([{ id: 1, name: 'Abfahrten' }])),
  getDevices: vi.fn(() => Promise.resolve([])),
  getScreenEvents: vi.fn(() => Promise.resolve([])),
  sendDeviceCommand: vi.fn(),
  getDeviceCommand: vi.fn(),
  unpairDevice: vi.fn(),
  revokeDevice: vi.fn(),
  updateScreen: vi.fn(),
  regenerateScreenKey: vi.fn(),
  reloadScreen: vi.fn(),
  deleteScreen: vi.fn(() => Promise.resolve({ success: true })),
}))

const { useNavigate } = await import('react-router-dom')
const api = await import('../shared/api')
const { toast } = await import('sonner')
const { default: ScreenDetail } = await import('./ScreenDetail')

const glocke = () => ({
  id: 1, name: 'Glocke', slug: 'glocke', location: 'Eingangshalle', default_view_id: 1, scale: 'auto',
  orientation: 'landscape', access_key: 'alt-key', power_mode: 'auto', off_during_holidays: true, off_until: null,
  power_schedule: [{ days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00' }], power_exceptions: [],
  cec_status: 'on', cec_status_at: null,
  power_method: 'cec', power_config: { cec_device: '0' }, auto_updates: true,
  update_window: { weekday: 6, from: '03:00', until: '05:00' }, daily_reboot: true,
})

const pairedDevice = (extra = {}) => ({
  id: 5, screen_id: 1, status: 'online', status_text: 'Online', agent_version: '1.0.0', legacy: false, warnings: [],
  last_seen_at: '2026-10-20T09:59:40', last_screenshot_url: null, last_screenshot_at: null,
  telemetry: { network: { kind: 'wifi', ssid: 'Technik', signal_dbm: -58 }, system: { temperature_c: 47 } },
  ...extra,
})

// Knopf neben dem Detail: wechselt wie ein Link zu Bildschirm 2, die Detail-Komponente bleibt eingehängt
function GoToSecond() {
  const navigate = useNavigate()
  return createElement('button', { type: 'button', 'data-go': '', onClick: () => navigate('/monitor-admin/screens/2') }, 'weiter')
}

let root, container
async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/monitor-admin/screens/1'] },
      createElement(Routes, null,
        createElement(Route, { path: '/monitor-admin/screens/:id', element: createElement(ScreenDetail) }),
        createElement(Route, { path: '/monitor-admin/screens', element: createElement('p', { 'data-list': '' }, 'Liste') }))))
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
  api.getViews.mockImplementation(() => Promise.resolve([{ id: 1, name: 'Abfahrten' }]))
  api.getDevices.mockImplementation(() => Promise.resolve([]))
  api.getScreenEvents.mockImplementation(() => Promise.resolve([]))
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

  it('nur mit Recht für Ein- und Ausschalten: Anzeige lesend, Ein- und Ausschalten bearbeitbar, keine Setup-Aktionen', async () => {
    perms.add('monitor.power')
    await mount()
    expect(byLabel('Name').disabled).toBe(true)
    expect(byLabel('Ort').disabled).toBe(true)
    expect(container.querySelector('[data-section="display"]').textContent).toContain('Nur lesend, Recht für die Einrichtung fehlt')
    expect(container.querySelector('[data-section="power"]').textContent).not.toContain('Nur lesend')
    expect(button('Zeile hinzufügen')).toBeDefined()
    expect(byLabel('Kiosk-URL')).toBeNull()
    expect(container.textContent).not.toContain('alt-key')
    expect(button('Neu erzeugen')).toBeUndefined()
    expect(button('Neu laden')).toBeUndefined()
    expect([...container.querySelectorAll('a')].some((a) => a.textContent.includes('Vorschau'))).toBe(false)

    await click(button('Immer aus'))
    await click(button('Speichern'))
    expect(api.updateScreen).toHaveBeenCalledTimes(1)
    expect(Object.keys(api.updateScreen.mock.calls[0][1]).sort())
      .toEqual(['off_during_holidays', 'power_exceptions', 'power_mode', 'power_schedule'])
    expect(api.updateScreen.mock.calls[0][1].power_mode).toBe('manual_off')
  })

  it('verwirft Stand und Entwurf beim Wechsel zu einem anderen Bildschirm', async () => {
    perms.add('monitor.setup').add('monitor.power')
    const aula = { ...glocke(), id: 2, name: 'Aula', slug: 'aula', location: 'Bühne' }
    let resolveSecond
    api.getScreens
      .mockImplementationOnce(() => Promise.resolve([glocke(), aula]))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ['/monitor-admin/screens/1'] },
        createElement(Routes, null, createElement(Route, {
          path: '/monitor-admin/screens/:id',
          element: createElement(Fragment, null, createElement(ScreenDetail), createElement(GoToSecond)),
        }))))
    })
    await act(async () => { typeInto(byLabel('Ort'), 'Geändert') })
    expect(container.textContent).toContain('1 ungespeicherte Änderung')
    await click(container.querySelector('[data-go]'))
    // Während Aula lädt, bleibt nichts von Glocke stehen
    expect(container.textContent).not.toContain('Glocke')
    expect(container.textContent).not.toContain('ungespeicherte')
    await act(async () => { resolveSecond([glocke(), aula]) })
    expect(byLabel('Ort').value).toBe('Bühne')
    expect(container.textContent).not.toContain('ungespeicherte')
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

  it('setzt eine andere Ansicht vorübergehend und hebt sie wieder auf', async () => {
    perms.add('monitor.setup')
    api.getViews.mockImplementation(() => Promise.resolve([{ id: 1, name: 'Abfahrten' }, { id: 2, name: 'Info' }]))
    await mount()
    const section = container.querySelector('[data-section="override"]')
    expect(section.textContent).toContain('Zeigt die Standard-Ansicht')
    await click(button('Anwenden', section))
    expect(api.updateScreen).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Bitte eine Ansicht wählen.')

    const select = section.querySelector('select')
    await act(async () => {
      select.value = '2'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(button('Anwenden', section))
    expect(api.updateScreen).toHaveBeenCalledWith(1, { override_view_id: 2, override_until: null })
    expect(container.querySelector('[data-section="override"]').textContent).toContain('Zeigt „Info“ bis auf Weiteres')

    await click(button('Aufheben', container.querySelector('[data-section="override"]')))
    expect(api.updateScreen).toHaveBeenLastCalledWith(1, { override_view_id: null, override_until: null })
    expect(container.querySelector('[data-section="override"]').textContent).toContain('Zeigt die Standard-Ansicht')
  })

  it('löscht den Bildschirm nach Bestätigung endgültig und wechselt zur Liste', async () => {
    perms.add('monitor.setup')
    await mount()
    await click(button('Löschen'))
    const dialog = container.querySelector('[role="alertdialog"]')
    expect(dialog.textContent).toContain('„Glocke“ löschen?')
    expect(dialog.textContent).toContain('endgültig')
    await click(button('Endgültig löschen', dialog))
    expect(api.deleteScreen).toHaveBeenCalledWith(1)
    expect(container.querySelector('[data-list]')).not.toBeNull()
  })

  it('ohne Recht für die Einrichtung: kein Löschen, vorübergehende Ansicht nur lesend', async () => {
    perms.add('monitor.power')
    api.getScreens.mockImplementation(() => Promise.resolve([{ ...glocke(), override_view_id: 1, override_until: null }]))
    await mount()
    expect(button('Löschen')).toBeUndefined()
    const section = container.querySelector('[data-section="override"]')
    expect(section.textContent).toContain('Zeigt „Abfahrten“ bis auf Weiteres')
    expect(button('Aufheben', section)).toBeUndefined()
    expect(section.querySelector('select')).toBeNull()
  })

  describe('Gerät', () => {
    const select = (label, value) => act(async () => {
      const el = byLabel(label)
      el.value = value
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    it('Methodenwechsel sendet Methode und Konfiguration zusammen, nur für den Geräte-Entwurf', async () => {
      perms.add('monitor.devices')
      await mount()
      await select('Steuerung des Bildschirms', 'hybrid')
      await act(async () => { typeInto(byLabel('SICP-IP'), '192.0.2.30') })
      expect(container.textContent).toContain('2 ungespeicherte Änderungen')
      await click(button('Speichern'))
      expect(api.updateScreen).toHaveBeenCalledTimes(1)
      expect(api.updateScreen).toHaveBeenCalledWith(1, {
        power_method: 'hybrid',
        power_config: { display_ip: '192.0.2.30', display_port: 5000, monitor_id: 0, cec_device: '0' },
      })
    })

    it('Hybrid ohne SICP-IP wird nicht gespeichert', async () => {
      perms.add('monitor.devices')
      await mount()
      await select('Steuerung des Bildschirms', 'hybrid')
      await click(button('Speichern'))
      expect(api.updateScreen).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('SICP-IP'))
      expect(container.querySelector('[data-power-method]').textContent).toContain('SICP-IP fehlt.')
    })

    it('Update-Fenster: von muss vor bis liegen, gespeichert wird nur das Geänderte', async () => {
      perms.add('monitor.devices')
      await mount()
      await act(async () => { typeInto(byLabel('Von'), '06:00') })
      expect(container.querySelector('[data-section="updates"]').textContent).toContain('„Von“ muss vor „Bis“ liegen.')
      await click(button('Speichern'))
      expect(api.updateScreen).not.toHaveBeenCalled()
      await act(async () => { typeInto(byLabel('Von'), '02:00') })
      await click(byLabel('Automatische Updates'))
      await click(button('Speichern'))
      expect(api.updateScreen).toHaveBeenCalledWith(1, { auto_updates: false, update_window: { weekday: 6, from: '02:00', until: '05:00' } })
    })

    it('ohne monitor.devices sind die Geräte-Felder nur lesend', async () => {
      perms.add('monitor.power')
      await mount()
      expect(byLabel('Steuerung des Bildschirms').disabled).toBe(true)
      expect(container.querySelector('[data-section="updates"]')).toBeNull()
      expect(container.querySelector('[data-section="log"]')).toBeNull()
    })

    it('mit gekoppeltem Gerät: Geräte-Box, Ampel im Kopf und Protokoll', async () => {
      perms.add('monitor.devices')
      api.getDevices.mockImplementation(() => Promise.resolve([pairedDevice()]))
      await mount()
      expect(container.querySelector('[data-section="device"]').textContent).toContain('Stand 09:59')
      expect(button('Neu laden')).toBeDefined()
      expect(api.getScreenEvents).toHaveBeenCalledWith(1, { limit: 100 })
      expect(container.querySelector('[data-section="log"]')).not.toBeNull()
    })

    it('ohne Gerät: Hinweis, bei Ladefehler Unbekannt statt Kein Gerät gekoppelt', async () => {
      perms.add('monitor.devices')
      await mount()
      expect(container.querySelector('[data-section="device"]').dataset.deviceState).toBe('unpaired')
      expect(container.textContent).toContain('Kein Gerät gekoppelt')
      act(() => root.unmount())
      container.remove()
      api.getDevices.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { response: { status: 503, data: {} } })))
      await mount()
      const box = container.querySelector('[data-section="device"]')
      expect(box.dataset.deviceState).toBe('unknown')
      expect(box.textContent).toContain('Unbekannt')
      expect(box.textContent).not.toContain('Kein Gerät gekoppelt')
    })

    it('mit monitor.setup ohne monitor.devices bleibt Neu laden über reloadScreen, sonst keine Befehle', async () => {
      perms.add('monitor.setup')
      api.getDevices.mockImplementation(() => Promise.resolve([pairedDevice()]))
      api.reloadScreen.mockResolvedValue({ success: true })
      await mount()
      expect(button('Pi neu starten')).toBeUndefined()
      expect(button('Entkoppeln')).toBeUndefined()
      await click(button('Neu laden'))
      expect(api.reloadScreen).toHaveBeenCalledWith(1)
      expect(api.sendDeviceCommand).not.toHaveBeenCalled()
    })

    it('altes Skript: CEC-Stand und Hinweis', async () => {
      perms.add('monitor.setup')
      api.getDevices.mockImplementation(() => Promise.resolve([{ id: null, screen_id: 1, status: 'legacy', legacy: true, warnings: [], telemetry: {} }]))
      await mount()
      expect(container.querySelector('[data-section="device"]').textContent).toContain('Altes Skript')
      expect(button('Neu laden')).toBeDefined()
    })
  })
})
