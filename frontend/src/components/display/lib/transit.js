import { swlColorForLine } from './lines'

// Verkehrsmittel, die als Bus gelten; alles andere (re, rb, ice, sbahn …) zählt als Zug
const BUS_KINDS = ['bus', 'faehre', 'taxi']

// Allgemeine Dauer-Hinweise ohne Störungscharakter (aus der alten MonitorPage übernommen)
const DISRUPTION_GENERIC_RE = /(tretroller|e-?scooter|e-?roller|fahrr[aä]d|gep[aä]ck|mitnahme|hund|ferienfahrplan|schulfrei|kurzstrecke|heiligabend|silvester|rollstuhl|autokraft|barrierefrei|informationen zum)/i

const DISRUPTION_KIND_LABEL = { disruption: 'Störung', construction: 'Baustelle', strike: 'Streik' }

export const isBus = (dep) => BUS_KINDS.includes(dep?.kind_icon)

// Kurzes Chip-Label: "Bus 12" → "12", "RE8" → "RE 8"
export function lineLabel(dep) {
  const raw = String(dep?.line || '').trim()
  const m = raw.match(/^(?:Bus|Linie|Tram|Fähre|Faehre)\s+(.+)$/i)
  const label = (m ? m[1] : raw) || '?'
  return label.replace(/^([A-Za-z]+)(\d+)$/, '$1 $2')
}

// Chip-Farbe: Farbe aus der API, sonst SWL-Farbe (nur Busse), sonst null (neutraler Chip)
export function lineColor(dep) {
  if (dep?.line_color) return dep.line_color
  return isBus(dep) ? swlColorForLine(lineLabel(dep)) : null
}

// Minuten bis zur tatsächlichen Abfahrt ("HH:MM", Verspätung eingerechnet), über Mitternacht hinweg
export function minutesUntil(dep, now) {
  const value = dep?.departure_actual || dep?.departure
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''))
  if (!m) return null
  const depMin = Number(m[1]) * 60 + Number(m[2]) + (dep.departure_actual ? 0 : Number(dep.delay) || 0)
  let diff = depMin - (now.getHours() * 60 + now.getMinutes())
  if (diff < -720) diff += 1440
  if (diff > 720) diff -= 1440
  return diff
}

// Störungsleiste: allgemeine Hinweise ohne Linienbezug raus; Streik, dann hervorgehobene zuerst
export function visibleDisruptions(items) {
  return (items || [])
    .filter((d) => !(DISRUPTION_GENERIC_RE.test(`${d.title || ''} ${d.text || ''}`)
      && (d.all_lines || !(d.lines || []).filter((l) => l && l !== 'all').length)))
    .sort((a, b) => (b.kind === 'strike') - (a.kind === 'strike') || (b.highlighted ? 1 : 0) - (a.highlighted ? 1 : 0))
}

// "Störung · Linie 5", "Baustelle · Linien 11, 31", "Hinweis"
export function disruptionLabel(d) {
  const lines = d.all_lines ? [] : (d.lines || []).filter((l) => l && l !== 'all')
  const linePart = lines.length ? `${lines.length === 1 ? 'Linie' : 'Linien'} ${lines.join(', ')}` : ''
  return [DISRUPTION_KIND_LABEL[d.kind] ?? 'Hinweis', linePart].filter(Boolean).join(' · ')
}
