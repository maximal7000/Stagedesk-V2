import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { useClock } from './useClock'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useClock', () => {
  it('tickt sekündlich mit einem gemeinsamen Timer und räumt auf', () => {
    const seen = []
    function Probe({ id }) { seen.push([id, useClock().getTime()]); return null }
    const root = createRoot(document.createElement('div'))
    act(() => { root.render(createElement('div', null, createElement(Probe, { id: 'a' }), createElement(Probe, { id: 'b' }))) })
    expect(vi.getTimerCount()).toBe(1)
    const n = seen.length
    act(() => { vi.advanceTimersByTime(3000) })
    expect(seen.length).toBeGreaterThan(n)
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
  })
})
