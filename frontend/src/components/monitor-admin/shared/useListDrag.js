// Sortieren per Ziehen mit nativem HTML5-Drag (keine Bibliothek): Zeilen bekommen die Handler aus
// rowProps(index); beim Ablegen ruft der Hook onMove(von, nach). Die Tastatur-Alternative liefert
// handleKeyDown (Pfeil hoch/runter am Griff).
import { useState } from 'react'

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

// Gemeinsame Klassen: gezogene Zeile blass, Zielzeile hinterlegt
export const dragRowClass = 'data-[dragging]:opacity-50 data-[drop-target]:bg-raised'
