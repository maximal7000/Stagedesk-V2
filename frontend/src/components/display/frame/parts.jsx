import wheelUrl from '../../../assets/ci/wheel.svg'
import wheelTripleUrl from '../../../assets/ci/wheel-triple.svg'

// Katharinenrad links angeschnitten. solid: Stil A; watermark: Stil B (hell) und C (dunkel, invertiert).
const WHEEL_LOOK = {
  solid: '',
  'watermark-light': 'opacity-[0.06]',
  'watermark-dark': 'opacity-[0.07] invert',
}

export function CiWheel({ look = 'solid', triple = false }) {
  return (
    <img
      src={triple ? wheelTripleUrl : wheelUrl}
      alt=""
      aria-hidden="true"
      draggable="false"
      className={`pointer-events-none absolute left-0 top-0 h-full w-auto max-w-none select-none ${WHEEL_LOOK[look] ?? ''}`}
    />
  )
}

// Roter CI-Streifen am rechten Rand (reines CSS)
export function CiStripe({ className }) {
  return <div aria-hidden="true" className={`absolute right-0 top-0 h-full bg-(--d-red) ${className}`} />
}

// Fußleiste der Stile A und C (ohne Uhr-Box): unten über die volle Breite. Bleibt unsichtbar, solange
// der Inhalt nichts zeigt (.d-footer in display.css), damit kein leerer Streifen Platz belegt.
export function FrameFooter({ children }) {
  if (!children) return null
  return <div className="d-footer mt-[1.5rem] h-[4.75rem] shrink-0">{children}</div>
}
