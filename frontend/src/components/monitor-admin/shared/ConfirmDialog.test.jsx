import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import ConfirmDialog from './ConfirmDialog'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, host

function mount(props) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root.render(createElement(ConfirmDialog, { title: 'Löschen?', confirmLabel: 'Löschen', ...props })) })
}

function key(target, k, extra = {}) {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra })
  act(() => { target.dispatchEvent(event) })
  return event
}

afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove()
  root = undefined
})

describe('ConfirmDialog', () => {
  it('schließt mit Escape im Dialog, ohne dass die Taste die Seite erreicht', () => {
    const onCancel = vi.fn()
    const onWindow = vi.fn()
    window.addEventListener('keydown', onWindow)
    mount({ onCancel, onConfirm: vi.fn() })
    key(document.activeElement, 'Escape')
    window.removeEventListener('keydown', onWindow)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onWindow).not.toHaveBeenCalled()
  })

  it('reagiert nicht auf Escape außerhalb des Dialogs', () => {
    const onCancel = vi.fn()
    mount({ onCancel, onConfirm: vi.fn() })
    key(document.body, 'Escape')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('hält den Fokus mit Tab im Dialog', () => {
    mount({ onCancel: vi.fn(), onConfirm: vi.fn() })
    const [cancel, confirm] = host.querySelectorAll('button')
    expect(document.activeElement).toBe(cancel)
    confirm.focus()
    const forward = key(confirm, 'Tab')
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(cancel)
    const back = key(cancel, 'Tab', { shiftKey: true })
    expect(back.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(confirm)
  })
})
