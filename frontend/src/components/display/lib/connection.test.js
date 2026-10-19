import { describe, it, expect } from 'vitest'
import { connectionState, reloadNeeded } from './connection'

describe('connectionState', () => {
  it('ist ok ohne Fehler', () => {
    expect(connectionState({ lastOkAt: 1000, now: 1000, online: true })).toBe('ok')
  })
  it('ist stale ab dem ersten Fehler', () => {
    expect(connectionState({ lastOkAt: 0, now: 30000, online: true, failed: true })).toBe('stale')
  })
  it('ist stale bei offline', () => {
    expect(connectionState({ lastOkAt: 0, now: 30000, online: false })).toBe('stale')
  })
  it('ist lost ab 120 s', () => {
    expect(connectionState({ lastOkAt: 0, now: 119999, online: true, failed: true })).toBe('stale')
    expect(connectionState({ lastOkAt: 0, now: 120000, online: true, failed: true })).toBe('lost')
    expect(connectionState({ lastOkAt: 0, now: 121000, online: false })).toBe('lost')
  })
  it('ist lost bei Fehler ohne je erfolgreiche Abfrage', () => {
    expect(connectionState({ lastOkAt: null, now: 5000, online: true, failed: true })).toBe('lost')
  })
  it('ist ok vor der ersten Antwort ohne Fehler', () => {
    expect(connectionState({ lastOkAt: null, now: 5000, online: true })).toBe('ok')
  })
})

describe('reloadNeeded', () => {
  it('ist true von null auf einen Zeitstempel', () => {
    expect(reloadNeeded(null, '2026-10-19T10:00:00Z')).toBe(true)
  })
  it('ist false bei gleichen Werten', () => {
    const x = '2026-10-19T10:00:00Z'
    expect(reloadNeeded(x, x)).toBe(false)
    expect(reloadNeeded(null, null)).toBe(false)
  })
  it('ist true bei geändertem Zeitstempel', () => {
    expect(reloadNeeded('2026-10-19T10:00:00Z', '2026-10-19T10:05:00Z')).toBe(true)
  })
  it('ist false wenn der aktuelle Wert fehlt', () => {
    expect(reloadNeeded('2026-10-19T10:00:00Z', null)).toBe(false)
  })
})
