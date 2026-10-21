import { describe, it, expect } from 'vitest'
import { deviceStatusView, deviceFacts, normalizeCode, isCompleteCode, reportTime, telemetryGroups } from './deviceStatus'

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

describe('telemetryGroups', () => {
  const device = {
    last_seen_at: '2026-10-20T09:59:40',
    warnings: [{ code: 'temperature', text: 'Temperatur 83 °C' }],
    telemetry: {
      network: { kind: 'wifi', ssid: 'Technik', signal_dbm: -58, ip: '192.0.2.10', mac: null },
      system: { temperature_c: 83.4, throttled_now: false, throttled_since_boot: true, disk_percent: 41, ram_percent: 30, uptime_s: 93784, model: 'Raspberry Pi 4', serial: null, os: 'Debian 12', agent_version: '1.0.0' },
      display: { resolution: '3840x2160', browser_running: true, power: 'on' },
      updates: { last_at: '2026-10-18T03:20:00', last_ok: false, last_error: 'apt: Paket gesperrt', pending_packages: 4, reboot_required_since: null },
    },
  }
  const rows = (groups, title) => Object.fromEntries(groups.find((g) => g.title === title).rows.map((r) => [r.label, r]))

  it('bildet die vier Gruppen und lässt fehlende Werte weg', () => {
    const groups = telemetryGroups(device)
    expect(groups.map((g) => g.title)).toEqual(['Netz', 'System', 'Anzeige', 'Updates'])
    const net = rows(groups, 'Netz')
    expect(net.Verbindung.value).toBe('WLAN')
    expect(net.Signal.value).toBe('-58 dBm')
    expect(net.IP.value).toBe('192.0.2.10')
    expect(net.MAC).toBeUndefined()
    expect(rows(groups, 'System').Seriennummer).toBeUndefined()
  })

  it('formatiert System, Anzeige und Updates, Warnwerte sind markiert', () => {
    const groups = telemetryGroups(device)
    const sys = rows(groups, 'System')
    expect(sys.Temperatur).toMatchObject({ value: '83 °C', warn: true })
    expect(sys.Laufzeit.value).toBe('1 Tag 2 Std')
    expect(sys.Speicher.value).toBe('41 % belegt')
    expect(sys.Drosselung.value).toBe('seit dem Start aufgetreten')
    const disp = rows(groups, 'Anzeige')
    expect(disp.Browser.value).toBe('läuft')
    expect(disp.Bildschirm.value).toBe('an')
    const upd = rows(groups, 'Updates')
    expect(upd['Letzter Lauf'].value).toBe('So 18.10., 03:20')
    expect(upd.Ergebnis).toMatchObject({ value: 'fehlgeschlagen: apt: Paket gesperrt', warn: true })
    expect(upd['Ausstehende Pakete'].value).toBe('4')
  })

  it('ohne Telemetrie keine Gruppen', () => {
    expect(telemetryGroups({ telemetry: {} })).toEqual([])
    expect(telemetryGroups(null)).toEqual([])
  })

  it('stand nennt die letzte Meldung als HH:MM', () => {
    expect(reportTime(device)).toBe('09:59')
    expect(reportTime({ last_seen_at: null })).toBe('')
  })
})
