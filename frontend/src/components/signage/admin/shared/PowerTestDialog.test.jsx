import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./api', () => ({ sendDeviceCommand: vi.fn(), getDeviceCommand: vi.fn() }))

const api = await import('./api')
const { default: PowerTestDialog } = await import('./PowerTestDialog')

const device = { id: 5, status: 'online', legacy: false }
const screen = { id: 1, name: 'Glocke', location: 'Eingangshalle' }
const CONFIG = { cec_device: '0' }

const started = (seconds = 15) => ({
  id: 8, kind: 'power_test', status: 'ok', result: JSON.stringify({ off_at: new Date(Date.now()).toISOString(), seconds }),
})
const ended = { id: 9, kind: 'power_test_end', status: 'ok', result: 'Bildschirm wird eingeschaltet' }

let root, container
async function mount(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const onAdopt = vi.fn()
  const onClose = vi.fn()
  await act(async () => {
    root.render(createElement(PowerTestDialog, {
      device, screen, method: 'cec', config: CONFIG, order: ['cec', 'hdmi'], onAdopt, onClose, ...props,
    }))
  })
  return { onAdopt, onClose }
}
const dialog = () => container.querySelector('[role="dialog"]')
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const click = async (el) => { await act(async () => { el.click() }) }
const wait = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-25T10:43:02'))
})
afterEach(() => {
  if (root) act(() => root.unmount())
  container?.remove()
  root = undefined
  vi.useRealTimers()
})

describe('PowerTestDialog', () => {
  it('Testen: Countdown, dann Rückfrage; Ja übernimmt', async () => {
    api.sendDeviceCommand.mockResolvedValue(started())
    const { onAdopt, onClose } = await mount()
    expect(api.sendDeviceCommand).toHaveBeenCalledWith(5, 'power_test', { method: 'cec', config: CONFIG, seconds: 15 })
    expect(dialog().textContent).toContain('CEC testen')
    expect(dialog().textContent).toContain('Glocke')
    expect(dialog().textContent).toContain('Eingangshalle')
    expect(container.querySelector('[data-countdown]').textContent).toBe('0:15')
    expect(dialog().textContent).toContain('Ausschalten gesendet (10:43:02)')
    expect(document.activeElement).toBe(button('Abbrechen und einschalten'))
    await wait(4000)
    expect(container.querySelector('[data-countdown]').textContent).toBe('0:11')
    expect(dialog().textContent).toContain('Einschalten in 11 Sekunden')
    await wait(11000)
    expect(container.querySelector('[data-countdown]')).toBeNull()
    expect(dialog().textContent).toContain('Ist der Bildschirm aus- und wieder angegangen?')
    expect(dialog().textContent).toContain('Nur „Ja“, wenn er wirklich dunkel war, nicht nur „Kein Signal“ gezeigt hat.')
    expect(document.activeElement).toBe(button('Ja, CEC übernehmen'))
    await click(button('Ja, CEC übernehmen'))
    expect(onAdopt).toHaveBeenCalledWith('cec', CONFIG)
    expect(onClose).toHaveBeenCalled()
    expect(api.sendDeviceCommand).toHaveBeenCalledTimes(1)
  })

  it('Nein springt zur nächsten Methode, am Ende Keine Steuerung', async () => {
    api.sendDeviceCommand.mockImplementation(() => Promise.resolve(started()))
    const { onAdopt } = await mount()
    await wait(15000)
    await click(button('Nein, nächste Methode testen'))
    expect(api.sendDeviceCommand).toHaveBeenLastCalledWith(5, 'power_test', { method: 'hdmi', config: { output: 'HDMI-A-1' }, seconds: 15 })
    expect(dialog().textContent).toContain('HDMI-Ausgang testen')
    await wait(15000)
    expect(button('Nein, nächste Methode testen')).toBeUndefined()
    await click(button('Nein'))
    expect(dialog().textContent).toContain('Keine Steuerung')
    expect(dialog().textContent).toContain('Das Display bleibt an und zeigt außerhalb des Zeitplans einen dunklen Bildschirm mit Uhr.')
    await click(button('Keine Steuerung übernehmen'))
    expect(onAdopt).toHaveBeenCalledWith('none', {})
  })

  it('Abbrechen und einschalten und Schließen senden power_test_end', async () => {
    api.sendDeviceCommand.mockImplementation((id, kind) => Promise.resolve(kind === 'power_test' ? started() : ended))
    const first = await mount()
    await wait(3000)
    await click(button('Abbrechen und einschalten'))
    expect(api.sendDeviceCommand).toHaveBeenLastCalledWith(5, 'power_test_end')
    expect(first.onClose).toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()

    vi.clearAllMocks()
    const second = await mount()
    await click(container.querySelector('button[aria-label="Schließen"]'))
    expect(api.sendDeviceCommand).toHaveBeenLastCalledWith(5, 'power_test_end')
    expect(second.onClose).toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()

    vi.clearAllMocks()
    const third = await mount()
    await act(async () => {
      dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(api.sendDeviceCommand).toHaveBeenLastCalledWith(5, 'power_test_end')
    expect(api.sendDeviceCommand.mock.calls.filter((c) => c[1] === 'power_test_end')).toHaveLength(1)
    expect(third.onClose).toHaveBeenCalled()
  })

  it('nach der Rückfrage sendet Schließen kein power_test_end', async () => {
    api.sendDeviceCommand.mockResolvedValue(started())
    const { onClose } = await mount()
    await wait(15000)
    await click(container.querySelector('button[aria-label="Schließen"]'))
    expect(api.sendDeviceCommand).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('Fehler beim Ausschalten: kein Countdown, Fehlertext', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 8, kind: 'power_test', status: 'failed', result: 'Fehler: CEC antwortet nicht' })
    const { onClose } = await mount()
    expect(container.querySelector('[data-countdown]')).toBeNull()
    expect(container.querySelector('[role="alert"]').textContent).toContain('Fehler: CEC antwortet nicht')
    await wait(20000)
    expect(dialog().textContent).not.toContain('Ist der Bildschirm aus- und wieder angegangen?')
    await click(container.querySelector('button[aria-label="Schließen"]'))
    expect(api.sendDeviceCommand).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('wartet auf die Antwort des Geräts', async () => {
    api.sendDeviceCommand.mockResolvedValue({ id: 8, kind: 'power_test', status: 'pending', result: '' })
    api.getDeviceCommand.mockResolvedValue(started())
    await mount()
    expect(container.querySelector('[data-countdown]')).toBeNull()
    await wait(2000)
    expect(api.getDeviceCommand).toHaveBeenCalledWith(5, 8)
    expect(container.querySelector('[data-countdown]')).not.toBeNull()
  })
})
