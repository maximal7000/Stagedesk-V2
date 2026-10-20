import '@fontsource/oswald/300.css'
import '@fontsource/oswald/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import './display.css'
import { Frame } from './frame'
import ConnectionLost from './states/ConnectionLost'
import IdleScreen from './states/IdleScreen'
import Loading from './states/Loading'
import ScreenNotFound from './states/ScreenNotFound'

// Ansichten je kind; Tasks 11/12 tragen sie ein. Fehlende Typen zeigen vorübergehend "Wird geladen" im Rahmen.
const VIEW_COMPONENTS = {}

function viewportOrientation() {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
}

// Wählt Zustand, Sondermodus oder Ansicht. Rendert nicht sekündlich; das tun nur Uhr und Countdown.
// slug: Bildschirm- oder Ansichts-Slug aus der URL, preview: Vorschau-Token.
export default function DisplayRoot({ payload, state, lastOkAt, nextRetryAt, error, slug = '', preview = null }) {
  const screen = payload?.screen ?? null
  const orientation = screen?.orientation ?? viewportOrientation()

  if (preview && error?.status === 404) return <ScreenNotFound previewExpired orientation={orientation} />
  if (!payload) {
    if (state === 'lost') return <ConnectionLost lastOkAt={lastOkAt} nextRetryAt={nextRetryAt} orientation={orientation} />
    return <Loading orientation={orientation} />
  }
  if (!screen && !payload.view) return <ScreenNotFound slug={slug} orientation={orientation} />
  if (state === 'lost') {
    return <ConnectionLost screenName={screen?.name} lastOkAt={lastOkAt} nextRetryAt={nextRetryAt} orientation={orientation} />
  }
  if (screen?.power === false) return <IdleScreen orientation={orientation} />
  if (payload.mode) return <Loading orientation={orientation} />

  const staleSince = state === 'stale' ? lastOkAt : null
  return <ViewScreen view={payload.view} orientation={orientation} staleSince={staleSince} />
}

function ViewScreen({ view, orientation, staleSince }) {
  const View = VIEW_COMPONENTS[view.kind]
  const clock = { showWeather: view.show_weather, weather: view.weather, staleSince }
  return (
    <Frame style={view.style} orientation={orientation} clock={clock}>
      <div data-display-state="view" data-view-kind={view.kind} className="h-full">
        {View ? <View view={view} /> : <Loading bare />}
      </div>
    </Frame>
  )
}
