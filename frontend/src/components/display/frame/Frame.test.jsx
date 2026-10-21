import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import Frame from './Frame'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, host
function render(ui) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root.render(ui) })
  return host
}
afterEach(() => { act(() => root.unmount()); host.remove() })

const clock = { showWeather: false, weather: null, staleSince: null }
const isBefore = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('Frame', () => {
  it('wählt den Rahmen nach Aufteilung', () => {
    const el = render(<Frame layout="wide" scheme="dark">x</Frame>)
    const rootEl = el.querySelector('.d-root')
    expect(rootEl.classList.contains('d-scheme-dark')).toBe(true)
    expect(rootEl.classList.contains('d-layout-wide')).toBe(true)
  })

  it('Standard ist Normal und Hell', () => {
    const rootEl = render(<Frame>x</Frame>).querySelector('.d-root')
    expect(rootEl.classList.contains('d-scheme-light')).toBe(true)
    expect(rootEl.classList.contains('d-layout-normal')).toBe(true)
    expect(rootEl.className).not.toMatch(/d-tone-/)
  })

  it.each(['landscape', 'portrait'])('Rad liegt bei Breit hinter dem Inhalt (%s)', (orientation) => {
    const el = render(<Frame layout="wide" orientation={orientation}>x</Frame>)
    const wheel = el.querySelector('[data-wheel]')
    const main = el.querySelector('main')
    expect(wheel).not.toBeNull()
    expect(isBefore(wheel, main)).toBe(true)
    expect(wheel.classList.contains('z-0')).toBe(true)
    expect(main.closest('.z-10')).not.toBeNull()
  })

  it.each(['normal', 'wide'])('Rad steht in %s an derselben Stelle am linken Rand', (layout) => {
    const wheel = render(<Frame layout={layout}>x</Frame>).querySelector('[data-wheel]')
    expect(wheel.classList.contains('left-0')).toBe(true)
    expect(wheel.classList.contains('top-0')).toBe(true)
    expect(wheel.classList.contains('d-wheel')).toBe(true)
  })

  it('Breit: Uhr als Kasten unten, Normal: Uhr in der Kopfzeile', () => {
    expect(render(<Frame layout="wide" clock={clock}>x</Frame>).querySelector('[data-clock="box"]')).not.toBeNull()
    act(() => root.unmount()); host.remove()
    const el = render(<Frame layout="normal" clock={clock}>x</Frame>)
    expect(el.querySelector('[data-clock="box"]')).toBeNull()
    expect(el.querySelector('header')).not.toBeNull()
  })

  it('Hochformat kennt beide Aufteilungen', () => {
    const el = render(<Frame layout="wide" scheme="dark" orientation="portrait" clock={clock}>x</Frame>)
    const rootEl = el.querySelector('.d-root')
    expect(rootEl.classList.contains('d-layout-wide')).toBe(true)
    expect(rootEl.classList.contains('d-scheme-dark')).toBe(true)
    expect(el.querySelector('[data-clock="box"]')).not.toBeNull()
  })
})

describe('display.css', () => {
  it('Breit + Hell hat eine hellgraue Seite, damit die Kästen sich abheben', () => {
    // jsdom wertet kein CSS aus: die Regel wird im Quelltext geprüft
    const css = readFileSync(resolve(__dirname, '../display.css'), 'utf8')
    const rule = css.match(/\.d-scheme-light\.d-layout-wide\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/--d-bg:\s*#f2f2f2;/)
    expect(rule[1]).toMatch(/--d-surface:\s*#ffffffcc;/)
  })
})
