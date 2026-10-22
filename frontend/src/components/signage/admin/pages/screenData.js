// Daten-Helfer für Bildschirm-Liste und -Detail (Spec §6.2 Bildschirm-Detail).
import { formatTime } from '../../display/lib/format'
import { formatDayTime } from '../shared/explain'
import { describeSchedule, normalizeExceptions, normalizeSchedule } from '../shared/schedule'

// Abschnitte des Details: Speichern sendet nur die Felder des eigenen Abschnitts.
// Anzeige braucht signage.setup, Zeitplan und Ein- und Ausschalten signage.power (Backend: SCREEN_POWER_FIELDS).
export const DISPLAY_FIELDS = ['name', 'location', 'default_view_id', 'scale', 'orientation', 'color_scheme']
export const POWER_FIELDS = ['power_mode', 'schedule', 'off_during_holidays', 'power_exceptions']
// Geräte-Agent (Spec §3.4): Power-Methode, Updates und Neustart; Backend braucht dafür signage.devices.
export const DEVICE_FIELDS = ['power_method', 'power_config', 'auto_updates', 'update_window', 'daily_reboot']

export const POWER_METHOD_OPTIONS = [
  { value: 'cec', label: 'CEC' },
  { value: 'hdmi', label: 'HDMI-Ausgang' },
  { value: 'hybrid', label: 'Hybrid (SICP aus, CEC an)' },
  { value: 'ddc', label: 'DDC/CI' },
]

// Standardwerte von power_config je Methode (Ruling R4); der Agent nutzt dieselben
export const POWER_CONFIG_DEFAULTS = {
  cec: { cec_device: '0' },
  hdmi: { output: 'HDMI-A-1' },
  hybrid: { display_ip: '', display_port: 5000, monitor_id: 0, cec_device: '0' },
  ddc: { vcp_on: '01', vcp_off: '04' },
}
const POWER_CONFIG_INTS = { display_port: [1, 65535], monitor_id: [0, 255] }
const POWER_CONFIG_LABELS = {
  cec_device: 'CEC-Gerät', output: 'HDMI-Ausgang', display_ip: 'SICP-IP', display_port: 'Port', monitor_id: 'Monitor-ID',
  vcp_on: 'DDC-Wert an', vcp_off: 'DDC-Wert aus',
}

export const WEEKDAY_OPTIONS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
  .map((label, value) => ({ value, label }))
export const DEFAULT_UPDATE_WINDOW = { weekday: 6, from: '03:00', until: '05:00' }

export const configLabel = (key) => POWER_CONFIG_LABELS[key] ?? key

// Konfiguration einer Methode: gespeicherte Werte, fehlende mit dem Standard aufgefüllt
export function configFor(method, config) {
  const defaults = POWER_CONFIG_DEFAULTS[method] ?? {}
  return Object.fromEntries(Object.keys(defaults).map((k) => [k, config?.[k] ?? defaults[k]]))
}

// Werte, die das Formular anzeigt (gespeicherte Angaben, sonst die Standardwerte)
export function deviceDefaults(draft) {
  const method = draft?.power_method ?? 'cec'
  return {
    power_method: method,
    power_config: configFor(method, draft?.power_config),
    auto_updates: draft?.auto_updates ?? true,
    update_window: { ...DEFAULT_UPDATE_WINDOW, ...(draft?.update_window || {}) },
    daily_reboot: draft?.daily_reboot ?? true,
  }
}

export const SCALE_OPTIONS = [
  { value: 'auto', label: 'Automatisch' },
  ...['75', '90', '100', '110', '125', '150', '175', '200'].map((v) => ({ value: v, label: `${v} %` })),
]

export const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: 'Quer' },
  { value: 'portrait', label: 'Hoch' },
]

