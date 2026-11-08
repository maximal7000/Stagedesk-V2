import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import StopSearch from './StopSearch'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container
function render(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root.render(element) })
  return container
}
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const hbf = [
  { id: '8000237', name: 'Lübeck Hbf', source: 'db', products: ['regional'] },
  { id: '708049', name: 'Lübeck Wahmstraße', source: 'nahsh', products: ['bus'] },
]

describe('StopSearch', () => {
  it('sucht in der gewählten Quelle und nennt die Quelle jedes Treffers', async () => {
    vi.useFakeTimers()
    const search = vi.fn(() => Promise.resolve(hbf))
    const el = render(<StopSearch onSelect={() => {}} search={search} sourcePicker={{ dbConfigured: true }} />)
    const picker = el.querySelector('[aria-label="Suchen in"]')
    await act(async () => { [...picker.querySelectorAll('button')].find((b) => b.textContent === 'Deutsche Bahn').click() })
    const input = el.querySelector('input')
    await act(async () => { input.focus(); typeInto(input, 'Lübeck Hbf') })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(search).toHaveBeenLastCalledWith('Lübeck Hbf', 10, 'db')
    expect([...el.querySelectorAll('[role="option"]')].map((o) => o.textContent))
      .toEqual(['Lübeck HbfZug · DB', 'Lübeck WahmstraßeBus · NAH.SH'])
  })

  it('ohne DB-Zugang auf dem Server gibt es Deutsche Bahn nicht zur Auswahl', () => {
    const el = render(<StopSearch onSelect={() => {}} search={vi.fn()} sourcePicker={{ dbConfigured: false }} />)
    expect([...el.querySelectorAll('[aria-label="Suchen in"] button')].map((b) => b.textContent)).toEqual(['Beide', 'NAH.SH'])
    expect(el.querySelector('[data-db-missing]').textContent).toBe('Deutsche Bahn: auf dem Server nicht eingerichtet')
  })

  it('ohne Auswahl wie bisher: beide Quellen, keine Quellenangabe', async () => {
    vi.useFakeTimers()
    const search = vi.fn(() => Promise.resolve(hbf))
    const el = render(<StopSearch onSelect={() => {}} search={search} />)
    expect(el.querySelector('[aria-label="Suchen in"]')).toBeNull()
    const input = el.querySelector('input')
    await act(async () => { input.focus(); typeInto(input, 'Lübeck') })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(search).toHaveBeenLastCalledWith('Lübeck', 10, 'all')
    expect(el.querySelector('[role="option"]').textContent).toBe('Lübeck HbfZug')
  })
})
