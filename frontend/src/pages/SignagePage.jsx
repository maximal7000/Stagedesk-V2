/**
 * Public display page, full screen, no login. Reads only the URL and leaves rendering to DisplayRoot.
 * URL: ?screen=<slug> (old ?bildschirm=), ?view=<slug> (old ?profil=), ?key=, ?preview=<token>, ?zoom=
 */
import { useEffect, useMemo } from 'react'
import DisplayRoot from '../components/signage/display/DisplayRoot'
import { useDisplayData } from '../components/signage/display/lib/useDisplayData'
import { computeRootPx, readZoom } from '../components/signage/display/lib/scale'

function readParams(search) {
  const p = new URLSearchParams(search)
  return {
    screen: p.get('screen') || p.get('bildschirm') || '',
    view: p.get('view') || p.get('profil') || '',
    key: p.get('key') || '',
    preview: p.get('preview') || '',
  }
}

// rem base from viewport width, screen scaling and ?zoom=. Recomputed only on resize.
function useRootScale(scale, orientation) {
  useEffect(() => {
    const root = document.documentElement
    const zoom = readZoom()
    const apply = () => {
      const portrait = orientation ? orientation === 'portrait' : window.innerHeight > window.innerWidth
      root.style.fontSize = `${computeRootPx({
        width: window.innerWidth,
        orientation: portrait ? 'portrait' : 'landscape',
        scale,
        zoom,
      })}px`
    }
    apply()
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      root.style.fontSize = ''
    }
  }, [scale, orientation])
}

// Nightly reload around 4 am (random minute) so the kiosk runs stable for weeks
function useNightlyReload() {
  useEffect(() => {
    const now = new Date()
    const next = new Date(now)
    next.setHours(4, Math.floor(Math.random() * 15), 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    const id = setTimeout(() => window.location.reload(), next - now)
    return () => clearTimeout(id)
  }, [])
}

export default function SignagePage() {
  const params = useMemo(() => readParams(window.location.search), [])
  const data = useDisplayData({
    screen: params.screen || undefined,
    view: params.view || undefined,
    key: params.key || undefined,
    preview: params.preview || undefined,
  })
  const screen = data.payload?.screen
  useRootScale(screen?.scale, screen?.orientation)
  useNightlyReload()

  return <DisplayRoot {...data} slug={params.screen || params.view} preview={params.preview || null} />
}
