import { useId } from 'react'
import { Checkbox, Field, Section, Segmented, fieldClass } from '../shared/form'

const COUNTDOWN_OPTIONS = [
  { value: 'none', label: 'Keiner' },
  { value: 'next', label: 'Nächster Termin' },
  { value: 'custom', label: 'Eigener' },
]

function countdownMode(draft) {
  if (draft.show_custom_countdown) return 'custom'
  return draft.show_countdown ? 'next' : 'none'
}

export default function InfoEditor({ draft, set }) {
  const ids = { name: useId(), date: useId() }
  const mode = countdownMode(draft)
  const setMode = (value) => {
    set('show_countdown', value === 'next')
    set('show_custom_countdown', value === 'custom')
  }
  return (
    <Section title="Inhalt" data-editor-section="info">
      <div className="space-y-4">
        <Checkbox label="Ankündigungen" checked={draft.show_announcements !== false} onChange={(v) => set('show_announcements', v)}
          help="Aktive Ankündigungen, wichtige zuerst. Gepflegt unter Klausuren & Termine." />
        <Checkbox label="Termine" checked={draft.show_events !== false} onChange={(v) => set('show_events', v)}
          help="Veranstaltungen der nächsten sieben Tage." />
        <Field label="Countdown" help={mode === 'next'
          ? 'Zählt bis zum Beginn der nächsten Veranstaltung.'
          : mode === 'custom' ? 'Zählt bis zum eingetragenen Zeitpunkt und verschwindet danach.' : 'Die Ansicht zeigt keinen Countdown.'}>
          <div className="max-w-md">
            <Segmented label="Countdown" options={COUNTDOWN_OPTIONS} value={mode} onChange={setMode} />
          </div>
        </Field>
        {mode === 'custom' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Anlass" htmlFor={ids.name}>
              <input id={ids.name} value={draft.custom_countdown_name ?? ''} onChange={(e) => set('custom_countdown_name', e.target.value)}
                placeholder="zum Beispiel Abiball" className={fieldClass} />
            </Field>
            <Field label="Zeitpunkt" htmlFor={ids.date}>
              <input id={ids.date} type="datetime-local" value={draft.custom_countdown_date ?? ''}
                onChange={(e) => set('custom_countdown_date', e.target.value)} className={fieldClass} />
            </Field>
          </div>
        )}
      </div>
    </Section>
  )
}
