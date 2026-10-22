import { useState } from 'react'
import { moveItem } from '../pages/viewData'

export function useListDrag(count, onMove) {
  const [from, setFrom] = useState(null)
  const [over, setOver] = useState(null)
  const end = () => { setFrom(null); setOver(null) }

  const rowProps = (index) => ({
    draggable: true,
    'data-dragging': from === index ? '' : undefined,
    'data-drop-target': over === index && from !== null && from !== index ? '' : undefined,
    onDragStart(e) {
      setFrom(index)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    },
    onDragOver(e) {
      if (from === null) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== index) setOver(index)
    },
    onDrop(e) {
      e.preventDefault()
      if (from !== null && from !== index) onMove(from, index)
      end()
    },
    onDragEnd: end,
  })

  const handleKeyDown = (index) => (e) => {
    if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); onMove(index, index - 1) }
    if (e.key === 'ArrowDown' && index < count - 1) { e.preventDefault(); onMove(index, index + 1) }
  }

  return { rowProps, handleKeyDown }
}

export const dragRowClass = 'data-[dragging]:opacity-50 data-[drop-target]:bg-raised'

// Stable keys per row (items have no id): move, remove and add carry them so React keeps the row
// and its focus. If the count does not match (discard, reload) they are reassigned.
let nextRowKey = 0
const freshKey = () => `row-${++nextRowKey}`

export function useRowKeys(count) {
  const [keys, setKeys] = useState(() => Array.from({ length: count }, freshKey))
  let current = keys
  if (keys.length !== count) {
    current = Array.from({ length: count }, freshKey)
    setKeys(current)
  }
  return {
    keys: current,
    move: (a, b) => setKeys((k) => moveItem(k, a, b)),
    remove: (i) => setKeys((k) => k.filter((_, j) => j !== i)),
    add: () => setKeys((k) => [...k, freshKey()]),
  }
}
