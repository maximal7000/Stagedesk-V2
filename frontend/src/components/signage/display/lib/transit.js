import { swlColorForLine } from './lines'

const BUS_KINDS = ['bus', 'faehre', 'taxi']

const DISRUPTION_GENERIC_RE = /(tretroller|e-?scooter|e-?roller|fahrr[aä]d|gep[aä]ck|mitnahme|hund|ferienfahrplan|schulfrei|kurzstrecke|heiligabend|silvester|rollstuhl|autokraft|barrierefrei|informationen zum)/i

const DISRUPTION_KIND_LABEL = { disruption: 'Störung', construction: 'Baustelle', strike: 'Streik' }

export const BUS_FALLBACK_COLOR = '#95276E'

const MIXED_LIMIT_MIN = 20
const STATION_WORDS = ['hbf', 'hauptbahnhof', 'bahnhof']

export const isBus = (dep) => BUS_KINDS.includes(dep?.kind_icon)

export function lineLabel(dep) {
  const raw = String(dep?.line || '').trim()
  const m = raw.match(/^(?:Bus|Linie|Tram|Fähre|Faehre)\s+(.+)$/i)
  const label = (m ? m[1] : raw) || '?'
  return label.replace(/^([A-Za-z]+)(\d+)$/, '$1 $2')
}

export function lineColor(dep) {
  if (dep?.line_color) return dep.line_color
  return isBus(dep) ? swlColorForLine(lineLabel(dep)) || BUS_FALLBACK_COLOR : null
}

const clockMinutes = (value) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function wrapDay(diff) {
  if (diff < -720) return diff + 1440
  if (diff > 720) return diff - 1440
  return diff
}

export function formatDepartureTime(dep, now, format = 'minutes') {
  const planned = clockMinutes(dep?.departure)
  if (planned == null) return ''
  if (format === 'clock') return dep.departure
  const diff = wrapDay(planned - (now.getHours() * 60 + now.getMinutes()))
  if (format === 'mixed' && diff > MIXED_LIMIT_MIN) return dep.departure
  return diff < 1 ? 'jetzt' : `${diff} min`
}

export function delayLabel(dep) {
  const delay = Number(dep?.delay) || 0
  return delay > 0 ? `+${delay}` : null
}

export function assignColumns(stations, columns) {
  const count = Math.max(1, Math.floor(Number(columns)) || 1)
  const result = Array.from({ length: count }, () => [])
  const list = (stations || []).map((station, pos) => ({ station, order: Number.isInteger(station.index) ? station.index : pos }))
  list.sort((a, b) => a.order - b.order)
  for (const { station, order } of list) {
    const column = Number.isInteger(station.column) && station.column >= 1 ? Math.min(station.column, count) : (order % count) + 1
    result[column - 1].push(station)
  }
  return result
}

export function stripCommonCity(names) {
  const list = (names || []).map((n) => String(n || ''))
  const first = list[0]?.split(' ')[0]
  const prefix = `${first} `
  const shared = list.length > 1 && first && list.every((n) => n.startsWith(prefix) && n.length > prefix.length)
  return (name) => {
    const value = String(name || '')
    if (!shared || !value.startsWith(prefix)) return value
    const rest = value.slice(prefix.length)
    return STATION_WORDS.includes(rest.trim().toLowerCase()) ? value : rest
  }
}

export function minutesUntil(dep, now) {
  const value = dep?.departure_actual || dep?.departure
  const base = clockMinutes(value)
  if (base == null) return null
  const depMin = base + (dep.departure_actual ? 0 : Number(dep.delay) || 0)
  return wrapDay(depMin - (now.getHours() * 60 + now.getMinutes()))
}

export function visibleDisruptions(items) {
  return (items || [])
    .filter((d) => !(DISRUPTION_GENERIC_RE.test(`${d.title || ''} ${d.text || ''}`)
      && (d.all_lines || !(d.lines || []).filter((l) => l && l !== 'all').length)))
    .sort((a, b) => (b.kind === 'strike') - (a.kind === 'strike') || (b.highlighted ? 1 : 0) - (a.highlighted ? 1 : 0))
}

export function disruptionLabel(d) {
  const lines = d.all_lines ? [] : (d.lines || []).filter((l) => l && l !== 'all')
  const linePart = lines.length ? `${lines.length === 1 ? 'Linie' : 'Linien'} ${lines.join(', ')}` : ''
  return [DISRUPTION_KIND_LABEL[d.kind] ?? 'Hinweis', linePart].filter(Boolean).join(' · ')
}
