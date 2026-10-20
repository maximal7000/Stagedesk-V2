import { describe, it, expect } from 'vitest'
import { screenStatus } from './ScreenStatus'

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
