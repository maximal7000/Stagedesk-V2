import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const perms = new Set()
vi.mock('../../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: (p) => perms.has(p) }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../shared/api', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  checkWebuntis: vi.fn(),
  getDevices: vi.fn(),
  getScreens: vi.fn(),
  getEmergencyTemplates: vi.fn(),
  updateEmergencyTemplate: vi.fn(),
  createEmergencyTemplate: vi.fn(),
  deleteEmergencyTemplate: vi.fn(),
}))

const api = await import('../shared/api')
const { default: Settings } = await import('./Settings')

const settings = () => ({
  weather_api_key: '', weather_api_key_set: false, webuntis_server: 'neilo.webuntis.com', webuntis_school: 'katharineum',
  webuntis_username: 'monitor', webuntis_password: '', webuntis_password_set: true,
  on_air_text: 'ON AIR', on_air_animation: 'pulse', on_air_show_clock: true, webuntis_source: '', webuntis_checked_at: null,
  device_offline_minutes: 10, warn_temperature_c: 80, warn_disk_percent: 90, warn_wifi_dbm: -75, warn_reboot_days: 7,
  require_device_token: false,
  color_scheme: 'light', light_from: '07:00', light_until: '18:00', daylight_today: { sunrise: '07:58', sunset: '18:12' },
})

let root, container
async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Settings))) })
}
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const byLabel = (text) => [...container.querySelectorAll('label')].find((l) => l.textContent === text)?.control
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const click = async (el) => { await act(async () => { el.click() }) }

