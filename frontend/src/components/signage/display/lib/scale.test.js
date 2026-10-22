import { describe, it, expect } from 'vitest'
import { computeRootPx } from './scale'

const base = { width: 3840, height: 2160, orientation: 'landscape' }

describe('computeRootPx', () => {
  it('skaliert Automatisch nach Breite (4K = 32px)', () => {
    expect(computeRootPx({ ...base, scale: 'auto' })).toBe(32)
  })
  it('wendet den Prozentfaktor an', () => {
    expect(computeRootPx({ ...base, scale: '150' })).toBe(48)
    expect(computeRootPx({ ...base, scale: '75' })).toBe(24)
    expect(computeRootPx({ ...base, scale: '110' })).toBeCloseTo(35.2, 10)
  })
  it('behandelt zoom als absoluten Faktor', () => {
    expect(computeRootPx({ ...base, scale: 'auto', zoom: 2 })).toBe(32)
    expect(computeRootPx({ ...base, scale: '200', zoom: 2 })).toBe(32)
  })
  it('nutzt im Hochformat 1080 als Basis', () => {
    expect(computeRootPx({ width: 2160, height: 3840, orientation: 'portrait', scale: 'auto' })).toBe(32)
  })
  it('liefert bei fehlender Skala den Faktor 1', () => {
    expect(computeRootPx({ width: 1920, height: 1080, orientation: 'landscape' })).toBe(16)
  })
})
