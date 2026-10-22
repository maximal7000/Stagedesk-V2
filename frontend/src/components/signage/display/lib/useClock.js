import { useSyncExternalStore } from 'react'

// All callers share one timer; it only runs with at least one subscriber.
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

// Changes (and re-renders) only when the minute changes.
const getMinute = () => Math.floor(current.getTime() / 60000)

export function useClockMinute() {
  return new Date(useSyncExternalStore(subscribe, getMinute) * 60000)
}
