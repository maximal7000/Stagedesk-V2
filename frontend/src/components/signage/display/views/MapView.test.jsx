import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import MapView from './MapView'
import { project, unproject, viewport, visibleVehicles } from '../lib/map'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const KATHARINEUM = [53.8699, 10.6892]
const bus = (key, frames, extra = {}) => ({ id: `j-${key}`, line: key, key, direction: 'ZOB', kind: 'bus', replacement: false, frames, ...extra })

describe('MapView Mathe', () => {
  it('rechnet Web-Mercator hin und zurück', () => {
    const p = project(KATHARINEUM, 15)
    const [lat, lon] = unproject(p, 15)
    expect(lat).toBeCloseTo(53.8699, 6)
    expect(lon).toBeCloseTo(10.6892, 6)
  })

  it('der Mittelpunkt liegt in der Mitte, die Kacheln decken die Fläche, der Ausschnitt umschließt die Mitte', () => {
    const map = viewport({ center: KATHARINEUM, zoom: 15, width: 800, height: 600, factor: 2 })
    expect(map.place(KATHARINEUM)).toEqual({ left: 400, top: 300 })
    expect(map.tileSize).toBe(512)
    expect(Math.min(...map.tiles.map((t) => t.left))).toBeLessThanOrEqual(0)
    expect(Math.max(...map.tiles.map((t) => t.left + map.tileSize))).toBeGreaterThanOrEqual(800)
    const [south, west, north, east] = map.bbox
    expect(south < KATHARINEUM[0] && KATHARINEUM[0] < north && west < KATHARINEUM[1] && KATHARINEUM[1] < east).toBe(true)
  })

  it('zeigt nur die gewählten Linien, ohne Auswahl alle', () => {
    const all = [bus('9', []), bus('5', []), bus('SEV RE83', [])]
    expect(visibleVehicles(all, ['9', 'SEV RE83']).map((v) => v.key)).toEqual(['9', 'SEV RE83'])
    expect(visibleVehicles(all, null)).toHaveLength(3)
  })
})

describe('MapView', () => {
  let root
  afterEach(() => {
    act(() => root.unmount())
    vi.restoreAllMocks()
  })

  it('lädt die Fahrzeuge für den Ausschnitt und zeigt die Linien als Marker', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ step_ms: 5000, vehicles: [bus('9', [[53.869, 10.688], [53.8691, 10.6881]]), bus('5', [[53.868, 10.687]])] }),
    })
    const host = document.createElement('div')
    root = createRoot(host)
    await act(async () => {
      root.render(<MapView view={{ data: { center: KATHARINEUM, zoom: 15, lines: ['9'] } }} />)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/signage\/display\/vehicles\?bbox=53\.\d{3},10\.\d{3},53\.\d{3},10\.\d{3}$/)
    expect([...host.querySelectorAll('[data-vehicle]')].map((m) => m.textContent)).toEqual(['9'])
    expect(host.querySelector('[data-map-tiles] img').getAttribute('src')).toMatch(/^https:\/\/tile\.openstreetmap\.org\/15\//)
    expect(host.textContent).toContain('© OpenStreetMap-Mitwirkende')
  })
})
