import { useSyncExternalStore } from 'react'

// Gemeinsamer Sekundentakt: alle Aufrufer teilen einen Timer, er läuft nur bei mindestens einem Abonnenten.
const listeners = new Set()
let timer = null
let current = new Date()

function subscribe(listener) {
  listeners.add(listener)
  if (!timer) {
    current = new Date()
    timer = setInterval(() => {
      current = new Date()
      listeners.forEach((l) => l())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getSnapshot = () => current

export function useClock() {
  return useSyncExternalStore(subscribe, getSnapshot)
}
