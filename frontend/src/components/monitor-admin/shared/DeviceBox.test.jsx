import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', () => ({
  sendDeviceCommand: vi.fn(),
  getDeviceCommand: vi.fn(),
  unpairDevice: vi.fn(() => Promise.resolve({ success: true })),
  revokeDevice: vi.fn(() => Promise.resolve({ success: true })),
}))

const api = await import('./api')
const { toast } = await import('sonner')
const { default: DeviceBox } = await import('./DeviceBox')

const device = (extra = {}) => ({
  id: 5, screen_id: 1, status: 'online', status_text: 'Online', agent_version: '1.0.0', legacy: false, warnings: [],
  last_seen_at: '2026-10-20T09:59:40', last_screenshot_url: null, last_screenshot_at: null,
  telemetry: {
    network: { kind: 'wifi', ssid: 'Technik', signal_dbm: -58, ip: '192.0.2.10' },
    system: { temperature_c: 47, uptime_s: 7200, model: 'Raspberry Pi 4' },
    display: { resolution: '3840x2160', browser_running: true, power: 'on' },
    updates: { last_at: '2026-10-18T03:20:00', last_ok: true, pending_packages: 0 },
  },
  ...extra,
})
const all = (p) => ['signage.view', 'signage.devices', 'signage.power'].includes(p)

