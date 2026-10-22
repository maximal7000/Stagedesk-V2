import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import DisplayRoot from './DisplayRoot'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const screen = { slug: 'glocke', name: 'Glocke', orientation: 'landscape', scale: 'auto', power: true }
const view = { id: 1, kind: 'info', layout: 'normal', page_seconds: 15, show_weather: false, weather: null, qr: null,
  data: { announcements: [], events: [], countdown: null } }
const emergency = { kind: 'emergency', text: 'Bitte das Gebäude verlassen', note: 'Sammelplatz Schulhof',
  since: '2026-10-19T08:38:00+00:00' }
const onAir = { kind: 'on_air', display: 'fullscreen', side: 'right', text: 'ON AIR', animation: 'still',
  show_clock: true, since: '2026-10-19T08:30:00+00:00' }

let root
let host
function render(props) {
  host = document.createElement('div')
  root = createRoot(host)
  act(() => { root.render(<DisplayRoot {...props} />) })
  return host
}
const stateOf = (el) => el.querySelector('[data-display-state]')?.getAttribute('data-display-state')

afterEach(() => {
  act(() => root.unmount())
})

describe('DisplayRoot', () => {
  const lastOkAt = new Date('2026-10-19T08:40:00+00:00').getTime()

  it('zeigt bei verlorener Verbindung den zwischengespeicherten Notfall statt "Verbindung verloren"', () => {
    const el = render({ payload: { screen, view, mode: emergency }, state: 'lost', lastOkAt, nextRetryAt: null })
    expect(stateOf(el)).toBe('mode')
    expect(el.querySelector('[data-mode-kind="emergency"]')).not.toBeNull()
    expect(el.textContent).toContain('Bitte das Gebäude verlassen')
    expect(el.textContent).toContain('Stand')
  })

  it('der Notfall gilt auch, wenn der Bildschirm laut Zwischenspeicher aus ist', () => {
    const el = render({ payload: { screen: { ...screen, power: false }, view, mode: emergency }, state: 'lost', lastOkAt })
    expect(el.querySelector('[data-mode-kind="emergency"]')).not.toBeNull()
  })

  it('andere Sondermodi und Ansichten zeigen bei verlorener Verbindung weiter "Verbindung verloren"', () => {
    expect(stateOf(render({ payload: { screen, view, mode: onAir }, state: 'lost', lastOkAt }))).toBe('lost')
    act(() => root.unmount())
    expect(stateOf(render({ payload: { screen, view, mode: null }, state: 'lost', lastOkAt }))).toBe('lost')
  })

  it('Sondermodi im Vollbild zeigen bei veralteten Daten "Stand HH:MM"', () => {
    const el = render({ payload: { screen, view, mode: onAir }, state: 'stale', lastOkAt })
    expect(el.querySelector('[data-mode-kind="on_air"]')).not.toBeNull()
    expect(el.textContent).toContain('Stand')
  })

  it('wechselt das Schema ohne Neuladen', () => {
    const el = render({ payload: { screen, view, mode: null, scheme: 'light' }, state: 'ok', lastOkAt })
    const before = el.querySelector('.d-root')
    expect(before.classList.contains('d-scheme-light')).toBe(true)
    act(() => { root.render(<DisplayRoot payload={{ screen, view, mode: null, scheme: 'dark' }} state="ok" lastOkAt={lastOkAt} />) })
    const after = el.querySelector('.d-root')
    // derselbe Knoten: nur die Klasse wechselt, nichts wird neu aufgebaut oder geladen
    expect(after).toBe(before)
    expect(after.classList.contains('d-scheme-dark')).toBe(true)
    expect(after.classList.contains('d-scheme-light')).toBe(false)
  })

  it('ohne Schema im Payload gilt Hell, die Aufteilung kommt aus der Ansicht', () => {
    const el = render({ payload: { screen, view: { ...view, layout: 'wide' }, mode: null }, state: 'ok', lastOkAt })
    const rootEl = el.querySelector('.d-root')
    expect(rootEl.classList.contains('d-scheme-light')).toBe(true)
    expect(rootEl.classList.contains('d-layout-wide')).toBe(true)
  })

  it('On-Air zeigt kein "seit"', () => {
    const el = render({ payload: { screen, view, mode: onAir }, state: 'ok', lastOkAt })
    expect(el.textContent).not.toContain('seit')
    expect(el.textContent).not.toContain('Stand')
  })
})
