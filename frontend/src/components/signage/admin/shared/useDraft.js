// `original` must be stable (e.g. state from loading): a new object resets the draft.
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
  const source = current.source
  const save = useCallback(async (fn) => {
    setSaving(true)
    try {
      const result = await fn(snapshot)
      // If a new original arrived meanwhile (reloaded) it wins; the old state is not taken over
      setState((s) => (s.source === source ? { ...s, base: snapshot } : s))
      return result
    } finally {
      setSaving(false)
    }
  }, [snapshot, source])

  const changedCount = useMemo(() => countChanges(current.base, current.draft), [current.base, current.draft])

  return { draft: current.draft, set, changedCount, reset, save, saving }
}
