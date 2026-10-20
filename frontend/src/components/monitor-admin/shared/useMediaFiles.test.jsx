import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useMediaFiles, POLL_MS } from './useMediaFiles'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, latest
function Probe({ load }) {
  const value = useMediaFiles(load)
  useEffect(() => { latest = value })
  return null
}
const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

describe('useMediaFiles', () => {
  it('fragt alle 3 s ab, solange eine Datei vorbereitet wird, und hört danach auf', async () => {
    const answers = [
      [{ id: 1, status: 'processing' }],
      [{ id: 1, status: 'processing' }],
      [{ id: 1, status: 'ready' }],
    ]
    const load = vi.fn(() => Promise.resolve(answers[Math.min(load.mock.calls.length - 1, answers.length - 1)]))
    act(() => { root.render(createElement(Probe, { load })) })
    await flush()
    expect(load).toHaveBeenCalledTimes(1)
    expect(latest.polling).toBe(true)

    await act(async () => { vi.advanceTimersByTime(POLL_MS) })
    await flush()
    expect(load).toHaveBeenCalledTimes(2)

    await act(async () => { vi.advanceTimersByTime(POLL_MS) })
    await flush()
    expect(load).toHaveBeenCalledTimes(3)
    expect(latest.files[0].status).toBe('ready')
    expect(latest.polling).toBe(false)

    await act(async () => { vi.advanceTimersByTime(POLL_MS * 5) })
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('ohne vorbereitete Datei keine Abfrage', async () => {
    const load = vi.fn(() => Promise.resolve([{ id: 1, status: 'ready' }, { id: 2, status: 'failed' }]))
    act(() => { root.render(createElement(Probe, { load })) })
    await flush()
    await act(async () => { vi.advanceTimersByTime(POLL_MS * 3) })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('räumt das Intervall beim Verlassen auf', async () => {
    const load = vi.fn(() => Promise.resolve([{ id: 1, status: 'processing' }]))
    act(() => { root.render(createElement(Probe, { load })) })
    await flush()
    act(() => root.unmount())
    await act(async () => { vi.advanceTimersByTime(POLL_MS * 3) })
    expect(load).toHaveBeenCalledTimes(1)
    root = createRoot(container)
  })

  it('eine ältere Antwort überschreibt keine neuere', async () => {
    let first
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise((ok) => { first = ok }))
      .mockImplementationOnce(() => Promise.resolve([{ id: 2, status: 'ready' }]))
    act(() => { root.render(createElement(Probe, { load })) })
    await act(async () => { await latest.reload() })
    expect(latest.files).toEqual([{ id: 2, status: 'ready' }])
    await act(async () => { first([{ id: 1, status: 'processing' }]) })
    expect(latest.files).toEqual([{ id: 2, status: 'ready' }])
  })
})
