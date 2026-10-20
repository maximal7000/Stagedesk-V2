/**
 * Öffentliche Monitor-Anzeige, Vollbild, ohne Login.
 * Liest nur die URL, holt die Daten und überlässt die Darstellung DisplayRoot.
 * URL: ?screen=<slug> (alt ?bildschirm=), ?view=<slug> (alt ?profil=), ?key=, ?preview=<token>, ?zoom=
 */
import { useEffect, useMemo } from 'react'
import DisplayRoot from '../components/display/DisplayRoot'
import { useDisplayData } from '../components/display/lib/useDisplayData'
import { computeRootPx, readZoom } from '../components/display/lib/scale'

function readParams(search) {
  const p = new URLSearchParams(search)
  return {
    screen: p.get('screen') || p.get('bildschirm') || '',
    view: p.get('view') || p.get('profil') || '',
    key: p.get('key') || '',
    preview: p.get('preview') || '',
  }
}

// rem-Basis aus Viewport-Breite, Skalierung des Bildschirms und ?zoom=. Neu berechnet nur bei Größenänderung.
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

// Nächtliches Neuladen gegen 4 Uhr (zufällige Minute), damit der Kiosk über Wochen stabil läuft
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

export default function MonitorPage() {
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
