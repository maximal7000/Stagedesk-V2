// Bestätigungsdialog des Monitor-Admin. tone='danger' füllt den Bestätigen-Knopf rot (einziger Ort dafür).
import { useEffect, useId, useRef } from 'react'
import { Button } from '../../../ui'

export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId()
  const cancelRef = useRef(null)
  const dialogRef = useRef(null)

  // Beim Öffnen: Fokus auf "Abbrechen"
  useEffect(() => { cancelRef.current?.focus() }, [])

  // Escape gilt nur im Dialog und erreicht die Seite nicht (ein offenes Seitenpanel bleibt offen);
  // Tab bleibt zwischen den Knöpfen des Dialogs
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel?.()
    } else if (e.key === 'Tab') {
      const items = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], input, select, textarea')]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onKeyDown={onKeyDown}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="bg-overlay border border-line rounded-lg shadow-overlay max-w-md w-full p-5 focus:outline-none">
        <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight text-fg">{title}</h2>
        {body && <div className="mt-2 text-sm text-fg-muted">{body}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          {tone === 'danger' ? (
            // Eigener Knopf statt Button-Variante: die Akzentfläche von "primary" ließe sich nicht sicher überschreiben
            <button type="button" onClick={onConfirm} disabled={busy}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium leading-none px-3.5 py-2 rounded-md whitespace-nowrap bg-bad text-white hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-bad focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:bg-raised disabled:text-fg-disabled">
              {confirmLabel}
            </button>
          ) : (
            <Button variant="primary" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
