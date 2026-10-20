// Einstellungen (Spec §6.2): WebUntis-Test als Satz, Payloads der Abschnitte und Notfall-Vorlagen.
// Zugangsdaten sind write-only (Ruling R22): der Server liefert '' plus *_set; ein leeres Feld heißt unverändert.
import { deepEqual } from '../shared/useDraft'
import { errorText } from '../shared/errorText'

export const SECRET_FIELDS = ['webuntis_password', 'weather_api_key']
export const SETUP_FIELDS = ['webuntis_server', 'webuntis_school', 'webuntis_username', 'webuntis_password', 'weather_api_key']
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
