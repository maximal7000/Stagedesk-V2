import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { useClock, useClockMinute } from './useClock'

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

describe('useClockMinute', () => {
  it('rendert nur beim Minutenwechsel neu', () => {
    vi.setSystemTime(new Date('2026-10-19T10:41:30+02:00'))
    let renders = 0
    let last = null
    function Probe() { renders++; last = useClockMinute(); return null }
    const root = createRoot(document.createElement('div'))
    act(() => { root.render(createElement(Probe)) })
    const first = renders
    act(() => { vi.advanceTimersByTime(20000) })
    expect(renders).toBe(first)
    act(() => { vi.advanceTimersByTime(15000) })
    expect(renders).toBe(first + 1)
    expect(last.getMinutes()).toBe(42)
    expect(last.getSeconds()).toBe(0)
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
  })
})
