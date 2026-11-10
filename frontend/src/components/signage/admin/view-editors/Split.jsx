import { useId } from 'react'
import { Field, Section, fieldClass } from '../shared/form'
import DeparturesEditor from './Departures'
import InfoEditor from './Info'
import MediaEditor from './Media'
import SubstitutionsEditor from './Substitutions'

const SIDE_CONTENT = [
  { value: 'substitutions', label: 'Vertretungsplan' },
  { value: 'departures', label: 'Abfahrten' },
  { value: 'media', label: 'Medien' },
  { value: 'info', label: 'Ankündigungen' },
]
const isSubstitutions = (v) => v === 'substitutions' || v === 'webuntis'

export default function SplitEditor({ draft, set, viewId }) {
  const ids = { width: useId(), left: useId(), right: useId() }
  const left = isSubstitutions(draft.split_left) ? 'substitutions' : draft.split_left
  const right = isSubstitutions(draft.split_right) ? 'substitutions' : draft.split_right
  const percent = Number(draft.split_left_percent) || 50
  const sides = [left, right]
  return (
    <>
      <Section title="Aufteilung" data-editor-section="split">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* A select: four kinds of content no longer fit side by side as buttons */}
          <Field label="Links" htmlFor={ids.left}>
            <select id={ids.left} value={left} onChange={(e) => set('split_left', e.target.value)} className={fieldClass}>
              {SIDE_CONTENT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Rechts" htmlFor={ids.right}>
            <select id={ids.right} value={right} onChange={(e) => set('split_right', e.target.value)} className={fieldClass}>
              {SIDE_CONTENT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Breite links" htmlFor={ids.width} className="sm:col-span-2" help="Anteil der linken Seite an der Bildschirmbreite, 20 bis 80 %.">
            <div className="flex items-center gap-3">
              <input id={ids.width} type="range" min="20" max="80" step="5" value={percent}
                onChange={(e) => set('split_left_percent', Number(e.target.value))} className="flex-1 accent-accent" />
              <span className="text-sm text-fg tabular-nums w-28 text-right">{percent} % zu {100 - percent} %</span>
            </div>
          </Field>
        </div>
      </Section>
      {sides.includes('departures') && <DeparturesEditor draft={draft} set={set} viewId={viewId} />}
      {sides.includes('substitutions') && <SubstitutionsEditor draft={draft} set={set} />}
      {sides.includes('media') && <MediaEditor draft={draft} set={set} />}
      {sides.includes('info') && <InfoEditor draft={draft} set={set} title="Ankündigungen und Termine" />}
    </>
  )
}
