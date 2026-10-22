import { describe, it, expect } from 'vitest'
import { paginate, paginateByHeight } from './pager'

describe('paginate', () => {
  it('teilt 25 Einträge bei 10 pro Seite in 3 Seiten', () => {
    const pages = paginate(Array.from({ length: 25 }, (_, i) => i + 1), 10)
    expect(pages).toHaveLength(3)
    expect(pages[2]).toEqual([21, 22, 23, 24, 25])
  })
  it('liefert bei leerer Liste keine Seite', () => {
    expect(paginate([], 10)).toEqual([])
  })
  it('behandelt ungültige perPage als eine Seite', () => {
    expect(paginate([1, 2, 3], 0)).toEqual([[1, 2, 3]])
  })
})

describe('paginateByHeight', () => {
  it('füllt Seiten nach gemessener Höhe', () => {
    expect(paginateByHeight([10, 10, 10], 25)).toEqual([[0, 1], [2]])
  })
  it('gibt einer zu hohen Zeile eine eigene Seite', () => {
    expect(paginateByHeight([10, 40, 10], 25)).toEqual([[0], [1], [2]])
  })
  it('liefert bei leerer Liste keine Seite', () => {
    expect(paginateByHeight([], 25)).toEqual([])
  })
})
