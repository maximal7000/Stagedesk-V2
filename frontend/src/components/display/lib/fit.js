import { useLayoutEffect, useRef, useState } from 'react'

const rootRemPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

// Größe eines Elements in px plus rem-Basis. Gemessen, sobald das Element (neu) im Baum hängt, und danach
// nur bei Größenänderung (ResizeObserver), nie im Sekundentakt. Das Element darf später erscheinen
// (z.B. erst nach dem Laden der Daten statt eines Leerzustands): jeder Render prüft, ob ref.current
// ein anderes Element ist, und hängt Messung und Beobachter dann um.
export function useBoxSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0, remPx: 16 })
  const watched = useRef({ el: null, observer: null })
  useLayoutEffect(() => {
    const el = ref.current
    if (el === watched.current.el) return
    watched.current.observer?.disconnect()
    watched.current = { el, observer: null }
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      const remPx = rootRemPx()
      setSize((s) => (s.width === width && s.height === height && s.remPx === remPx ? s : { width, height, remPx }))
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(el)
      watched.current.observer = observer
    }
  })
  useLayoutEffect(() => () => watched.current.observer?.disconnect(), [])
  return size
}

// Zeilenzahl für eine Liste: so viele, wie bei der Mindestschrift minRem passen, höchstens max und count.
// Die Schrift wächst danach bis prefRem, soweit die Höhe reicht. lineFactor = Zeilenhöhe / Schriftgröße.
export function fitRows({ height, remPx, count, max, minRem, prefRem, lineFactor }) {
  const pref = prefRem * remPx
  if (!(height > 0) || !(count > 0)) return { rows: 0, fontPx: pref }
  const atMin = Math.floor(height / (minRem * remPx * lineFactor))
  const rows = Math.max(0, Math.min(count, max > 0 ? max : count, atMin))
  return { rows, fontPx: rows ? Math.min(pref, height / (rows * lineFactor)) : pref }
}

// Teilt Einträge mit gemessenen Höhen in Seiten, die jeweils in `height` passen (mindestens ein Eintrag je Seite).
// Ergebnis: Listen von Indizes.
export function packByHeight(heights, height, gap = 0) {
  const pages = []
  let page = []
  let used = 0
  heights.forEach((h, i) => {
    const need = page.length ? used + gap + h : h
    if (page.length && need > height) {
      pages.push(page)
      page = [i]
      used = h
    } else {
      page.push(i)
      used = need
    }
  })
  if (page.length) pages.push(page)
  return pages
}
