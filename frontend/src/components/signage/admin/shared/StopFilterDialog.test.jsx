import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./StopSearch', () => ({ default: () => null }))

const { default: StopFilterDialog } = await import('./StopFilterDialog')

let container
let root
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

describe('StopFilterDialog', () => {
  it('wählt die Quelle der Haltestelle', async () => {
    const onApply = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(StopFilterDialog, { stop: { id: '8000237', name: 'Lübeck Hbf' }, onApply, onCancel: () => {} }))
    })
    const select = [...container.querySelectorAll('select')].find((s) => s.labels?.[0]?.textContent === 'Quelle')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Automatisch', 'Deutsche Bahn', 'NAH.SH', 'Beide (zusammengeführt)'])
    expect(select.value).toBe('')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'nahsh')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'Übernehmen').click() })
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: '8000237', source: 'nahsh' }))
  })
})
