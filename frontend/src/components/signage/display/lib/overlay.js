import { useSyncExternalStore } from 'react'

// Which side of a split view a busy substitution plan has taken over ('left' / 'right' / null), per view id.
// The split view's main part decides; its footer, a sibling in the frame, reads it to line up with the pair.
const sides = new Map()
const listeners = new Set()

export function setOverlay(viewId, side) {
  if ((sides.get(viewId) ?? null) === side) return
  sides.set(viewId, side)
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useOverlay(viewId) {
  return useSyncExternalStore(subscribe, () => sides.get(viewId) ?? null, () => null)
}
