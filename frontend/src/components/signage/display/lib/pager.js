import { useEffect, useLayoutEffect, useState } from 'react'
import { packByHeight } from './fit'

export function paginate(items, perPage) {
  if (!items.length) return []
  const size = Number.isFinite(perPage) && perPage >= 1 ? Math.floor(perPage) : items.length
  const pages = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

// A row taller than `available` gets a page of its own.
export function paginateByHeight(heights, available) {
  return packByHeight(heights, available)
}

export function usePager(pages, seconds) {
  const count = pages.length
  const [raw, setRaw] = useState(0)
  useEffect(() => {
    if (count <= 1 || !(seconds > 0)) return undefined
    const id = setInterval(() => setRaw((i) => i + 1), seconds * 1000)
    return () => clearInterval(id)
  }, [count, seconds])
  return { index: count ? raw % count : 0, count }
}

// Heights of the children of ref (a hidden measuring layer), re-measured after the fonts load too.
export function useChildHeights(ref, deps) {
  const [heights, setHeights] = useState([])
  useLayoutEffect(() => {
    let alive = true
    const measure = () => {
      const el = ref.current
      if (!alive || !el) return
      const next = [...el.children].map((child) => child.getBoundingClientRect().height)
      setHeights((prev) => (prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next))
    }
    measure()
    document.fonts?.ready?.then(measure)
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return heights
}
