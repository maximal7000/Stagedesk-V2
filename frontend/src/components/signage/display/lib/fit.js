import { useLayoutEffect, useRef, useState } from 'react'

const rootRemPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

// Size of an element in px plus the rem base. Measured when the element is (re)attached, then only
// on resize (ResizeObserver), never every second. The element may appear later
// (e.g. only after the data loads instead of an empty state): each render checks whether ref.current
// is a different element and then moves measurement and observer.
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
  // In StrictMode too (mount, cleanup, mount) the second run re-attaches the observer
  useLayoutEffect(() => () => {
    watched.current.observer?.disconnect()
    watched.current = { el: null, observer: null }
  }, [])
  return size
}

// Row count for a list: as many as fit at the minimum font minRem, at most max and count.
// The font then grows up to prefRem as far as the height allows. lineFactor = line height / font size.
export function fitRows({ height, remPx, count, max, minRem, prefRem, lineFactor }) {
  const pref = prefRem * remPx
  if (!(height > 0) || !(count > 0)) return { rows: 0, fontPx: pref }
  const atMin = Math.floor(height / (minRem * remPx * lineFactor))
  const rows = Math.max(0, Math.min(count, max > 0 ? max : count, atMin))
  return { rows, fontPx: rows ? Math.min(pref, height / (rows * lineFactor)) : pref }
}

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
