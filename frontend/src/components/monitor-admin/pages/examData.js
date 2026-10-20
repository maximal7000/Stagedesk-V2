// Klausuren & Termine (Spec §6.2): gemeinsame Liste "Läuft gerade / Kommt / Vergangen", Entwürfe und Payloads
// der Formulare (Klausur, Termin, Ankündigung). Zeiten im Formular sind Werte von datetime-local (Ortszeit),
// an den Server gehen sie als ISO mit Zone.
import { toLocalInput } from './viewData'

export const EXAM_DISPLAY_OPTIONS = [
  { value: 'fullscreen', label: 'Vollbild' },
  { value: 'split', label: 'Geteilt' },
  { value: 'standard', label: 'Ansicht behalten' },
]

export const EXAM_DISPLAY_HELP = {
  fullscreen: 'Der Klausur-Hinweis füllt den ganzen Bildschirm.',
  split: 'Der Klausur-Hinweis steht auf einer Seite, daneben bleibt die Ansicht sichtbar.',
  standard: 'Die Ansicht bleibt unverändert; die Klausur erscheint nur hier in der Liste.',
}

export const EXAM_SIDE_OPTIONS = [
  { value: 'left', label: 'Links' },
  { value: 'right', label: 'Rechts' },
]

export const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Wichtig' },
  { value: 'urgent', label: 'Dringend' },
]

export const PAST_LIMIT = 10
const DEFAULT_EXAM_MINUTES = 90
const QUARTER_MS = 15 * 60 * 1000

function asDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// Wert eines datetime-local-Felds → ISO mit Zone (der Browser rechnet in Ortszeit); leer oder ungültig → null
export function fromLocalInput(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const text = (v) => (typeof v === 'string' ? v.trim() : '')
const minutesBetween = (from, until) => Math.round((new Date(until) - new Date(from)) / 60000)

// ── Liste ───────────────────────────────────────────────────────────

export function scheduleItems(exams, events, screens) {
  const names = new Map((screens || []).map((s) => [s.id, s.name]))
  const examItems = (exams || []).map((e) => ({
    key: `exam-${e.id}`,
    type: 'exam',
    id: e.id,
    title: e.title,
    from: asDate(e.active_from),
    until: asDate(e.active_until),
    active: false,
    screens: (e.screen_ids || []).map((id) => names.get(id)).filter(Boolean),
    record: e,
  }))
  // Ein Termin läuft automatisch nur mit Beginn und Ende (DisplayEvent.is_active_now); sonst nur manuell
  const eventItems = (events || []).map((e) => {
    const timed = asDate(e.active_from) && asDate(e.active_until)
    return {
      key: `event-${e.id}`,
      type: 'event',
      id: e.id,
      title: e.name,
      from: timed ? asDate(e.active_from) : null,
      until: timed ? asDate(e.active_until) : null,
      active: !!e.is_active,
      screens: (e.assignments || []).map((a) => `${a.screen_name || names.get(a.screen_id) || 'Bildschirm'} → ${a.view_name || 'Ansicht'}`),
      record: e,
    }
  })
  return [...examItems, ...eventItems]
}

const byFrom = (a, b) => (a.from?.getTime() ?? Infinity) - (b.from?.getTime() ?? Infinity)

// Läuft: manuell aktiv oder Beginn erreicht und Ende noch nicht. Kommt: Beginn in der Zukunft, danach Termine ohne
// Zeitraum. Vergangen: Ende erreicht, die letzten zehn, neueste zuerst.
export function groupItems(items, now) {
  const running = []
  const upcoming = []
  const past = []
  for (const item of items) {
    if (item.active || (item.from && item.from <= now && (!item.until || now < item.until))) running.push(item)
    else if (item.until && item.until <= now) past.push(item)
    else upcoming.push(item)
  }
  running.sort(byFrom)
  upcoming.sort(byFrom)
  past.sort((a, b) => b.until - a.until)
  return { running, upcoming, past: past.slice(0, PAST_LIMIT) }
}

// ── Klausur ─────────────────────────────────────────────────────────

const plusMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000)
const nextQuarter = (now) => new Date(Math.ceil(now.getTime() / QUARTER_MS) * QUARTER_MS)

export function examDraft(exam, now = new Date()) {
  if (exam) {
    return {
      title: exam.title ?? '',
      text: exam.text ?? '',
      active_from: toLocalInput(exam.active_from),
      active_until: toLocalInput(exam.active_until),
      screen_ids: [...(exam.screen_ids || [])],
      display_mode: exam.display_mode || 'fullscreen',
      split_side: exam.split_side || 'right',
    }
  }
  const start = nextQuarter(now)
  return {
    title: '',
    text: '',
    active_from: toLocalInput(start),
    active_until: toLocalInput(plusMinutes(start, DEFAULT_EXAM_MINUTES)),
    screen_ids: [],
    display_mode: 'fullscreen',
    split_side: 'right',
  }
}

