import { describe, it, expect } from 'vitest'
import { screenStatus } from './ScreenStatus'
import { screensMeta } from '../pages/overviewData'

const now = new Date('2026-10-20T10:00:00')

describe('screenStatus', () => {
  it('ohne CEC-Meldung: Unbekannt', () => {
    expect(screenStatus({ cec_status: '', cec_status_at: null }, now)).toEqual({ state: 'unknown', label: 'Unbekannt', detail: '' })
  })

  it('Meldung innerhalb von 5 min: Online mit CEC-Zustand', () => {
    const s = screenStatus({ cec_status: 'on', cec_status_at: '2026-10-20T09:56:00' }, now)
    expect(s).toEqual({ state: 'online', label: 'Online', detail: 'Bildschirm an' })
  })

  it('ältere Meldung: Offline mit Uhrzeit, an anderen Tagen mit Datum', () => {
    expect(screenStatus({ cec_status: 'on', cec_status_at: '2026-10-20T09:14:00' }, now).detail).toBe('zuletzt gesehen 09:14')
    expect(screenStatus({ cec_status: 'on', cec_status_at: '2026-10-18T17:02:00' }, now).detail).toBe('zuletzt gesehen 18.10., 17:02')
  })
})

describe('screenStatus mit Gerät', () => {
  const cec = { cec_status: 'on', cec_status_at: '2026-10-20T09:58:00' }
  const dev = (status, status_text) => ({ id: 3, status, status_text, legacy: false, warnings: [], telemetry: {} })

  it('ok und warn zählen als online, mit Ton', () => {
    expect(screenStatus(cec, now, dev('online', 'Online'))).toEqual({ state: 'online', label: 'Online', detail: '', tone: 'ok' })
    const warn = screenStatus(cec, now, dev('warning', 'Warnung · Temperatur 83 °C'))
    expect(warn).toEqual({ state: 'online', label: 'Warnung', detail: 'Temperatur 83 °C', tone: 'warn' })
  })

  it('bad ist offline, off ist off', () => {
    expect(screenStatus(cec, now, dev('offline', 'Offline · zuletzt gesehen 09:14'))).toMatchObject({ state: 'offline', tone: 'bad', detail: 'zuletzt gesehen 09:14' })
    expect(screenStatus(cec, now, dev('off', 'Aus · zuletzt gesehen 17:02'))).toMatchObject({ state: 'off', tone: 'off' })
  })

  it('legacy und fehlendes Gerät fallen auf cec_status_at zurück', () => {
    const expected = { state: 'online', label: 'Online', detail: 'Bildschirm an' }
    expect(screenStatus(cec, now, { id: null, status: 'legacy', legacy: true })).toEqual(expected)
    expect(screenStatus(cec, now, undefined)).toEqual(expected)
    expect(screenStatus(cec, now, { id: null, status: 'unpaired', legacy: false })).toEqual(expected)
  })
})

describe('screensMeta', () => {
  const screens = [
    { id: 1, ...{ cec_status_at: null } },
    { id: 2, cec_status: 'on', cec_status_at: '2026-10-20T09:58:00' },
    { id: 3, cec_status: 'on', cec_status_at: '2026-10-20T09:58:00' },
  ]
  it('zählt Geräte-Ampel (Warnung online, offline nicht) und CEC-Rückfall', () => {
    const devices = {
      1: { id: 1, status: 'warning', status_text: 'Warnung · x', legacy: false },
      3: { id: 3, status: 'offline', status_text: 'Offline · zuletzt gesehen 09:00', legacy: false },
    }
    expect(screensMeta(screens, now, devices)).toBe('3 Bildschirme · 2 online')
    expect(screensMeta([screens[0]], now, {})).toBe('1 Bildschirm · 0 online')
  })
})
