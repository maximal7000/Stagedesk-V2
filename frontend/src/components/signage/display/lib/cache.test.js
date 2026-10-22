import { describe, it, expect, beforeEach, vi } from 'vitest'
import { save, load } from './cache'

describe('cache', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

  it('speichert und lädt mit Zeitstempel', () => {
    save('screen:eingang', { a: 1 })
    const hit = load('screen:eingang')
    expect(hit.payload).toEqual({ a: 1 })
    expect(typeof hit.savedAt).toBe('number')
  })
  it('liefert null ohne Eintrag oder bei kaputtem JSON', () => {
    expect(load('screen:x')).toBeNull()
    localStorage.setItem('stagedesk.display.screen:y', '{kaputt')
    expect(load('screen:y')).toBeNull()
  })
  it('übersteht einen werfenden localStorage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('voll') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('gesperrt') })
    expect(() => save('screen:a', { a: 1 })).not.toThrow()
    expect(load('screen:a')).toBeNull()
  })
})
