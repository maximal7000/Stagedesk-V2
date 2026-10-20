// Wochenzeitplan und Datums-Ausnahmen eines Bildschirms (Screen.power_schedule / power_exceptions).
// Tage zählen wie im Backend (power.py, date.weekday()): 0 = Montag … 6 = Sonntag.
// Endet ein Fenster vor seinem Beginn, gilt es am selben Tag ab Beginn bis Mitternacht und ab 0 Uhr bis zum Ende
// (power.time_in_window). Eine Ausnahme ohne Zeiten heißt: ganztags an.
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

const text = (v) => (typeof v === 'string' ? v.trim() : '')
const isEntry = (e) => e !== null && typeof e === 'object' && !Array.isArray(e)

export function normalizeSchedule(entries) {
  return (Array.isArray(entries) ? entries : []).filter(isEntry).map((e) => ({
    // "1" aus alten Daten zählt als 1; das Backend vergleicht Zahlen
    days: [...new Set((Array.isArray(e.days) ? e.days : []).map((d) => (typeof d === 'string' && d.trim() !== '' ? Number(d) : d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      .sort((a, b) => a - b),
    from: text(e.from),
    until: text(e.until),
  }))
}

const SAME_TIMES = 'Von und bis dürfen nicht gleich sein.'

export function scheduleProblems(entries) {
  return normalizeSchedule(entries).map((e) => {
    if (!e.days.length) return 'Mindestens einen Tag wählen.'
    if (!e.from || !e.until) return 'Von und bis angeben.'
    if (e.from === e.until) return SAME_TIMES
    return null
  })
}

// Zusammenhängende Tage ab drei werden zu "Mo–Fr", sonst einzeln mit Komma
export function formatDays(days) {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    if (j - i >= 2) parts.push(`${WEEKDAYS[sorted[i]]}–${WEEKDAYS[sorted[j]]}`)
    else for (let k = i; k <= j; k++) parts.push(WEEKDAYS[sorted[k]])
    i = j + 1
  }
  return parts.join(', ')
}

export function describeSchedule(entries) {
  const list = normalizeSchedule(entries)
  if (!list.length) return 'Ohne Zeitplan'
  return list.map((e) => `${formatDays(e.days)} ${e.from} bis ${e.until}`).join(' · ')
}

export function normalizeExceptions(list) {
  return (Array.isArray(list) ? list : []).filter(isEntry).map((e) => {
    const fromDate = text(e.from_date)
    return {
      from_date: fromDate,
      until_date: text(e.until_date) || fromDate,
      from: text(e.from),
      until: text(e.until),
      note: text(e.note),
    }
  })
}

export function exceptionProblems(list) {
  return normalizeExceptions(list).map((e) => {
    if (!e.from_date) return 'Datum angeben.'
    if (e.until_date < e.from_date) return 'Das Enddatum liegt vor dem Startdatum.'
    if (!e.from !== !e.until) return 'Von und bis angeben oder beide leer lassen.'
    if (e.from && e.from === e.until) return SAME_TIMES
    return null
  })
}

// ── Wochenübersicht (Ferien & Zeitpläne) ────────────────────────────
// Ein-Zeiten je Wochentag als Minuten-Bereiche [start, end), genau wie das Backend sie wertet
// (power.compute_power_state): leerer Zeitplan = immer an, nur Zahlen als Tage, fehlende Zeiten 00:00 bzw. 23:59,
// über Mitternacht beide Teile am selben Wochentag. 23:59 als Ende zählt bis Mitternacht.
export const DAY_MINUTES = 1440
const FULL_DAY = [{ start: 0, end: DAY_MINUTES }]

function toMinutes(hhmm, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '') ?? /^(\d{1,2}):(\d{2})$/.exec(fallback)
  return Number(m[1]) * 60 + Number(m[2])
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const out = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

export function weekBars(screen) {
  if (screen?.power_mode === 'manual_off') return { mode: 'off', days: Array(7).fill([]) }
  if (screen?.power_mode === 'manual_on') return { mode: 'on', days: Array(7).fill(FULL_DAY) }
  const entries = screen?.power_schedule
  if (!Array.isArray(entries) || !entries.length) return { mode: 'always', days: Array(7).fill(FULL_DAY) }
  const days = Array.from({ length: 7 }, () => [])
  for (const e of entries.filter(isEntry)) {
    if (!Array.isArray(e.days)) continue
    const start = toMinutes(e.from, '00:00')
    const rawEnd = toMinutes(e.until, '23:59')
    const end = rawEnd === DAY_MINUTES - 1 ? DAY_MINUTES : rawEnd
    const parts = start <= rawEnd ? [{ start, end }] : [{ start: 0, end }, { start, end: DAY_MINUTES }]
    for (const d of e.days) {
      if (Number.isInteger(d) && d >= 0 && d <= 6) days[d].push(...parts)
    }
  }
  return { mode: 'schedule', days: days.map(mergeRanges) }
}
