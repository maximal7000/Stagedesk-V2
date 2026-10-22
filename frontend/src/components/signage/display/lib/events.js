import { formatShortDate, formatTime } from './format'

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime()

// Calendar days from `now` to `value` (today = 0, yesterday = -1)
export function daysUntil(value, now) {
  return Math.round((startOfDay(new Date(value)) - startOfDay(now)) / 86400000)
}

// Second line of an event: time, "ganztägig", "bis Fr 23.10." or "läuft bis 21:00"
export function eventDetail(ev) {
  const start = new Date(ev.date_from)
  // An end exactly at midnight counts for the previous day
  const end = ev.date_until ? new Date(new Date(ev.date_until).getTime() - 60000) : start
  const multiDay = !sameDay(start, end)
  const allDay = start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 23 && end.getMinutes() >= 58
  if (ev.is_running) {
    if (!ev.date_until) return 'läuft'
    return `läuft bis ${multiDay ? formatShortDate(end) : formatTime(ev.date_until)}`
  }
  if (multiDay) return allDay ? `bis ${formatShortDate(end)}` : `${formatTime(start)}, bis ${formatShortDate(end)}`
  return allDay ? 'ganztägig' : formatTime(start)
}
