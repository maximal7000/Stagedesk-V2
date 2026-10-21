// Editor für den Vertretungsplan (Spec §1.4): Datenquelle, Ausgabe, Abwesenheiten, Klausuren, Wechsel auf den
// nächsten Schultag, Blättertakt und die Rückfall-Links für die eingebettete WebUntis-Seite.
import { useEffect, useId, useState } from 'react'
import { getWebuntisLinks } from '../shared/api'
import { Checkbox, Field, Section, Segmented, fieldClass } from '../shared/form'

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

const SOURCE_OPTIONS = [
  { value: 'monitor', label: 'WebUntis-Vertretungsplan', help: 'Die Vertretungen, wie WebUntis sie für Bildschirme bereitstellt. Kein Konto nötig.' },
  { value: 'account', label: 'WebUntis-Konto', help: 'Abfrage mit Benutzername und Passwort aus den Einstellungen. Nur nötig, wenn der Vertretungsplan in WebUntis nicht freigegeben ist.' },
  { value: 'embed', label: 'WebUntis-Seite einbetten', help: 'Zeigt die Originalseite von WebUntis statt der eigenen Darstellung.' },
]
const FORMAT_OPTIONS = [
  { value: 'students_2', label: 'Schüler, 2 Tage' },
  { value: 'students_1', label: 'Schüler, 1 Tag' },
  { value: 'teachers', label: 'Lehrkräfte' },
  { value: 'custom', label: 'Eigenes Format' },
]
const EXAM_OPTIONS = [
  { value: 'default', label: 'Wie in WebUntis', exams: null },
  { value: 'yes', label: 'Ja', exams: true },
  { value: 'no', label: 'Nein', exams: false },
]
const DEFAULT_NEXT_DAY_FROM = '16:00'

function NextDayField({ draft, set }) {
  const id = useId()
  const value = draft.substitutions_next_day_from ?? ''
  const on = value !== ''
  return (
    <Field label="Nächsten Schultag zeigen ab" help="Ab dieser Uhrzeit beginnt die Anzeige mit dem nächsten Schultag.">
      <div className="flex items-center gap-3">
        <input type="checkbox" aria-label="Nächsten Schultag zeigen ab" checked={on} className="w-4 h-4 accent-accent"
          onChange={(e) => set('substitutions_next_day_from', e.target.checked ? DEFAULT_NEXT_DAY_FROM : '')} />
        <input id={id} type="time" aria-label="Uhrzeit für den nächsten Schultag" value={value} disabled={!on}
          onChange={(e) => { if (e.target.value) set('substitutions_next_day_from', e.target.value) }} className={`${fieldClass} max-w-32 tabular-nums`} />
        {!on && <span className="text-xs text-fg-subtle">Aus: die Anzeige bleibt beim heutigen Tag.</span>}
      </div>
    </Field>
  )
}

export default function SubstitutionsEditor({ draft, set }) {
  const [links, setLinks] = useState([])
  const formatId = useId()
  const source = draft.substitutions_source ?? 'monitor'
  const examValue = draft.substitutions_show_exams === true ? 'yes' : draft.substitutions_show_exams === false ? 'no' : 'default'
  useEffect(() => {
    if (!draft.webuntis_link_id && !draft.webuntis_link_next_day_id) return undefined
    let alive = true
    getWebuntisLinks().then((list) => { if (alive && Array.isArray(list)) setLinks(list) }, () => {})
    return () => { alive = false }
  }, [draft.webuntis_link_id, draft.webuntis_link_next_day_id])

  return (
    <Section title="Vertretungsplan" data-editor-section="substitutions">
      <div className="space-y-4">
        <Field label="Datenquelle" help={SOURCE_OPTIONS.find((o) => o.value === source)?.help}>
          <div className="max-w-2xl">
            <Segmented label="Datenquelle" options={SOURCE_OPTIONS} value={source} onChange={(v) => set('substitutions_source', v)} />
          </div>
        </Field>
        {source === 'monitor' && (
          <Field label="Ausgabe">
            <div className="max-w-2xl">
              <Segmented label="Ausgabe" options={FORMAT_OPTIONS} value={draft.substitutions_format ?? 'students_2'}
                onChange={(v) => set('substitutions_format', v)} />
            </div>
          </Field>
        )}
        {source === 'monitor' && draft.substitutions_format === 'custom' && (
          <Field label="Formatname" htmlFor={formatId} help="Name eines weiteren Formats aus WebUntis, genau wie dort geschrieben.">
            <input id={formatId} value={draft.substitutions_custom_format ?? ''} className={`${fieldClass} max-w-sm`}
              onChange={(e) => set('substitutions_custom_format', e.target.value)} />
          </Field>
        )}
        {source === 'monitor' && (
          <Checkbox label="Abwesenheiten anzeigen" checked={draft.substitutions_show_absences !== false}
            onChange={(v) => set('substitutions_show_absences', v)} help="Abwesende und betroffene Lehrkräfte und Klassen über der Tabelle." />
        )}
        {source !== 'embed' && (
          <>
            <Field label="Klausuren anzeigen">
              <div className="max-w-sm">
                <Segmented label="Klausuren anzeigen" options={EXAM_OPTIONS} value={examValue}
                  onChange={(v) => set('substitutions_show_exams', EXAM_OPTIONS.find((o) => o.value === v).exams)} />
              </div>
            </Field>
            <NextDayField draft={draft} set={set} />
          </>
        )}
        <PageSecondsField draft={draft} set={set} />
        {source === 'embed' && (
          <>
            <FallbackUrlField label="Rückfall-Link" urlKey="webuntis_url" linkKey="webuntis_link_id" draft={draft} set={set} links={links}
              help="Diese WebUntis-Seite erscheint eingebettet, wenn keine Vertretungsdaten kommen." />
            <FallbackUrlField label="Rückfall-Link für einen Tag" urlKey="webuntis_url_next_day" linkKey="webuntis_link_next_day_id"
              draft={draft} set={set} links={links} help="Kompakte Fassung für geteilte Ansichten. Leer nutzt den Link oben." />
          </>
        )}
      </div>
    </Section>
  )
}
