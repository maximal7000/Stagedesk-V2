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
