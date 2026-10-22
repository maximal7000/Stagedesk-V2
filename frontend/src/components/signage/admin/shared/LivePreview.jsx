// Live-Vorschau (Spec §6.2): schickt den Entwurf entprellt an POST /views/preview und zeigt
// /signage?preview=<token> in einem iframe in der Originalgröße des gewählten Bildschirms, verkleinert per
// transform: scale(). Auflösung und Ausrichtung kommen vom Bildschirm (4K quer, im Hochformat 2160 × 3840).
import { useEffect, useId, useRef, useState } from 'react'
import { previewErrorText, usePreviewToken } from './usePreviewToken'
import { fieldClass } from './form'
import { screenSize } from '../pages/viewData'

const PORTRAIT_MAX_HEIGHT = 560

function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

export default function LivePreview({ payload, screens = [], defaultScreenId = null }) {
  const selectId = useId()
  const boxRef = useRef(null)
  const [chosenId, setChosenId] = useState(null)
  const screen = screens.find((s) => s.id === chosenId) ?? screens.find((s) => s.id === defaultScreenId) ?? screens[0] ?? null
  const { width, height } = screenSize(screen)
  const { token, error, pending } = usePreviewToken(payload, screen?.id ?? null)
  const boxWidth = useWidth(boxRef)
  const scale = boxWidth ? Math.min(boxWidth / width, height > width ? PORTRAIT_MAX_HEIGHT / height : Infinity) : 0
  const sizeLabel = `${width} × ${height}`

  return (
    <section className="bg-surface rounded-lg p-4" data-live-preview data-preview-state={error ? 'error' : token ? (pending ? 'updating' : 'ready') : 'loading'}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm text-fg-muted whitespace-nowrap">Live-Vorschau mit echten Daten</h2>
        {screens.length > 0 ? (
          <>
            <label htmlFor={selectId} className="sr-only">Bildschirm der Vorschau</label>
            <select id={selectId} value={screen?.id ?? ''} onChange={(e) => setChosenId(Number(e.target.value))}
              className={`${fieldClass.replace('w-full ', '')} min-w-0 max-w-64 py-1.5`}>
              {screens.map((s) => <option key={s.id} value={s.id}>{s.name} · {screenSize(s).width} × {screenSize(s).height}</option>)}
            </select>
          </>
        ) : (
          <span className="text-xs text-fg-subtle">Ohne Bildschirm · {sizeLabel}</span>
        )}
      </div>
      <div ref={boxRef} className="w-full">
        <div className="relative overflow-hidden rounded-md bg-canvas border border-line-subtle mx-auto"
          style={{ width: scale ? width * scale : '100%', height: scale ? height * scale : undefined, aspectRatio: scale ? undefined : `${width} / ${height}` }}>
          {token && scale > 0 && (
            <iframe key={token} title="Vorschau der Ansicht" src={`/signage?preview=${encodeURIComponent(token)}`} tabIndex={-1}
              aria-hidden="true"
              style={{ width, height, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none', border: 0 }}
              className="absolute left-0 top-0" />
          )}
          {!token && !error && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-fg-subtle">Vorschau wird erstellt…</p>
          )}
        </div>
      </div>
      <p className={`text-xs mt-2 ${error ? 'text-bad' : 'text-fg-subtle'}`} role={error ? 'alert' : undefined}>
        {error ? previewErrorText(error) : 'Zeigt den Stand mit den ungespeicherten Änderungen.'}
      </p>
    </section>
  )
}
