// Daten-Helfer für Ansichten-Liste und -Bearbeitung (Spec §3.1, §6.2 "Ansicht bearbeiten").
// Der Entwurf enthält nur bearbeitbare Felder; gespeichert und in die Vorschau geschickt werden nur die
// geänderten, normalisiert über viewPayload.
import { deepEqual } from '../shared/useDraft'

export const KIND_OPTIONS = [
  { value: 'departures', label: 'Abfahrten', description: 'Nächste Busse und Züge der gewählten Haltestellen.' },
  { value: 'substitutions', label: 'Vertretungsplan', description: 'Vertretungen und Ausfälle aus WebUntis für heute und den nächsten Schultag.' },
  { value: 'split', label: 'Geteilt', description: 'Vertretungsplan und Abfahrten nebeneinander auf einem Bildschirm.' },
  { value: 'media', label: 'Medien', description: 'PDFs und Bilder als Seiten, nacheinander oder nebeneinander.' },
  { value: 'info', label: 'Info', description: 'Ankündigungen, Termine und ein Countdown.' },
  { value: 'rotation', label: 'Wechsel', description: 'Zeigt mehrere Ansichten nacheinander, jede für eine feste Zeit.' },
]

export const kindLabel = (kind) => KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind

export const STYLE_OPTIONS = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'ci', label: 'CI' },
  { value: 'dense', label: 'Dicht' },
  { value: 'dark', label: 'Dunkel' },
]

const DENSE_KINDS = new Set(['departures', 'substitutions', 'split'])

export function styleHelp(style, kind) {
  if (style === 'ci') return 'CI: Schulfarben mit Rad und Streifen, große Schrift.'
  if (style === 'dense') return 'Dicht: mehr Zeilen pro Bildschirm, ohne Titelzeile.'
  if (style === 'dark') return 'Dunkel: dunkler Hintergrund für Räume mit wenig Licht.'
  return DENSE_KINDS.has(kind)
    ? 'Automatisch: diese Ansicht erscheint dicht, mit mehr Zeilen pro Bildschirm.'
    : 'Automatisch: diese Ansicht erscheint im CI-Stil mit Schulfarben.'
}

export const ON_AIR_OPTIONS = [
  { value: 'fullscreen', label: 'Vollbild' },
  { value: 'split', label: 'Daneben' },
  { value: 'none', label: 'Nicht zeigen' },
]

export const SIDE_OPTIONS = [
  { value: 'left', label: 'Links' },
  { value: 'right', label: 'Rechts' },
]

export const MIN_ROTATION_SECONDS = 5
export const MAX_ROTATION_SECONDS = 600
export const DEFAULT_MAX_DEPARTURES = 10

// Zahlenfelder mit Bereich, wie das Backend sie prüft (monitor/validation.py)
export const NUMBER_RULES = {
  page_seconds: { label: 'Blättertakt', min: 5, max: 120 },
  media_seconds: { label: 'Sekunden pro Seite', min: 3, max: 600 },
  pdf_per_screen: { label: 'Seiten nebeneinander', min: 1, max: 3 },
  pdf_static_page: { label: 'Feste Seite', min: 1, max: 999 },
  split_left_percent: { label: 'Breite links', min: 20, max: 80 },
}
export const WALK_MINUTES_LIMIT = 60
export const MAX_DEPARTURES_LIMIT = 30

const numberMessage = (label, min, max) => `${label}: bitte eine ganze Zahl von ${min} bis ${max} eintragen.`
const inRange = (value, min, max) => value !== '' && value != null && Number.isInteger(Number(value))
  && Number(value) >= min && Number(value) <= max

