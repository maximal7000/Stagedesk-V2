// Web Mercator for the map side (OpenStreetMap tiles, 256 px)

const TILE = 256
export const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`

// Web Mercator: lat/lon -> world pixels at zoom z (tile size 256)
export function project([lat, lon], zoom) {
  const scale = TILE * 2 ** zoom
  const sin = Math.sin((lat * Math.PI) / 180)
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

export function unproject({ x, y }, zoom) {
  const scale = TILE * 2 ** zoom
  const lon = (x / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / scale
  return [(180 / Math.PI) * Math.atan(Math.sinh(n)), lon]
}

// The visible area of a box (CSS px, tiles drawn `factor` times larger so streets stay readable on 4K)
export function viewport({ center, zoom, width, height, factor }) {
  const mid = project(center, zoom)
  const half = { x: width / factor / 2, y: height / factor / 2 }
  const topLeft = { x: mid.x - half.x, y: mid.y - half.y }
  const tiles = []
  const max = 2 ** zoom
  for (let ty = Math.floor(topLeft.y / TILE); ty * TILE < mid.y + half.y; ty++) {
    for (let tx = Math.floor(topLeft.x / TILE); tx * TILE < mid.x + half.x; tx++) {
      if (ty < 0 || ty >= max) continue
      tiles.push({ x: ((tx % max) + max) % max, y: ty, left: (tx * TILE - topLeft.x) * factor, top: (ty * TILE - topLeft.y) * factor })
    }
  }
  const [north, west] = unproject(topLeft, zoom)
  const [south, east] = unproject({ x: mid.x + half.x, y: mid.y + half.y }, zoom)
  const place = (point) => {
    const p = project(point, zoom)
    return { left: (p.x - topLeft.x) * factor, top: (p.y - topLeft.y) * factor }
  }
  return { tiles, tileSize: TILE * factor, bbox: [south, west, north, east], place }
}

// Shared by all screens with the same view: the server caches on a 0.005 degree grid
export const bboxParam = (bbox) => bbox.map((v) => v.toFixed(3)).join(',')

export function visibleVehicles(vehicles, lines) {
  if (!Array.isArray(lines)) return vehicles
  const wanted = new Set(lines)
  return vehicles.filter((v) => wanted.has(v.key))
}

