import wheelUrl from '../../../../assets/ci/wheel.svg'
import wheelTripleUrl from '../../../../assets/ci/wheel-triple.svg'

// The shape comes from the SVG as a mask, the colour from the surface behind it;
// the invisible image only sets the size. Sits below the content (z-0, content z-10): in "Breit"
// it shows through the slightly translucent boxes.
export function CiWheel({ triple = false }) {
  const url = triple ? wheelTripleUrl : wheelUrl
  return (
    <div
      data-wheel
      aria-hidden="true"
      className="d-wheel pointer-events-none absolute left-0 top-0 z-0 h-full select-none"
      style={{ WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` }}
    >
      <img src={url} alt="" draggable="false" className="invisible h-full w-auto max-w-none" />
    </div>
  )
}

export function CiStripe({ className }) {
  return <div aria-hidden="true" className={`absolute right-0 top-0 z-0 h-full bg-(--d-red) ${className}`} />
}

// Stays invisible while the content shows nothing (.d-footer in display.css),
// so no empty strip takes up space.
export function FrameFooter({ children }) {
  if (!children) return null
  return <div className="d-footer mt-[1.5rem] h-[4.75rem] shrink-0">{children}</div>
}

// Scheme and layout as CSS classes (switching without a rebuild)
export function frameRootClass(scheme, layout) {
  return `d-root d-scheme-${scheme === 'dark' ? 'dark' : 'light'} d-layout-${layout === 'wide' ? 'wide' : 'normal'} absolute inset-0 overflow-hidden`
}
