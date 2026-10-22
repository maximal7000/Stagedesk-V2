import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useDraft } from './useDraft'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, latest

function Probe({ original }) {
  const value = useDraft(original)
  useEffect(() => { latest = value })
  return null
}
function mount(original) {
  root = createRoot(document.createElement('div'))
  act(() => { root.render(createElement(Probe, { original })) })
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = undefined
})

const screen = () => ({ name: 'Glocke', location: 'Eingangshalle', schedule: [{ days: [0, 1], start: '07:00', end: '17:00' }] })

describe('useDraft', () => {
  it('Ändern und Zurückändern ergibt changedCount 0', () => {
    mount(screen())
    act(() => latest.set('name', 'Aula'))
    expect(latest.changedCount).toBe(1)
    expect(latest.draft.name).toBe('Aula')
    act(() => latest.set('name', 'Glocke'))
    expect(latest.changedCount).toBe(0)
  })

  it('vergleicht tief: eine gleiche Liste in neuer Instanz zählt nicht als Änderung', () => {
    mount(screen())
    act(() => latest.set('schedule', [{ days: [0, 1], start: '07:00', end: '17:00' }]))
    expect(latest.changedCount).toBe(0)
    act(() => latest.set('schedule.0.end', '18:00'))
    expect(latest.draft.schedule[0].end).toBe('18:00')
    expect(latest.changedCount).toBe(1)
  })

  it('zwei geänderte Felder ergeben 2', () => {
    mount(screen())
    act(() => latest.set('name', 'Aula'))
    act(() => latest.set('location', 'Bühne links'))
    expect(latest.changedCount).toBe(2)
  })

  it('reset verwirft alle Änderungen', () => {
    mount(screen())
    act(() => latest.set('name', 'Aula'))
    act(() => latest.set('location', 'Bühne links'))
    act(() => latest.reset())
    expect(latest.changedCount).toBe(0)
    expect(latest.draft).toEqual(screen())
  })

  it('save ruft fn(draft) auf und übernimmt danach den Entwurf als neues Original', async () => {
    mount(screen())
    act(() => latest.set('name', 'Aula'))
    const fn = vi.fn(() => Promise.resolve())
    await act(() => latest.save(fn))
    expect(fn).toHaveBeenCalledWith({ ...screen(), name: 'Aula' })
    expect(latest.changedCount).toBe(0)
    expect(latest.draft.name).toBe('Aula')
    act(() => latest.reset())
    expect(latest.draft.name).toBe('Aula')
  })

  it('save behält bei einem Fehler die Änderungen und gibt den Fehler weiter', async () => {
    mount(screen())
    act(() => latest.set('name', 'Aula'))
    const fn = vi.fn(() => Promise.reject(new Error('Netz weg')))
    await expect(act(() => latest.save(fn))).rejects.toThrow('Netz weg')
    expect(latest.changedCount).toBe(1)
    expect(latest.saving).toBe(false)
  })

  it('übernimmt ein neues Original (zum Beispiel nach dem Laden) als Ausgangsstand', () => {
    mount(null)
    expect(latest.changedCount).toBe(0)
    act(() => { root.render(createElement(Probe, { original: screen() })) })
    expect(latest.draft).toEqual(screen())
    expect(latest.changedCount).toBe(0)
  })
})

describe('useDraft während des Speicherns', () => {
  it('übernimmt den gespeicherten Stand nicht, wenn sich das Original inzwischen geändert hat', async () => {
    const first = screen()
    mount(first)
    act(() => latest.set('name', 'Aula'))
    let finish
    const fn = vi.fn(() => new Promise((r) => { finish = r }))
    let pending
    act(() => { pending = latest.save(fn) })
    const reloaded = { ...screen(), name: 'Mensa' }
    act(() => { root.render(createElement(Probe, { original: reloaded })) })
    await act(async () => { finish(); await pending })
    expect(latest.draft).toEqual(reloaded)
    expect(latest.changedCount).toBe(0)
  })
})
