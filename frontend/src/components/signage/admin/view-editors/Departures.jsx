import { useEffect, useId, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { Button, StatusBadge } from '../../../ui'
import { errorText } from '../shared/errorText'
import * as api from '../shared/api'
import { Checkbox, Field, ListInput, Section, Segmented, fieldClass } from '../shared/form'
import StopSearch from '../shared/StopSearch'
import StopFilterDialog from '../shared/StopFilterDialog'
import DragHandle from '../shared/DragHandle'
import { dragRowClass, useListDrag } from '../shared/useListDrag'
import { assignColumns } from '../../display/lib/transit'
import {
  DEFAULT_MAX_DEPARTURES, DEFAULT_COLUMNS, MAX_COLUMNS, MAX_DEPARTURES_LIMIT, NUMBER_RULES, WALK_MINUTES_LIMIT, moveItem, newStop, stopSource, stopTransport,
} from '../pages/viewData'

const numberClass = `${fieldClass} tabular-nums`

const TIME_FORMATS = [
  { value: 'minutes', label: 'Minuten' },
  { value: 'clock', label: 'Uhrzeit' },
  { value: 'mixed', label: 'Gemischt' },
]

const STRIKE_TYPES = [
  { value: 'bus', label: 'Bus' },
  { value: 're', label: 'RE/RB' },
  { value: 'sbahn', label: 'S-Bahn' },
  { value: 'ubahn', label: 'U-Bahn' },
  { value: 'tram', label: 'Tram' },
  { value: 'ice', label: 'ICE/IC' },
  { value: 'faehre', label: 'Fähre' },
]

function filterSummary(stop) {
  const parts = []
  if (stop.filter_lines?.length) parts.push(`Linien ${stop.filter_lines.join(', ')}`)
  if (stop.filter_direction) parts.push(`Richtung ${stop.filter_direction}`)
  if (stop.filter_via) parts.push(`über ${stop.filter_via}`)
  if (stop.extra_id) parts.push(`mit ${stop.extra_name || stop.extra_id}`)
  return parts.join(' · ')
}

function columnCount(draft) {
  const n = Number(draft.transit_columns)
  return Number.isInteger(n) && n >= 1 && n <= MAX_COLUMNS ? n : DEFAULT_COLUMNS
}

// Like the display: a column above the column count means the last one; 0 means a column of its own
function disruptionColumn(draft) {
  const n = Number(draft.transit_disruption_column)
  return Number.isInteger(n) && n >= 1 ? Math.min(n, columnCount(draft)) : 0
}

function StopRow({ stop, index, columns, column, source, drag, onChange, onFilter }) {
  return (
    <tr {...drag.rowProps(index)} data-stop-row={stop.id} className={`border-t border-line-subtle ${dragRowClass}`}>
      <td className="py-2 align-middle">
        <DragHandle label={`${stop.name} verschieben`} onKeyDown={drag.handleKeyDown(index)} />
      </td>
      <td className="py-2 pr-3 align-middle">
        <div className="text-sm text-fg break-words">{stop.name}</div>
        <div className="text-xs text-fg-subtle truncate">{[stopTransport(stop), `Quelle: ${source}`, filterSummary(stop)].filter(Boolean).join(' · ')}</div>
        <label className="inline-flex items-center gap-2 mt-1 text-xs whitespace-nowrap text-fg-muted cursor-pointer">
          <input type="checkbox" aria-label={`Busse und Züge getrennt ${stop.name}`} checked={stop.split_modes !== false}
            onChange={(e) => onChange({ split_modes: e.target.checked })} className="w-3.5 h-3.5 accent-accent" />
          Busse und Züge getrennt
        </label>
      </td>
      <td className="py-2 pr-2 align-middle">
        <select aria-label={`Spalte ${stop.name}`} value={column} onChange={(e) => onChange({ column: Number(e.target.value) })} className={fieldClass}>
          {Array.from({ length: columns }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
        </select>
      </td>
      <td className="py-2 pr-2 align-middle">
        <div className="relative">
          <input type="number" min="0" max={WALK_MINUTES_LIMIT} aria-label={`Fußweg ${stop.name} in Minuten`} value={stop.walk_minutes ?? 0}
            onChange={(e) => onChange({ walk_minutes: e.target.value === '' ? '' : Number(e.target.value) })} className={`${numberClass} pr-9`} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle pointer-events-none">min</span>
        </div>
      </td>
      <td className="py-2 pr-3 align-middle">
        <input type="number" min="1" max={MAX_DEPARTURES_LIMIT} aria-label={`Max. Zeilen ${stop.name}`} value={stop.max_departures ?? DEFAULT_MAX_DEPARTURES}
          onChange={(e) => onChange({ max_departures: e.target.value === '' ? '' : Number(e.target.value) })} className={numberClass} />
      </td>
      <td className="py-2 align-middle text-right">
        <button type="button" onClick={onFilter} aria-label={`Filter für ${stop.name}`} title={`Filter für ${stop.name}`}
          className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ChevronRight className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

function ColumnOverview({ stops, columns, disruptions }) {
  const groups = assignColumns(stops, columns).map((group, i) => [
    ...group.map((s) => s.name), ...(disruptions === i + 1 ? ['Störungen'] : []),
  ])
  const parts = groups.map((names, i) => `Spalte ${i + 1}: ${names.length ? names.join(', ') : 'leer'}`)
  if (disruptions === 0) parts.push('Störungen: eigene Spalte rechts')
  return (
    <p className="text-xs text-fg-muted mt-4" data-column-overview>{parts.join(' · ')}</p>
  )
}

function StopsSection({ draft, set }) {
  const stops = draft.transit_stops ?? []
  const columns = columnCount(draft)
  const placed = assignColumns(stops, columns)
  const columnOf = (stop) => placed.findIndex((group) => group.includes(stop)) + 1
  const [adding, setAdding] = useState(false)
  const [filterIndex, setFilterIndex] = useState(null)
  const setStops = (next) => set('transit_stops', next)
  const drag = useListDrag(stops.length, (a, b) => setStops(moveItem(stops, a, b)))

  return (
    <Section title="Haltestellen" data-editor-section="stops"
      aside={stops.length > 1 ? <span className="text-xs text-fg-subtle">Reihenfolge per Ziehen</span> : null}>
      {stops.length ? (
        <table className="w-full table-fixed text-left">
          <thead>
            <tr className="text-xs text-fg-subtle">
              <th className="w-7 font-normal pb-2"><span className="sr-only">Reihenfolge</span></th>
              <th className="font-normal pb-2">Haltestelle</th>
              <th className="w-20 font-normal pb-2">Spalte</th>
              <th className="w-24 font-normal pb-2">Fußweg</th>
              <th className="w-24 font-normal pb-2">Max. Zeilen</th>
              <th className="w-9 font-normal pb-2"><span className="sr-only">Filter</span></th>
            </tr>
          </thead>
          <tbody>
            {stops.map((stop, i) => (
              <StopRow key={stop.id} stop={stop} index={i} columns={columns} column={columnOf(stop)} source={stopSource(stop, draft)} drag={drag}
                onChange={(patch) => setStops(stops.map((s, j) => (j === i ? { ...s, ...patch } : s)))}
                onFilter={() => setFilterIndex(i)} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-fg-muted">Noch keine Haltestelle. Ohne Haltestelle bleibt die Ansicht leer.</p>
      )}
      {stops.length > 0 && (
        <ColumnOverview stops={stops} columns={columns}
          disruptions={draft.transit_show_disruptions !== false ? disruptionColumn(draft) : null} />
      )}
      <div className="mt-4">
        {adding ? (
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <StopSearch autoFocus label="Haltestelle hinzufügen" excludeIds={stops.map((s) => s.id)}
                onSelect={(r) => { setStops([...stops, newStop(r)]); setAdding(false) }} />
            </div>
            <Button variant="ghost" onClick={() => setAdding(false)}>Fertig</Button>
          </div>
        ) : (
          <Button icon={Plus} onClick={() => setAdding(true)}>Haltestelle hinzufügen</Button>
        )}
        <p className="text-xs text-fg-subtle mt-2">
          Abfahrten, die man zu Fuß nicht mehr schafft, werden ausgeblendet. Filter und Entfernen unter ›.
        </p>
      </div>
      {filterIndex !== null && stops[filterIndex] && (
        <StopFilterDialog stop={stops[filterIndex]} onCancel={() => setFilterIndex(null)}
          onRemove={() => { setStops(stops.filter((_, j) => j !== filterIndex)); setFilterIndex(null) }}
          onApply={(next) => { setStops(stops.map((s, j) => (j === filterIndex ? next : s))); setFilterIndex(null) }} />
      )}
    </Section>
  )
}

function DisplaySection({ draft, set }) {
  return (
    <Section title="Darstellung" data-editor-section="transit-display">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Spalten">
          <Segmented label="Spalten" value={columnCount(draft)} onChange={(v) => set('transit_columns', v)}
            options={Array.from({ length: MAX_COLUMNS }, (_, n) => ({ value: n + 1, label: String(n + 1) }))} />
        </Field>
        <Field label="Zeitangabe" help="Minuten enthalten die Verspätung, bei der Uhrzeit steht sie daneben. Gemischt: bis 20 Minuten als Minuten, danach als Uhrzeit.">
          <Segmented label="Zeitangabe" value={draft.transit_time_format ?? 'minutes'} onChange={(v) => set('transit_time_format', v)} options={TIME_FORMATS} />
        </Field>
      </div>
      <div className="mt-4">
        <Checkbox label="Ortsnamen kürzen" help="Lässt einen Ortsnamen weg, der vor allen Haltestellen steht."
          checked={draft.transit_strip_city !== false} onChange={(v) => set('transit_strip_city', v)} />
      </div>
    </Section>
  )
}

function ManualMessages({ value, onChange }) {
  const list = value ?? []
  const update = (i, patch) => onChange(list.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  return (
    <div className="space-y-2">
      {list.map((m, i) => (
        <div key={i} className="flex items-start gap-2" data-manual-message>
          <div className="flex-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <input aria-label={`Titel der Meldung ${i + 1}`} value={m.title ?? ''} onChange={(e) => update(i, { title: e.target.value })}
              placeholder="Titel" className={fieldClass} />
            <input aria-label={`Text der Meldung ${i + 1}`} value={m.text ?? ''} onChange={(e) => update(i, { text: e.target.value })}
              placeholder="Text" className={fieldClass} />
          </div>
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Meldung ${i + 1} entfernen`} title="Meldung entfernen"
            className="p-2 rounded-md text-fg-subtle hover:text-bad hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => onChange([...list, { title: '', text: '' }])}>Meldung hinzufügen</Button>
    </div>
  )
}

const MESSAGE_FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'disruption', label: 'Störungen' },
  { value: 'construction', label: 'Baumaßnahmen' },
  { value: 'hidden', label: 'Ausgeblendet' },
]

function matchesFilter(message, filter, hidden) {
  if (filter === 'hidden') return hidden.includes(message.id)
  if (filter === 'construction') return message.kind === 'construction'
  if (filter === 'disruption') return message.kind !== 'construction'
  return true
}

// Hiding changes transit_disruption_hidden in the draft
function CurrentMessages({ viewId, hidden, onChange }) {
  const [state, setState] = useState({ viewId: null, list: null, error: null })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  useEffect(() => {
    if (viewId == null) return undefined
    let alive = true
    api.getDisruptions(viewId)
      .then((list) => { if (alive) setState({ viewId, list, error: null }) })
      .catch((error) => { if (alive) setState({ viewId, list: null, error }) })
    return () => { alive = false }
  }, [viewId])
  if (viewId == null || state.viewId !== viewId) return null
  if (state.error) return <p className="text-sm text-bad">Meldungen konnten nicht geladen werden. {errorText(state.error, '')}</p>
  if (!state.list.length) return <p className="text-sm text-fg-subtle">Aktuell keine Meldungen.</p>
  const list = state.list
  const hiddenCount = list.filter((d) => hidden.includes(d.id)).length
  const summary = `${list.length} ${list.length === 1 ? 'aktuelle Meldung' : 'aktuelle Meldungen'}${hiddenCount ? `, ${hiddenCount} ausgeblendet` : ''}`
  const q = query.trim().toLowerCase()
  const shown = list
    .filter((d) => matchesFilter(d, filter, hidden))
    .filter((d) => !q || [d.title, d.text, ...(d.lines ?? [])].join(' ').toLowerCase().includes(q))
  const toggle = (id) => onChange(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id])
  return (
    <div data-disruptions>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg" data-disruption-summary>{summary}</span>
        <Button size="sm" variant="ghost" icon={open ? ChevronUp : ChevronDown} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Meldungen schließen' : 'Meldungen anzeigen'}
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <input type="search" aria-label="Meldungen durchsuchen" placeholder="Suchen, zum Beispiel RE8 oder Umleitung"
              value={query} onChange={(e) => setQuery(e.target.value)} className={fieldClass} />
            <Segmented label="Meldungen filtern" value={filter} onChange={setFilter} options={MESSAGE_FILTERS} />
          </div>
          {shown.length ? (
            <ul className="max-h-[28rem] overflow-y-auto divide-y divide-line-subtle border-y border-line-subtle" data-disruption-list>
              {shown.map((d) => (
                <MessageRow key={d.id} message={d} hidden={hidden.includes(d.id)} open={expanded === d.id}
                  onOpen={() => setExpanded(expanded === d.id ? null : d.id)} onToggle={() => toggle(d.id)} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">Keine passenden Meldungen.</p>
          )}
        </div>
      )}
    </div>
  )
}

function MessageRow({ message: d, hidden, open, onOpen, onToggle }) {
  return (
    <li data-disruption-hidden={hidden ? '' : undefined}>
      <div className="flex items-start gap-3 py-2.5">
        <button type="button" aria-expanded={open} onClick={onOpen}
          className="flex flex-1 min-w-0 items-start gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 text-fg-subtle transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <StatusBadge label={d.kind === 'construction' ? 'Baumaßnahme' : 'Störung'} tone={d.kind === 'construction' ? 'warning' : 'danger'} />
              {d.lines?.length > 0 && <span className="text-xs text-fg-muted truncate">{d.lines.join(', ')}</span>}
            </span>
            <span className={`block text-sm mt-1 ${hidden ? 'text-fg-subtle line-through' : 'text-fg'}`}>{d.title}</span>
          </span>
        </button>
        <Button size="sm" variant="ghost" icon={hidden ? Eye : EyeOff} onClick={onToggle}
          aria-label={`${d.title} ${hidden ? 'einblenden' : 'ausblenden'}`}>
          {hidden ? 'Einblenden' : 'Ausblenden'}
        </Button>
      </div>
      {open && (
        <div className="pb-3 pl-6 space-y-2" data-disruption-detail>
          {d.text
            ? <p className="text-sm text-fg-muted whitespace-pre-line">{d.text}</p>
            : <p className="text-sm text-fg-subtle">Kein weiterer Text.</p>}
          {d.image && <img src={d.image} alt="" className="max-h-72 w-full rounded-md bg-raised object-contain" />}
        </div>
      )}
    </li>
  )
}

function AdvancedSection({ draft, set }) {
  const durationId = useId()
  const { min, max } = NUMBER_RULES.transit_duration
  return (
    <Section title="Erweitert" data-editor-section="transit-advanced">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vorausschau" htmlFor={durationId} help="So viele Minuten im Voraus werden Abfahrten abgefragt.">
          <div className="relative max-w-40">
            <input id={durationId} type="number" min={min} max={max} value={draft.transit_duration ?? ''}
              onChange={(e) => set('transit_duration', e.target.value === '' ? '' : Number(e.target.value))}
              className={`${numberClass} pr-12`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle pointer-events-none">min</span>
          </div>
        </Field>
        <Field label="Quellen" help="Abfahrten kommen aus den gewählten Auskunftssystemen.">
          <div className="space-y-2 pt-1">
            <Checkbox label="Deutsche Bahn" checked={draft.transit_source_db !== false} onChange={(v) => set('transit_source_db', v)} />
            <Checkbox label="NAH.SH" checked={draft.transit_source_nahsh !== false} onChange={(v) => set('transit_source_nahsh', v)} />
          </div>
        </Field>
      </div>
      <div className="mt-4">
        <Checkbox label="Zwischenhalte anzeigen" help="Zeigt unter dem Ziel die nächsten Halte, sofern die Quelle sie liefert."
          checked={!!draft.transit_show_via} onChange={(v) => set('transit_show_via', v)} />
      </div>
    </Section>
  )
}

function DisruptionsSection({ draft, set, viewId }) {
  return (
    <Section title="Störungsmeldungen" data-editor-section="disruptions">
      <Checkbox label="Störungen anzeigen" checked={draft.transit_show_disruptions !== false} onChange={(v) => set('transit_show_disruptions', v)} />
      {draft.transit_show_disruptions !== false && (
      <div className="space-y-4 mt-4">
        <div className="space-y-2">
          <Checkbox label="Zug-Störungen von NAH.SH" checked={draft.transit_disruption_rail !== false} onChange={(v) => set('transit_disruption_rail', v)} />
          {draft.transit_disruption_rail !== false && (
            <div className="ml-6.5">
              <ListInput value={draft.transit_disruption_rail_lines} onChange={(v) => set('transit_disruption_rail_lines', v)} placeholder="zum Beispiel RE8, RB85" />
              <p className="text-xs text-fg-subtle mt-1">Nur Meldungen zu diesen Linien. Leer zeigt alle mit erkennbarer Linie.</p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Checkbox label="Bus-Störungen vom Stadtverkehr Lübeck" checked={draft.transit_disruption_bus !== false} onChange={(v) => set('transit_disruption_bus', v)} />
          {draft.transit_disruption_bus !== false && (
            <div className="ml-6.5">
              <ListInput value={draft.transit_disruption_bus_lines} onChange={(v) => set('transit_disruption_bus_lines', v)} placeholder="zum Beispiel 5, 11" />
              <p className="text-xs text-fg-subtle mt-1">Nur Meldungen zu diesen Linien. Leer zeigt alle.</p>
            </div>
          )}
        </div>
        <Field label="Störungen in Spalte" help="In einer Abfahrten-Spalte stehen die Meldungen unter deren Haltestellen.">
          <select aria-label="Störungen in Spalte" value={disruptionColumn(draft)} className={`${fieldClass} max-w-64`}
            onChange={(e) => set('transit_disruption_column', Number(e.target.value) || null)}>
            <option value={0}>Eigene Spalte rechts</option>
            {Array.from({ length: columnCount(draft) }, (_, n) => <option key={n + 1} value={n + 1}>Spalte {n + 1}</option>)}
          </select>
        </Field>
        <Field label="Eigene Meldungen" help="Erscheinen vor den Meldungen der Verkehrsbetriebe in der Störungsspalte.">
          <ManualMessages value={draft.transit_disruption_manual} onChange={(v) => set('transit_disruption_manual', v)} />
        </Field>
        <Field label="Aktuelle Meldungen" help="Ausgeblendete Meldungen erscheinen nicht auf dem Bildschirm. Endet eine Meldung beim Anbieter, fällt sie aus der Liste.">
          <CurrentMessages viewId={viewId} hidden={draft.transit_disruption_hidden ?? []} onChange={(v) => set('transit_disruption_hidden', v)} />
        </Field>
      </div>
      )}
    </Section>
  )
}

function StrikeSection({ draft, set }) {
  const active = !!draft.transit_strike_active
  const types = draft.transit_strike_types ?? []
  const toggleType = (value) => set('transit_strike_types', types.includes(value) ? types.filter((t) => t !== value) : [...types, value])
  return (
    <Section title="Streik" data-editor-section="strike">
      <Checkbox label="Streik berücksichtigen" checked={active} onChange={(v) => set('transit_strike_active', v)}
        help="Blendet die Abfahrten der bestreikten Linien und Verkehrsmittel aus." />
      {active && (
        <div className="mt-4 grid gap-4">
          <Field label="Linien">
            <ListInput value={draft.transit_strike_lines} onChange={(v) => set('transit_strike_lines', v)} placeholder="zum Beispiel 5, 11" />
          </Field>
          <Field label="Verkehrsmittel">
            <div className="flex flex-wrap gap-2">
              {STRIKE_TYPES.map((t) => {
                const on = types.includes(t.value)
                return (
                  <button key={t.value} type="button" aria-pressed={on} onClick={() => toggleType(t.value)}
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      on ? 'bg-hover border-line-strong text-fg font-medium' : 'border-line text-fg-muted hover:text-fg'}`}>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
      )}
    </Section>
  )
}

export default function DeparturesEditor({ draft, set, viewId }) {
  return (
    <>
      <StopsSection draft={draft} set={set} />
      <DisplaySection draft={draft} set={set} />
      <DisruptionsSection draft={draft} set={set} viewId={viewId} />
      <StrikeSection draft={draft} set={set} />
      <AdvancedSection draft={draft} set={set} />
    </>
  )
}
