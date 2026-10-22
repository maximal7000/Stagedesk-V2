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

// Derselbe Takt, aber nur minutengenau: der Wert ändert sich (und rendert neu) nur beim Minutenwechsel.
// Für Minutenangaben wie "in 6 min" oder Countdown-Tage.
const getMinute = () => Math.floor(current.getTime() / 60000)

export function useClockMinute() {
  return new Date(useSyncExternalStore(subscribe, getMinute) * 60000)
}
