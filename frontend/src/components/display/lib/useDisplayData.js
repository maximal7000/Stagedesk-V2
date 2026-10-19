import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { connectionState, reloadNeeded, LOST_AFTER_MS } from './connection'
import * as cache from './cache'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
const POLL_MS = 60000
const BACKOFF_MS = [5000, 10000, 30000, 60000]

const backoff = (failures) => BACKOFF_MS[Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1]

// Basis für fetch und WebSocket: gleicher Host wie die API (Vite-Proxy im Dev, gleiche Origin in Produktion).
export function endpoints(base = API_BASE, loc = window.location) {
  const apiUrl = new URL(base.replace(/\/+$/, ''), loc.origin)
  const origin = apiUrl.origin
  return {
    display: `${apiUrl.href}/monitor/display`,
    wsBase: origin.replace(/^http/, 'ws'),
  }
}

function cacheKey({ screen, view, preview }) {
  if (preview) return null
  if (screen) return `screen:${screen}`
  if (view) return `view:${view}`
  return null
}

export function useDisplayData({ screen, view, key, preview } = {}) {
  const slugKey = cacheKey({ screen, view, preview })
  const [snapshot, setSnapshot] = useState(() => {
    const hit = slugKey ? cache.load(slugKey) : null
    return { payload: hit?.payload ?? null, lastOkAt: hit?.savedAt ?? null, failed: false, failures: 0, nextRetryAt: null, error: null }
  })
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const [, tick] = useReducer((n) => n + 1, 0)
  const initialReload = useRef(undefined)
  const timerRef = useRef(null)
  const failuresRef = useRef(0)

  const load = useCallback(async () => {
    clearTimeout(timerRef.current)
    const params = new URLSearchParams()
    if (preview) params.set('preview', preview)
    if (screen) params.set('screen', screen)
    else if (view) params.set('view', view)
    if (key) params.set('key', key)
    const qs = params.toString()
    const url = `${endpoints().display}${qs ? '?' + qs : ''}`
    try {
      const res = await fetch(url)
      if (!res.ok) {
        let detail = null
        try { detail = (await res.json())?.detail ?? null } catch { /* kein JSON */ }
        const err = new Error('http')
        err.status = res.status
        err.detail = detail
        throw err
      }
      const json = await res.json()
      if (initialReload.current === undefined) initialReload.current = json.reload_requested_at ?? null
      else if (reloadNeeded(initialReload.current, json.reload_requested_at)) { window.location.reload(); return }
      failuresRef.current = 0
      if (slugKey) cache.save(slugKey, json)
      setSnapshot({ payload: json, lastOkAt: Date.now(), failed: false, failures: 0, nextRetryAt: null, error: null })
      timerRef.current = setTimeout(load, POLL_MS)
    } catch (e) {
      failuresRef.current += 1
      const wait = backoff(failuresRef.current)
      setSnapshot((s) => ({
        ...s,
        failed: true,
        failures: failuresRef.current,
        nextRetryAt: Date.now() + wait,
        error: { status: e.status ?? null, detail: e.detail ?? null },
      }))
      timerRef.current = setTimeout(load, wait)
    }
  }, [screen, view, key, preview, slugKey])

  // Laden, Polling und Wiederholung
  useEffect(() => {
    load()
    return () => clearTimeout(timerRef.current)
  }, [load])

  // Browser-Online-Status: bei Rückkehr sofort neu laden
  useEffect(() => {
    const on = () => { setOnline(true); load() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [load])

  // WebSocket: changed lädt neu, reload lädt die Seite neu. Fehler wirken nur auf die Wiederverbindung.
  useEffect(() => {
    if (!screen || preview) return undefined
    let ws = null
    let closed = false
    let retryTimer = null
    let attempts = 0
    const connect = () => {
      try {
        ws = new WebSocket(`${endpoints().wsBase}/ws/monitor/display/${encodeURIComponent(screen)}/`)
      } catch {
        retryTimer = setTimeout(connect, backoff(++attempts))
        return
      }
      ws.onopen = () => { attempts = 0 }
      ws.onmessage = (ev) => {
        let msg = null
        try { msg = JSON.parse(ev.data) } catch { return }
        if (msg?.type === 'changed') load()
        else if (msg?.type === 'reload') window.location.reload()
      }
      ws.onclose = () => {
        if (closed) return
        retryTimer = setTimeout(connect, backoff(++attempts))
      }
      ws.onerror = () => { try { ws.close() } catch { /* bereits zu */ } }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retryTimer)
      if (ws) { ws.onclose = null; try { ws.close() } catch { /* bereits zu */ } }
    }
  }, [screen, preview, load])

  const now = Date.now()
  const failed = snapshot.failed
  const state = connectionState({ lastOkAt: snapshot.lastOkAt, now, online, failed })

  // Übergang stale -> lost braucht einen Render, auch wenn sonst nichts passiert (einmaliger Timer)
  useEffect(() => {
    if ((!failed && online) || snapshot.lastOkAt == null) return undefined
    const left = snapshot.lastOkAt + LOST_AFTER_MS - Date.now()
    if (left <= 0) return undefined
    const id = setTimeout(tick, left + 50)
    return () => clearTimeout(id)
  }, [failed, online, snapshot.lastOkAt])

  // Countdown zum nächsten Versuch: Sekundentakt nur im Zustand lost
  useEffect(() => {
    if (state !== 'lost') return undefined
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state])

  const retryInSeconds = snapshot.nextRetryAt == null ? null : Math.max(0, Math.ceil((snapshot.nextRetryAt - now) / 1000))

  return {
    payload: snapshot.payload,
    state,
    lastOkAt: snapshot.lastOkAt,
    retryInSeconds,
    error: snapshot.error,
  }
}