// Farbschema pro Bildschirm (Spec §3.2); "Wie eingestellt" folgt den Einstellungen für alle Bildschirme
export const COLOR_SCHEME_OPTIONS = [
  { value: 'inherit', label: 'Wie eingestellt' },
  { value: 'light', label: 'Immer hell' },
  { value: 'dark', label: 'Immer dunkel' },
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

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function normalizedConfig(method, config) {
  const full = configFor(method, config)
  return Object.fromEntries(Object.entries(full).map(([k, v]) => [k, k in POWER_CONFIG_INTS ? Number(v) : String(v).trim()]))
}

// Nur geänderte Felder. Ändert sich Methode oder Konfiguration, gehen beide zusammen (der Server prüft die
// Konfiguration gegen die Methode der Anfrage).
export function devicePayload(draft, original) {
  const out = {}
  for (const key of ['auto_updates', 'update_window', 'daily_reboot']) {
    if (draft[key] !== undefined && !sameValue(draft[key], original?.[key])) out[key] = draft[key]
  }
  if (!sameValue(draft.power_method, original?.power_method) || !sameValue(draft.power_config, original?.power_config)) {
    const method = draft.power_method ?? 'cec'
    out.power_method = method
    out.power_config = normalizedConfig(method, draft.power_config)
  }
  return out
}

const timeOk = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? '')

// -> { window: Text oder '', config: { feld: Text } }; ein Wert, der unverändert ist, wird nicht beanstandet
export function deviceProblems(draft, original) {
  const problems = { window: '', config: {} }
  const w = draft?.update_window
  if (w && !sameValue(w, original?.update_window)) {
    if (!timeOk(w.from) || !timeOk(w.until)) problems.window = 'Von und bis angeben, zum Beispiel 03:00 und 05:00.'
    else if (w.from >= w.until) problems.window = 'Das Zeitfenster muss am selben Tag enden. „Von“ muss vor „Bis“ liegen.'
  }
  if (draft && (!sameValue(draft.power_method, original?.power_method) || !sameValue(draft.power_config, original?.power_config))) {
    const method = draft.power_method ?? 'cec'
    const config = configFor(method, draft.power_config)
    for (const [key, value] of Object.entries(config)) {
      const label = configLabel(key)
      if (key in POWER_CONFIG_INTS) {
        const [lo, hi] = POWER_CONFIG_INTS[key]
        const n = Number(value)
        if (String(value).trim() === '' || !Number.isInteger(n) || n < lo || n > hi) problems.config[key] = `${label}: bitte eine ganze Zahl von ${lo} bis ${hi} eintragen.`
      } else if (String(value).trim() === '') {
        problems.config[key] = key === 'display_ip'
          ? 'SICP-IP fehlt. Für Hybrid die IP-Adresse des Bildschirms eintragen.'
          : `${label} fehlt. Bitte einen Wert eintragen.`
      } else if (String(value).length > 64) {
        problems.config[key] = `${label}: höchstens 64 Zeichen.`
      }
    }
  }
  return problems
}

export function sectionPayload(section, draft, original) {
  if (section === 'device') return devicePayload(draft, original)
  if (section === 'display') {
    return {
      name: (draft.name ?? '').trim(),
      location: (draft.location ?? '').trim(),
      default_view_id: draft.default_view_id ? Number(draft.default_view_id) : null,
      scale: draft.scale,
      orientation: draft.orientation,
      color_scheme: draft.color_scheme ?? 'inherit',
    }
  }
  return {
    power_mode: draft.power_mode,
    off_during_holidays: !!draft.off_during_holidays,
    schedule: normalizeSchedule(draft.schedule),
    power_exceptions: normalizeExceptions(draft.power_exceptions),
  }
}

export function powerSummary(screen) {
  if (screen.power_mode === 'manual_on') return 'Manuell immer an'
  if (screen.power_mode === 'manual_off') return 'Manuell immer aus'
  return describeSchedule(screen.schedule)
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

// Andere Ansicht vorübergehend (override_view_id/override_until, Recht signage.setup).
// Gilt wie im Backend (Screen.get_active_view) ohne Ende oder bis zu einem Zeitpunkt in der Zukunft.
// views (optional, Liste der Ansichten ohne Papierkorb): eine Ansicht, die dort fehlt, gilt wie im
// Backend nicht (override_view.deleted_at). Leere Liste = noch nicht geladen, dann nichts verwerfen.
export function activeOverride(screen, now = new Date(), views = null) {
  if (!screen?.override_view_id) return null
  const until = screen.override_until ? new Date(screen.override_until) : null
  if (until && !(until > now)) return null
  if (views?.length && !views.some((v) => v.id === screen.override_view_id)) return null
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
