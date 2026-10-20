// Daten-Helfer für Bildschirm-Liste und -Detail (Spec §6.2 Bildschirm-Detail).
import { formatTime } from '../../display/lib/format'
import { formatDayTime } from '../shared/explain'
import { describeSchedule, normalizeExceptions, normalizeSchedule } from '../shared/schedule'

// Abschnitte des Details: Speichern sendet nur die Felder des eigenen Abschnitts.
// Anzeige braucht monitor.setup, Ein- und Ausschalten monitor.power (Backend: SCREEN_POWER_FIELDS).
export const DISPLAY_FIELDS = ['name', 'location', 'default_view_id', 'scale', 'orientation']
export const POWER_FIELDS = ['power_mode', 'power_schedule', 'off_during_holidays', 'power_exceptions']

export const SCALE_OPTIONS = [
  { value: 'auto', label: 'Automatisch' },
  ...['75', '90', '100', '110', '125', '150', '175', '200'].map((v) => ({ value: v, label: `${v} %` })),
]

export const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: 'Quer' },
  { value: 'portrait', label: 'Hoch' },
]

export const POWER_MODE_OPTIONS = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'manual_on', label: 'Immer an' },
  { value: 'manual_off', label: 'Immer aus' },
]

// Ohne zoom: ein URL-Zoom würde die Skalierung aus dem Admin überstimmen
export function kioskUrl(origin, screen) {
  return `${origin}/monitor?screen=${encodeURIComponent(screen.slug)}&key=${encodeURIComponent(screen.access_key)}`
}

export function pickFields(screen, fields) {
  return Object.fromEntries(fields.map((f) => [f, screen?.[f]]))
}

export function sectionPayload(section, draft) {
  if (section === 'display') {
    return {
      name: (draft.name ?? '').trim(),
      location: (draft.location ?? '').trim(),
      default_view_id: draft.default_view_id ? Number(draft.default_view_id) : null,
      scale: draft.scale,
      orientation: draft.orientation,
    }
  }
  return {
    power_mode: draft.power_mode,
    off_during_holidays: !!draft.off_during_holidays,
    power_schedule: normalizeSchedule(draft.power_schedule),
    power_exceptions: normalizeExceptions(draft.power_exceptions),
  }
}

export function powerSummary(screen) {
  if (screen.power_mode === 'manual_on') return 'Manuell immer an'
  if (screen.power_mode === 'manual_off') return 'Manuell immer aus'
  return describeSchedule(screen.power_schedule)
}

const CEC_TEXT = { on: 'an', standby: 'Standby' }
export const cecLabel = (status) => CEC_TEXT[status] ?? 'unbekannt'

// Letzte Meldung des Bildschirms (bis zum Geräte-Agent: der CEC-Status vom Pi)
export function lastReport(value, now = new Date()) {
  const at = value ? new Date(value) : null
  if (!at || Number.isNaN(at.getTime())) return 'noch nie'
  if (at.toDateString() === now.toDateString()) return `heute ${formatTime(at)}`
  return formatDayTime(at)
}

// Andere Ansicht vorübergehend (override_view_id/override_until, Recht monitor.setup).
// Gilt wie im Backend (Screen.get_active_view) ohne Ende oder bis zu einem Zeitpunkt in der Zukunft.
export function activeOverride(screen, now = new Date()) {
  if (!screen?.override_view_id) return null
  const until = screen.override_until ? new Date(screen.override_until) : null
  if (until && !(until > now)) return null
  return { viewId: screen.override_view_id, until }
}

export const OVERRIDE_CLEAR = { override_view_id: null, override_until: null }

// untilLocal: Wert eines datetime-local-Felds ("2026-10-20T14:00", Ortszeit), leer = bis auf Weiteres
export function overridePayload(viewId, untilLocal) {
  return {
    override_view_id: Number(viewId),
    override_until: untilLocal ? new Date(untilLocal).toISOString() : null,
  }
}

export function overrideProblem(viewId, untilLocal, now = new Date()) {
  if (!viewId) return 'Bitte eine Ansicht wählen.'
  if (untilLocal) {
    const until = new Date(untilLocal)
    if (Number.isNaN(until.getTime()) || until <= now) return '„Bis“ muss in der Zukunft liegen. Bitte einen späteren Zeitpunkt wählen oder das Feld leeren.'
  }
  return ''
}
