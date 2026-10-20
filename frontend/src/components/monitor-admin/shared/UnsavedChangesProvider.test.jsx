import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import UnsavedChangesProvider, { useConfirmLeave, useUnsavedGuard, LEAVE_QUESTION } from './UnsavedChangesProvider'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, confirmLeave

function Page({ dirty }) { useUnsavedGuard(dirty); return null }
function Sidebar() {
  const fn = useConfirmLeave()
  useEffect(() => { confirmLeave = fn })
  return null
}
function render(dirty) {
  act(() => {
    root.render(createElement(UnsavedChangesProvider, null, createElement(Sidebar), dirty === null ? null : createElement(Page, { dirty })))
  })
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = undefined
  vi.restoreAllMocks()
})

describe('UnsavedChangesProvider', () => {
  it('fragt nur bei ungespeicherten Änderungen nach und warnt dann beim Schließen', () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    root = createRoot(document.createElement('div'))
    render(false)
    expect(confirmLeave()).toBe(true)
    expect(ask).not.toHaveBeenCalled()

    render(true)
    expect(confirmLeave()).toBe(false)
    expect(ask).toHaveBeenCalledWith(LEAVE_QUESTION)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)

    render(null)
    expect(confirmLeave()).toBe(true)
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  it('ohne Provider ist Verlassen immer erlaubt', () => {
    root = createRoot(document.createElement('div'))
    act(() => { root.render(createElement(Sidebar)) })
    expect(confirmLeave()).toBe(true)
  })
})
