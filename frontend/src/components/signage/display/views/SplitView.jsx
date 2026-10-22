import { VIEW_COMPONENTS } from './index'

// Old side values without data (exam, clock, empty) stay empty.

const clampPercent = (value) => Math.min(80, Math.max(20, Number(value) || 50))

function sideView(view, side) {
  const View = side?.data != null ? VIEW_COMPONENTS[side.kind] : null
  if (!View || View.ownFrame) return { View: null, sub: null }
  return { View, sub: { ...view, kind: side.kind, data: side.data } }
}

export default function SplitView({ view }) {
  const data = view.data ?? {}
  const percent = clampPercent(data.left_percent)
  const left = sideView(view, data.left)
  const right = sideView(view, data.right)
  return (
    <div className="flex h-full gap-[1.25rem]">
      <div className="relative min-w-0" style={{ flex: `0 0 calc(${percent}% - 0.625rem)` }} data-split-side="left">
        {left.View && <left.View view={left.sub} />}
      </div>
      <div className="relative min-w-0 flex-1" data-split-side="right">
        {right.View && <right.View view={right.sub} />}
      </div>
    </div>
  )
}

function SplitFooter({ view }) {
  const data = view.data ?? {}
  const percent = clampPercent(data.left_percent)
  const cells = [data.left, data.right].map((side) => {
    const { View, sub } = sideView(view, side)
    return View?.Footer ? <View.Footer view={sub} /> : null
  })
  if (!cells.some(Boolean)) return null
  return (
    <div className="grid h-full gap-[1.25rem]" style={{ gridTemplateColumns: `${percent}fr ${100 - percent}fr` }}>
      <div className="min-w-0">{cells[0]}</div>
      <div className="min-w-0">{cells[1]}</div>
    </div>
  )
}

SplitView.Footer = SplitFooter
