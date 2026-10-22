// Griff einer sortierbaren Zeile: Ziehen mit der Maus, Pfeiltasten mit der Tastatur.
import { GripVertical } from 'lucide-react'

export default function DragHandle({ label, onKeyDown }) {
  return (
    <button type="button" aria-label={label} title="Ziehen oder mit Pfeiltasten verschieben" onKeyDown={onKeyDown}
      className="p-1 rounded-md text-fg-subtle hover:text-fg cursor-grab focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <GripVertical className="w-4 h-4" />
    </button>
  )
}
