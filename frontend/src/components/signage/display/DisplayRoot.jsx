import '@fontsource/oswald/300.css'
import '@fontsource/oswald/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import './display.css'
import { Frame } from './frame'
import { MODE_COMPONENTS, isSplitMode } from './modes'
import EmergencyMode from './modes/EmergencyMode'
import ConnectionLost from './states/ConnectionLost'
import IdleScreen from './states/IdleScreen'
import Loading from './states/Loading'
import ScreenNotFound from './states/ScreenNotFound'
import { VIEW_COMPONENTS } from './views'

function viewportOrientation() {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
}

export default function DisplayRoot(props) {
  return (
    <div className="fixed inset-0 overflow-hidden">
      <DisplayContent {...props} />
    </div>
  )
}

// Does not re-render every second; only the clock and countdown do.
function DisplayContent({ payload, state, lastOkAt, nextRetryAt, error, slug = '', preview = null }) {
  const screen = payload?.screen ?? null
  const scheme = payload?.scheme === 'dark' ? 'dark' : 'light'
  const orientation = screen?.orientation ?? viewportOrientation()

  if (preview && error?.status === 404) return <ScreenNotFound previewExpired orientation={orientation} />
  if (!payload) {
    if (state === 'lost') return <ConnectionLost lastOkAt={lastOkAt} nextRetryAt={nextRetryAt} orientation={orientation} />
    return <Loading orientation={orientation} />
  }
  if (!screen && !payload.view) return <ScreenNotFound slug={slug} orientation={orientation} />
  // A cached emergency stays, even offline and with "off" in the cache (the server switches on during
  // an emergency); with "Stand HH:MM" of the last data.
  if (state === 'lost' && payload.mode?.kind === 'emergency') {
    return <EmergencyMode mode={payload.mode} orientation={orientation} staleSince={lastOkAt ?? null} />
  }
  if (state === 'lost') {
    return <ConnectionLost screenName={screen?.name} lastOkAt={lastOkAt} nextRetryAt={nextRetryAt} orientation={orientation} />
  }
  if (screen?.power === false) return <IdleScreen orientation={orientation} />

  const staleSince = state === 'stale' ? lastOkAt : null
  const Mode = payload.mode ? MODE_COMPONENTS[payload.mode.kind] : null
  if (Mode) {
    if (isSplitMode(payload.mode) && payload.view) {
      return <ModeSplit mode={payload.mode} view={payload.view} scheme={scheme} orientation={orientation} staleSince={staleSince} />
    }
    return <Mode mode={payload.mode} orientation={orientation} staleSince={staleSince} />
  }
  if (!payload.view) return <Loading orientation={orientation} />
  return <ViewScreen view={payload.view} scheme={scheme} orientation={orientation} staleSince={staleSince} />
}

function ModeSplit({ mode, view, scheme, orientation, staleSince }) {
  const Mode = MODE_COMPONENTS[mode.kind]
  const side = mode.side === 'left' ? 'left' : 'right'
  const portrait = orientation === 'portrait'
  const modePanel = (
    <div key="mode" className="relative shrink-0" style={{ flexBasis: '38%' }}>
      <Mode mode={mode} orientation={orientation} panel={side} />
    </div>
  )
  const viewPanel = (
    <div key="view" className="relative min-h-0 min-w-0 flex-1">
      <ViewScreen
        view={view}
        scheme={scheme}
        orientation={orientation}
        staleSince={staleSince}
        wheel={portrait || side === 'right'}
        stripe={portrait || side === 'left'}
      />
    </div>
  )
  return (
    <div data-mode-split={side} className={`absolute inset-0 flex ${portrait ? 'flex-col' : ''}`}>
      {side === 'left' ? [modePanel, viewPanel] : [viewPanel, modePanel]}
    </div>
  )
}

function ViewScreen({ view, scheme = 'light', orientation, staleSince = null, wheel = true, stripe = true }) {
  if (!view) return <Loading orientation={orientation} />
  const View = VIEW_COMPONENTS[view.kind]
  if (View?.ownFrame) {
    return <View view={view} orientation={orientation} frame={{ scheme, staleSince, wheel, stripe }} screen={ViewScreen} />
  }
  const weatherInFooter = typeof View?.weatherInFooter === 'function' ? View.weatherInFooter(view) : !!View?.weatherInFooter
  const clock = { showWeather: view.show_weather && !weatherInFooter, weather: view.weather, staleSince }
  const footer = View?.Footer ? <View.Footer view={view} /> : null
  return (
    <Frame layout={view.layout} scheme={scheme} orientation={orientation} clock={clock} footer={footer} wheel={wheel} stripe={stripe}>
      <div data-display-state="view" data-view-kind={view.kind} className="h-full">
        {View ? <View view={view} /> : <Loading bare />}
      </div>
    </Frame>
  )
}
