import { useEffect, useState } from 'react'
import { Frame } from '../frame'

// Brings its own frame (ownFrame); screen is ViewScreen from DisplayRoot
// (as a prop, to avoid an import cycle).
export default function RotationView({ view, orientation, frame = {}, screen }) {
  const Screen = screen
  const items = view.data?.items ?? []
  const count = items.length
  const [raw, setRaw] = useState(0)
  const index = count ? raw % count : 0
  const seconds = Math.max(1, Number(items[index]?.seconds) || 15)

  useEffect(() => {
    if (count <= 1) return undefined
    const id = setTimeout(() => setRaw((i) => (i + 1) % count), seconds * 1000)
    return () => clearTimeout(id)
  }, [raw, count, seconds])

  const item = items[index]
  if (!item?.view) {
    return (
      <Frame layout={view.layout} scheme={frame.scheme} orientation={orientation} wheel={frame.wheel} stripe={frame.stripe}>
        <div data-display-state="view" data-view-kind="rotation" className="flex h-full items-center">
          <p className="d-text max-w-[60rem] text-[2rem] leading-[1.5] text-(--d-fg-soft)">
            Wechsel ohne Ansichten.
          </p>
        </div>
      </Frame>
    )
  }
  return <Screen key={index} view={item.view} orientation={orientation} {...frame} />
}

RotationView.ownFrame = true
