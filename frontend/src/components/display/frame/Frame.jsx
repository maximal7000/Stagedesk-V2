import CiFrame from './CiFrame'
import DarkFrame from './DarkFrame'
import DenseFrame from './DenseFrame'
import PortraitFrame from './PortraitFrame'

// Wählt den Rahmen nach Stil und Ausrichtung. Der Rahmen füllt sein Elternelement (absolute inset-0);
// DisplayRoot stellt die bildschirmfüllende Fläche, der Splitscreen der Sondermodi eine Hälfte.
//   clock:  {showWeather, weather, staleSince} oder null (ohne Uhr)
//   footer: Fußleiste (Störungen, Stand der Daten); im dichten Stil links neben der Uhr-Box, sonst unten
//   wheel, stripe: CI-Rad links und Streifen rechts; im Splitscreen nur am Bildschirmrand
export default function Frame({ style = 'ci', orientation = 'landscape', clock = null, footer, wheel = true, stripe = true, children }) {
  const props = { clock, footer, wheel, stripe }
  if (orientation === 'portrait') return <PortraitFrame style={style} {...props}>{children}</PortraitFrame>
  if (style === 'dense') return <DenseFrame {...props}>{children}</DenseFrame>
  if (style === 'dark') return <DarkFrame {...props}>{children}</DarkFrame>
  return <CiFrame {...props}>{children}</CiFrame>
}
