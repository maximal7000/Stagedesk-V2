import { useEffect, useMemo, useRef, useState } from 'react'
import { useBoxSize } from '../lib/fit'
import { TILE_URL, bboxParam, viewport, visibleVehicles } from '../lib/map'
import { endpoints } from '../lib/useDisplayData'

// Live bus positions on an OpenStreetMap map. The positions come from NAH.SH, calculated from the timetable
// and the real-time delays (no GPS); each answer holds the next 30 s in 5 s steps, so the buses move between
// two requests without a new one.

const POLL_MS = 15000

function useVehicles(bbox) {
  const [state, setState] = useState({ vehicles: [], stepMs: 5000, at: 0 })
  const param = bbox ? bboxParam(bbox) : null
  useEffect(() => {
    if (!param) return undefined
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`${endpoints().vehicles}?bbox=${param}`)
        if (!res.ok) return // keep the last positions
        const body = await res.json()
        if (alive) setState({ vehicles: body.vehicles ?? [], stepMs: body.step_ms || 5000, at: Date.now() })
      } catch {
        // offline: keep the last positions
      }
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [param])
  return state
}

// Frame index since the answer arrived; the marker moves to the next frame over one step
function useStep(at, stepMs) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), stepMs)
    return () => clearInterval(timer)
  }, [stepMs])
  return Math.max(0, Math.floor((now - at) / stepMs))
}

export default function MapView({ view }) {
  const data = view.data ?? {}
  const ref = useRef(null)
  const { width, height, remPx } = useBoxSize(ref)
  const zoom = Number.isInteger(data.zoom) ? data.zoom : 15
  const center = Array.isArray(data.center) ? data.center : [53.8699, 10.6892]
  const factor = remPx / 16
  const map = useMemo(
    () => (width > 0 && height > 0 ? viewport({ center, zoom, width, height, factor }) : null),
    // center is a new array on each payload; compare its values
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [center[0], center[1], zoom, width, height, factor],
  )
  const { vehicles, stepMs, at } = useVehicles(map?.bbox)
  const step = useStep(at, stepMs)
  const shown = visibleVehicles(vehicles, data.lines)

  return (
    <div ref={ref} className="d-card relative h-full overflow-hidden" data-map>
      {map && (
        <>
          <div data-map-tiles className="absolute inset-0">
            {map.tiles.map((t) => (
              <img key={`${t.x}-${t.y}`} src={TILE_URL(zoom, t.x, t.y)} alt="" draggable="false"
                className="absolute max-w-none select-none" style={{ left: t.left, top: t.top, width: map.tileSize, height: map.tileSize }} />
            ))}
          </div>
          <span aria-hidden="true" className="absolute h-[1.25rem] w-[1.25rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.25rem] border-(--d-red) bg-(--d-bg)"
            style={map.place(center)} data-map-home />
          {shown.map((v) => {
            const frames = v.frames?.length ? v.frames : null
            if (!frames) return null
            const target = frames[Math.min(step + 1, frames.length - 1)]
            const { left, top } = map.place(target)
            return (
              <span key={v.id || `${v.key}-${v.direction}`} data-vehicle={v.key}
                className={`d-head absolute left-0 top-0 rounded-lg px-[0.5rem] py-[0.125rem] text-[1.25rem] font-semibold leading-[1.3] shadow-sm whitespace-nowrap ${v.replacement ? 'bg-(--d-red) text-white' : 'bg-(--d-chip) text-(--d-chip-fg)'}`}
                style={{ transform: `translate(${left}px, ${top}px) translate(-50%, -50%)`, transition: `transform ${stepMs}ms linear` }}>
                {v.line}
              </span>
            )
          })}
        </>
      )}
      <span className="d-text absolute bottom-[0.375rem] right-[0.5rem] rounded-sm bg-(--d-bg)/80 px-[0.375rem] text-[0.875rem] text-(--d-muted)">
        © OpenStreetMap-Mitwirkende
      </span>
    </div>
  )
}
