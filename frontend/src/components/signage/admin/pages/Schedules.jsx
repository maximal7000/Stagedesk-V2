// Ferien & Zeitpläne (Spec §6.2): Ferienzeiträume als Tabelle (Anlegen, Bearbeiten, Löschen) und eine
// Wochenübersicht der Ein-Zeiten aller Bildschirme (Zeilen Mo–So, Balken als CSS-Grid mit einer Spalte pro Minute).
// Die Balken folgen power.compute_power_state (shared/schedule.powerWeek). Recht: signage.power (Route).
import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button } from '../../../ui'
import ConfirmDialog from '../shared/ConfirmDialog'
import { iconButton } from '../shared/ScreenTable'
import { useUnsavedGuard } from '../shared/UnsavedChangesProvider'
import { errorText } from '../shared/errorText'
import { Section, fieldClass } from '../shared/form'
import { DAY_MINUTES, WEEKDAYS, powerWeek } from '../shared/schedule'
import { formatShortDate, parseLocalDate } from '../../display/lib/format'
import * as api from '../shared/api'

const pad = (n) => String(n).padStart(2, '0')
const hhmm = (minutes) => (minutes >= DAY_MINUTES ? '24:00' : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`)
const isoToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// "Do 09.07.2026"
const formatDate = (iso) => {
  const d = parseLocalDate(iso)
  return Number.isNaN(d.getTime()) ? '' : `${formatShortDate(d)}${d.getFullYear()}`
}
const GRID = { gridTemplateColumns: `repeat(${DAY_MINUTES}, minmax(0, 1fr))` }
const HOURS = [0, 6, 12, 18, 24]

const MODE_TEXT = {
  schedule: 'Automatisch nach Zeitplan',
  always: 'Ohne Zeitplan, immer an',
  on: 'Manuell immer an',
  off: 'Manuell immer aus',
}

function holidayProblem(row) {
  if (!row.name.trim()) return 'Der Name fehlt. Bitte einen Namen eintragen.'
  if (!row.start_date || !row.end_date) return 'Von und bis angeben.'
  if (row.end_date < row.start_date) return 'Das Enddatum liegt vor dem Startdatum. Bitte das Enddatum anpassen.'
  return null
}

function HolidayEditRow({ row, onChange, onSave, onCancel, busy }) {
  const ids = { name: useId(), from: useId(), until: useId() }
  const set = (key) => (e) => onChange({ ...row, [key]: e.target.value })
  return (
    <tr className="border-b border-line-subtle last:border-0" data-holiday-edit>
      <td className="px-4 py-2">
        <label htmlFor={ids.name} className="sr-only">Name</label>
        <input id={ids.name} value={row.name} onChange={set('name')} placeholder="zum Beispiel Herbstferien" className={fieldClass} autoFocus />
      </td>
      <td className="px-4 py-2">
        <label htmlFor={ids.from} className="sr-only">Von</label>
        <input id={ids.from} type="date" value={row.start_date}
          onChange={(e) => onChange({ ...row, start_date: e.target.value, end_date: row.end_date || e.target.value })} className={fieldClass} />
      </td>
      <td className="px-4 py-2">
        <label htmlFor={ids.until} className="sr-only">Bis</label>
        <input id={ids.until} type="date" value={row.end_date} min={row.start_date || undefined} onChange={set('end_date')} className={fieldClass} />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1 justify-end">
          <button type="button" className={iconButton} onClick={onSave} disabled={busy} aria-label="Zeitraum speichern" title="Speichern"><Check className="w-4 h-4" /></button>
          <button type="button" className={iconButton} onClick={onCancel} disabled={busy} aria-label="Bearbeiten abbrechen" title="Abbrechen"><X className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
  )
}

function Holidays({ holidays, onReload }) {
  const [editing, setEditing] = useState(null)   // { id|null, name, start_date, end_date }
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  useUnsavedGuard(!!editing)

  const today = isoToday()
  const sorted = [...holidays].sort((a, b) => a.start_date.localeCompare(b.start_date))

  const save = async () => {
    const problem = holidayProblem(editing)
    if (problem) {
      toast.error(problem)
      return
    }
    setBusy(true)
    try {
      const body = { name: editing.name.trim(), start_date: editing.start_date, end_date: editing.end_date }
      await (editing.id ? api.updateHoliday(editing.id, body) : api.createHoliday(body))
      setEditing(null)
      toast.success('Gespeichert')
      await onReload()
    } catch (e) {
      toast.error(errorText(e))
    }
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteHoliday(confirm.id)
      setConfirm(null)
      toast.success('Gelöscht')
      await onReload()
    } catch (e) {
      toast.error(errorText(e))
    }
    setBusy(false)
  }

  const editRow = (row) => (
    <HolidayEditRow key={row.id ?? 'new'} row={row} busy={busy} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />
  )

  return (
    <Section title="Ferienzeiträume" data-section="holidays"
      aside={<Button size="sm" variant="ghost" icon={Plus} disabled={!!editing}
        onClick={() => setEditing({ id: null, name: '', start_date: '', end_date: '' })}>Zeitraum hinzufügen</Button>}>
      <p className="text-sm text-fg-muted -mt-2 mb-4 max-w-3xl">
        In diesen Zeiträumen sind alle Bildschirme mit „In den Ferien ausgeschaltet“ aus. Ein einzelner freier Tag, etwa ein Brückentag,
        wird als Zeitraum mit gleichem Start- und Enddatum angelegt.
      </p>
      <div className="-mx-5 -mb-5 border-t border-line-subtle">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-fg-subtle border-b border-line-subtle">
              <th className="font-medium px-4 py-2.5 w-[40%]">Name</th>
              <th className="font-medium px-4 py-2.5">Von</th>
              <th className="font-medium px-4 py-2.5">Bis</th>
              <th className="font-medium px-4 py-2.5 w-px"><span className="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {editing && !editing.id && editRow(editing)}
            {sorted.map((h) => (editing?.id === h.id ? editRow(editing) : (
              <tr key={h.id} className="border-b border-line-subtle last:border-0" data-holiday={h.id}>
                <td className={`px-4 py-3 text-sm font-semibold ${h.end_date < today ? 'text-fg-muted' : 'text-fg'}`}>{h.name}</td>
                <td className="px-4 py-3 text-sm text-fg-muted tabular-nums">{formatDate(h.start_date)}</td>
                <td className="px-4 py-3 text-sm text-fg-muted tabular-nums">
                  {formatDate(h.end_date)}
                  {h.start_date === h.end_date && <span className="text-fg-subtle"> · ein Tag</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1 justify-end">
                    <button type="button" className={iconButton} disabled={!!editing} onClick={() => setEditing({ ...h })}
                      aria-label={`${h.name} bearbeiten`} title="Bearbeiten"><Pencil className="w-4 h-4" /></button>
                    <button type="button" className={iconButton} disabled={!!editing} onClick={() => setConfirm(h)}
                      aria-label={`${h.name} löschen`} title="Löschen"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )))}
            {!sorted.length && !editing && (
              <tr><td colSpan={4} className="px-4 py-4 text-sm text-fg-subtle">Noch keine Ferienzeiträume eingetragen.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {confirm && (
        <ConfirmDialog title={`„${confirm.name}“ löschen?`} body="Bildschirme mit „In den Ferien ausgeschaltet“ folgen in diesem Zeitraum wieder ihrem Zeitplan."
          confirmLabel="Löschen" tone="danger" busy={busy} onConfirm={remove} onCancel={() => setConfirm(null)} />
      )}
    </Section>
  )
}

function DayTrack({ ranges }) {
  const label = ranges.length ? ranges.map((r) => `${hhmm(r.start)} bis ${hhmm(r.end)}`).join(', ') : 'aus'
  return (
    <div className="grid h-4 bg-raised rounded-sm overflow-hidden" style={GRID} title={label} aria-label={label} role="img">
      {[360, 720, 1080].map((m) => (
        <span key={m} aria-hidden="true" className="bg-line row-start-1" style={{ gridColumn: `${m + 1} / span 1` }} />
      ))}
      {ranges.map((r) => (
        <span key={r.start} aria-hidden="true" data-bar className="bg-ok row-start-1" style={{ gridColumn: `${r.start + 1} / ${r.end + 1}` }} />
      ))}
    </div>
  )
}

function WeekOverview({ screens }) {
  return (
    <Section title="Wochenübersicht" data-section="week">
      <p className="text-sm text-fg-muted -mt-2 mb-4 max-w-3xl">
        Grün sind die Zeiten, in denen ein Bildschirm laut Zeitplan an ist. Ferien, Ausnahmen nach Datum und „Bis Tagesende aus“
        gelten zusätzlich. Eine Zeile über Mitternacht reicht bis in den Folgetag.
      </p>
      {screens.length === 0 ? (
        <p className="text-sm text-fg-subtle">Noch keine Bildschirme angelegt.</p>
      ) : (
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
          {screens.map((s) => {
            const { mode, days } = powerWeek(s)
            return (
              <div key={s.id} data-week-screen={s.slug}>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <Link to={`/signage-admin/screens/${s.id}`} className="text-sm font-semibold text-fg hover:underline underline-offset-2 focus:outline-none focus-visible:underline truncate">
                    {s.name}
                  </Link>
                  <span className="text-xs text-fg-muted whitespace-nowrap">
                    {MODE_TEXT[mode]}{s.off_during_holidays ? ' · in den Ferien aus' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-1 items-center">
                  {days.map((ranges, i) => (
                    <div key={WEEKDAYS[i]} className="contents">
                      <span className="text-xs text-fg-muted">{WEEKDAYS[i]}</span>
                      <DayTrack ranges={ranges} />
                    </div>
                  ))}
                  <span />
                  <div className="relative h-4 text-[11px] text-fg-subtle tabular-nums" aria-hidden="true">
                    {HOURS.map((h) => (
                      <span key={h} className={`absolute top-0 ${h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2'}`}
                        style={{ left: `${(h / 24) * 100}%` }}>{pad(h)}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

const fetchAll = () => Promise.allSettled([api.getHolidays(), api.getScreens()])

export default function Schedules() {
  const [holidays, setHolidays] = useState(null)
  const [screens, setScreens] = useState([])
  const [error, setError] = useState(null)

  const apply = useCallback(([holidaysRes, screensRes]) => {
    if (screensRes.status === 'fulfilled') setScreens(screensRes.value)
    if (holidaysRes.status === 'fulfilled') {
      setHolidays(holidaysRes.value)
      setError(null)
    } else {
      setError(holidaysRes.reason)
    }
  }, [])
  const load = useCallback(() => fetchAll().then(apply), [apply])

  useEffect(() => {
    let alive = true
    fetchAll().then((results) => { if (alive) apply(results) })
    return () => { alive = false }
  }, [apply])

  const state = error ? 'error' : holidays ? 'ready' : 'loading'

  return (
    <div data-admin-page="schedules" data-state={state}>
      <PageHeader title="Ferien & Zeitpläne" />
      {error ? (
        <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
          Ferienzeiträume konnten nicht geladen werden. {errorText(error, 'Bitte die Seite neu laden.')}
        </div>
      ) : holidays ? (
        <div className="space-y-4">
          <Holidays holidays={holidays} onReload={load} />
          <WeekOverview screens={screens} />
        </div>
      ) : null}
    </div>
  )
}
