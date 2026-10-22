// Vorschau-Token zum Entwurf (Spec §6.2 Live-Vorschau): fragt POST /views/preview erst nach 600 ms ohne
// Änderung an, verwirft Antworten, die von einer neueren Anfrage überholt wurden, und holt vor Ablauf der
// 10 Minuten (Cache im Backend) einen neuen Token. Gleicher Inhalt in einem neuen Objekt fragt nicht erneut.
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

  // Nach dem Abbau zählt keine Antwort mehr
  useEffect(() => () => { seq.current += 1 }, [])

  if (key == null) return { token: null, error: null, pending: false }
  // Bis die Antwort zum aktuellen Entwurf da ist, bleibt der letzte Token sichtbar
  return { token: result.token, error: result.error, pending: result.key !== key }
}

// "Vorschau nicht verfügbar: <Grund>." mit dem Grund aus der Server-Meldung (ohne doppelten Punkt)
export function previewErrorText(error) {
  const reason = errorText(error, 'Bitte später erneut versuchen.').replace(/[.\s]+$/, '')
  return `Vorschau nicht verfügbar: ${reason}.`
}
