// Abschnitt "Zeitplan" der Bildschirm-Seite (Spec §2.2): eine Liste für Einschaltzeiten und Ansichten.
// Zeile: Tage, von, bis, Ansicht ("Standard-Ansicht" = view_id null). Die obere Zeile hat Vorrang, die
// Reihenfolge ändert der Griff (Ziehen oder Pfeiltasten). Ohne Zeilen ist der Bildschirm immer an, der
// Abschnitt zeigt dann nur eine Zeile. Kontrolliert: value ist die Liste, onChange bekommt die neue Liste.
// problems: Meldung je Zeile oder null (schedule.scheduleProblems); Überschneidungen ergänzt der Editor selbst.
import { useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../ui'
import DragHandle from './DragHandle'
import { inputClass } from './ExceptionEditor'
import { iconButton } from './ScreenTable'
import { Section } from './form'
import { WEEKDAYS, overlapHints } from './schedule'
import { dragRowClass, useListDrag, useRowKeys } from './useListDrag'
import { moveItem } from '../pages/viewData'
import WeekOverview from './WeekOverview'

const NEW_ROW = { days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00', view_id: null }

function DayToggle({ label, pressed, disabled, onToggle }) {
  return (
    <button type="button" aria-pressed={pressed} disabled={disabled} onClick={onToggle}
      className={`w-7 h-8 rounded-md text-xs font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        pressed ? 'bg-hover border-line-strong text-fg' : 'bg-raised border-line text-fg-subtle hover:text-fg'
      } disabled:pointer-events-none ${disabled && !pressed ? 'text-fg-disabled' : ''}`}>
      {label}
    </button>
  )
}

function ScheduleRow({ row, index, views, disabled, problem, hint, update, remove, drag }) {
  const viewId = useId()
  const known = row.view_id === null || row.view_id === undefined || views.some((v) => v.id === row.view_id)
  const toggleDay = (day) => {
    const days = row.days || []
    update({ days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b) })
  }
  return (
    <li {...(disabled ? {} : drag.rowProps(index))} className={`py-2 ${dragRowClass}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {!disabled && <DragHandle label={`Zeile ${index + 1} verschieben`} onKeyDown={drag.handleKeyDown(index)} />}
        <span className="w-4 text-right text-sm text-fg-subtle tabular-nums">{index + 1}</span>
        <div className="flex gap-0.5" role="group" aria-label={`Tage für Zeile ${index + 1}`}>
          {WEEKDAYS.map((label, day) => (
            <DayToggle key={label} label={label} disabled={disabled}
              pressed={(row.days || []).includes(day)} onToggle={() => toggleDay(day)} />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input type="time" aria-label="Von" value={row.from || ''} disabled={disabled}
            onChange={(e) => update({ from: e.target.value })} className={inputClass} />
          <span className="text-sm text-fg-muted">bis</span>
          <input type="time" aria-label="Bis" value={row.until || ''} disabled={disabled}
            onChange={(e) => update({ until: e.target.value })} className={inputClass} />
        </div>
        <label htmlFor={viewId} className="sr-only">Ansicht in Zeile {index + 1}</label>
        <select id={viewId} value={row.view_id ?? ''} disabled={disabled}
          onChange={(e) => update({ view_id: e.target.value ? Number(e.target.value) : null })}
          className={`${inputClass} flex-1 min-w-36`}>
          <option value="">Standard-Ansicht</option>
          {!known && <option value={row.view_id}>Nicht mehr verfügbar</option>}
          {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        {!disabled && (
          <button type="button" className={iconButton} onClick={remove}
            aria-label={`Zeile ${index + 1} entfernen`} title="Zeile entfernen">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {problem
        ? <p className="text-xs text-bad mt-1.5 ml-12">{problem}</p>
        : hint && <p className="text-xs text-warn mt-1.5 ml-12">{hint}</p>}
    </li>
  )
}

export default function ScreenScheduleEditor({ value, onChange, views = [], problems = [], disabled = false, readOnly = false }) {
  const rows = Array.isArray(value) ? value : []
  const rowKeys = useRowKeys(rows.length)
  const drag = useListDrag(rows.length, (a, b) => { rowKeys.move(a, b); onChange(moveItem(rows, a, b)) })
  const hints = overlapHints(rows)
  const update = (index, patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const remove = (index) => { rowKeys.remove(index); onChange(rows.filter((_, i) => i !== index)) }
  const add = () => { rowKeys.add(); onChange([...rows, { ...NEW_ROW }]) }
  const aside = readOnly
    ? <span className="text-xs text-fg-subtle">Nur lesend, Recht für Ein- und Ausschalten fehlt</span>
    : rows.length > 1 ? <span className="text-xs text-fg-subtle">Reihenfolge per Ziehen</span> : null

  if (!rows.length) {
    return (
      <Section title="Zeitplan" data-section="schedule" aside={readOnly ? aside : null}>
        <div className="flex items-center gap-2 text-sm text-fg-muted -mt-1" data-schedule-editor>
          <span>Kein Zeitplan</span>
          {!disabled && (
            <>
              <span aria-hidden="true">·</span>
              <Button size="sm" variant="ghost" icon={Plus} onClick={add}>Zeitplan hinzufügen</Button>
            </>
          )}
        </div>
      </Section>
    )
  }

  return (
    <Section title="Zeitplan" data-section="schedule" aside={aside}>
      <p className="text-xs text-fg-subtle -mt-2 mb-4">
        Zu diesen Zeiten ist der Bildschirm an und zeigt die gewählte Ansicht. Außerhalb ist er aus.
      </p>
      <WeekOverview rows={rows} views={views} />
      <div className="mt-4" data-schedule-editor>
        <ol className="divide-y divide-line-subtle">
          {rows.map((row, index) => (
            <ScheduleRow key={rowKeys.keys[index]} row={row} index={index} views={views}
              disabled={disabled} problem={problems[index]} hint={hints[index]} drag={drag}
              update={(patch) => update(index, patch)} remove={() => remove(index)} />
          ))}
        </ol>
        {!disabled && (
          <Button size="sm" variant="ghost" icon={Plus} className="mt-2 -ml-2.5" onClick={add}>Zeile hinzufügen</Button>
        )}
      </div>
    </Section>
  )
}
