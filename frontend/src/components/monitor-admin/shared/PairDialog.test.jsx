import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./api', () => ({ pairDevice: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const api = await import('./api')
const { toast } = await import('sonner')
const { default: PairDialog } = await import('./PairDialog')

const screens = [{ id: 1, name: 'Glocke' }, { id: 2, name: 'Aula' }]
let root, host

function mount(props = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const handlers = { onClose: vi.fn(), onPaired: vi.fn() }
  act(() => { root.render(createElement(PairDialog, { screens, ...handlers, ...props })) })
  return handlers
}

function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const digitInputs = () => [...host.querySelectorAll('[data-code-index]')]
const enterCode = (code) => { const inputs = digitInputs(); code.split('').forEach((d, i) => type(inputs[i], d)) }
const key = (el, k) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
const paste = (el, text) => act(() => {
  const ev = new Event('paste', { bubbles: true, cancelable: true })
  ev.clipboardData = { getData: () => text }
  el.dispatchEvent(ev)
})
const button = (name) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === name)
const click = (el) => act(async () => { el.click() })

afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove()
  root = undefined
  vi.clearAllMocks()
})

describe('PairDialog', () => {
  it('blockiert "Weiter" bei weniger als 6 Ziffern', () => {
    mount()
    enterCode('48291')
    expect(button('Weiter').disabled).toBe(true)
    type(digitInputs()[5], '3')
    expect(button('Weiter').disabled).toBe(false)
  })

  it('zeigt sechs Ziffernfelder mit Beschriftung, 3 + 3 gruppiert', () => {
    mount()
    const inputs = digitInputs()
    expect(inputs).toHaveLength(6)
    expect(host.querySelector('[role="group"]').getAttribute('aria-label')).toBe('Kopplungscode')
    expect(inputs[0].getAttribute('aria-label')).toBe('Ziffer 1 von 6')
    expect(inputs[5].getAttribute('aria-label')).toBe('Ziffer 6 von 6')
    expect(inputs[0].getAttribute('inputmode')).toBe('numeric')
    expect(inputs[0].getAttribute('autocomplete')).toBe('one-time-code')
    expect(inputs[3].className).toContain('ml-4')
  })

  it('akzeptiert nur Ziffern und springt nach der Eingabe ins nächste Feld', () => {
    mount()
    const inputs = digitInputs()
    type(inputs[0], 'a')
    expect(inputs[0].value).toBe('')
    expect(document.activeElement).toBe(inputs[0])
    type(inputs[0], '4')
    expect(inputs[0].value).toBe('4')
    expect(document.activeElement).toBe(inputs[1])
  })

  it('Rücktaste im leeren Feld springt zurück und löscht dort', () => {
    mount()
    enterCode('48')
    const inputs = digitInputs()
    expect(document.activeElement).toBe(inputs[2])
    key(inputs[2], 'Backspace')
    expect(document.activeElement).toBe(inputs[1])
    expect(inputs[1].value).toBe('')
    expect(inputs[0].value).toBe('4')
  })

  it('Pfeiltasten wechseln das Feld', () => {
    mount()
    const inputs = digitInputs()
    key(inputs[0], 'ArrowRight')
    expect(document.activeElement).toBe(inputs[1])
    key(inputs[1], 'ArrowLeft')
    expect(document.activeElement).toBe(inputs[0])
  })

  it('Einfügen verteilt "482 913" auf alle Felder', () => {
    mount()
    paste(digitInputs()[0], '482 913')
    expect(digitInputs().map((i) => i.value).join('')).toBe('482913')
    expect(button('Weiter').disabled).toBe(false)
  })

  it('Einfügen mit Leerzeichen und Zeilenumbruch ignoriert Nichtziffern', () => {
    mount()
    paste(digitInputs()[0], ' 482 \n913 ')
    expect(digitInputs().map((i) => i.value).join('')).toBe('482913')
  })

  it('normalisiert "482 913" zu 482913 und koppelt mit vorhandenem Bildschirm', async () => {
    api.pairDevice.mockResolvedValue({ id: 7, screen_id: 2 })
    const { onPaired } = mount()
    paste(digitInputs()[0], '482 913')
    await click(button('Weiter'))
    host.querySelector('select').value = '2'
    act(() => { host.querySelector('select').dispatchEvent(new Event('change', { bubbles: true })) })
    await click(button('Koppeln'))
    expect(api.pairDevice).toHaveBeenCalledWith({ code: '482913', screen_id: 2 })
    expect(toast.success).toHaveBeenCalledWith('Bildschirm Aula ist gekoppelt.')
    expect(onPaired).toHaveBeenCalled()
  })

  it('legt einen neuen Bildschirm mit Name und Ort an', async () => {
    api.pairDevice.mockResolvedValue({ id: 8, screen_id: 9 })
    mount()
    enterCode('482913')
    await click(button('Weiter'))
    await click([...host.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Neuer Bildschirm'))
    expect(button('Koppeln').disabled).toBe(true)
    type(host.querySelector('input[name="name"]'), ' Foyer ')
    type(host.querySelector('input[name="location"]'), 'Eingang')
    await click(button('Koppeln'))
    expect(api.pairDevice).toHaveBeenCalledWith({ code: '482913', new_screen: { name: 'Foyer', location: 'Eingang' } })
    expect(toast.success).toHaveBeenCalledWith('Bildschirm Foyer ist gekoppelt.')
  })

  it('Codefehler (400): zurück zu Schritt 1 mit der Meldung dort', async () => {
    api.pairDevice.mockRejectedValue({ response: { status: 400, data: { detail: 'Der Code ist ungültig oder abgelaufen. Den Code auf dem Bildschirm prüfen.' } } })
    const { onClose, onPaired } = mount()
    enterCode('482913')
    await click(button('Weiter'))
    host.querySelector('select').value = '1'
    act(() => { host.querySelector('select').dispatchEvent(new Event('change', { bubbles: true })) })
    await click(button('Koppeln'))
    expect(host.querySelector('[data-pair-dialog]').dataset.pairDialog).toBe('1')
    expect(host.querySelector('[role="alert"]').textContent).toContain('Der Code ist ungültig oder abgelaufen.')
    expect(digitInputs().map((i) => i.value).join('')).toBe('482913')
    expect(document.activeElement).toBe(digitInputs()[0])
    expect(onClose).not.toHaveBeenCalled()
    expect(onPaired).not.toHaveBeenCalled()
  })

  it('anderer Fehler: bleibt in Schritt 2', async () => {
    api.pairDevice.mockRejectedValue({ response: { status: 500, data: {} } })
    mount()
    enterCode('482913')
    await click(button('Weiter'))
    host.querySelector('select').value = '1'
    act(() => { host.querySelector('select').dispatchEvent(new Event('change', { bubbles: true })) })
    await click(button('Koppeln'))
    expect(host.querySelector('[data-pair-dialog]').dataset.pairDialog).toBe('2')
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('setzt den Fokus beim Schrittwechsel auf das erste Bedienelement', async () => {
    mount()
    expect(document.activeElement).toBe(digitInputs()[0])
    enterCode('482913')
    await click(button('Weiter'))
    expect(document.activeElement).toBe(host.querySelector('select'))
  })

  it('warnt bei unbekanntem Gerätestand vor dem Verlust des Zugangs', async () => {
    mount({ screens: [{ id: 1, name: 'Glocke', hasDevice: null }, { id: 2, name: 'Aula', hasDevice: false }] })
    enterCode('482913')
    await click(button('Weiter'))
    const select = host.querySelector('select')
    const choose = (v) => act(() => { select.value = v; select.dispatchEvent(new Event('change', { bubbles: true })) })
    choose('1')
    expect(host.textContent).toContain('Ob dieser Bildschirm schon ein Gerät hat, ließ sich nicht laden.')
    expect(host.textContent).not.toContain('(Gerät gekoppelt)')
    choose('2')
    expect(host.textContent).not.toContain('ließ sich nicht laden')
  })
})
