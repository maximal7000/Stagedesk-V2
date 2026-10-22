// Remount per action (change the key) so the timer starts over.
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../../ui'

export const UNDO_MS = 8000

export default function UndoToast({ message, onUndo, onClose, duration = UNDO_MS }) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current?.(), duration)
    return () => clearTimeout(timer)
  }, [duration])

  return (
    <div role="status" aria-live="polite" data-undo-toast
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] bg-overlay border border-line rounded-lg shadow-overlay pl-4 pr-2 py-2 flex items-center gap-3">
      <span className="text-sm text-fg min-w-0 truncate">{message}</span>
      {onUndo && (
        <Button size="sm" variant="secondary" onClick={() => { onUndo(); onCloseRef.current?.() }}>Rückgängig</Button>
      )}
      <button type="button" onClick={() => onCloseRef.current?.()} aria-label="Meldung schließen" title="Meldung schließen"
        className="p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
