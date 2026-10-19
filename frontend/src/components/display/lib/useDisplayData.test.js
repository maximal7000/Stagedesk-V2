import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { useDisplayData, endpoints } from './useDisplayData'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

class FakeSocket {
  static instances = []
  constructor(url) { this.url = url; FakeSocket.instances.push(this) }
  close() { this.closed = true }
}

const json = (body, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(body) })
const payload = (extra = {}) => ({ screen: { slug: 'eingang' }, view: { kind: 'info' }, reload_requested_at: null, ...extra })

let root, host, latest, fetchMock, reloadMock

function mount(args) {
  function Probe() { latest = useDisplayData(args); return null }
  host = document.createElement('div')
  root = createRoot(host)
  act(() => { root.render(createElement(Probe)) })
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  FakeSocket.instances = []
  fetchMock = vi.fn()
  reloadMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('location', { ...window.location, origin: 'http://localhost:5173', reload: reloadMock })
})
afterEach(() => {
  if (root) act(() => root.unmount())
  root = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('endpoints', () => {
  it('leitet WS-Host aus der API-Basis ab', () => {
    const e = endpoints('https://stagedesk.t410.de/api', { origin: 'https://x' })
    expect(e.display).toBe('https://stagedesk.t410.de/api/monitor/display')
    expect(e.wsBase).toBe('wss://stagedesk.t410.de')
  })
  it('löst eine relative Basis gegen die Origin auf', () => {
    const e = endpoints('/api', { origin: 'http://localhost:5173' })
    expect(e.display).toBe('http://localhost:5173/api/monitor/display')
    expect(e.wsBase).toBe('ws://localhost:5173')
  })
})

describe('useDisplayData', () => {
  it('lädt mit Parametern, speichert im Cache und öffnet den WebSocket', async () => {
    fetchMock.mockImplementation(() => json(payload()))
    mount({ screen: 'eingang', key: 'abc' })
    await flush()
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.pathname).toBe('/api/monitor/display')
    expect(url.searchParams.get('screen')).toBe('eingang')
    expect(url.searchParams.get('key')).toBe('abc')
    expect(latest.state).toBe('ok')
    expect(latest.payload.view.kind).toBe('info')
    expect(localStorage.getItem('stagedesk.display.screen:eingang')).toContain('"kind":"info"')
    expect(FakeSocket.instances[0].url).toMatch(/^wss?:\/\/.+\/ws\/monitor\/display\/eingang\/$/)
  })

  it('zeigt beim Start sofort den Zwischenspeicher', () => {
    localStorage.setItem('stagedesk.display.screen:eingang', JSON.stringify({ payload: payload({ cached: true }), savedAt: Date.now() }))
    fetchMock.mockImplementation(() => new Promise(() => {}))
    mount({ screen: 'eingang' })
    expect(latest.payload.cached).toBe(true)
  })

  it('lädt bei changed neu und lädt die Seite bei reload', async () => {
    fetchMock.mockImplementation(() => json(payload()))
    mount({ screen: 'eingang' })
    await flush()
    const ws = FakeSocket.instances[0]
    await act(async () => { ws.onmessage({ data: JSON.stringify({ type: 'changed' }) }); await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    act(() => { ws.onmessage({ data: JSON.stringify({ type: 'reload' }) }) })
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('lädt die Seite neu, wenn reload_requested_at sich ändert', async () => {
    fetchMock.mockImplementationOnce(() => json(payload()))
    fetchMock.mockImplementationOnce(() => json(payload({ reload_requested_at: '2026-10-19T10:00:00Z' })))
    mount({ screen: 'eingang' })
    await flush()
    await advance(60000)
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('pollt alle 60 s', async () => {
    fetchMock.mockImplementation(() => json(payload()))
    mount({ view: 'foyer' })
    await flush()
    await advance(60000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('geht bei Fehlern auf stale, wiederholt mit Rückoff 5, 10, 30, 60 s und wird nach 120 s lost', async () => {
    fetchMock.mockImplementationOnce(() => json(payload()))
    mount({ screen: 'eingang' })
    await flush()
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))
    await advance(60000)
    expect(latest.state).toBe('stale')
    expect(latest.retryInSeconds).toBe(5)
    const calls = () => fetchMock.mock.calls.length
    const before = calls()
    await advance(5000); expect(calls()).toBe(before + 1)
    await advance(10000); expect(calls()).toBe(before + 2)
    await advance(30000); expect(calls()).toBe(before + 3)
    await advance(60000); expect(calls()).toBe(before + 4)
    expect(latest.state).toBe('lost')
    fetchMock.mockImplementation(() => json(payload()))
    await advance(60000)
    expect(latest.state).toBe('ok')
    expect(latest.retryInSeconds).toBeNull()
  })

  it('meldet bei 404 den Status', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ detail: 'abgelaufen' }) }))
    mount({ preview: 'tok' })
    await flush()
    expect(latest.error).toEqual({ status: 404, detail: 'abgelaufen' })
    expect(localStorage.length).toBe(0)
  })
})
