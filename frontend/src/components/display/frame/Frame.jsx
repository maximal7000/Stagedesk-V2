import NormalFrame from './NormalFrame'
import PortraitFrame from './PortraitFrame'
import WideFrame from './WideFrame'

// Wählt den Rahmen nach Aufteilung und Ausrichtung. Der Rahmen füllt sein Elternelement (absolute inset-0);
// DisplayRoot stellt die bildschirmfüllende Fläche, der Splitscreen der Sondermodi eine Hälfte.
//   layout: 'normal' | 'wide' (vom Server aufgelöst); scheme: 'light' | 'dark' (CSS-Klasse d-scheme-*)
//   clock:  {showWeather, weather, staleSince} oder null (ohne Uhr)
//   footer: Fußleiste (Störungen, Stand der Daten); bei "Breit" links neben dem Uhr-Kasten, sonst unten
//   wheel, stripe: CI-Rad links und Streifen rechts; im Splitscreen nur am Bildschirmrand
export default function Frame({ layout = 'normal', scheme = 'light', orientation = 'landscape', clock = null, footer, wheel = true, stripe = true, children }) {
  const props = { scheme, clock, footer, wheel, stripe }
  if (orientation === 'portrait') return <PortraitFrame layout={layout === 'wide' ? 'wide' : 'normal'} {...props}>{children}</PortraitFrame>
  if (layout === 'wide') return <WideFrame {...props}>{children}</WideFrame>
  return <NormalFrame {...props}>{children}</NormalFrame>
}
