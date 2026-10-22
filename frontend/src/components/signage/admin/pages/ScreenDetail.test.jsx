import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const perms = new Set()
vi.mock('../../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: (p) => perms.has(p) }) }))
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
  schedule: [{ days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00', view_id: null }], power_exceptions: [], color_scheme: 'inherit',
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
    perms.add('signage.setup').add('signage.power')
    await mount()
    await act(async () => { typeInto(byLabel('Ort'), 'Eingangshalle Nord') })
    const saturday = [...container.querySelectorAll('[data-schedule-editor] button[aria-pressed]')].find((b) => b.textContent === 'Sa')
    await click(saturday)
    expect(container.textContent).toContain('2 ungespeicherte Änderungen')

    await click(button('Speichern'))
    expect(api.updateScreen).toHaveBeenCalledTimes(2)
    const [displayCall, powerCall] = api.updateScreen.mock.calls
    expect(displayCall[1]).toEqual({
      name: 'Glocke', location: 'Eingangshalle Nord', default_view_id: 1, scale: 'auto', orientation: 'landscape', color_scheme: 'inherit',
    })
    expect(Object.keys(powerCall[1]).sort()).toEqual(['off_during_holidays', 'power_exceptions', 'power_mode', 'schedule'])
    expect(powerCall[1].schedule).toEqual([{ days: [0, 1, 2, 3, 4, 5], from: '07:00', until: '17:00', view_id: null }])
    expect(container.textContent).not.toContain('ungespeicherte')
  })

  it('ohne Recht für Ein- und Ausschalten ist der Abschnitt nur lesend', async () => {
    perms.add('signage.setup')
    await mount()
    expect(container.textContent).toContain('Nur lesend')
    expect(button('Zeile hinzufügen')).toBeUndefined()
    expect(button('Immer aus').disabled).toBe(true)
  })

  it('nur mit Recht für Ein- und Ausschalten: Anzeige lesend, Ein- und Ausschalten bearbeitbar, keine Setup-Aktionen', async () => {
    perms.add('signage.power')
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
      .toEqual(['off_during_holidays', 'power_exceptions', 'power_mode', 'schedule'])
    expect(api.updateScreen.mock.calls[0][1].power_mode).toBe('manual_off')
  })

  describe('Zeitplan', () => {
    const section = () => container.querySelector('[data-section="schedule"]')
    const withSchedule = (schedule) => api.getScreens.mockImplementation(() => Promise.resolve([{ ...glocke(), schedule }]))

    it('steht als eigener Abschnitt zwischen Anzeige und Ein- und Ausschalten', async () => {
      perms.add('signage.setup').add('signage.power')
      await mount()
      const order = [...container.querySelectorAll('[data-section]')].map((el) => el.dataset.section)
      expect(order.indexOf('display')).toBeLessThan(order.indexOf('schedule'))
      expect(order.indexOf('schedule')).toBeLessThan(order.indexOf('power'))
      expect(section().textContent).toContain('Zu diesen Zeiten ist der Bildschirm an und zeigt die gewählte Ansicht. Außerhalb ist er aus.')
      expect(container.querySelector('[data-section="power"] [data-schedule-editor]')).toBeNull()
    })

    it('leerer Zeitplan ist kompakt', async () => {
      perms.add('signage.setup').add('signage.power')
      withSchedule([])
      await mount()
      expect(section().textContent).toBe('ZeitplanKein Zeitplan·Zeitplan hinzufügen')
      expect(section().querySelector('[data-week-overview]')).toBeNull()
      expect(section().querySelector('input, select')).toBeNull()
    })

    it('Zeitplan ohne Recht power nur lesend', async () => {
      perms.add('signage.setup')
      await mount()
      expect(section().textContent).toContain('Nur lesend')
      expect(button('Zeile hinzufügen', section())).toBeUndefined()
      expect(section().querySelector('[aria-label^="Zeile 1 verschieben"]')).toBeNull()
      expect(section().querySelector('[aria-label="Zeile 1 entfernen"]')).toBeNull()
      expect([...section().querySelectorAll('input, select')].every((el) => el.disabled)).toBe(true)

      withSchedule([])
      act(() => root.unmount())
      await mount()
      expect(button('Zeitplan hinzufügen', section())).toBeUndefined()
      expect(section().textContent).toContain('Kein Zeitplan')
    })

    it('speichert schedule mit view_id null für Standard-Ansicht', async () => {
      perms.add('signage.power')
      withSchedule([])
      await mount()
      await click(button('Zeitplan hinzufügen', section()))
      const viewSelect = section().querySelector('select')
      expect([...viewSelect.options].map((o) => o.textContent)).toEqual(['Standard-Ansicht', 'Abfahrten'])
      expect(section().querySelector('[data-week-overview]')).not.toBeNull()
      await click(button('Zeile hinzufügen', section()))
      const second = section().querySelectorAll('select')[1]
      await act(async () => {
        second.value = '1'
        second.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const from = section().querySelectorAll('input[aria-label="Von"]')[1]
      await act(async () => { typeInto(from, '12:00') })

      await click(button('Speichern'))
      expect(api.updateScreen).toHaveBeenCalledTimes(1)
      expect(api.updateScreen.mock.calls[0][1].schedule).toEqual([
        { days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00', view_id: null },
        { days: [0, 1, 2, 3, 4], from: '12:00', until: '17:00', view_id: 1 },
      ])
    })

    it('zeigt unter überschneidenden Zeilen, welche Vorrang hat', async () => {
      perms.add('signage.power')
      withSchedule([
        { days: [0], from: '07:00', until: '13:00', view_id: 1 },
        { days: [0], from: '12:00', until: '15:00', view_id: null },
        { days: [0], from: '15:00', until: '18:00', view_id: null },
      ])
      await mount()
      const rows = section().querySelectorAll('[data-schedule-editor] > ol > li')
      expect(rows).toHaveLength(3)
      expect(rows[1].textContent).toContain('Überschneidet sich mit Zeile 1, Zeile 1 hat Vorrang.')
      expect(rows[2].textContent).not.toContain('Überschneidet')
      expect(section().querySelector('[data-week-overview]').textContent).toContain('Abfahrten')
      expect(section().querySelector('[data-week-overview]').textContent).toContain('Standard-Ansicht')
      // Wechsel der Ansicht ohne Lücke: keine Fläche in Hintergrundfarbe, höchstens eine dunklere Linie im Balken
      const bars = [...section().querySelectorAll('[data-week-day="0"] [data-view-id]')]
      expect(bars.map((b) => b.dataset.viewId)).toEqual(['1', 'default'])
      expect(bars.some((b) => b.className.includes('border-surface'))).toBe(false)
      expect(bars[1].className).toContain('border-l border-black/30')
      expect(bars[0].className).not.toContain('border-l')
    })

    it('verschiebt Zeilen mit dem Griff per Tastatur', async () => {
      perms.add('signage.power')
      withSchedule([
        { days: [0], from: '07:00', until: '13:00', view_id: 1 },
        { days: [1], from: '12:00', until: '15:00', view_id: null },
      ])
      await mount()
      const handle = section().querySelector('[aria-label="Zeile 2 verschieben"]')
      await act(async () => { handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })) })
      await click(button('Speichern'))
      expect(api.updateScreen.mock.calls[0][1].schedule.map((r) => r.view_id)).toEqual([null, 1])
    })
  })

  it('Farbschema pro Bildschirm wird mit der Anzeige gespeichert', async () => {
    perms.add('signage.setup')
    await mount()
    const group = container.querySelector('[role="radiogroup"][aria-label="Farbschema"]')
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Wie eingestellt', 'Immer hell', 'Immer dunkel'])
    await click(button('Immer dunkel', group))
    await click(button('Speichern'))
    expect(api.updateScreen.mock.calls[0][1].color_scheme).toBe('dark')
  })

  it('verwirft Stand und Entwurf beim Wechsel zu einem anderen Bildschirm', async () => {
    perms.add('signage.setup').add('signage.power')
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

  it('zeigt mit nur signage.devices die Geräte-Box und keine Einrichtung', async () => {
    perms.add('signage.devices')
    api.getDevices.mockImplementation(() => Promise.resolve([pairedDevice()]))
    await mount()
    expect(container.textContent).toContain('Glocke')
    expect(container.querySelector('[data-section="device"]')).not.toBeNull()
    expect(container.querySelector('[data-section="log"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Kiosk-URL')
    expect(container.textContent).toContain('Technik')
  })

  it('hält das Speichern bei unvollständigem Zeitplan an', async () => {
    perms.add('signage.setup').add('signage.power')
    await mount()
    const fromInput = container.querySelector('[data-schedule-editor] input[aria-label="Von"]')
    await act(async () => { typeInto(fromInput, '') })
    expect(container.textContent).toContain('Von und bis angeben.')
    await click(button('Speichern'))
    expect(api.updateScreen).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('erzeugt nach Bestätigung einen neuen Schlüssel und zeigt die neue URL', async () => {
    perms.add('signage.setup')
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
    perms.add('signage.setup')
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
    perms.add('signage.setup')
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
    perms.add('signage.power')
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
      perms.add('signage.devices')
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
      perms.add('signage.devices')
      await mount()
      await select('Steuerung des Bildschirms', 'hybrid')
      await click(button('Speichern'))
      expect(api.updateScreen).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('SICP-IP'))
      expect(container.querySelector('[data-power-method]').textContent).toContain('SICP-IP fehlt.')
    })

    it('Update-Fenster: von muss vor bis liegen, gespeichert wird nur das Geänderte', async () => {
      perms.add('signage.devices')
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

    it('ohne signage.devices sind die Geräte-Felder nur lesend', async () => {
      perms.add('signage.power')
      await mount()
      expect(byLabel('Steuerung des Bildschirms').disabled).toBe(true)
      expect(container.querySelector('[data-section="updates"]')).toBeNull()
      expect(container.querySelector('[data-section="log"]')).toBeNull()
    })

    it('mit gekoppeltem Gerät: Geräte-Box, Ampel im Kopf und Protokoll', async () => {
      perms.add('signage.devices')
      api.getDevices.mockImplementation(() => Promise.resolve([pairedDevice()]))
      await mount()
      expect(container.querySelector('[data-section="device"]').textContent).toContain('Stand 09:59')
      expect(button('Neu laden')).toBeDefined()
      expect(api.getScreenEvents).toHaveBeenCalledWith(1, { limit: 100 })
      expect(container.querySelector('[data-section="log"]')).not.toBeNull()
    })

    it('ohne Gerät: Hinweis, bei Ladefehler Unbekannt statt Kein Gerät gekoppelt', async () => {
      perms.add('signage.devices')
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

    it('mit signage.setup ohne signage.devices bleibt Neu laden über reloadScreen, sonst keine Befehle', async () => {
      perms.add('signage.setup')
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
      perms.add('signage.setup')
      api.getDevices.mockImplementation(() => Promise.resolve([{ id: null, screen_id: 1, status: 'legacy', legacy: true, warnings: [], telemetry: {} }]))
      await mount()
      expect(container.querySelector('[data-section="device"]').textContent).toContain('Altes Skript')
      expect(button('Neu laden')).toBeDefined()
    })
  })
})
