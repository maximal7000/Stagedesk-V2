const BASE_WIDTH = { landscape: 1920, portrait: 1080 }

function scaleFactor(scale) {
  if (scale == null || scale === 'auto') return 1
  const pct = Number(scale)
  return Number.isFinite(pct) && pct > 0 ? pct / 100 : 1
}

// A set zoom is an absolute factor and replaces auto scaling including the percentage.
export function computeRootPx({ width, orientation, scale, zoom }) {
  const base = orientation === 'portrait' ? BASE_WIDTH.portrait : BASE_WIDTH.landscape
  const factor = zoom ?? (width / base) * scaleFactor(scale)
  return 16 * factor
}

export function readZoom(search = window.location.search) {
  const raw = new URLSearchParams(search).get('zoom')
  const n = raw == null ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}
