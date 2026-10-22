// The order follows the backend: emergency switches on (power rule), then the off reasons, then exam,
// then the view rule override > event > schedule > default (Screen.get_active_view).
import { formatShortDate, formatTime } from '../../display/lib/format'
import { activeRow } from './schedule'

const KIND_LABELS = {
  departures: 'Abfahrten',
  substitutions: 'Vertretungsplan',
  split: 'Geteilte Ansicht',
  media: 'Medien',
  info: 'Info',
  rotation: 'Ansichten-Wechsel',
}

const pad = (n) => String(n).padStart(2, '0')
const quote = (text) => `„${text}“`

function asDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// "Mi 21.10., 07:00"
export function formatDayTime(value) {
  const d = asDate(value)
  return d ? `${formatShortDate(d)}, ${formatTime(d)}` : ''
}

function isoDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Python weekday as in the backend: Monday = 0
const weekdayOf = (d) => (d.getDay() + 6) % 7
const hhmmOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function exceptionToday(screen, today) {
  return (screen.power_exceptions || []).some((e) => {
    if (!e || !e.from_date) return false
    return e.from_date <= today && today <= (e.until_date || e.from_date)
  })
}

function holidayToday(holidays, today) {
  return (holidays || []).some((h) => h.start_date <= today && today <= h.end_date)
}

function offReason(screen, { now, holidays }) {
  if (screen.power_mode === 'manual_off') return 'manuell aus'
  const until = asDate(screen.off_until)
  if (until && until > now) return `aus bis ${formatDayTime(until)}`
  const today = isoDay(now)
  if (!exceptionToday(screen, today) && screen.off_during_holidays && holidayToday(holidays, today)) {
    return 'in den Ferien aus'
  }
  return 'laut Zeitplan aus'
}

function eventActive(event, now) {
  if (event.is_active) return true
  const from = asDate(event.active_from)
  const until = asDate(event.active_until)
  return !!(from && until && from <= now && now <= until)
}

function viewReason(screen, viewId, { now, events }) {
  const overrideUntil = asDate(screen.override_until)
  if (screen.override_view_id && screen.override_view_id === viewId && (!screen.override_until || overrideUntil > now)) {
    return overrideUntil ? `manuell festgelegt bis ${formatTime(overrideUntil)}` : 'manuell festgelegt'
  }

  const event = (events || []).find((ev) => eventActive(ev, now)
    && (ev.assignments || []).some((a) => a.screen_id === screen.id && a.view_id === viewId))
  if (event) {
    const until = event.is_active ? null : asDate(event.active_until)
    return until ? `weil Termin ${quote(event.name)} bis ${formatTime(until)} läuft` : `weil Termin ${quote(event.name)} läuft`
  }

  const entry = activeRow(screen.schedule, weekdayOf(now), hhmmOf(now))
  if (entry?.view_id && entry.view_id === viewId) return `laut Zeitplan bis ${entry.until || '23:59'}`

  return 'Standard-Ansicht'
}

// context: { now, events (/events), holidays (/holidays) }. Without display data only what follows
// from the screen fields remains (off or '').
export function explainScreen(screen, payload, context = {}) {
  const ctx = { now: context.now ?? new Date(), events: context.events, holidays: context.holidays }
  if (payload?.mode?.kind === 'emergency') return 'Notfall aktiv'

  if (!payload) {
    const until = asDate(screen.off_until)
    if (screen.power_mode === 'manual_off' || (until && until > ctx.now)) return offReason(screen, ctx)
    return ''
  }
  if (payload.screen?.power === false) return offReason(screen, ctx)

  if (payload.mode?.kind === 'exam') {
    const until = asDate(payload.mode.active_until)
    const title = quote(payload.mode.title || 'Klausur')
    return until ? `weil Klausur ${title} bis ${formatTime(until)} läuft` : `weil Klausur ${title} läuft`
  }
  if (!payload.view) return ''
  return viewReason(screen, payload.view.id, ctx)
}

function viewLabel(view, viewNames) {
  if (!view) return 'Keine Ansicht'
  return viewNames?.[view.id] || KIND_LABELS[view.kind] || 'Ansicht'
}

// viewNames: { [id]: name } from /views.
export function describeShown(payload, viewNames) {
  const mode = payload?.mode
  if (mode?.kind === 'emergency') return 'Notfall'
  if (payload?.screen?.power === false) return 'Aus'
  if (mode?.kind === 'exam' || mode?.kind === 'on_air') {
    const label = mode.kind === 'exam' ? 'Klausur' : 'On-Air'
    return mode.display === 'split' ? `${label}, geteilt mit ${viewLabel(payload.view, viewNames)}` : label
  }
  return viewLabel(payload?.view, viewNames)
}
