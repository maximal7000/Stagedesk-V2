import wheelUrl from '../../../assets/ci/wheel.svg'
import wheelTripleUrl from '../../../assets/ci/wheel-triple.svg'

// Katharinenrad links angeschnitten, in beiden Aufteilungen und Schemata an derselben Stelle und immer
// leicht grau (--d-wheel). Die Form kommt als Maske aus dem SVG, die Farbe aus der Fläche dahinter;
// das unsichtbare Bild gibt nur die Größe vor. Liegt unter dem Inhalt (z-0, Inhalt z-10): bei "Breit"
// scheint es durch die leicht durchsichtigen Kästen.
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

// Roter CI-Streifen am rechten Rand (reines CSS)
export function CiStripe({ className }) {
  return <div aria-hidden="true" className={`absolute right-0 top-0 z-0 h-full bg-(--d-red) ${className}`} />
}

// Fußleiste bei "Normal" (ohne Uhr-Kasten): unten über die volle Breite. Bleibt unsichtbar, solange
// der Inhalt nichts zeigt (.d-footer in display.css), damit kein leerer Streifen Platz belegt.
export function FrameFooter({ children }) {
  if (!children) return null
  return <div className="d-footer mt-[1.5rem] h-[4.75rem] shrink-0">{children}</div>
}

// Wurzel jedes Rahmens: Schema und Aufteilung als CSS-Klassen (Umschalten ohne Neuaufbau)
export function frameRootClass(scheme, layout) {
  return `d-root d-scheme-${scheme === 'dark' ? 'dark' : 'light'} d-layout-${layout === 'wide' ? 'wide' : 'normal'} absolute inset-0 overflow-hidden`
}