let root, container
async function mount(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const onChanged = vi.fn()
  await act(async () => {
    root.render(createElement(DeviceBox, { device: device(), screen: { id: 1, name: 'Glocke' }, can: all, onChanged, ...props }))
  })
  return { onChanged }
}
const button = (text, scope = container) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const click = async (el) => { await act(async () => { el.click() }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => {
  if (root) act(() => root.unmount())
  container?.remove()
  root = undefined
  vi.useRealTimers()
})

describe('DeviceBox', () => {
  it('zeigt Telemetrie in Gruppen mit Stand', async () => {
    await mount()
    const text = container.textContent
    for (const title of ['Netz', 'System', 'Anzeige', 'Updates']) expect(text).toContain(title)
    expect(text).toContain('Stand 09:59')
    expect(text).toContain('Technik')
    expect(text).toContain('3840x2160')
  })

  it('sendet einen Befehl, fragt alle 2 s nach und meldet das Ergebnis als Toast', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 9, kind: 'reload', status: 'pending', result: '' })
    api.getDeviceCommand
      .mockResolvedValueOnce({ id: 9, kind: 'reload', status: 'sent', result: '' })
      .mockResolvedValueOnce({ id: 9, kind: 'reload', status: 'ok', result: '' })
    await mount()
    await click(button('Neu laden'))
    expect(api.sendDeviceCommand).toHaveBeenCalledWith(5, 'reload')
    expect(button('Neu laden').disabled).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(api.getDeviceCommand).toHaveBeenCalledWith(5, 9)
    expect(toast.success).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(toast.success).toHaveBeenCalledWith('Neu laden ist ausgeführt.')
    expect(button('Neu laden').disabled).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(api.getDeviceCommand).toHaveBeenCalledTimes(2)
  })

  it('stoppt das Nachfragen beim Abbau', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 9, kind: 'reload', status: 'pending', result: '' })
    api.getDeviceCommand.mockResolvedValue({ id: 9, kind: 'reload', status: 'sent', result: '' })
    await mount()
    await click(button('Neu laden'))
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(api.getDeviceCommand).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
    root = undefined
    await vi.advanceTimersByTimeAsync(20000)
    expect(api.getDeviceCommand).toHaveBeenCalledTimes(2)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('Neustart fragt nach und sendet erst nach Bestätigung', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 3, kind: 'reboot', status: 'pending', result: '' })
    await mount()
    await click(button('Pi neu starten'))
    const dialog = container.querySelector('[role="alertdialog"]')
    expect(dialog.textContent).toContain('Pi jetzt neu starten? Die Anzeige ist etwa eine Minute weg.')
    await click(button('Abbrechen', dialog))
    expect(api.sendDeviceCommand).not.toHaveBeenCalled()
    await click(button('Pi neu starten'))
    await click(button('Pi neu starten', container.querySelector('[role="alertdialog"]')))
    expect(api.sendDeviceCommand).toHaveBeenCalledWith(5, 'reboot')
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('Update fragt mit der Folge nach', async () => {
    await mount()
    await click(button('Jetzt aktualisieren'))
    expect(container.querySelector('[role="alertdialog"]').textContent)
      .toContain('Updates jetzt installieren? Ein nötiger Neustart wird danach hier angezeigt und nicht automatisch ausgeführt.')
  })

  it('ohne signage.power keine Knöpfe für Bildschirm an und aus', async () => {
    await mount({ can: (p) => p === 'signage.devices' })
    expect(button('Bildschirm an')).toBeUndefined()
    expect(button('Bildschirm aus')).toBeUndefined()
    expect(button('Neu laden')).toBeDefined()
  })

  it('ohne signage.devices keine Befehle und keine Kopplungsaktionen', async () => {
    await mount({ can: (p) => p === 'signage.view' })
    expect(button('Neu laden')).toBeUndefined()
    expect(button('Entkoppeln')).toBeUndefined()
    expect(container.textContent).toContain('Netz')
  })

  it('offline: Hinweis zum Senden', async () => {
    await mount({ device: device({ status: 'offline', status_text: 'Offline · zuletzt gesehen 09:14' }) })
    expect(container.textContent).toContain('Der Befehl wird gesendet, sobald das Gerät wieder verbunden ist (höchstens 5 Minuten).')
  })

  it('failed meldet die Ursache als Fehler', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 4, kind: 'restart_browser', status: 'pending', result: '' })
    api.getDeviceCommand.mockResolvedValue({ id: 4, kind: 'restart_browser', status: 'failed', result: 'Dienst nicht gefunden' })
    await mount()
    await click(button('Browser neu starten'))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(toast.error).toHaveBeenCalledWith('Browser neu starten ist fehlgeschlagen: Dienst nicht gefunden')
  })

  it('Screenshot: nach ok lädt die Seite die Geräteliste neu', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 6, kind: 'screenshot', status: 'pending', result: '' })
    api.getDeviceCommand.mockResolvedValue({ id: 6, kind: 'screenshot', status: 'ok', result: 'Screenshot gespeichert' })
    const { onChanged } = await mount()
    await click(button('Screenshot aufnehmen'))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(onChanged).toHaveBeenCalled()
  })

  it('zeigt den letzten Screenshot mit Zeitpunkt und öffnet ihn groß', async () => {
    await mount({ device: device({ last_screenshot_url: '/media/monitor/s.png', last_screenshot_at: '2026-10-20T09:58:00' }) })
    expect(container.textContent).toContain('Screenshot von Di 20.10., 09:58')
    const thumb = container.querySelector('button[aria-label="Screenshot groß anzeigen"]')
    expect(thumb.querySelector('img').getAttribute('src')).toBe('/media/monitor/s.png')
    await click(thumb)
    expect(container.querySelector('[data-screenshot-large] img')).not.toBeNull()
    await click(button('Schließen'))
    expect(container.querySelector('[data-screenshot-large]')).toBeNull()
  })

  it('Entkoppeln: Nachfrage mit Folge, danach Aufruf und Neuladen', async () => {
    const { onChanged } = await mount()
    await click(button('Entkoppeln'))
    const dialog = container.querySelector('[role="alertdialog"]')
    expect(dialog.textContent).toContain('Der Pi zeigt danach wieder einen Kopplungscode.')
    await click(button('Entkoppeln', dialog))
    expect(api.unpairDevice).toHaveBeenCalledWith(5)
    expect(onChanged).toHaveBeenCalled()
  })

  it('Token zurückziehen ruft revoke', async () => {
    await mount()
    await click(button('Token zurückziehen'))
    const dialog = container.querySelector('[role="alertdialog"]')
    expect(dialog.textContent).toContain('Der Pi zeigt danach wieder einen Kopplungscode.')
    await click(button('Token zurückziehen', dialog))
    expect(api.revokeDevice).toHaveBeenCalledWith(5)
  })

  it('sofort beendeter Befehl: Toast ohne Nachfragen', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 8, kind: 'reload', status: 'ok', result: '' })
    await mount()
    await click(button('Neu laden'))
    expect(toast.success).toHaveBeenCalledWith('Neu laden ist ausgeführt.')
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(api.getDeviceCommand).not.toHaveBeenCalled()
    expect(button('Neu laden').disabled).toBe(false)
  })

  it('nach 2 Minuten ohne Ergebnis: Toast mit Hinweis auf das Protokoll, Knopf wieder frei', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 9, kind: 'reload', status: 'pending', result: '' })
    api.getDeviceCommand.mockResolvedValue({ id: 9, kind: 'reload', status: 'sent', result: '' })
    await mount()
    await click(button('Neu laden'))
    await act(async () => { await vi.advanceTimersByTimeAsync(120000) })
    expect(toast.error).toHaveBeenCalledWith('Neu laden: noch keine Antwort des Geräts. Der Befehl läuft weiter, das Ergebnis steht im Protokoll.')
    expect(button('Neu laden').disabled).toBe(false)
    const calls = api.getDeviceCommand.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(api.getDeviceCommand.mock.calls.length).toBe(calls)
  })

  it('ohne signage.devices: Neu laden nur über onReload, keine Geräte-Befehle', async () => {
    const onReload = vi.fn()
    await mount({ can: (p) => p === 'signage.setup', onReload })
    expect(button('Pi neu starten')).toBeUndefined()
    await click(button('Neu laden'))
    expect(onReload).toHaveBeenCalled()
    expect(api.sendDeviceCommand).not.toHaveBeenCalled()
  })
})