// "Aus Vorlage": Werte der Vorlage, Zeitraum ab jetzt (volle Minute) mit der Dauer der Vorlage
export function examFromTemplate(template, now = new Date()) {
  const start = new Date(Math.floor(now.getTime() / 60000) * 60000)
  return {
    title: template.title ?? '',
    text: template.text ?? '',
    active_from: toLocalInput(start),
    active_until: toLocalInput(plusMinutes(start, template.duration_minutes || DEFAULT_EXAM_MINUTES)),
    screen_ids: [],
    display_mode: template.display_mode || 'fullscreen',
    split_side: template.split_side || 'right',
  }
}

export function examPayload(draft) {
  return {
    title: text(draft.title),
    text: draft.text ?? '',
    active_from: fromLocalInput(draft.active_from),
    active_until: fromLocalInput(draft.active_until),
    screen_ids: [...(draft.screen_ids || [])],
    display_mode: draft.display_mode,
    split_side: draft.split_side,
  }
}

function rangeProblem(from, until, required) {
  if (!from || !until) return required ? 'Beginn und Ende angeben.' : null
  if (fromLocalInput(until) <= fromLocalInput(from)) return 'Das Ende muss nach dem Beginn liegen. Bitte die Zeiten prüfen.'
  return null
}

export function examProblems(draft) {
  if (!text(draft.title)) return 'Der Titel fehlt. Bitte einen Titel eintragen.'
  const range = rangeProblem(draft.active_from, draft.active_until, true)
  if (range) return range
  if (!draft.screen_ids?.length) return 'Mindestens einen Bildschirm wählen.'
  return null
}

export function templateFromExam(draft) {
  return {
    name: text(draft.title),
    title: text(draft.title),
    text: draft.text ?? '',
    duration_minutes: Math.max(1, minutesBetween(draft.active_from, draft.active_until)),
    display_mode: draft.display_mode,
    split_side: draft.split_side,
  }
}

// ── Termin ──────────────────────────────────────────────────────────

export function eventDraft(event, now = new Date()) {
  if (event) {
    return {
      name: event.name ?? '',
      description: event.description ?? '',
      active_from: toLocalInput(event.active_from),
      active_until: toLocalInput(event.active_until),
      assignments: (event.assignments || []).map((a) => ({ screen_id: a.screen_id, view_id: a.view_id })),
    }
  }
  const start = nextQuarter(now)
  return {
    name: '',
    description: '',
    active_from: toLocalInput(start),
    active_until: toLocalInput(plusMinutes(start, 120)),
    assignments: [{ screen_id: null, view_id: null }],
  }
}

const completeAssignment = (a) => Number.isInteger(a?.screen_id) && Number.isInteger(a?.view_id)

export function eventPayload(draft) {
  return {
    name: text(draft.name),
    description: text(draft.description),
    active_from: fromLocalInput(draft.active_from),
    active_until: fromLocalInput(draft.active_until),
    assignments: (draft.assignments || []).filter(completeAssignment).map((a) => ({ screen_id: a.screen_id, view_id: a.view_id })),
  }
}

export function eventProblems(draft) {
  if (!text(draft.name)) return 'Der Name fehlt. Bitte einen Namen eintragen.'
  // Ohne Zeitraum wird der Termin nur von Hand aktiviert; eine einzelne Zeit hätte keine Wirkung
  if (!draft.active_from !== !draft.active_until) return 'Beginn und Ende angeben oder beide leer lassen.'
  const range = rangeProblem(draft.active_from, draft.active_until, false)
  if (range) return range
  const rows = draft.assignments || []
  if (!rows.length) return 'Zuordnung fehlt: mindestens einen Bildschirm mit Ansicht wählen.'
  if (!rows.every(completeAssignment)) return 'Zuordnung unvollständig: in jeder Zeile Bildschirm und Ansicht wählen.'
  return null
}

// ── Ankündigung ─────────────────────────────────────────────────────

export function announcementDraft(a) {
  return {
    title: a?.title ?? '',
    text: a?.text ?? '',
    priority: a?.priority || 'normal',
    is_active: a ? !!a.is_active : true,
    active_from: toLocalInput(a?.active_from),
    active_until: toLocalInput(a?.active_until),
  }
}

export function announcementPayload(draft) {
  return {
    title: text(draft.title),
    text: draft.text ?? '',
    priority: draft.priority || 'normal',
    is_active: !!draft.is_active,
    active_from: fromLocalInput(draft.active_from),
    active_until: fromLocalInput(draft.active_until),
  }
}

export function announcementProblems(draft) {
  if (!text(draft.title)) return 'Der Titel fehlt. Bitte einen Titel eintragen.'
  return rangeProblem(draft.active_from, draft.active_until, false)
}
