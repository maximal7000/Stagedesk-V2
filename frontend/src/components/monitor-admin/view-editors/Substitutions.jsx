// Editor für den Vertretungsplan (Spec §3.1, §4.3): zweite Spalte "Morgen", Blättertakt und der
// iframe-Rückfall, falls WebUntis keine Daten liefert oder der Bildschirm keinen Schlüssel hat.
import { useEffect, useId, useState } from 'react'
import { getWebuntisLinks } from '../shared/api'
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

// Ein gespeicherter Link aus der Link-Bibliothek hat Vorrang vor der Adresse (DisplayView.get_webuntis_url).
// Wird die Adresse bearbeitet, geht der Link als null mit, damit die eigene Adresse gilt.
function FallbackUrlField({ label, help, urlKey, linkKey, draft, set, links }) {
  const id = useId()
  const linkId = draft[linkKey]
  const linkName = linkId ? (links.find((l) => l.id === linkId)?.name ?? 'aus der Link-Bibliothek') : null
  return (
    <Field label={label} htmlFor={id} help={help}>
      <input id={id} type="url" value={draft[urlKey] ?? ''} placeholder="https://…" className={fieldClass}
        onChange={(e) => {
          set(urlKey, e.target.value)
          if (linkId) set(linkKey, null)
        }} />
      {linkName && (
        <p className="text-xs text-fg-muted mt-1.5" data-saved-link={linkKey}>
          Aktiv ist der gespeicherte Link „{linkName}“. Eine Adresse hier ersetzt ihn beim Speichern.
        </p>
      )}
    </Field>
  )
}

export default function SubstitutionsEditor({ draft, set }) {
  const [links, setLinks] = useState([])
  useEffect(() => {
    if (!draft.webuntis_link_id && !draft.webuntis_link_next_day_id) return undefined
    let alive = true
    getWebuntisLinks().then((list) => { if (alive && Array.isArray(list)) setLinks(list) }, () => {})
    return () => { alive = false }
  }, [draft.webuntis_link_id, draft.webuntis_link_next_day_id])

  return (
    <Section title="Vertretungsplan" data-editor-section="substitutions">
      <div className="space-y-4">
        <Checkbox label="Morgen zeigen" checked={draft.substitutions_next_day !== false}
          onChange={(v) => set('substitutions_next_day', v)} help="Zweite Spalte mit dem nächsten Schultag." />
        <PageSecondsField draft={draft} set={set} />
        <FallbackUrlField label="Rückfall-Link" urlKey="webuntis_url" linkKey="webuntis_link_id" draft={draft} set={set} links={links}
          help="Diese WebUntis-Seite erscheint eingebettet, wenn keine Vertretungsdaten kommen." />
        <FallbackUrlField label="Rückfall-Link für einen Tag" urlKey="webuntis_url_next_day" linkKey="webuntis_link_next_day_id"
          draft={draft} set={set} links={links} help="Kompakte Fassung für geteilte Ansichten. Leer nutzt den Link oben." />
      </div>
    </Section>
  )
}
