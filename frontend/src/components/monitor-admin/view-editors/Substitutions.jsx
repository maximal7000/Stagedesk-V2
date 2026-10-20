// Editor für den Vertretungsplan (Spec §3.1, §4.3): zweite Spalte "Morgen", Blättertakt und der
// iframe-Rückfall, falls WebUntis keine Daten liefert oder der Bildschirm keinen Schlüssel hat.
import { useId } from 'react'
import { Checkbox, Field, Section, fieldClass } from '../shared/form'

export function PageSecondsField({ draft, set }) {
  const id = useId()
  return (
    <Field label="Blättertakt" htmlFor={id} help="Sekunden pro Seite, wenn eine Liste nicht auf den Bildschirm passt.">
      <div className="relative max-w-40">
        <input id={id} type="number" min="5" max="120" value={draft.page_seconds ?? 15}
          onChange={(e) => set('page_seconds', e.target.value === '' ? '' : Number(e.target.value))}
          className={`${fieldClass} pr-8 tabular-nums`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle pointer-events-none">s</span>
      </div>
    </Field>
  )
}

export default function SubstitutionsEditor({ draft, set }) {
  const ids = { url: useId(), compact: useId() }
  return (
    <Section title="Vertretungsplan" data-editor-section="substitutions">
      <div className="space-y-4">
        <Checkbox label="Morgen zeigen" checked={draft.substitutions_next_day !== false}
          onChange={(v) => set('substitutions_next_day', v)} help="Zweite Spalte mit dem nächsten Schultag." />
        <PageSecondsField draft={draft} set={set} />
        <Field label="Rückfall-Link" htmlFor={ids.url}
          help="Diese WebUntis-Seite erscheint eingebettet, wenn keine Vertretungsdaten kommen.">
          <input id={ids.url} type="url" value={draft.webuntis_url ?? ''} onChange={(e) => set('webuntis_url', e.target.value)}
            placeholder="https://…" className={fieldClass} />
        </Field>
        <Field label="Rückfall-Link für einen Tag" htmlFor={ids.compact}
          help="Kompakte Fassung für geteilte Ansichten. Leer nutzt den Link oben.">
          <input id={ids.compact} type="url" value={draft.webuntis_url_next_day ?? ''} onChange={(e) => set('webuntis_url_next_day', e.target.value)}
            placeholder="https://…" className={fieldClass} />
        </Field>
      </div>
    </Section>
  )
}
