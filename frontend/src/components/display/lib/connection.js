export const LOST_AFTER_MS = 120000

// failed: die letzte Abfrage ist fehlgeschlagen. Ohne je erfolgreiche Abfrage gilt ein Fehler sofort als lost.
export function connectionState({ lastOkAt, now, online = true, failed = false }) {
  if (!failed && online) return 'ok'
  if (lastOkAt == null) return failed ? 'lost' : 'stale'
  return now - lastOkAt >= LOST_AFTER_MS ? 'lost' : 'stale'
}

// initial: Wert beim Seitenstart. Ein neuer oder geänderter Zeitstempel verlangt ein Neuladen.
export function reloadNeeded(initial, current) {
  if (current == null) return false
  return (initial ?? null) !== current
}
