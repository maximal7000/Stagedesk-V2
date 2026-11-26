import { useEffect, useMemo, useRef, useState } from 'react'
import { ClockBox, Frame } from '../frame'
import { useBoxSize } from '../lib/fit'
import { paginate } from '../lib/pager'

// If all pages match the screen orientation they run edge to edge with object-fit: contain on white
// (black in the dark scheme). Otherwise (portrait page on a landscape screen) they sit centred in
// the CI frame with the clock.

const FADE_MS = 300

function useSlideshow(count, seconds) {
  const [state, setState] = useState({ index: 0, previous: null })
  useEffect(() => {
    if (count <= 1) return undefined
    const id = setInterval(
      () => setState((s) => ({ index: (s.index + 1) % count, previous: s.index % count })),
      Math.max(1, Number(seconds) || 10) * 1000,
    )
    return () => clearInterval(id)
  }, [count, seconds])
  // The previous page stays until the new one has faded in
  useEffect(() => {
    if (state.previous == null) return undefined
    const id = setTimeout(() => setState((s) => ({ ...s, previous: null })), FADE_MS)
    return () => clearTimeout(id)
  }, [state])
  const index = count ? state.index % count : 0
  const previous = state.previous != null && state.previous < count && state.previous !== index ? state.previous : null
  return { index, previous }
}

function useSlides(data) {
  const perScreen = Math.min(3, Math.max(1, Number(data.per_screen) || 1))
  const slides = useMemo(() => paginate(data.pages ?? [], perScreen), [data.pages, perScreen])
  const { index, previous } = useSlideshow(slides.length, data.seconds)

  // Preload the next page so the switch does not wait for decoding
  useEffect(() => {
    if (slides.length <= 1) return
    for (const page of slides[(index + 1) % slides.length]) {
      const img = new Image()
      img.src = page.url
    }
  }, [slides, index])
  return { slides, index, previous }
}

export default function MediaView({ view, orientation = 'landscape', frame = {} }) {
  const data = view.data ?? {}
  const { slides, index, previous } = useSlides(data)

  if (!slides.length) {
    return (
      <Frame layout={view.layout} scheme={frame.scheme} orientation={orientation} clock={{ staleSince: frame.staleSince }} wheel={frame.wheel} stripe={frame.stripe}>
        <div data-display-state="view" data-view-kind="media" className="flex h-full items-center">
          <p className="d-text max-w-[60rem] text-[2rem] leading-[1.5] text-(--d-fg-soft)">
            Keine Medien.
          </p>
        </div>
      </Frame>
    )
  }
  const shown = previous != null ? [previous, index] : [index]
  return (
    <div data-display-state="view" data-view-kind="media" className="absolute inset-0">
      {shown.map((i) => (
        <Slide key={i} pages={slides[i]} layout={view.layout} orientation={orientation} frame={frame} fadeIn={i === index && previous != null}
          clockBelow={Number(data.per_screen) > 1} />
      ))}
    </div>
  )
}

