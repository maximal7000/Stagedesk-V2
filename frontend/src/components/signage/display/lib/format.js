const TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const TIME_SECONDS = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'long' })
const LONG_DATE = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })

// Date or null for missing and invalid values (Intl would throw on Invalid Date)
function asDate(value) {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const formatWith = (fmt) => (value) => {
  const d = asDate(value)
  return d ? fmt.format(d) : ''
}

export const formatTime = formatWith(TIME)
export const formatTimeSeconds = formatWith(TIME_SECONDS)
export const formatWeekday = formatWith(WEEKDAY)
export const formatLongDate = formatWith(LONG_DATE)

export function formatTemperature(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${Math.round(n)} °C` : ''
}

const DAY_MONTH = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
const WEEKDAY_SHORT = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })

// "19.10."
export const formatDayMonth = formatWith(DAY_MONTH)
// "Do 22.10."
export function formatShortDate(value) {
  const d = asDate(value)
  return d ? `${WEEKDAY_SHORT.format(d).replace(/\.$/, '')} ${DAY_MONTH.format(d)}` : ''
}

// "2026-10-19" as a local date (no time zone shift from UTC parsing).
// Other values are parsed normally; invalid ones give an Invalid Date that the formats print as ''.
export function parseLocalDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : (asDate(iso) ?? new Date(NaN))
}
