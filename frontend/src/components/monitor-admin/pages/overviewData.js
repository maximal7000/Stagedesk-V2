// Abgeleitete Angaben der Übersicht (Spec §6.2): Datenquellen, nächste Klausur, "Demnächst",
// und ob alle Bildschirme bis Tagesende aus sind.
import { formatShortDate, formatTime, parseLocalDate } from '../../display/lib/format'
import { formatDayTime } from '../shared/explain'
import { screenStatus } from '../shared/screenStatus'

function asDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// Alle Abfahrts-Daten einer Ansicht, auch in geteilten Ansichten und im Ansichten-Wechsel
function departuresBlocks(view, out = []) {
  if (!view) return out
  if (view.kind === 'departures' && view.data) out.push(view.data)
  if (view.kind === 'split' && view.data) {
    for (const side of [view.data.left, view.data.right]) {
      if (side?.kind === 'departures' && side.data) out.push(side.data)
    }
  }
  if (view.kind === 'rotation') {
    for (const item of view.data?.items || []) departuresBlocks(item.view, out)
  }
  return out
}

function latest(dates) {
  return dates.reduce((a, b) => (!a || b > a ? b : a), null)
}

function sourceFrom(entries, isOk) {
  if (!entries.length) return { tone: 'muted', text: 'nicht verwendet' }
  const last = latest(entries.filter((e) => isOk(e.data)).map((e) => e.at).filter(Boolean))
  return last ? { tone: 'ok', text: `OK · ${formatTime(last)}` } : { tone: 'warn', text: 'keine Daten' }
}

// payloads: /display-Antworten der Bildschirme; settings: /settings (WebUntis-Prüfung)
export function dataSources(payloads, settings) {
  const entries = []
  for (const p of payloads || []) {
    const at = asDate(p?.generated_at)
    for (const data of departuresBlocks(p?.view)) entries.push({ at, data })
  }
  const source = settings?.webuntis_source || ''
  const checked = asDate(settings?.webuntis_checked_at)
  let webuntis
  if (!source) webuntis = { tone: 'muted', text: 'nicht geprüft' }
  else if (source === 'unavailable') webuntis = { tone: 'bad', text: checked ? `nicht erreichbar · ${formatTime(checked)}` : 'nicht erreichbar' }
  else webuntis = { tone: 'ok', text: checked ? `OK · ${formatTime(checked)}` : 'OK' }

  return {
    departures: sourceFrom(entries, (d) => (d.stations || []).length > 0),
    webuntis,
    disruptions: sourceFrom(entries, (d) => Array.isArray(d.disruptions)),
  }
}

// Laufende oder nächste Klausur
export function nextExam(exams, now) {
  const open = (exams || []).filter((e) => {
    const until = asDate(e.active_until)
    return until && until >= now
  })
  open.sort((a, b) => asDate(a.active_from) - asDate(b.active_from))
  return open[0] ?? null
}

// "Di 20.10., 08:00 bis 12:30" (am selben Tag nur die Endzeit)
export function formatRange(from, until) {
  const a = asDate(from)
  const b = asDate(until)
  if (!a) return ''
  if (!b) return formatDayTime(a)
  const end = a.toDateString() === b.toDateString() ? formatTime(b) : formatDayTime(b)
  return `${formatDayTime(a)} bis ${end}`
}

// "Demnächst": nächste (oder laufende) Ferien und der nächste Termin
export function upcoming(holidays, events, now) {
  const items = []
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const holiday = (holidays || [])
    .filter((h) => parseLocalDate(h.end_date) >= today)
    .sort((a, b) => parseLocalDate(a.start_date) - parseLocalDate(b.start_date))[0]
  if (holiday) {
    const start = parseLocalDate(holiday.start_date)
    const value = start <= today ? `bis ${formatShortDate(parseLocalDate(holiday.end_date))}` : `ab ${formatShortDate(start)}`
    items.push({ key: 'holiday', label: holiday.name, value })
  }
  const event = (events || [])
    .filter((e) => !e.is_active && asDate(e.active_from) > now)
    .sort((a, b) => asDate(a.active_from) - asDate(b.active_from))[0]
  if (event) items.push({ key: 'event', label: `Termin „${event.name}“`, value: formatDayTime(event.active_from) })
  return items
}

// Spätestes off_until, wenn alle Bildschirme bis Tagesende aus sind; sonst null
export function allOffUntil(screens, now) {
  if (!screens?.length) return null
  const dates = screens.map((s) => asDate(s.off_until))
  if (dates.some((d) => !d || d <= now)) return null
  return dates.reduce((a, b) => (b > a ? b : a))
}

export const EMERGENCY_POWER_HINT = 'Während des Notfalls sind alle Bildschirme an.'

// Menü "An/aus" einer Bildschirm-Zeile. isOn: aktueller Zustand laut /display.
// Während des Notfalls schaltet die Power-Regel alles ein, die Einträge sind dann gesperrt.
export function powerMenu(screen, { now, isOn, emergencyActive }) {
  const disabled = !!emergencyActive
  const items = []
  const until = asDate(screen.off_until)
  if (until && until > now) {
    items.push({ key: 'clear-off', label: 'Tagesende-Aus aufheben', previous: screen.off_until, disabled })
  } else {
    items.push({ key: 'off-today', label: 'Bis Tagesende aus', disabled })
  }
  items.push(isOn
    ? { key: 'manual', label: 'Jetzt ausschalten', mode: 'manual_off', disabled }
    : { key: 'manual', label: 'Jetzt einschalten', mode: 'manual_on', disabled })
  if (screen.power_mode !== 'auto') items.push({ key: 'auto', label: 'Wieder automatisch', mode: 'auto', disabled })
  return { items, hint: disabled ? EMERGENCY_POWER_HINT : '' }
}

// "3 Bildschirme · 2 online"; online zählt die Geräte-Ampel (Warnung gilt als online), sonst der CEC-Rückfall
export function screensMeta(screens, now, devices = {}) {
  const online = screens.filter((s) => screenStatus(s, now, devices[s.id]).state === 'online').length
  const count = screens.length === 1 ? '1 Bildschirm' : `${screens.length} Bildschirme`
  return `${count} · ${online} online`
}
