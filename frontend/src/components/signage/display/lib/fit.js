import { useLayoutEffect, useRef, useState } from 'react'

const rootRemPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

// Measured on (re)attach, then only on resize, never every second. Each render checks whether
// ref.current is a different element (it may appear only after the data loads).
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

// Number of grid columns for cells with minimum widths (all in rem): all side by side when they fit,
// otherwise as many as the widest minimum allows. Width 0 (not measured yet) keeps all.
export function wrapColumns(mins, width, gap) {
  const count = mins.length
  if (!(width > 0) || !count) return count
  const needed = mins.reduce((a, b) => a + b, 0) + gap * (count - 1)
  if (needed <= width) return count
  return Math.max(1, Math.floor((width + gap) / (Math.max(...mins) + gap)))
}
