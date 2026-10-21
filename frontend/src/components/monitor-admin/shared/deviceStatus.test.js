import { describe, it, expect } from 'vitest'
import { deviceStatusView, deviceFacts, normalizeCode, isCompleteCode } from './deviceStatus'

const base = { id: 1, screen_id: 1, agent_version: '1.2.0', telemetry: {}, warnings: [], legacy: false }

describe('deviceStatusView', () => {
  it('online: grün, nur "Online"', () => {
    expect(deviceStatusView({ ...base, status: 'online', status_text: 'Online' })).toEqual({ tone: 'ok', label: 'Online', detail: '' })
  })

  it('warning: gelb mit dem ersten Warnungstext', () => {
    const device = { ...base, status: 'warning', status_text: 'Warnung · Temperatur 83 °C', warnings: [{ code: 'temperature', text: 'Temperatur 83 °C' }, { code: 'disk', text: 'Speicher 91 % belegt' }] }
    expect(deviceStatusView(device)).toEqual({ tone: 'warn', label: 'Warnung', detail: 'Temperatur 83 °C' })
  })

  it('offline: rot mit "zuletzt gesehen HH:MM"', () => {
    const device = { ...base, status: 'offline', status_text: 'Offline · zuletzt gesehen 09:14' }
    expect(deviceStatusView(device)).toEqual({ tone: 'bad', label: 'Offline', detail: 'zuletzt gesehen 09:14' })
  })

  it('offline ohne Text vom Server: Uhrzeit aus last_seen_at', () => {
    const view = deviceStatusView({ ...base, status: 'offline', status_text: '', last_seen_at: '2026-10-20T09:14:00' })
    expect(view).toEqual({ tone: 'bad', label: 'Offline', detail: 'zuletzt gesehen 09:14' })
  })

  it('off: grau', () => {
    const device = { ...base, status: 'off', status_text: 'Aus · zuletzt gesehen 17:02' }
    expect(deviceStatusView(device)).toEqual({ tone: 'off', label: 'Aus', detail: 'zuletzt gesehen 17:02' })
  })

  it('legacy: "Altes Skript" in Gelb', () => {
    expect(deviceStatusView({ ...base, id: null, status: 'legacy', status_text: 'Altes Skript', legacy: true }))
      .toEqual({ tone: 'warn', label: 'Altes Skript', detail: '' })
  })

  it('unpaired und fehlendes Gerät: "Kein Gerät gekoppelt" ohne Farbe', () => {
    expect(deviceStatusView({ ...base, id: null, status: 'unpaired', status_text: 'Kein Gerät gekoppelt' }))
      .toEqual({ tone: 'none', label: 'Kein Gerät gekoppelt', detail: '' })
    expect(deviceStatusView(undefined)).toEqual({ tone: 'none', label: 'Kein Gerät gekoppelt', detail: '' })
  })

  it('unbekannter Status: neutral, Text des Servers bleibt', () => {
    expect(deviceStatusView({ ...base, status: 'neu', status_text: 'Etwas Neues' }).tone).toBe('none')
  })
})

describe('deviceFacts', () => {
  it('Agent-Version und Messwerte, Warnungsursache markiert', () => {
    const device = { ...base, status: 'warning', warnings: [{ code: 'temperature', text: 'Temperatur 83 °C' }], telemetry: { network: { kind: 'wifi', signal_dbm: -61 }, system: { temperature_c: 83.4 } } }
    expect(deviceFacts(device)).toEqual({
      agent: 'Agent 1.2.0',
      metrics: [{ text: 'WLAN -61 dBm', warn: false }, { text: '83 °C', warn: true }],
    })
  })

  it('Kabel und fehlende Werte erzeugen nichts', () => {
    const device = { ...base, agent_version: '', telemetry: { network: { kind: 'ethernet', signal_dbm: null }, system: { temperature_c: null } } }
    expect(deviceFacts(device)).toEqual({ agent: '', metrics: [] })
  })
})

describe('Kopplungscode', () => {
  it('normalizeCode entfernt Leerzeichen und Nichtziffern', () => {
    expect(normalizeCode('482 913')).toBe('482913')
    expect(normalizeCode(' 482-913 ')).toBe('482913')
  })

  it('isCompleteCode verlangt genau 6 Ziffern', () => {
    expect(isCompleteCode('482 913')).toBe(true)
    expect(isCompleteCode('48291')).toBe(false)
    expect(isCompleteCode('4829133')).toBe(false)
  })
})
