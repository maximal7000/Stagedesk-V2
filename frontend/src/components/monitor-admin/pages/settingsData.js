// Einstellungen (Spec §6.2): WebUntis-Test als Satz, Payloads der Abschnitte und Notfall-Vorlagen.
// Zugangsdaten sind write-only (Ruling R22): der Server liefert '' plus *_set; ein leeres Feld heißt unverändert.
import { deepEqual } from '../shared/useDraft'
import { errorText } from '../shared/errorText'

export const SECRET_FIELDS = ['webuntis_password', 'weather_api_key']
// Geräte-Überwachung (Spec §8): Zahlenfelder mit Bereich wie im Backend, dazu der Token-Schalter
export const DEVICE_NUMBER_FIELDS = [
  { key: 'device_offline_minutes', label: 'Offline melden nach', min: 2, max: 240 },
  { key: 'warn_temperature_c', label: 'Warnung ab Temperatur', min: 50, max: 95 },
  { key: 'warn_disk_percent', label: 'Warnung ab Speicherbelegung', min: 50, max: 99 },
  { key: 'warn_wifi_dbm', label: 'Warnung bei WLAN schwächer als', min: -95, max: -40 },
  { key: 'warn_reboot_days', label: 'Warnung, wenn Neustart nötig seit', min: 1, max: 60 },
]
export const DEVICE_FIELDS = [...DEVICE_NUMBER_FIELDS.map((f) => f.key), 'require_device_token']
const NUMBER_KEYS = new Set(DEVICE_NUMBER_FIELDS.map((f) => f.key))
export const SETUP_FIELDS = ['webuntis_server', 'webuntis_school', 'webuntis_username', 'webuntis_password', 'weather_api_key', ...DEVICE_FIELDS]
export const ON_AIR_FIELDS = ['on_air_text', 'on_air_animation', 'on_air_show_clock']

export const ON_AIR_ANIMATION_OPTIONS = [
  { value: 'still', label: 'Ruhig' },
  { value: 'pulse', label: 'Pulsieren' },
  { value: 'blink', label: 'Blinken' },
]

export const ON_AIR_ANIMATION_HELP = {
  still: 'Das Schild steht ruhig.',
  pulse: 'Das Schild wird langsam heller und dunkler.',
  blink: 'Das Schild schaltet im Sekundentakt an und aus.',
}

const SOURCE_SENTENCES = {
  substitutions: 'Vertretungen werden direkt abgerufen.',
  timetable: 'Vertretungen werden aus den Stundenplänen der Klassen abgeleitet.',
}

