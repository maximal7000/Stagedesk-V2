import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./api', () => ({ sendDeviceCommand: vi.fn(), getDeviceCommand: vi.fn() }))

const api = await import('./api')
const { default: PowerCheck } = await import('./PowerCheck')

const probe = (methods, recommended) => ({
  id: 7, kind: 'power_probe', status: 'ok',
  result: JSON.stringify({ methods, recommended, checked_at: '2026-10-25T10:42:00' }),
})
const FOUND = probe([
  { method: 'cec', state: 'ok', text: 'Display gefunden: iiyama LH4341UHS. Status lesbar: an.' },
  { method: 'sicp', state: 'skip', text: 'Keine Display-IP eingetragen.' },
  { method: 'ddc', state: 'fail', text: 'Kein DDC-fähiges Display gefunden.' },
  { method: 'hdmi', state: 'warn', text: 'Ausgang HDMI-A-1 da.' },
], 'cec')

const device = (extra = {}) => ({ id: 5, status: 'online', legacy: false, ...extra })
const screen = { id: 1, name: 'Glocke', location: 'Eingangshalle' }

let root, container
async function mount(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const onAdopt = vi.fn()
  const onRecommended = vi.fn()
  await act(async () => {
    root.render(createElement(PowerCheck, {
      device: device(), screen, config: { cec_device: '0' }, canTest: true, onAdopt, onRecommended, ...props,
    }))
  })
  return { onAdopt, onRecommended }
}
const button = (text, scope = document.body) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
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

describe('PowerCheck', () => {
  it('prüft beim Öffnen und zeigt Ampel, Text und Empfehlung', async () => {
    api.sendDeviceCommand.mockResolvedValue(FOUND)
    const { onRecommended } = await mount()
    expect(api.sendDeviceCommand).toHaveBeenCalledWith(5, 'power_probe')
    const rows = [...container.querySelectorAll('[data-probe-row]')]
    expect(rows.map((r) => r.dataset.state)).toEqual(['ok', 'skip', 'fail', 'warn'])
    expect(rows[0].textContent).toContain('CEC')
    expect(rows[0].textContent).toContain('Display gefunden: iiyama LH4341UHS')
    expect(rows[1].textContent).toContain('Netzwerk (SICP)')
    expect(button('Testen', rows[0])).toBeDefined()
    expect(button('Testen', rows[2])).toBeUndefined()
    expect(button('Testen', rows[3])).toBeDefined()
    expect(container.textContent).toContain('Empfehlung: CEC')
    expect(container.textContent).toContain('Geprüft um 10:42 · ohne den Bildschirm auszuschalten')
    expect(onRecommended).toHaveBeenLastCalledWith('cec')
  })

  it('wartet auf das Ergebnis und prüft erneut', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 7, kind: 'power_probe', status: 'pending', result: '' })
    api.getDeviceCommand.mockResolvedValue(FOUND)
    await mount()
    expect(container.querySelector('[data-power-check]').getAttribute('aria-busy')).toBe('true')
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(api.getDeviceCommand).toHaveBeenCalledWith(5, 7)
    expect(container.querySelectorAll('[data-probe-row]')).toHaveLength(4)
    await click(button('Erneut prüfen'))
    expect(api.sendDeviceCommand).toHaveBeenCalledTimes(2)
  })

  it('Empfehlung Keine Steuerung mit Erklärsatz', async () => {
    api.sendDeviceCommand.mockResolvedValue(probe([
      { method: 'cec', state: 'fail', text: 'Kein CEC-Adapter gefunden.' },
      { method: 'ddc', state: 'fail', text: 'Kein DDC-fähiges Display gefunden.' },
    ], 'none'))
    const { onRecommended } = await mount()
    expect(container.textContent).toContain('Empfehlung: Keine Steuerung')
    expect(container.textContent).toContain('Das Display bleibt an und zeigt außerhalb des Zeitplans einen dunklen Bildschirm mit Uhr.')
    expect(button('Testen', container)).toBeUndefined()
    expect(onRecommended).toHaveBeenLastCalledWith('none')
  })

  it('ohne Agent / offline / Fehlertext statt Liste', async () => {
    await mount({ device: device({ id: null, legacy: true, status: 'legacy' }) })
    expect(container.textContent).toContain('Die Prüfung braucht den Geräte-Agent')
    expect(api.sendDeviceCommand).not.toHaveBeenCalled()
    act(() => root.unmount())

    await mount({ device: device({ status: 'offline' }) })
    expect(container.textContent).toContain('Bildschirm ist offline')
    expect(api.sendDeviceCommand).not.toHaveBeenCalled()
    act(() => root.unmount())

    api.sendDeviceCommand.mockResolvedValue({ id: 7, kind: 'power_probe', status: 'failed', result: 'Unbekannter Befehl' })
    await mount()
    expect(container.textContent).toContain('Unbekannter Befehl')
    expect(container.querySelectorAll('[data-probe-row]')).toHaveLength(0)
    expect(button('Erneut prüfen')).toBeDefined()
  })

  it('ohne Testrecht keine Testknöpfe', async () => {
    api.sendDeviceCommand.mockResolvedValue(FOUND)
    await mount({ canTest: false })
    expect(button('Testen', container)).toBeUndefined()
    expect(container.textContent).toContain('Empfehlung: CEC')
  })

  it('Testen öffnet den Test der Zeile', async () => {
    api.sendDeviceCommand.mockResolvedValueOnce(FOUND)
    api.sendDeviceCommand.mockResolvedValueOnce({ id: 8, kind: 'power_test', status: 'failed', result: 'Fehler: CEC antwortet nicht' })
    await mount()
    const hdmi = container.querySelectorAll('[data-probe-row]')[3]
    await click(button('Testen', hdmi))
    expect(api.sendDeviceCommand).toHaveBeenLastCalledWith(5, 'power_test', { method: 'hdmi', config: { output: 'HDMI-A-1' }, seconds: 15 })
    expect(document.querySelector('[role="dialog"]').textContent).toContain('HDMI-Signal testen')
  })
})
