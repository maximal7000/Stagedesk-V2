import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../shared/api', () => ({ getWebuntisLinks: vi.fn(() => Promise.resolve([])) }))

const { default: SubstitutionsEditor } = await import('./Substitutions')

let container
let root
const BASE = {
  substitutions_source: 'monitor', substitutions_format: 'students_2', substitutions_custom_format: '',
  substitutions_show_absences: true, substitutions_show_exams: null, substitutions_next_day_from: '16:00',
  page_seconds: 15, webuntis_url: '', webuntis_url_next_day: '',
}

async function mount(overrides = {}) {
  const calls = []
  const draft = { ...BASE, ...overrides }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(createElement(SubstitutionsEditor, { draft, set: (k, v) => calls.push([k, v]) })) })
  return calls
}
const text = () => container.textContent
const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const input = (label) => container.querySelector(`[aria-label="${label}"]`)

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

describe('SubstitutionsEditor', () => {
  it('zeigt bei der Monitor-Quelle Ausgabe und Abwesenheiten, aber weder Formatname noch Links', async () => {
    await mount()
    expect(text()).toContain('Datenquelle')
    expect(text()).toContain('Die Vertretungen, wie WebUntis sie für Bildschirme bereitstellt. Kein Konto nötig.')
    expect(text()).toContain('Ausgabe')
    expect(text()).toContain('Abwesenheiten anzeigen')
    expect(text()).not.toContain('Formatname')
    expect(text()).not.toContain('Rückfall-Link')
    expect(text()).not.toContain('Morgen zeigen')
  })

  it('zeigt den Formatnamen nur beim eigenen Format', async () => {
    await mount({ substitutions_format: 'custom' })
    expect(text()).toContain('Formatname')
  })

  it('zeigt bei der Konto-Quelle weder Ausgabe noch Abwesenheiten noch Links', async () => {
    await mount({ substitutions_source: 'account' })
    expect(text()).toContain('Abfrage mit Benutzername und Passwort aus den Einstellungen.')
    expect(text()).not.toContain('Ausgabe')
    expect(text()).not.toContain('Abwesenheiten anzeigen')
    expect(text()).not.toContain('Rückfall-Link')
    expect(text()).toContain('Klausuren anzeigen')
    expect(text()).toContain('Blättertakt')
  })

  it('zeigt die Rückfall-Links nur bei der eingebetteten Seite', async () => {
    await mount({ substitutions_source: 'embed' })
    expect(text()).toContain('Zeigt die Originalseite von WebUntis statt der eigenen Darstellung.')
    expect(text()).toContain('Rückfall-Link')
    expect(text()).not.toContain('Ausgabe')
  })

  it('setzt die Quelle und die Ausgabe', async () => {
    const calls = await mount()
    await act(async () => button('WebUntis-Konto').click())
    await act(async () => button('Lehrkräfte').click())
    expect(calls).toEqual([['substitutions_source', 'account'], ['substitutions_format', 'teachers']])
  })

  it('übersetzt die Klausuren-Auswahl in null, true und false', async () => {
    const calls = await mount({ substitutions_show_exams: false })
    await act(async () => button('Wie in WebUntis').click())
    await act(async () => button('Ja').click())
    await act(async () => button('Nein').click())
    expect(calls).toEqual([['substitutions_show_exams', null], ['substitutions_show_exams', true], ['substitutions_show_exams', false]])
  })

  it('schaltet "Nächsten Schultag zeigen ab" aus und mit 16:00 wieder an', async () => {
    let calls = await mount()
    const toggle = container.querySelector('input[type="checkbox"][aria-label="Nächsten Schultag zeigen ab"]')
    expect(toggle.checked).toBe(true)
    expect(input('Uhrzeit für den nächsten Schultag').value).toBe('16:00')
    await act(async () => toggle.click())
    expect(calls).toEqual([['substitutions_next_day_from', '']])
    act(() => root.unmount())
    container.remove()
    calls = await mount({ substitutions_next_day_from: '' })
    expect(input('Uhrzeit für den nächsten Schultag').disabled).toBe(true)
    await act(async () => container.querySelector('input[type="checkbox"][aria-label="Nächsten Schultag zeigen ab"]').click())
    expect(calls).toEqual([['substitutions_next_day_from', '16:00']])
  })
})
