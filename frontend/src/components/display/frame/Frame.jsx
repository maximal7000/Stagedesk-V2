import CiFrame from './CiFrame'
import DarkFrame from './DarkFrame'
import DenseFrame from './DenseFrame'
import PortraitFrame from './PortraitFrame'

// Wählt den Rahmen nach Stil und Ausrichtung. clock: {showWeather, weather, staleSince} oder null (ohne Uhr).
// footer: Fußleiste links neben der Uhr-Box (nur dichte Ansichten).
export default function Frame({ style = 'ci', orientation = 'landscape', clock = null, footer, children }) {
  if (orientation === 'portrait') return <PortraitFrame style={style} clock={clock} footer={footer}>{children}</PortraitFrame>
  if (style === 'dense') return <DenseFrame clock={clock} footer={footer}>{children}</DenseFrame>
  if (style === 'dark') return <DarkFrame clock={clock}>{children}</DarkFrame>
  return <CiFrame clock={clock}>{children}</CiFrame>
}