// clockBelow: with several pages side by side the clock sits in a box at the bottom right, as in the other
// views, so the pages get the whole width; a single page keeps the clock beside it.
function Slide({ pages, layout, orientation, frame, fadeIn, clockBelow }) {
  const borderless = pages.every((p) => p.orientation === orientation)
  const fade = fadeIn ? 'd-fade-in' : ''
  if (borderless) {
    return (
      <div className={`absolute inset-0 flex ${frame.scheme === 'dark' ? 'bg-[#000]' : 'bg-[#fff]'} ${fade}`}>
        {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} />)}
      </div>
    )
  }
  // Layout "Normal" with the logo column: the clock stands at its bottom, under the logo; no footer row,
  // so the pages get the whole height
  const VARIANT = import.meta.env.VITE_MEDIA_CLOCK || 'logo'
  if (clockBelow && layout === 'normal' && orientation !== 'portrait' && frame.wheel !== false && VARIANT === 'logo') {
    return (
      <div className={`absolute inset-0 ${fade}`}>
        <Frame layout={layout} scheme={frame.scheme} orientation={orientation} wheel={frame.wheel} stripe={frame.stripe}>
          <div className="flex h-full gap-[1.5rem]">
            {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} framed />)}
          </div>
        </Frame>
        <ClockBox variant="corner" staleSince={frame.staleSince} seconds={frame.seconds !== false}
          className="absolute bottom-[3.5rem] left-[3rem] z-20 text-[4.25rem]" />
      </div>
    )
  }
  if (clockBelow && layout === 'normal' && VARIANT === '1') {
    const footer = (
      <div className="d-footer-item flex h-full items-end justify-start">
        <ClockBox variant="inline" staleSince={frame.staleSince} seconds={frame.seconds !== false} className="text-[4.25rem]" />
      </div>
    )
    return (
      <div className={`absolute inset-0 ${fade}`}>
        <Frame layout={layout} scheme={frame.scheme} orientation={orientation} wheel={frame.wheel} stripe={frame.stripe} footer={footer}>
          <div className="flex h-full gap-[1.5rem]">
            {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} framed />)}
          </div>
        </Frame>
      </div>
    )
  }
  if (clockBelow && layout === 'normal' && VARIANT === '2') {
    return (
      <div className={`absolute inset-0 ${fade}`}>
        <Frame layout={layout} scheme={frame.scheme} orientation={orientation} wheel={frame.wheel} stripe={frame.stripe}>
          <div className="flex h-full gap-[2rem]">
            <div className="flex shrink-0 flex-col justify-end">
              <ClockBox variant="corner" staleSince={frame.staleSince} seconds={frame.seconds !== false} className="text-[3.5rem]" />
            </div>
            <div className="flex min-w-0 flex-1 gap-[1.5rem]">
              {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} framed />)}
            </div>
          </div>
        </Frame>
      </div>
    )
  }
  if (clockBelow && layout === 'normal' && VARIANT === '3') {
    return (
      <div className={`absolute inset-0 ${fade}`}>
        <Frame layout={layout} scheme={frame.scheme} orientation={orientation} wheel={frame.wheel} stripe={frame.stripe}>
          <div className="flex h-full gap-[1.5rem]">
            {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} framed />)}
          </div>
        </Frame>
        <ClockBox variant="corner" staleSince={frame.staleSince} seconds={frame.seconds !== false}
          className="absolute bottom-[3.5rem] left-[3rem] z-20 text-[4.25rem]" />
      </div>
    )
  }
  if (clockBelow) {
    const footer = (
      // d-footer-item: the footer shows only with an item in it (display.css). No box: on the white frame
      // a grey box looked like a stray element; the clock stands on its own, right-aligned under the pages.
      <div className="d-footer-item flex h-full items-end justify-end">
        <ClockBox variant="compact" staleSince={frame.staleSince} seconds={frame.seconds !== false} row className="text-[4.25rem]" />
      </div>
    )
    return (
      <div className={`absolute inset-0 ${fade}`}>
        <Frame layout={layout} scheme={frame.scheme} orientation={orientation} wheel={frame.wheel} stripe={frame.stripe} footer={footer}>
          <div className="flex h-full gap-[1.5rem]">
            {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} framed />)}
          </div>
        </Frame>
      </div>
    )
  }
  return (
    <div className={`absolute inset-0 ${fade}`}>
      <Frame layout={layout} scheme={frame.scheme} orientation={orientation} wheel={frame.wheel} stripe={frame.stripe}>
        <div className="flex h-full gap-[2.5rem]">
          <div className="flex min-w-0 flex-1 gap-[1.5rem]">
            {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} framed />)}
          </div>
          <ClockBox variant="compact" staleSince={frame.staleSince} seconds={frame.seconds !== false} className="shrink-0 pt-[1.75rem] text-[5.5rem]" />
        </div>
      </Frame>
    </div>
  )
}

// One side of a split view: the pages fit into the side, the split view's frame carries the clock.
function MediaPane({ view }) {
  const { slides, index, previous } = useSlides(view.data ?? {})
  if (!slides.length) {
    return <p className="d-text text-[2rem] leading-[1.5] text-(--d-fg-soft)">Keine Medien.</p>
  }
  const shown = previous != null ? [previous, index] : [index]
  return (
    <div data-media-pane className="absolute inset-0">
      {shown.map((i) => (
        <div key={i} className={`absolute inset-0 flex gap-[1.5rem] ${i === index && previous != null ? 'd-fade-in' : ''}`}>
          {slides[i].map((p, j) => <Page key={`${p.url}-${j}`} page={p} framed />)}
        </div>
      ))}
    </div>
  )
}

// framed: page in the CI frame with a fine edge so a white page on white stays recognisable as a page.
// The page fills its cell as far as its proportions allow, also when the image is smaller than the cell
// (a rendered PDF page is often only about 1300 px high, a 4K screen has more room).
function Page({ page, framed = false }) {
  const ref = useRef(null)
  const { width, height } = useBoxSize(ref)
  const ratio = page.width > 0 && page.height > 0 ? page.width / page.height : null
  const fitted = ratio && width > 0 && height > 0 ? Math.min(width, height * ratio) : null
  return (
    <div ref={ref} className="flex h-full min-w-0 flex-1 items-center justify-center">
      <img
        src={page.url}
        alt=""
        width={page.width || undefined}
        height={page.height || undefined}
        draggable="false"
        style={fitted ? { width: fitted, height: fitted / ratio } : undefined}
        className={`${fitted ? 'max-w-none' : 'h-auto max-h-full w-auto max-w-full'} object-contain ${framed ? 'd-page-edge' : ''}`}
      />
    </div>
  )
}

MediaView.ownFrame = true
MediaView.Pane = MediaPane
