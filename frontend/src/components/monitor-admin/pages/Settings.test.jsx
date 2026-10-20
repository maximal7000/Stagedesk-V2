import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const perms = new Set()
vi.mock('../../../contexts/UserContext', () => ({ useUser: () => ({ hasPermission: (p) => perms.has(p) }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../shared/api', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  checkWebuntis: vi.fn(),
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
    perms.add('monitor.setup')
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
    perms.add('monitor.onair')
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
    perms.add('monitor.setup')
    api.checkWebuntis.mockResolvedValue({ login: true, substitutions: true, timetable: true, source: 'substitutions' })
    await mount()
    await click(button('Verbindung testen'))
    expect(container.querySelector('[data-check-result]').textContent).toBe('Vertretungen werden direkt abgerufen.')
    await act(async () => { typeInto(byLabel('Server'), 'anders.webuntis.com') })
    expect(button('Verbindung testen').disabled).toBe(true)
  })

  it('Notfall-Vorlagen: Verschieben per Pfeiltaste speichert die neue Reihenfolge', async () => {
    perms.add('monitor.emergency')
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
    perms.add('monitor.setup')
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
    perms.add('monitor.setup')
    await mount()
    expect(container.querySelector('[data-section="transit"]')).toBeNull()
  })
})
