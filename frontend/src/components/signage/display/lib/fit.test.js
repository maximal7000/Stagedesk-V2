import { act, createElement, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { fitRows, packByHeight, useBoxSize, wrapColumns } from './fit'

describe('fitRows', () => {
  const base = { remPx: 16, minRem: 0.95, prefRem: 1.375, lineFactor: 1.6 }

  it('nimmt bei viel Platz die Höchstzahl und die Wunschschrift', () => {
    expect(fitRows({ ...base, height: 1000, count: 20, max: 10 })).toEqual({ rows: 10, fontPx: 22 })
  })

  it('zeigt bei wenig Platz so viele Zeilen, wie bei Mindestschrift passen', () => {
    const { rows, fontPx } = fitRows({ ...base, height: 200, count: 20, max: 20 })
    expect(rows).toBe(8) // 200 / (0.95 * 16 * 1.6) = 8.2
    expect(fontPx).toBeGreaterThanOrEqual(0.95 * 16)
    expect(rows * fontPx * 1.6).toBeLessThanOrEqual(200)
  })

  it('liefert ohne Höhe oder Einträge keine Zeilen', () => {
    expect(fitRows({ ...base, height: 0, count: 5, max: 10 }).rows).toBe(0)
    expect(fitRows({ ...base, height: 500, count: 0, max: 10 }).rows).toBe(0)
  })
})

describe('wrapColumns', () => {
  // Departures at 4K: landscape 114.5rem wide, portrait 62rem; train columns 22rem, others 16rem
  const mins = [16, 16, 16, 22, 16]

  it('alle Spalten nebeneinander, wenn die Mindestbreiten passen', () => {
    expect(wrapColumns(mins, 114.5, 1.25)).toBe(5)
    expect(wrapColumns([16, 16, 22, 22, 22, 16], 114.5, 1.25)).toBe(4)
  })

  it('Hochformat: zwei Spalten, sobald eine Zugspalte dabei ist', () => {
    expect(wrapColumns(mins, 62, 1.25)).toBe(2)
    expect(wrapColumns([16, 16, 16, 16, 16], 62, 1.25)).toBe(3)
  })

  it('ohne gemessene Breite keine Umbrüche', () => {
    expect(wrapColumns(mins, 0, 1.25)).toBe(5)
    expect(wrapColumns([40], 10, 1.25)).toBe(1)
  })
})

describe('packByHeight', () => {
  it('füllt Seiten bis zur Höhe, mit Abstand zwischen Einträgen', () => {
    expect(packByHeight([40, 40, 40, 40], 100, 10)).toEqual([[0, 1], [2, 3]])
    expect(packByHeight([40, 40, 40], 130, 5)).toEqual([[0, 1, 2]])
  })

  it('setzt zu hohe Einträge allein auf eine Seite', () => {
    expect(packByHeight([300, 20], 100)).toEqual([[0], [1]])
    expect(packByHeight([], 100)).toEqual([])
  })
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('useBoxSize', () => {
  afterEach(() => vi.restoreAllMocks())

  it('misst ein Element, das erst nach einem Leerzustand erscheint', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 640, height: 360 })
    let seen = null
    function Probe({ ready }) {
      const ref = useRef(null)
      seen = useBoxSize(ref)
      return ready ? createElement('div', { ref }) : createElement('p', null, 'Keine Daten')
    }
    const root = createRoot(document.createElement('div'))
    act(() => root.render(createElement(Probe, { ready: false })))
    expect(seen.width).toBe(0)
    act(() => root.render(createElement(Probe, { ready: true })))
    expect(seen.width).toBe(640)
    expect(seen.height).toBe(360)
    act(() => root.unmount())
  })
})
