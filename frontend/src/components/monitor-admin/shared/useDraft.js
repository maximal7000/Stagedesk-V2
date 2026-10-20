// Speichermodell des Monitor-Admin (Spec §6.2): ein Entwurf über einem Original.
// set('name', v) oder set('schedule.0.end', v) ändert den Entwurf; gezählt werden geänderte Felder der
// obersten Ebene (tiefer Vergleich). save(fn) ruft fn(draft) und macht den gespeicherten Stand zum Original.
// `original` muss stabil sein (zum Beispiel State aus dem Laden): ein neues Objekt setzt den Entwurf zurück.
import { useCallback, useMemo, useState } from 'react'

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

function setIn(target, keys, value) {
  const [head, ...rest] = keys
  const current = target ?? (/^\d+$/.test(head) ? [] : {})
  const next = Array.isArray(current) ? [...current] : { ...current }
  next[head] = rest.length ? setIn(current[head], rest, value) : value
  return next
}

export function countChanges(base, draft) {
  const a = base ?? {}
  const b = draft ?? {}
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let n = 0
  for (const k of keys) if (!deepEqual(a[k], b[k])) n++
  return n
}

export function useDraft(original) {
  const [state, setState] = useState(() => ({ source: original, base: original, draft: original }))
  const [saving, setSaving] = useState(false)

  // Neues Original von außen (geladen oder neu abgerufen): Entwurf und Ausgangsstand neu setzen
  let current = state
  if (state.source !== original) {
    current = { source: original, base: original, draft: original }
    setState(current)
  }

  const set = useCallback((path, value) => {
    const keys = Array.isArray(path) ? path.map(String) : String(path).split('.')
    setState((s) => ({ ...s, draft: setIn(s.draft, keys, value) }))
  }, [])

  const reset = useCallback(() => {
    setState((s) => ({ ...s, draft: s.base }))
  }, [])

  const snapshot = current.draft
  const save = useCallback(async (fn) => {
    setSaving(true)
    try {
      const result = await fn(snapshot)
      setState((s) => ({ ...s, base: snapshot }))
      return result
    } finally {
      setSaving(false)
    }
  }, [snapshot])

  const changedCount = useMemo(() => countChanges(current.base, current.draft), [current.base, current.draft])

  return { draft: current.draft, set, changedCount, reset, save, saving }
}
