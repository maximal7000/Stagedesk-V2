import { describe, it, expect } from 'vitest'
import { fitRows, packByHeight } from './fit'

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
