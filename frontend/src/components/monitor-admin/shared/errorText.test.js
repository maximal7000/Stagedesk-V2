import { describe, it, expect } from 'vitest'
import { errorText } from './errorText'

describe('errorText', () => {
  it('nimmt die Meldung des Servers', () => {
    expect(errorText({ response: { status: 422, data: { detail: 'Das Enddatum liegt vor dem Startdatum.' } } }))
      .toBe('Das Enddatum liegt vor dem Startdatum.')
    expect(errorText({ response: { status: 403, data: { message: 'Keine Berechtigung' } } })).toBe('Keine Berechtigung')
  })

  it('zeigt nie die englische axios-Meldung', () => {
    expect(errorText({ message: 'Network Error' })).toBe('Keine Verbindung zum Server. Bitte die Verbindung prüfen und erneut versuchen.')
    expect(errorText({ message: 'Request failed with status code 500', response: { status: 500, data: '<html>' } }))
      .toBe('Der Server hat einen Fehler gemeldet. Bitte später erneut versuchen.')
    expect(errorText({ response: { status: 403, data: {} } })).toBe('Dafür fehlt die Berechtigung. Bitte eine Person mit Admin-Rechten fragen.')
    expect(errorText(new Error('boom'))).toBe('Die Aktion ist fehlgeschlagen. Bitte erneut versuchen.')
  })
})