// Felder, die das Admin bearbeitet (Teilmenge von DisplayViewUpdateSchema)
export const EDITABLE_FIELDS = [
  'name', 'style', 'on_air_behavior', 'on_air_split_side', 'page_seconds',
  'show_weather', 'weather_city', 'show_qr_code', 'qr_code_url', 'qr_code_label',
  'transit_stops', 'transit_disruption_rail', 'transit_disruption_bus', 'transit_disruption_rail_lines',
  'transit_disruption_bus_lines', 'transit_disruption_manual',
  'transit_strike_active', 'transit_strike_text', 'transit_strike_lines', 'transit_strike_types',
  'substitutions_next_day', 'webuntis_url', 'webuntis_url_next_day', 'webuntis_link_id', 'webuntis_link_next_day_id',
  'media_items', 'media_seconds', 'pdf_per_screen', 'pdf_mode', 'pdf_pages', 'pdf_static_page',
  'show_announcements', 'show_events', 'show_countdown',
  'show_custom_countdown', 'custom_countdown_name', 'custom_countdown_date',
  'split_left', 'split_right', 'split_left_percent',
  'rotation_items',
]

const INT_FIELDS = new Set(['page_seconds', 'media_seconds', 'pdf_per_screen', 'pdf_static_page', 'split_left_percent'])
const TEXT_FIELDS = new Set(['name', 'weather_city', 'qr_code_url', 'qr_code_label', 'transit_strike_text',
  'webuntis_url', 'webuntis_url_next_day', 'pdf_pages', 'custom_countdown_name'])
const LINK_FIELDS = new Set(['webuntis_link_id', 'webuntis_link_next_day_id'])
const LIST_FIELDS = new Set(['transit_disruption_rail_lines', 'transit_disruption_bus_lines', 'transit_strike_lines', 'transit_strike_types'])

const pad = (n) => String(n).padStart(2, '0')

// ISO mit Zone → Wert eines datetime-local-Felds (Ortszeit). Der Server liest einen Wert ohne Zone als Ortszeit.
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function draftFromView(view) {
  const draft = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, view?.[f]]))
  draft.custom_countdown_date = toLocalInput(view?.custom_countdown_date)
  return draft
}

export function changedKeys(base, draft) {
  return EDITABLE_FIELDS.filter((f) => !deepEqual(base?.[f], draft?.[f]))
}

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}
const trimList = (list) => (Array.isArray(list) ? list.map((x) => String(x).trim()).filter(Boolean) : [])

export function normalizeStop(stop) {
  const max = toInt(stop.max_departures, DEFAULT_MAX_DEPARTURES)
  return {
    ...stop,
    name: String(stop.name ?? '').trim(),
    walk_minutes: Math.max(0, toInt(stop.walk_minutes, 0)),
    max_departures: max >= 1 ? Math.min(max, MAX_DEPARTURES_LIMIT) : DEFAULT_MAX_DEPARTURES,
    filter_lines: trimList(stop.filter_lines),
    filter_direction: String(stop.filter_direction ?? '').trim(),
    filter_via: String(stop.filter_via ?? '').trim(),
    show_bus: stop.show_bus !== false,
    show_rail: stop.show_rail !== false,
    show_long_distance: stop.show_long_distance !== false,
  }
}

function normalizeField(key, value) {
  if (INT_FIELDS.has(key)) return toInt(value, null)
  if (TEXT_FIELDS.has(key)) return String(value ?? '').trim()
  if (LIST_FIELDS.has(key)) return trimList(value)
  if (LINK_FIELDS.has(key)) return value ? Number(value) : null
  if (key === 'custom_countdown_date') return value || null
  if (key === 'transit_stops') return (value ?? []).map(normalizeStop)
  if (key === 'rotation_items') {
    return (value ?? [])
      .filter((item) => item?.view_id)
      .map((item) => ({ view_id: Number(item.view_id), seconds: toInt(item.seconds, 15) }))
  }
  if (key === 'media_items') return (value ?? []).map(Number).filter(Number.isFinite)
  if (key === 'transit_disruption_manual') {
    return (value ?? [])
      .map((m) => ({ ...m, title: String(m.title ?? '').trim(), text: String(m.text ?? '').trim() }))
      .filter((m) => m.title || m.text)
  }
  return value
}

export function viewPayload(draft, keys) {
  return Object.fromEntries(keys.map((k) => [k, normalizeField(k, draft[k])]))
}

// Vorschau: die gespeicherte Ansicht (id) ist die Basis, dazu nur die geänderten Felder
export function previewPayload(id, base, draft) {
  return { id, ...viewPayload(draft, changedKeys(base, draft)) }
}

