// Works on a copy; "Übernehmen" hands it back to the view draft. Removing the stop also happens
// here (keeps the table narrow enough for half the page width).
import { useEffect, useId, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '../../../ui'
import { Checkbox, Field, ListInput, fieldClass } from './form'
import StopSearch from './StopSearch'

export default function StopFilterDialog({ stop, onApply, onCancel, onRemove }) {
  const titleId = useId()
  const ids = { lines: useId(), direction: useId(), via: useId() }
  const [draft, setDraft] = useState(() => ({ ...stop }))
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))
  const onCancelRef = useRef(onCancel)
  useEffect(() => { onCancelRef.current = onCancel })
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancelRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setExtra = (result) => setDraft((d) => ({
    ...d,
    extra_id: result.id,
    extra_name: result.name,
    extra_source: result.source === 'nahsh' ? 'nahsh' : result.source === 'db' ? 'db' : '',
  }))
  const clearExtra = () => setDraft((d) => ({ ...d, extra_id: '', extra_name: '', extra_source: '' }))

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} data-stop-filter-dialog
        onSubmit={(e) => { e.preventDefault(); onApply(draft) }}
        className="bg-overlay border border-line rounded-lg shadow-overlay max-w-lg w-full max-h-[calc(100vh-2rem)] overflow-y-auto p-5">
        <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight text-fg">Filter für {stop.name}</h2>
        <div className="mt-4 space-y-4">
          <Field label="Linien" htmlFor={ids.lines} help="Nur diese Linien zeigen. Leer zeigt alle Linien.">
            <ListInput id={ids.lines} value={draft.filter_lines} onChange={(v) => set('filter_lines', v)} placeholder="zum Beispiel 5, 11, RE8" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Richtung" htmlFor={ids.direction} help="Nur Fahrten, deren Ziel diesen Text enthält.">
              <input id={ids.direction} value={draft.filter_direction ?? ''} onChange={(e) => set('filter_direction', e.target.value)}
                placeholder="zum Beispiel Travemünde" className={fieldClass} />
            </Field>
            <Field label="Via" htmlFor={ids.via} help="Nur Fahrten über diese Haltestelle.">
              <input id={ids.via} value={draft.filter_via ?? ''} onChange={(e) => set('filter_via', e.target.value)}
                placeholder="zum Beispiel Hauptbahnhof" className={fieldClass} />
            </Field>
          </div>
          <Field label="Verkehrsmittel">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Checkbox label="Bus" checked={draft.show_bus !== false} onChange={(v) => set('show_bus', v)} />
              <Checkbox label="Zug (Regionalverkehr, S-Bahn)" checked={draft.show_rail !== false} onChange={(v) => set('show_rail', v)} />
              <Checkbox label="Fernzug (ICE, IC)" checked={draft.show_long_distance !== false} onChange={(v) => set('show_long_distance', v)} />
            </div>
          </Field>
          <Field label="Zusatz-Haltestelle" help="Ihre Abfahrten erscheinen in derselben Liste, zum Beispiel von der anderen Straßenseite.">
            {draft.extra_id ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 bg-raised rounded-md px-3 py-2">
                  <span className="text-sm text-fg truncate">{draft.extra_name || draft.extra_id}</span>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={clearExtra}>Entfernen</Button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Checkbox label="Bus" checked={draft.extra_show_bus !== false} onChange={(v) => set('extra_show_bus', v)} />
                  <Checkbox label="Zug" checked={draft.extra_show_rail !== false} onChange={(v) => set('extra_show_rail', v)} />
                  <Checkbox label="Fernzug" checked={draft.extra_show_long_distance !== false} onChange={(v) => set('extra_show_long_distance', v)} />
                </div>
              </div>
            ) : (
              <StopSearch label="Zusatz-Haltestelle suchen" onSelect={setExtra} excludeIds={[stop.id]} />
            )}
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          {onRemove && <Button type="button" variant="danger" icon={Trash2} onClick={onRemove} className="mr-auto">Haltestelle entfernen</Button>}
          <Button type="button" variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button type="submit" variant="primary">Übernehmen</Button>
        </div>
      </form>
    </div>
  )
}
