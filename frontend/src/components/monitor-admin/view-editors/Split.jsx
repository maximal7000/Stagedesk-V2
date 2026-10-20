// Editor für die geteilte Ansicht (Spec §3.1): Inhalt links und rechts, Breite der linken Seite.
// Zeigt eine Seite Abfahrten oder den Vertretungsplan, folgen darunter deren Einstellungen.
import { useId } from 'react'
import { Field, Section, Segmented } from '../shared/form'
import DeparturesEditor from './Departures'
import SubstitutionsEditor from './Substitutions'

const SIDE_CONTENT = [
  { value: 'substitutions', label: 'Vertretungsplan' },
  { value: 'departures', label: 'Abfahrten' },
]
const isSubstitutions = (v) => v === 'substitutions' || v === 'webuntis'

export default function SplitEditor({ draft, set, viewId }) {
  const widthId = useId()
  const left = isSubstitutions(draft.split_left) ? 'substitutions' : draft.split_left
  const right = isSubstitutions(draft.split_right) ? 'substitutions' : draft.split_right
  const percent = Number(draft.split_left_percent) || 50
  const sides = [left, right]
  return (
    <>
      <Section title="Aufteilung" data-editor-section="split">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Links">
            <Segmented label="Inhalt links" options={SIDE_CONTENT} value={left} onChange={(v) => set('split_left', v)} />
          </Field>
          <Field label="Rechts">
            <Segmented label="Inhalt rechts" options={SIDE_CONTENT} value={right} onChange={(v) => set('split_right', v)} />
          </Field>
          <Field label="Breite links" htmlFor={widthId} className="sm:col-span-2" help="Anteil der linken Seite an der Bildschirmbreite, 20 bis 80 %.">
            <div className="flex items-center gap-3">
              <input id={widthId} type="range" min="20" max="80" step="5" value={percent}
                onChange={(e) => set('split_left_percent', Number(e.target.value))} className="flex-1 accent-accent" />
              <span className="text-sm text-fg tabular-nums w-28 text-right">{percent} % zu {100 - percent} %</span>
            </div>
          </Field>
        </div>
      </Section>
      {sides.includes('departures') && <DeparturesEditor draft={draft} set={set} viewId={viewId} />}
      {sides.includes('substitutions') && <SubstitutionsEditor draft={draft} set={set} />}
    </>
  )
}