export function rotationProblems(items) {
  const problems = []
  if (!items?.length) problems.push('Der Wechsel braucht mindestens eine Ansicht. Bitte eine Ansicht hinzufügen.')
  ;(items ?? []).forEach((item, i) => {
    if (!item?.view_id) {
      problems.push(`In Zeile ${i + 1} des Wechsels fehlt die Ansicht. Bitte eine wählen oder die Zeile entfernen.`)
      return
    }
    const seconds = Number(item.seconds)
    if (!Number.isInteger(seconds) || seconds < MIN_ROTATION_SECONDS || seconds > MAX_ROTATION_SECONDS) {
      problems.push(`In Zeile ${i + 1} des Wechsels muss die Dauer zwischen ${MIN_ROTATION_SECONDS} und ${MAX_ROTATION_SECONDS} Sekunden liegen.`)
    }
  })
  return problems
}

// keys: geänderte Felder; nur deren Zahlen werden geprüft (alte, ungeänderte Werte blockieren nichts)
export function viewProblems(draft, keys = []) {
  const problems = []
  if (!String(draft.name ?? '').trim()) problems.push('Der Name fehlt. Bitte einen Namen eintragen.')
  if (draft.kind === 'rotation') problems.push(...rotationProblems(draft.rotation_items))
  for (const [key, { label, min, max }] of Object.entries(NUMBER_RULES)) {
    if (keys.includes(key) && !inRange(draft[key], min, max)) problems.push(numberMessage(label, min, max))
  }
  if (keys.includes('transit_stops')) {
    for (const stop of draft.transit_stops ?? []) {
      if (!inRange(stop.walk_minutes ?? 0, 0, WALK_MINUTES_LIMIT)) {
        problems.push(`Haltestelle „${stop.name}“: ${numberMessage('Fußweg', 0, WALK_MINUTES_LIMIT)}`)
      }
      if (!inRange(stop.max_departures ?? DEFAULT_MAX_DEPARTURES, 1, MAX_DEPARTURES_LIMIT)) {
        problems.push(`Haltestelle „${stop.name}“: ${numberMessage('Max. Zeilen', 1, MAX_DEPARTURES_LIMIT)}`)
      }
    }
  }
  return problems
}

// Ein Wechsel enthält nie einen Wechsel (Backend: validate_rotation_items) und nie sich selbst
export function rotationChoices(views, ownId) {
  return (views ?? []).filter((v) => v.kind !== 'rotation' && v.id !== ownId)
}

export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// Bildschirme, auf denen die Ansicht eingestellt ist, mit der Rolle (Standard, vorübergehend, Zeitplan)
export function usedOn(viewId, screens, now = new Date()) {
  const out = []
  for (const s of screens ?? []) {
    const roles = []
    if (s.default_view_id === viewId) roles.push('Standard-Ansicht')
    if (s.override_view_id === viewId && (!s.override_until || new Date(s.override_until) > now)) roles.push('Vorübergehend')
    if ((s.schedule ?? []).some((e) => e?.view_id === viewId)) roles.push('Zeitplan')
    if (roles.length) out.push({ id: s.id, name: s.name, role: roles.join(', ') })
  }
  return out
}

export function newStop(result) {
  return {
    id: result.id, name: result.name, walk_minutes: 0, max_departures: DEFAULT_MAX_DEPARTURES, filter_lines: [],
    filter_direction: '', filter_via: '', show_bus: true, show_rail: true, show_long_distance: true,
  }
}

export function stopTransport(stop) {
  const parts = []
  if (stop.show_bus !== false) parts.push('Bus')
  if (stop.show_rail !== false) parts.push('Zug')
  if (stop.show_long_distance !== false) parts.push('Fernzug')
  return parts.length ? parts.join(', ') : 'Keine'
}

// Vorschau-Größe: Auflösung des Bildschirms (das Modell kennt keine; 4K wie die vorhandenen Geräte)
export function screenSize(screen) {
  return screen?.orientation === 'portrait' ? { width: 2160, height: 3840 } : { width: 3840, height: 2160 }
}
