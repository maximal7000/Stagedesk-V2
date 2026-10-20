// Zeit- und Datumsformate der Anzeige (Ortszeit des Geräts, deutsch)
const TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const TIME_SECONDS = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'long' })
const LONG_DATE = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })

const asDate = (value) => (value instanceof Date ? value : new Date(value))

export const formatTime = (value) => TIME.format(asDate(value))
export const formatTimeSeconds = (value) => TIME_SECONDS.format(asDate(value))
export const formatWeekday = (value) => WEEKDAY.format(asDate(value))
export const formatLongDate = (value) => LONG_DATE.format(asDate(value))

export function formatTemperature(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${Math.round(n)} °C` : ''
}

const DAY_MONTH = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
const WEEKDAY_SHORT = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })

// "19.10."
export const formatDayMonth = (value) => DAY_MONTH.format(asDate(value))
// "Do 22.10."
export const formatShortDate = (value) =>
  `${WEEKDAY_SHORT.format(asDate(value)).replace(/\.$/, '')} ${formatDayMonth(value)}`

// "2026-10-19" als lokales Datum (ohne Zeitzonenverschiebung durch UTC-Auslegung)
export function parseLocalDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : asDate(iso)
}
