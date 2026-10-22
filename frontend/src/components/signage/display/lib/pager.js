import { useEffect, useState } from 'react'
import { packByHeight } from './fit'

export function paginate(items, perPage) {
  if (!items.length) return []
  const size = Number.isFinite(perPage) && perPage >= 1 ? Math.floor(perPage) : items.length
  const pages = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

// Seiten aus gemessenen Zeilenhöhen: Indizes je Seite, die in `available` passen.
// Eine Zeile, die höher ist als `available`, bekommt eine eigene Seite.
export function paginateByHeight(heights, available) {
  return packByHeight(heights, available)
}

// Wechselt alle `seconds` Sekunden die Seite. Kein Timer bei höchstens einer Seite.
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
