import NormalFrame from './NormalFrame'
import PortraitFrame from './PortraitFrame'
import WideFrame from './WideFrame'

export default function Frame({ layout = 'normal', scheme = 'light', orientation = 'landscape', clock = null, footer, wheel = true, stripe = true, children }) {
  const props = { scheme, clock, footer, wheel, stripe }
  if (orientation === 'portrait') return <PortraitFrame layout={layout === 'wide' ? 'wide' : 'normal'} {...props}>{children}</PortraitFrame>
  if (layout === 'wide') return <WideFrame {...props}>{children}</WideFrame>
  return <NormalFrame {...props}>{children}</NormalFrame>
}
