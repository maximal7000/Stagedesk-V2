import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { usePreviewToken, PREVIEW_DELAY_MS } from './usePreviewToken'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, latest
function Probe({ payload, screenId, request }) {
  const value = usePreviewToken(payload, screenId, { request })
  useEffect(() => { latest = value })
  return null
}
function render(props) {
  act(() => { root.render(createElement(Probe, props)) })
}
function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

describe('usePreviewToken', () => {
  it('fragt erst nach 600 ms Ruhe an, mit dem letzten Entwurf', async () => {
    const request = vi.fn(() => Promise.resolve({ token: 't-3' }))
    render({ payload: { id: 1, name: 'A' }, screenId: 2, request })
    act(() => { vi.advanceTimersByTime(300) })
    render({ payload: { id: 1, name: 'AB' }, screenId: 2, request })
    act(() => { vi.advanceTimersByTime(300) })
    render({ payload: { id: 1, name: 'ABC' }, screenId: 2, request })
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS - 1) })
    expect(request).not.toHaveBeenCalled()
    expect(latest.pending).toBe(true)
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({ id: 1, name: 'ABC' }, 2)
    expect(latest).toMatchObject({ token: 't-3', error: null, pending: false })
  })

  it('fragt bei gleichem Inhalt (neues Objekt) nicht erneut an', async () => {
    const request = vi.fn(() => Promise.resolve({ token: 't' }))
    render({ payload: { id: 1 }, screenId: null, request })
    await act(async () => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    render({ payload: { id: 1 }, screenId: null, request })
    await act(async () => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('verwirft eine veraltete Antwort, die nach der neueren ankommt', async () => {
    const first = deferred()
    const second = deferred()
    const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render({ payload: { id: 1, style: 'ci' }, screenId: 1, request })
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    render({ payload: { id: 1, style: 'dark' }, screenId: 1, request })
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    expect(request).toHaveBeenCalledTimes(2)
    await act(async () => { second.resolve({ token: 'neu' }) })
    await act(async () => { first.resolve({ token: 'alt' }) })
    expect(latest.token).toBe('neu')
  })

  it('meldet Fehler und vergisst den alten Token', async () => {
    const request = vi.fn()
      .mockReturnValueOnce(Promise.resolve({ token: 'ok' }))
      .mockImplementationOnce(() => Promise.reject(Object.assign(new Error('x'), { response: { status: 422, data: { detail: 'Kaputt.' } } })))
    render({ payload: { id: 1 }, screenId: 1, request })
    await act(async () => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    render({ payload: { id: 1, kind: 'x' }, screenId: 1, request })
    await act(async () => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    expect(latest.token).toBe(null)
    expect(latest.error?.response?.data?.detail).toBe('Kaputt.')
    expect(latest.pending).toBe(false)
  })

  it('erneuert den Token, bevor er nach 10 Minuten abläuft', async () => {
    const request = vi.fn(() => Promise.resolve({ token: 't' }))
    render({ payload: { id: 1 }, screenId: 1, request })
    await act(async () => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(9 * 60 * 1000 - PREVIEW_DELAY_MS) })
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('ignoriert eine Antwort nach dem Abbau', async () => {
    const pending = deferred()
    const request = vi.fn(() => pending.promise)
    render({ payload: { id: 1 }, screenId: 1, request })
    act(() => { vi.advanceTimersByTime(PREVIEW_DELAY_MS) })
    act(() => root.unmount())
    await act(async () => { pending.resolve({ token: 'spät' }) })
    expect(latest.token).toBe(null)
    root = createRoot(container)
  })
})
