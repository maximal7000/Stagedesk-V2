// Row: { days, from, until, view_id }, view_id null = default view. Days as in the backend
// (screen_schedule.py, date.weekday()): 0 = Monday … 6 = Sunday. A row that ends before it starts
// crosses midnight; the part after 00:00 belongs to the next day. Overlapping rows: the top one wins;
// the screen is on in the union of all rows. An exception without times means on all day.
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

const text = (v) => (typeof v === 'string' ? v.trim() : '')
const isEntry = (e) => e !== null && typeof e === 'object' && !Array.isArray(e)

export function normalizeSchedule(entries) {
  return (Array.isArray(entries) ? entries : []).filter(isEntry).map((e) => ({
    // "1" from old data counts as 1; the backend compares numbers
    days: [...new Set((Array.isArray(e.days) ? e.days : []).map((d) => (typeof d === 'string' && d.trim() !== '' ? Number(d) : d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      .sort((a, b) => a - b),
    from: text(e.from),
    until: text(e.until),
    view_id: viewIdOf(e.view_id),
  }))
}

function viewIdOf(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return Number.isInteger(n) ? n : null
}

const SAME_TIMES = 'Von und bis dürfen nicht gleich sein.'

// views (optional, list from /views): the backend rejects a view missing there
export function scheduleProblems(entries, views = null) {
  const known = views ? new Set(views.map((v) => v.id)) : null
  return normalizeSchedule(entries).map((e) => {
    if (!e.days.length) return 'Mindestens einen Tag wählen.'
    if (!e.from || !e.until) return 'Von und bis angeben.'
    if (e.from === e.until) return SAME_TIMES
    if (known && e.view_id !== null && !known.has(e.view_id)) return 'Die gewählte Ansicht gibt es nicht mehr. Bitte eine andere wählen.'
    return null
  })
}

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
  return [...new Set(list.map((e) => `${formatDays(e.days)} ${e.from} bis ${e.until}`))].join(' · ')
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

// Times as minute ranges [start, end) per weekday, exactly as the backend evaluates them
// (screen_schedule.row_matches): only numbers as days, without times all day, missing time 00:00 or 23:59,
// across midnight until 00:00 on the day and from 00:00 on the next day. 23:59 as end counts until midnight.
export const DAY_MINUTES = 1440
const FULL_DAY = [{ start: 0, end: DAY_MINUTES }]
const DAY_START = '00:00'
const DAY_END = '23:59'

function windowOf(row) {
  const from = typeof row.from === 'string' ? row.from : ''
  const until = typeof row.until === 'string' ? row.until : ''
  if (!from && !until) return [DAY_START, DAY_END]
  return [from || DAY_START, until || DAY_END]
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm) ?? /^(\d{1,2}):(\d{2})$/.exec(DAY_START)
  return Number(m[1]) * 60 + Number(m[2])
}

const validDays = (row) => (Array.isArray(row.days) ? row.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)

function segments(row) {
  if (!isEntry(row)) return []
  const [from, until] = windowOf(row)
  const start = toMinutes(from)
  const rawEnd = toMinutes(until)
  const end = rawEnd === DAY_MINUTES - 1 ? DAY_MINUTES : rawEnd
  const out = []
  for (const day of validDays(row)) {
    if (start <= rawEnd) out.push({ day, start, end })
    else {
      out.push({ day, start, end: DAY_MINUTES })
      if (end > 0) out.push({ day: (day + 1) % 7, start: 0, end })
    }
  }
  return out
}

const overlaps = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end

// Hint per row that overlaps an earlier one (the top one wins); touching rows do not count
export function overlapHints(rows) {
  const list = Array.isArray(rows) ? rows : []
  const parts = list.map(segments)
  return parts.map((mine, i) => {
    const j = parts.slice(0, i).findIndex((other) => other.some((a) => mine.some((b) => overlaps(a, b))))
    return j === -1 ? null : `Überschneidet sich mit Zeile ${j + 1}, Zeile ${j + 1} hat Vorrang.`
  })
}

function subtract(range, covered) {
  let pieces = [range]
  for (const c of covered) {
    pieces = pieces.flatMap((p) => {
      if (c.end <= p.start || p.end <= c.start) return [p]
      return [{ ...p, end: c.start }, { ...p, start: c.end }].filter((q) => q.start < q.end)
    })
  }
  return pieces
}

export function weekBars(rows) {
  const covered = Array.from({ length: 7 }, () => [])
  const bars = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const viewId = isEntry(row) ? viewIdOf(row.view_id) : null
    for (const seg of segments(row)) {
      for (const piece of subtract(seg, covered[seg.day])) bars.push({ day: seg.day, start: piece.start, end: piece.end, viewId })
      covered[seg.day].push(seg)
    }
  }
  bars.sort((a, b) => a.day - b.day || a.start - b.start)
  const out = []
  for (const bar of bars) {
    const last = out[out.length - 1]
    if (last && last.day === bar.day && last.end === bar.start && last.viewId === bar.viewId) last.end = bar.end
    else out.push({ ...bar })
  }
  return out
}

function mergeRanges(ranges) {
  const out = []
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ start: r.start, end: r.end })
  }
  return out
}

// On-times per weekday (power.compute_power_state): empty schedule = always on,
// otherwise the union of all rows
export function powerWeek(screen) {
  if (screen?.power_mode === 'manual_off') return { mode: 'off', days: Array(7).fill([]) }
  if (screen?.power_mode === 'manual_on') return { mode: 'on', days: Array(7).fill(FULL_DAY) }
  const rows = screen?.schedule
  if (!Array.isArray(rows) || !rows.length) return { mode: 'always', days: Array(7).fill(FULL_DAY) }
  const days = Array.from({ length: 7 }, () => [])
  for (const bar of weekBars(rows)) days[bar.day].push(bar)
  return { mode: 'schedule', days: days.map(mergeRanges) }
}

// Row that applies now (screen_schedule.active_row): ends inclusive, top first. weekday 0 = Monday.
export function activeRow(rows, weekday, hhmm) {
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isEntry(row) || (row.days !== undefined && !Array.isArray(row.days))) continue
    const days = row.days ?? []
    const [start, end] = windowOf(row)
    const hit = start <= end
      ? days.includes(weekday) && start <= hhmm && hhmm <= end
      : (days.includes(weekday) && hhmm >= start) || (days.includes((weekday + 6) % 7) && hhmm <= end)
    if (hit) return row
  }
  return null
}

// Colour slot per view (series with count tones): default view first, then the others by id.
// The colour follows the view, so moving rows recolours nothing. -> Map(viewId | null -> slot)
export function seriesSlots(rows, count) {
  const ids = [...new Set((Array.isArray(rows) ? rows : []).map((r) => r?.view_id).filter((id) => Number.isInteger(id)))]
    .sort((a, b) => a - b)
  return new Map([[null, 0], ...ids.map((id, i) => [id, (i + 1) % count])])
}
