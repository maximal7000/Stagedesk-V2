// Escape or a click on the backdrop calls onClose; the page decides whether a draft may be discarded.
import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export default function SidePanel({ title, eyebrow, onClose, footer, children, width = 'max-w-xl', ...rest }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) onCloseRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`h-full w-full ${width} bg-overlay border-l border-line flex flex-col focus:outline-none`} {...rest}>
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-line-subtle">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle mb-1">{eyebrow}</p>}
            <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight text-fg truncate">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Schließen" title="Schließen"
            className="p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line-subtle flex items-center gap-2">{footer}</footer>}
      </aside>
    </div>
  )
}