const text = (v) => (typeof v === 'string' ? v.trim() : '')
const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`)

export function credentialsComplete(settings, draft = {}) {
  const value = (key) => text(draft[key] ?? settings?.[key])
  const password = !!text(draft.webuntis_password) || !!settings?.webuntis_password_set
  return !!(value('webuntis_server') && value('webuntis_school') && value('webuntis_username') && password)
}

// Ergebnis von POST /webuntis/check (webuntis.check: login, substitutions, timetable, source) als Satz
export function checkSentence(result, error, settings) {
  if (error) return { tone: 'bad', text: `Keine Verbindung: ${sentence(errorText(error))}` }
  if (SOURCE_SENTENCES[result?.source]) return { tone: 'ok', text: SOURCE_SENTENCES[result.source] }
  let reason
  if (!credentialsComplete(settings)) {
    reason = 'Die Zugangsdaten sind unvollständig. Bitte Server, Schule, Benutzer und Passwort eintragen und speichern.'
  } else if (!result?.login) {
    reason = 'Die Anmeldung ist fehlgeschlagen. Bitte Server, Schule, Benutzer und Passwort prüfen.'
  } else {
    reason = 'Der Benutzer darf weder Vertretungen noch Stundenpläne abrufen. Bitte die Rechte in WebUntis prüfen.'
  }
  return { tone: 'bad', text: `Keine Verbindung: ${reason}` }
}

// Gespeicherte Quelle (MonitorSettings.webuntis_source) für die Zeile unter dem Knopf
export function sourceSentence(source) {
  if (SOURCE_SENTENCES[source]) return SOURCE_SENTENCES[source]
  if (source === 'unavailable') return 'Keine Verbindung beim letzten Test.'
  return 'Noch nicht getestet.'
}

// Geänderte Felder eines Abschnitts; Geheimnisse nur, wenn etwas eingetragen ist
export function settingsPayload(base, draft, fields) {
  const out = {}
  for (const key of fields) {
    if (SECRET_FIELDS.includes(key)) {
      // Leer (auch nur Leerzeichen) heißt unverändert; sonst genau wie eingegeben, ohne Kürzen
      if (text(draft[key])) out[key] = draft[key]
      continue
    }
    if (NUMBER_KEYS.has(key)) {
      if (String(base?.[key] ?? '').trim() === String(draft?.[key] ?? '').trim()) continue
      out[key] = Number(draft[key])
      continue
    }
    if (deepEqual(base?.[key], draft?.[key])) continue
    out[key] = typeof draft[key] === 'string' && key !== 'on_air_text' ? draft[key].trim() : draft[key]
  }
  return out
}

export const changedIn = (base, draft, fields) => Object.keys(settingsPayload(base, draft, fields)).length

// ── Notfall-Vorlagen ────────────────────────────────────────────────

const templateBody = (t, index) => ({ title: text(t.title), text: text(t.text), note: text(t.note), sort_order: index })

// Entwurf (Reihenfolge = sort_order) gegen den gespeicherten Stand: anlegen, ändern, löschen
export function templateChanges(original, draft) {
  const byId = new Map((original || []).map((t) => [t.id, t]))
  const create = []
  const update = []
  ;(draft || []).forEach((t, index) => {
    const body = templateBody(t, index)
    if (t.id == null || !byId.has(t.id)) {
      create.push(body)
      return
    }
    const before = byId.get(t.id)
    if (!deepEqual(templateBody(before, before.sort_order ?? index), body)) update.push({ id: t.id, body })
  })
  const kept = new Set((draft || []).map((t) => t.id).filter((id) => id != null))
  const remove = (original || []).filter((t) => !kept.has(t.id)).map((t) => t.id)
  return { create, update, remove }
}

export const templateChangeCount = (original, draft) => {
  const c = templateChanges(original, draft)
  return c.create.length + c.update.length + c.remove.length
}

export function templateProblems(list) {
  const index = (list || []).findIndex((t) => !text(t.title) || !text(t.text))
  return index < 0 ? null : `Vorlage ${index + 1}: Titel und Text eintragen.`
}

// ── Geräte ──────────────────────────────────────────────────────────

// Erste Bereichsverletzung eines geänderten Geräte-Felds als Satz, sonst null
export function deviceProblems(base, draft) {
  const changed = settingsPayload(base, draft, DEVICE_FIELDS)
  for (const { key, label, min, max } of DEVICE_NUMBER_FIELDS) {
    if (!(key in changed)) continue
    const raw = String(draft[key] ?? '').trim()
    const n = Number(raw)
    if (raw === '' || !Number.isInteger(n) || n < min || n > max) {
      return `${label}: Bitte eine ganze Zahl von ${min} bis ${max} eintragen.`
    }
  }
  return null
}

// Bildschirme, die sich noch ohne Token melden (GET /devices: legacy), mit Namen aus der Bildschirmliste
export function legacyScreenNames(devices, screens) {
  const names = new Map((screens || []).map((s) => [s.id, s.name]))
  return (devices || []).filter((d) => d.legacy)
    .map((d) => d.screen_name || names.get(d.screen_id) || `Bildschirm ${d.screen_id}`)
    .sort((a, b) => a.localeCompare(b, 'de'))
}

export const installCommand = (origin) => `curl -fsSL ${origin}/api/monitor/agent/install.sh | sudo bash`
