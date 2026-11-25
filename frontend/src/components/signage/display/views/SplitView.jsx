import { useCallback, useEffect, useState } from 'react'
import { expandWanted, staysExpanded } from '../lib/expand'
import { setOverlay, useOverlay } from '../lib/overlay'
import { VIEW_COMPONENTS } from './index'

// Old side values without data (exam, clock, empty) stay empty. A view with its own frame takes part
// through its Pane.

const clampPercent = (value) => Math.min(80, Math.max(20, Number(value) || 50))

function sideView(view, side) {
  const full = side?.data != null ? VIEW_COMPONENTS[side.kind] : null
  const View = full?.Pane ?? full
  if (!View || View.ownFrame) return { View: null, sub: null }
  return { View, sub: { ...view, kind: side.kind, data: side.data } }
}

// Sides a busy substitution plan may take over; departures never (time-critical).
const YIELDING = new Set(['media', 'info'])

// The substitutions side and the side it may take over, if this split has such a pair.
// Only live data has pages: an embedded WebUntis page (fallback) never takes over, so the media come back.
function overlayPair(data) {
  for (const [own, other] of [['left', 'right'], ['right', 'left']]) {
    const plan = data[own]?.kind === 'substitutions' ? data[own].data : null
    if (plan?.mode === 'live' && plan.days?.length && YIELDING.has(data[other]?.kind)) return own
  }
  return null
}

export default function SplitView({ view }) {
  const data = view.data ?? {}
  // before: the count that switched to the pair; ratio: before / first count in the pair (null until known)
  const [state, setState] = useState({ pages: 0, expanded: false, before: 0, ratio: null })
  const percent = clampPercent(data.left_percent)
  const left = sideView(view, data.left)
  const right = sideView(view, data.right)
  const owner = overlayPair(data)
  const plan = owner === 'left' ? left : owner === 'right' ? right : null
  const expandPages = plan ? data[owner].data.expand_pages : 0
  const ownFraction = (owner === 'left' ? percent : 100 - percent) / 100
  // The count comes from what is shown: the side as it is, or the two half columns when expanded
  const decide = useCallback((pages) => setState((prev) => {
    let next
    if (!prev.expanded) {
      next = expandWanted(pages, expandPages) ? { pages, expanded: true, before: pages, ratio: null } : { ...prev, pages }
    } else {
      const ratio = prev.ratio ?? (pages > 0 ? Math.max(1, prev.before / pages) : 1)
      next = staysExpanded(pages, expandPages, ownFraction, ratio)
        ? { ...prev, pages, ratio }
        : { pages, expanded: false, before: 0, ratio: null }
    }
    // Same answer: keep the state object, so reporting the count again does not re-render
    return Object.keys(next).every((k) => next[k] === prev[k]) ? prev : next
  }), [expandPages, ownFraction])
  const overlaid = plan && state.expanded ? owner : null
  useEffect(() => { setOverlay(view.id, overlaid) }, [view.id, overlaid])
  useEffect(() => () => setOverlay(view.id, null), [view.id])
  // Busy day: today's plan takes the whole width as two equal columns (the split width does not count)
  if (overlaid) {
    return (
      <div className="relative h-full" data-split-overlay={owner}>
        <plan.View view={plan.sub} twoColumns onPageCount={decide} />
      </div>
    )
  }
  const report = (side) => (owner === side ? { onPageCount: decide } : {})
  return (
    <div className="flex h-full gap-[1.25rem]">
      <div className="relative min-w-0" style={{ flex: `0 0 calc(${percent}% - 0.625rem)` }} data-split-side="left">
        {left.View && <left.View view={left.sub} {...report('left')} />}
      </div>
      <div className="relative min-w-0 flex-1" data-split-side="right">
        {right.View && <right.View view={right.sub} {...report('right')} />}
      </div>
    </div>
  )
}

function SplitFooter({ view }) {
  const data = view.data ?? {}
  const overlay = useOverlay(view.id)
  // Overlaid: both halves show the plan, so its footer spans the whole width
  const percent = clampPercent(data.left_percent)
  let weatherShown = false
  const sides = overlay ? [data[overlay], null] : [data.left, data.right]
  const cells = sides.map((side) => {
    const { View, sub } = sideView(view, side)
    if (!View?.Footer) return null
    // Two departure sides: the weather only once
    const showWeather = sub.show_weather && !weatherShown
    if (View.weatherInFooter === true && showWeather) weatherShown = true
    return <View.Footer view={{ ...sub, show_weather: showWeather }} />
  })
  if (!cells.some(Boolean)) return null
  if (overlay) return <div data-split-footer="overlay" className="h-full min-w-0">{cells[0]}</div>
  return (
    <div className="grid h-full gap-[1.25rem]" style={{ gridTemplateColumns: `calc(${percent}cqw - 0.625rem) minmax(0, 1fr)` }}>
      <div className="min-w-0">{cells[0]}</div>
      <div className="min-w-0">{cells[1]}</div>
    </div>
  )
}

SplitView.Footer = SplitFooter
SplitView.weatherInFooter = (view) => [view.data?.left, view.data?.right]
  .some((side) => sideView(view, side).View?.weatherInFooter === true)
