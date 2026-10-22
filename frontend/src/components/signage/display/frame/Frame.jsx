import NormalFrame from './NormalFrame'
import PortraitFrame from './PortraitFrame'
import WideFrame from './WideFrame'

// Picks the frame by layout and orientation. The frame fills its parent (absolute inset-0);
// DisplayRoot provides the full-screen area, the special-mode split screen one half.
//   layout: 'normal' | 'wide' (resolved by the server); scheme: 'light' | 'dark' (CSS class d-scheme-*)
//   clock:  {showWeather, weather, staleSince} or null (no clock)
//   footer: footer bar (disruptions, data age); in "Breit" left of the clock box, otherwise at the bottom
//   wheel, stripe: CI wheel left and stripe right; in split screen only at the screen edge
export default function Frame({ layout = 'normal', scheme = 'light', orientation = 'landscape', clock = null, footer, wheel = true, stripe = true, children }) {
  const props = { scheme, clock, footer, wheel, stripe }
  if (orientation === 'portrait') return <PortraitFrame layout={layout === 'wide' ? 'wide' : 'normal'} {...props}>{children}</PortraitFrame>
  if (layout === 'wide') return <WideFrame {...props}>{children}</WideFrame>
  return <NormalFrame {...props}>{children}</NormalFrame>
}
