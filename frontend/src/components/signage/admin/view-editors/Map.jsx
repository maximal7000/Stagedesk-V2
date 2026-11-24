import { useId } from 'react'
import { Checkbox, Field, Section, Segmented, fieldClass } from '../shared/form'

const ZOOM_OPTIONS = [
  { value: 13, label: 'Stadt' },
  { value: 14, label: 'Weit' },
  { value: 15, label: 'Mittel' },
  { value: 16, label: 'Nah' },
  { value: 17, label: 'Sehr nah' },
]

export default function MapEditor({ draft, set }) {
  const centerId = useId()
  const hasStops = (draft.transit_stops ?? []).length > 0
  return (
    <Section title="Karte" data-editor-section="map">
      <div className="space-y-4">
        <Field label="Ausschnitt" help="Wie weit die Karte um den Mittelpunkt reicht.">
          <Segmented label="Ausschnitt" options={ZOOM_OPTIONS} value={Number(draft.map_zoom) || 15} onChange={(v) => set('map_zoom', v)} />
        </Field>
        <Field label="Mittelpunkt" htmlFor={centerId}
          help="Breite, Länge. In Google Maps per Rechtsklick auf einen Ort kopieren. Standard ist das Katharineum.">
          <input id={centerId} value={draft.map_center ?? ''} onChange={(e) => set('map_center', e.target.value)}
            placeholder="53.8699, 10.6892" className={fieldClass} inputMode="decimal" />
        </Field>
        <Checkbox label="Alle Linien zeigen" checked={!!draft.map_all_lines} onChange={(v) => set('map_all_lines', v)}
          help={hasStops
            ? 'Sonst nur die Linien, die an den Haltestellen dieser Ansicht abfahren.'
            : 'Ohne Haltestellen in dieser Ansicht zeigt die Karte immer alle Linien.'} />
        <p className="text-xs text-fg-subtle">
          Die Positionen berechnet NAH.SH aus Fahrplan und Verspätung, es sind keine GPS-Daten. Die Karte lädt alle 15 Sekunden neu.
        </p>
      </div>
    </Section>
  )
}
