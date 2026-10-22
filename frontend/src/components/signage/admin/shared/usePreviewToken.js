// Requests POST /views/preview only after 600 ms without change, drops responses overtaken by a
// newer request and fetches a new token before the 10 minutes (backend cache) run out. The same
// content in a new object does not request again.
import { useEffect, useRef, useState } from 'react'
import { previewView } from './api'
import { errorText } from './errorText'

export const PREVIEW_DELAY_MS = 600
const REFRESH_MS = 9 * 60 * 1000

export function usePreviewToken(payload, screenId, { request = previewView, delay = PREVIEW_DELAY_MS } = {}) {
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState({ key: null, token: null, error: null })
  const seq = useRef(0)
  const key = payload == null ? null : JSON.stringify([payload, screenId ?? null, tick])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (key == null) return undefined
    const mine = ++seq.current
    const [body, screen] = JSON.parse(key)
    const timer = setTimeout(() => {
      request(body, screen).then(
        (res) => { if (mine === seq.current) setResult({ key, token: res?.token ?? null, error: null }) },
        (error) => { if (mine === seq.current) setResult({ key, token: null, error }) },
      )
    }, delay)
    return () => clearTimeout(timer)
  }, [key, request, delay])

  useEffect(() => () => { seq.current += 1 }, [])

  if (key == null) return { token: null, error: null, pending: false }
  // Until the response for the current draft arrives the last token stays visible
  return { token: result.token, error: result.error, pending: result.key !== key }
}

export function previewErrorText(error) {
  const reason = errorText(error, 'Bitte später erneut versuchen.').replace(/[.\s]+$/, '')
  return `Vorschau nicht verfügbar: ${reason}.`
}