beforeEach(() => {
  perms.clear()
  vi.clearAllMocks()
  api.getSettings.mockResolvedValue(settings())
  api.getDevices.mockResolvedValue([{ id: null, screen_id: 4, legacy: true }])
  api.getScreens.mockResolvedValue([{ id: 4, name: 'Mensa' }, { id: 5, name: 'Aula' }])
  api.getEmergencyTemplates.mockResolvedValue([
    { id: 1, title: 'Räumung', text: 'Raus', note: '', sort_order: 0 },
    { id: 2, title: 'Unwetter', text: 'Drinnen', note: '', sort_order: 1 },
  ])
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Settings', () => {
  it('Passwort: gespeichert als Platzhalter, leer bleibt unverändert, nur geänderte Felder gehen raus', async () => {
    perms.add('signage.setup')
    api.updateSettings.mockResolvedValue({ ...settings(), webuntis_school: 'neu' })
    await mount()
    const password = byLabel('Passwort')
    expect(password.value).toBe('')
    expect(password.placeholder).toBe('Gespeichert')
    await act(async () => { typeInto(byLabel('Schule'), 'neu') })
    await click(button('Speichern'))
    expect(api.updateSettings).toHaveBeenCalledTimes(1)
    expect(api.updateSettings).toHaveBeenCalledWith({ webuntis_school: 'neu' })
  })

  it('On-Air und Einrichtung getrennt gespeichert; ohne setup nur On-Air bearbeitbar', async () => {
    perms.add('signage.onair')
    api.updateSettings.mockResolvedValue({ ...settings(), on_air_text: 'LIVE' })
    await mount()
    expect(byLabel('Schule').disabled).toBe(true)
    expect(container.querySelector('[data-section="emergency-templates"]')).toBeNull()
    expect(container.querySelector('[data-section="transit"]')).toBeNull()
    await act(async () => { typeInto(byLabel('Text'), 'LIVE') })
    await click(button('Speichern'))
    expect(api.updateSettings).toHaveBeenCalledWith({ on_air_text: 'LIVE' })
  })

  it('Verbindung testen zeigt die Quelle als Satz und ist bei ungespeicherten Zugangsdaten gesperrt', async () => {
    perms.add('signage.setup')
    api.checkWebuntis.mockResolvedValue({ login: true, substitutions: true, timetable: true, source: 'substitutions' })
    await mount()
    await click(button('Verbindung testen'))
    expect(container.querySelector('[data-check-result]').textContent).toBe('Vertretungen werden direkt abgerufen.')
    await act(async () => { typeInto(byLabel('Server'), 'anders.webuntis.com') })
    expect(button('Verbindung testen').disabled).toBe(true)
  })

  it('Notfall-Vorlagen: Verschieben per Pfeiltaste speichert die neue Reihenfolge', async () => {
    perms.add('signage.emergency')
    api.updateEmergencyTemplate.mockResolvedValue({})
    await mount()
    const grip = container.querySelector('[aria-label="Räumung verschieben"]')
    await act(async () => { grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    await click(button('Speichern'))
    expect(api.updateEmergencyTemplate.mock.calls).toEqual([
      [2, { title: 'Unwetter', text: 'Drinnen', note: '', sort_order: 0 }],
      [1, { title: 'Räumung', text: 'Raus', note: '', sort_order: 1 }],
    ])
    expect(api.createEmergencyTemplate).not.toHaveBeenCalled()
  })

  it('Passwort entfernen behält ungespeicherte Änderungen der anderen Felder', async () => {
    perms.add('signage.setup')
    api.updateSettings.mockResolvedValue({ ...settings(), webuntis_password_set: false })
    await mount()
    await act(async () => { typeInto(byLabel('Schule'), 'neu') })
    await click(button('Gespeichertes Passwort entfernen'))
    await click(button('Entfernen'))
    expect(api.updateSettings).toHaveBeenCalledWith({ webuntis_password_clear: true })
    expect(byLabel('Schule').value).toBe('neu')
    expect(byLabel('Passwort').placeholder).toBe('Nicht gesetzt')
    expect(container.textContent).toContain('1 ungespeicherte Änderung')
  })

  it('zeigt keinen ÖPNV-Abschnitt mehr (gehört zur Ansicht)', async () => {
    perms.add('signage.setup')
    await mount()
    expect(container.querySelector('[data-section="transit"]')).toBeNull()
  })

  it('nach dem Speichern nur eines neuen Passworts ist der Entwurf sauber und der Test wieder möglich', async () => {
    perms.add('signage.setup')
    api.updateSettings.mockResolvedValue(settings())
    await mount()
    await act(async () => { typeInto(byLabel('Passwort'), 'neu') })
    expect(container.textContent).toContain('1 ungespeicherte Änderung')
    expect(button('Verbindung testen').disabled).toBe(true)
    await click(button('Speichern'))
    expect(api.updateSettings).toHaveBeenCalledWith({ webuntis_password: 'neu' })
    expect(container.textContent).not.toContain('ungespeicherte Änderung')
    expect(byLabel('Passwort').value).toBe('')
    expect(button('Verbindung testen').disabled).toBe(false)
  })

  it('Geräte: Payload nur mit geänderten Feldern, Hinweis zu altem Skript', async () => {
    perms.add('signage.setup')
    api.updateSettings.mockResolvedValue({ ...settings(), warn_temperature_c: 70, require_device_token: true })
    await mount()
    expect(container.querySelector('[data-section="devices"]').textContent).toContain('Noch mit altem Skript: Mensa.')
    await act(async () => { typeInto(byLabel('Warnung ab Temperatur'), '70') })
    await click(byLabel('Nur Geräte mit Token zulassen'))
    await click(button('Speichern'))
    expect(api.updateSettings).toHaveBeenCalledTimes(1)
    expect(api.updateSettings).toHaveBeenCalledWith({ warn_temperature_c: 70, require_device_token: true })
  })

  it('Geräte: Wert außerhalb des Bereichs blockiert das Speichern mit Hinweis', async () => {
    perms.add('signage.setup')
    await mount()
    await act(async () => { typeInto(byLabel('Offline melden nach'), '1') })
    await click(button('Speichern'))
    expect(api.updateSettings).not.toHaveBeenCalled()
    const { toast } = await import('sonner')
    expect(toast.error).toHaveBeenCalledWith('Offline melden nach ungültig (ganze Zahl von 2 bis 240).')
  })

  it('Geräte: ohne altes Skript steht der Hinweis für alle Bildschirme, ohne Recht nur lesend', async () => {
    perms.add('signage.view')
    api.getDevices.mockResolvedValue([])
    await mount()
    expect(container.querySelector('[data-section="devices"]').textContent).toContain('Aktuell meldet sich kein Bildschirm mit altem Skript.')
    expect(byLabel('Warnung ab Temperatur').disabled).toBe(true)
  })

  it('Geräte: Installationsbefehl mit Kopieren', async () => {
    perms.add('signage.setup')
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await mount()
    const cmd = `curl -fsSL ${window.location.origin}/api/signage/agent/install.sh | sudo bash`
    expect(container.querySelector('[data-install-command]').textContent).toBe(cmd)
    await click(button('Kopieren'))
    expect(writeText).toHaveBeenCalledWith(cmd)
  })

  it('Farbschema: Zeitfelder nur bei Zeitplan, Tageslicht-Text mit Werten, nur Geändertes gesendet', async () => {
    perms.add('signage.setup')
    api.updateSettings.mockResolvedValue({ ...settings(), color_scheme: 'schedule', light_until: '17:30' })
    await mount()
    const radio = (t) => [...container.querySelectorAll('[role="radiogroup"][aria-label="Farbschema"] button')].find((b) => b.textContent === t)
    expect(radio('Hell').getAttribute('aria-checked')).toBe('true')
    expect(byLabel('Hell von')).toBeUndefined()
    expect(container.textContent).toContain('Einzelne Bildschirme können auf der Bildschirm-Seite immer hell oder immer dunkel bleiben.')
    await click(radio('Tageslicht'))
    expect(container.textContent).toContain('Heute hell von 07:58 bis 18:12.')
    expect(byLabel('Hell von')).toBeUndefined()
    await click(radio('Zeitplan'))
    expect(container.textContent).not.toContain('Heute hell von')
    expect(byLabel('Hell von').value).toBe('07:00')
    await act(async () => { typeInto(byLabel('bis'), '17:30') })
    await click(button('Speichern'))
    expect(api.updateSettings).toHaveBeenCalledTimes(1)
    expect(api.updateSettings).toHaveBeenCalledWith({ color_scheme: 'schedule', light_until: '17:30' })
  })

  it('Farbschema ohne Recht nur lesend', async () => {
    await mount()
    const group = container.querySelector('[role="radiogroup"][aria-label="Farbschema"]')
    expect([...group.querySelectorAll('button')].every((b) => b.disabled)).toBe(true)
  })
})
