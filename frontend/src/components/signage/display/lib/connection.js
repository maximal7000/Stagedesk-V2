export const LOST_AFTER_MS = 120000

// failed: the last request failed. Without any successful request an error counts as lost at once.
export function connectionState({ lastOkAt, now, online = true, failed = false }) {
  if (!failed && online) return 'ok'
  if (lastOkAt == null) return failed ? 'lost' : 'stale'
  return now - lastOkAt >= LOST_AFTER_MS ? 'lost' : 'stale'
}

// initial: value at page start. A new or changed timestamp requires a reload.
export function reloadNeeded(initial, current) {
  if (current == null) return false
  return (initial ?? null) !== current
}
