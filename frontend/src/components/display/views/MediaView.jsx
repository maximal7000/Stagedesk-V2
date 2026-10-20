import { useEffect, useMemo, useState } from 'react'
import { ClockBox, Frame } from '../frame'
import { paginate } from '../lib/pager'

// Medien (PDF-Seiten und Bilder als fertige Seitenbilder): alle `seconds` die nächsten `per_screen`
// Seiten (1 bis 3 nebeneinander), Wechsel per Deckkraft (300 ms).
// Passen alle Seiten zur Ausrichtung des Bildschirms (Querformat auf Querformat), laufen sie randlos
// mit object-fit: contain auf Weiß bzw. im Stil dark auf Schwarz. Sonst (Hochformat-Seite auf
// Querformat-Bildschirm) stehen sie mittig im CI-Rahmen mit Uhr.
// Bringt den Rahmen selbst mit (ownFrame): frame = {staleSince, wheel, stripe} aus ViewScreen.

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
  // Die vorige Seite bleibt liegen, bis die neue eingeblendet ist
  useEffect(() => {
    if (state.previous == null) return undefined
    const id = setTimeout(() => setState((s) => ({ ...s, previous: null })), FADE_MS)
    return () => clearTimeout(id)
  }, [state])
  const index = count ? state.index % count : 0
  const previous = state.previous != null && state.previous < count && state.previous !== index ? state.previous : null
  return { index, previous }
}

export default function MediaView({ view, orientation = 'landscape', frame = {} }) {
  const data = view.data ?? {}
  const perScreen = Math.min(3, Math.max(1, Number(data.per_screen) || 1))
  const slides = useMemo(() => paginate(data.pages ?? [], perScreen), [data.pages, perScreen])
  const { index, previous } = useSlideshow(slides.length, data.seconds)

  // Nächste Seite vorladen, damit der Wechsel nicht auf das Dekodieren wartet
  useEffect(() => {
    if (slides.length <= 1) return
    for (const page of slides[(index + 1) % slides.length]) {
      const img = new Image()
      img.src = page.url
    }
  }, [slides, index])

  if (!slides.length) {
    return (
      <Frame style={view.style} orientation={orientation} clock={{ staleSince: frame.staleSince }} wheel={frame.wheel} stripe={frame.stripe}>
        <div data-display-state="view" data-view-kind="media" className="flex h-full items-center">
          <p className="d-lato max-w-[60rem] text-[2rem] leading-[1.5] text-(--d-fg-soft)">
            Keine Medien zum Anzeigen. Im Admin unter Monitore → Medien die Dateien der Ansicht prüfen.
          </p>
        </div>
      </Frame>
    )
  }
  const shown = previous != null ? [previous, index] : [index]
  return (
    <div data-display-state="view" data-view-kind="media" className="absolute inset-0">
      {shown.map((i) => (
        <Slide key={i} pages={slides[i]} style={view.style} orientation={orientation} frame={frame} fadeIn={i === index && previous != null} />
      ))}
    </div>
  )
}

function Slide({ pages, style, orientation, frame, fadeIn }) {
  const borderless = pages.every((p) => p.orientation === orientation)
  const fade = fadeIn ? 'd-fade-in' : ''
  if (borderless) {
    return (
      <div className={`absolute inset-0 flex ${style === 'dark' ? 'bg-[#000]' : 'bg-[#fff]'} ${fade}`}>
        {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} />)}
      </div>
    )
  }
  return (
    <div className={`absolute inset-0 ${fade}`}>
      <Frame style={style} orientation={orientation} wheel={frame.wheel} stripe={frame.stripe}>
        <div className="flex h-full gap-[2.5rem]">
          <div className="flex min-w-0 flex-1 gap-[1.5rem]">
            {pages.map((p, i) => <Page key={`${p.url}-${i}`} page={p} framed />)}
          </div>
          <ClockBox variant="compact" staleSince={frame.staleSince} className="shrink-0 pt-[1.75rem] text-[5.5rem]" />
        </div>
      </Frame>
    </div>
  )
}

// framed: Seite im CI-Rahmen mit feiner Kante, damit eine weiße Seite auf Weiß als Seite erkennbar bleibt
function Page({ page, framed = false }) {
  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center">
      <img
        src={page.url}
        alt=""
        width={page.width || undefined}
        height={page.height || undefined}
        draggable="false"
        className={`h-auto max-h-full w-auto max-w-full object-contain ${framed ? 'd-page-edge' : ''}`}
      />
    </div>
  )
}

MediaView.ownFrame = true
