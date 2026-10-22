import { describe, it, expect } from 'vitest'
import { errorText } from './errorText'

describe('errorText', () => {
  it('nimmt die Meldung des Servers', () => {
    expect(errorText({ response: { status: 422, data: { detail: 'Enddatum liegt vor dem Startdatum.' } } }))
      .toBe('Enddatum liegt vor dem Startdatum.')
    expect(errorText({ response: { status: 403, data: { message: 'Keine Berechtigung' } } })).toBe('Keine Berechtigung')
  })

  it('zeigt nie die englische axios-Meldung', () => {
    expect(errorText({ message: 'Network Error' })).toBe('Server nicht erreichbar.')
    expect(errorText({ message: 'Request failed with status code 500', response: { status: 500, data: '<html>' } }))
      .toBe('Serverfehler.')
    expect(errorText({ response: { status: 403, data: {} } })).toBe('Keine Berechtigung.')
    expect(errorText(new Error('boom'))).toBe('Aktion fehlgeschlagen.')
  })

  it('ersetzt die englischen Standardtexte von Django Ninja durch deutsche Sätze', () => {
    expect(errorText({ response: { status: 401, data: { detail: 'Unauthorized' } } }))
      .toBe('Anmeldung abgelaufen.')
    expect(errorText({ response: { status: 403, data: { detail: 'Forbidden' } } }))
      .toBe('Keine Berechtigung.')
    expect(errorText({ response: { status: 404, data: { detail: 'Not Found' } } }))
      .toBe('Eintrag nicht gefunden.')
    expect(errorText({ response: { status: 500, data: { detail: 'Internal Server Error' } } }))
      .toBe('Serverfehler.')
    expect(errorText({ response: { status: 405, data: { detail: 'Method Not Allowed' } } }))
      .toBe('Aktion fehlgeschlagen.')
  })

  it('eigene deutsche Meldungen des Backends bleiben auch bei 403 und 404', () => {
    expect(errorText({ response: { status: 404, data: { detail: 'Vorschau abgelaufen.' } } }))
      .toBe('Vorschau abgelaufen.')
  })
})
