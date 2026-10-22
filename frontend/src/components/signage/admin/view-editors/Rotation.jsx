// Editor für den Wechsel (Spec §3.1): Liste aus Ansicht und Sekunden, sortierbar per Ziehen.
// Wechsel-Ansichten und die eigene Ansicht sind nicht wählbar (Backend: validate_rotation_items).
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../../ui'
import { Section, fieldClass } from '../shared/form'
import DragHandle from '../shared/DragHandle'
import { dragRowClass, useListDrag, useRowKeys } from '../shared/useListDrag'
import {
  MAX_ROTATION_SECONDS, MIN_ROTATION_SECONDS, kindLabel, moveItem, rotationChoices, rotationProblems,
} from '../pages/viewData'

// Typ nur nennen, wenn der Name ihn nicht schon enthält ("Abfahrten (Abfahrten)" vermeiden)
function optionLabel(view) {
  const kind = kindLabel(view.kind)
  return view.name.toLowerCase().includes(kind.toLowerCase()) ? view.name : `${view.name} (${kind})`
}

export default function RotationEditor({ draft, set, views, viewId }) {
  const items = draft.rotation_items ?? []
  // Die leere Liste erklärt sich selbst; gemeldet werden unvollständige Zeilen
  const problems = items.length ? rotationProblems(items) : []
  const choices = rotationChoices(views, viewId)
  const names = Object.fromEntries((views ?? []).map((v) => [v.id, v.name]))
  const setItems = (next) => set('rotation_items', next)
  const update = (i, patch) => setItems(items.map((item, j) => (j === i ? { ...item, ...patch } : item)))
  const rowKeys = useRowKeys(items.length)
  const drag = useListDrag(items.length, (a, b) => { rowKeys.move(a, b); setItems(moveItem(items, a, b)) })
  const remove = (i) => { rowKeys.remove(i); setItems(items.filter((_, j) => j !== i)) }
  const add = () => { rowKeys.add(); setItems([...items, { view_id: null, seconds: 15 }]) }

  return (
    <Section title="Ansichten im Wechsel" data-editor-section="rotation"
      aside={items.length > 1 ? <span className="text-xs text-fg-subtle">Reihenfolge per Ziehen</span> : null}>
      {items.length ? (
        <ol className="divide-y divide-line-subtle" data-rotation-items>
          {items.map((item, i) => {
            const label = names[item.view_id] ?? `Zeile ${i + 1}`
            const known = choices.some((v) => v.id === item.view_id)
            return (
              <li key={rowKeys.keys[i]} {...drag.rowProps(i)} className={`flex items-center gap-2 py-2 ${dragRowClass}`}>
                <DragHandle label={`${label} verschieben`} onKeyDown={drag.handleKeyDown(i)} />
                <span className="w-5 text-right text-sm text-fg-subtle tabular-nums">{i + 1}</span>
                <label className="sr-only" htmlFor={`rotation-view-${i}`}>Ansicht in Zeile {i + 1}</label>
                <select id={`rotation-view-${i}`} value={item.view_id ?? ''} onChange={(e) => update(i, { view_id: e.target.value ? Number(e.target.value) : null })}
                  className={`${fieldClass} flex-1 min-w-0`}>
                  <option value="">Ansicht wählen</option>
                  {!known && item.view_id && <option value={item.view_id}>Nicht mehr verfügbar</option>}
                  {choices.map((v) => <option key={v.id} value={v.id}>{optionLabel(v)}</option>)}
                </select>
                <div className="relative w-28 shrink-0">
                  <input type="number" min={MIN_ROTATION_SECONDS} max={MAX_ROTATION_SECONDS} aria-label={`Sekunden für ${label}`}
                    value={item.seconds ?? ''} onChange={(e) => update(i, { seconds: e.target.value === '' ? '' : Number(e.target.value) })}
                    className={`${fieldClass} pr-8 tabular-nums`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle pointer-events-none">s</span>
                </div>
                <button type="button" onClick={() => remove(i)} aria-label={`${label} entfernen`} title={`${label} entfernen`}
                  className="p-1.5 rounded-md text-fg-subtle hover:text-bad hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-sm text-fg-muted">Noch keine Ansicht im Wechsel.</p>
      )}
      {problems.length > 0 && (
        <ul className="mt-3 space-y-1" data-rotation-problems>
          {problems.map((p) => <li key={p} className="text-xs text-bad">{p}</li>)}
        </ul>
      )}
      <div className="mt-4">
        {choices.length ? (
          <Button icon={Plus} onClick={add}>Ansicht hinzufügen</Button>
        ) : (
          <p className="text-sm text-fg-muted">Es gibt noch keine andere Ansicht. Erst eine Ansicht anlegen, dann hier hinzufügen.</p>
        )}
        <p className="text-xs text-fg-subtle mt-2">
          Jede Ansicht steht {MIN_ROTATION_SECONDS} bis {MAX_ROTATION_SECONDS} Sekunden, dann folgt die nächste. Wechsel lassen sich nicht ineinander schachteln.
        </p>
      </div>
    </Section>
  )
}
