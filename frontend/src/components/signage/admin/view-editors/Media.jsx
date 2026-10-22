import { useEffect, useId, useState } from 'react'
import { FileImage, FileText, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../../ui'
import { Field, Section, Segmented, fieldClass } from '../shared/form'
import DragHandle from '../shared/DragHandle'
import { dragRowClass, useListDrag } from '../shared/useListDrag'
import { errorText } from '../shared/errorText'
import { getFiles } from '../shared/api'
import { moveItem } from '../pages/viewData'

const MEDIA_KINDS = new Set(['pdf', 'image'])
const PER_SCREEN_OPTIONS = [1, 2, 3].map((n) => ({ value: n, label: String(n) }))
const PDF_MODE_OPTIONS = [
  { value: 'cycle', label: 'Alle Seiten' },
  { value: 'selection', label: 'Auswahl' },
  { value: 'static', label: 'Feste Seite' },
]
const PDF_MODE_HELP = {
  cycle: 'Alle Seiten nacheinander.',
  selection: 'Nur die angegebenen Seiten nacheinander.',
  static: 'Immer dieselbe Seite, mit der Zahl daneben gezeigter Seiten ab dieser.',
}

function FilesList({ items, files, onChange }) {
  const byId = Object.fromEntries(files.map((f) => [f.id, f]))
  const drag = useListDrag(items.length, (a, b) => onChange(moveItem(items, a, b)))
  return (
    <ul className="divide-y divide-line-subtle" data-media-items>
      {items.map((id, i) => {
        const file = byId[id]
        const Icon = file?.kind === 'pdf' ? FileText : FileImage
        const name = file?.name ?? 'Datei nicht mehr vorhanden'
        return (
          <li key={id} {...drag.rowProps(i)} className={`flex items-center gap-2 py-2 ${dragRowClass}`}>
            <DragHandle label={`${name} verschieben`} onKeyDown={drag.handleKeyDown(i)} />
            <Icon className="w-4 h-4 text-fg-subtle shrink-0" aria-hidden="true" />
            <span className={`flex-1 min-w-0 truncate text-sm ${file ? 'text-fg' : 'text-fg-subtle'}`}>{name}</span>
            <span className="text-xs text-fg-subtle">{file?.kind === 'pdf' ? 'PDF' : file ? 'Bild' : ''}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`${name} entfernen`} title={`${name} entfernen`}
              className="p-1.5 rounded-md text-fg-subtle hover:text-bad hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default function MediaEditor({ draft, set }) {
  const ids = { add: useId(), seconds: useId(), pages: useId(), page: useId() }
  const [files, setFiles] = useState(null)
  const [error, setError] = useState(null)
  const [pick, setPick] = useState('')
  const items = draft.media_items ?? []
  const mode = draft.pdf_mode ?? 'cycle'

  useEffect(() => {
    let alive = true
    getFiles().then((list) => { if (alive) setFiles(list) }, (e) => { if (alive) setError(e) })
    return () => { alive = false }
  }, [])

  // Only PDFs and images; logos and backgrounds do not belong in the media view
  const available = (files ?? []).filter((f) => MEDIA_KINDS.has(f.kind) && !items.includes(f.id))
  const add = () => {
    if (!pick) return
    set('media_items', [...items, Number(pick)])
    setPick('')
  }

  return (
    <>
      <Section title="Dateien" data-editor-section="media"
        aside={items.length > 1 ? <span className="text-xs text-fg-subtle">Reihenfolge per Ziehen</span> : null}>
        {error && <p className="text-sm text-bad mb-3">Dateien konnten nicht geladen werden. {errorText(error, '')}</p>}
        {items.length ? (
          <FilesList items={items} files={files ?? []} onChange={(v) => set('media_items', v)} />
        ) : (
          <p className="text-sm text-fg-muted">Noch keine Datei gewählt. Dateien hochladen unter Medien.</p>
        )}
        <div className="mt-4 flex items-center gap-2">
          <label htmlFor={ids.add} className="sr-only">Datei wählen</label>
          <select id={ids.add} value={pick} onChange={(e) => setPick(e.target.value)} disabled={!available.length} className={`${fieldClass} max-w-sm`}>
            <option value="">{files && !available.length ? 'Keine weiteren Dateien' : 'Datei wählen'}</option>
            {available.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <Button icon={Plus} onClick={add} disabled={!pick}>Hinzufügen</Button>
        </div>
      </Section>
      <Section title="Darstellung" data-editor-section="media-display">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sekunden pro Seite" htmlFor={ids.seconds} help="So lange steht jede Seite oder jedes Bild.">
            <input id={ids.seconds} type="number" min="3" max="600" value={draft.media_seconds ?? 10}
              onChange={(e) => set('media_seconds', e.target.value === '' ? '' : Number(e.target.value))} className={`${fieldClass} tabular-nums`} />
          </Field>
          <Field label="Seiten nebeneinander" help="Zwei oder drei Hochformat-Seiten passen auf einen Querbildschirm.">
            <Segmented label="Seiten nebeneinander" options={PER_SCREEN_OPTIONS} value={Number(draft.pdf_per_screen) || 1}
              onChange={(v) => set('pdf_per_screen', v)} />
          </Field>
          <Field label="Modus" className="sm:col-span-2" help={`Gilt für PDFs. ${PDF_MODE_HELP[mode] ?? ''}`}>
            <div className="max-w-md">
              <Segmented label="Modus" options={PDF_MODE_OPTIONS} value={mode} onChange={(v) => set('pdf_mode', v)} />
            </div>
          </Field>
          {mode === 'selection' && (
            <Field label="Seiten" htmlFor={ids.pages} help="Einzelne Seiten und Bereiche, durch Komma getrennt.">
              <input id={ids.pages} value={draft.pdf_pages ?? ''} onChange={(e) => set('pdf_pages', e.target.value)}
                placeholder="zum Beispiel 1, 3, 5-7" className={fieldClass} />
            </Field>
          )}
          {mode === 'static' && (
            <Field label="Seite" htmlFor={ids.page}>
              <input id={ids.page} type="number" min="1" max="999" value={draft.pdf_static_page ?? 1}
                onChange={(e) => set('pdf_static_page', e.target.value === '' ? '' : Number(e.target.value))} className={`${fieldClass} tabular-nums max-w-32`} />
            </Field>
          )}
        </div>
      </Section>
    </>
  )
}
