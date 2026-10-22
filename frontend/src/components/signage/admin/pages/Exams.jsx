import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BookmarkPlus, CalendarClock, ChevronDown, Megaphone, Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button, StatusBadge } from '../../../ui'
import SidePanel from '../shared/SidePanel'
import ConfirmDialog from '../shared/ConfirmDialog'
import { iconButton } from '../shared/ScreenTable'
import { deepEqual } from '../shared/useDraft'
import { LEAVE_QUESTION, useUnsavedGuard } from '../shared/UnsavedChangesProvider'
import { errorText } from '../shared/errorText'
import { Checkbox, Field, Segmented, fieldClass } from '../shared/form'
import { formatRange } from './overviewData'
import {
  EXAM_DISPLAY_HELP, EXAM_DISPLAY_OPTIONS, EXAM_SIDE_OPTIONS, PRIORITY_OPTIONS,
  announcementDraft, announcementPayload, announcementProblems, eventDraft, eventPayload, eventProblems,
  examDraft, examFromTemplate, examPayload, examProblems, groupItems, scheduleItems, templateFromExam,
} from './examData'
import * as api from '../shared/api'

const TYPE_BADGE = { exam: { label: 'Klausur', tone: 'info' }, event: { label: 'Termin', tone: 'neutral' } }
const PRIORITY_BADGE = { urgent: { label: 'Dringend', tone: 'danger' }, important: { label: 'Wichtig', tone: 'warning' }, normal: null }

const KIND_TEXT = {
  exam: { create: 'Neue Klausur', edit: 'Klausur bearbeiten', eyebrow: 'Klausur' },
  event: { create: 'Neuer Termin', edit: 'Termin bearbeiten', eyebrow: 'Termin' },
  announcement: { create: 'Neue Ankündigung', edit: 'Ankündigung bearbeiten', eyebrow: 'Ankündigung' },
}

const PROBLEMS = { exam: examProblems, event: eventProblems, announcement: announcementProblems }
const PAYLOADS = { exam: examPayload, event: eventPayload, announcement: announcementPayload }
const SAVE = {
  exam: (id, body) => (id ? api.updateExam(id, body) : api.createExam(body)),
  event: (id, body) => (id ? api.updateEvent(id, body) : api.createEvent(body)),
  announcement: (id, body) => (id ? api.updateAnnouncement(id, body) : api.createAnnouncement(body)),
}
const REMOVE = { exam: api.deleteExam, event: api.deleteEvent, announcement: api.deleteAnnouncement }

function TimeRange({ draft, set, optional, help }) {
  const fromId = useId()
  const untilId = useId()
  return (
    <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
      <Field label="Von" htmlFor={fromId} help={optional ? 'Leer lassen für sofort.' : null}>
        <input id={fromId} type="datetime-local" value={draft.active_from} onChange={(e) => set('active_from', e.target.value)} className={fieldClass} />
      </Field>
      <Field label="Bis" htmlFor={untilId} help={optional ? 'Leer lassen für unbegrenzt.' : null}>
        <input id={untilId} type="datetime-local" value={draft.active_until} onChange={(e) => set('active_until', e.target.value)} className={fieldClass} />
      </Field>
      {help && <p className="text-xs text-fg-subtle sm:col-span-2">{help}</p>}
    </div>
  )
}

function ExamForm({ draft, set, screens }) {
  const titleId = useId()
  const textId = useId()
  const toggle = (id) => set('screen_ids', draft.screen_ids.includes(id) ? draft.screen_ids.filter((x) => x !== id) : [...draft.screen_ids, id])
  return (
    <div className="space-y-5">
      <Field label="Titel" htmlFor={titleId}>
        <input id={titleId} value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="zum Beispiel Abitur Mathematik" className={fieldClass} />
      </Field>
      <Field label="Text" htmlFor={textId} help="Steht unter dem Titel auf dem Bildschirm.">
        <textarea id={textId} rows={3} value={draft.text} onChange={(e) => set('text', e.target.value)} placeholder="zum Beispiel Bitte leise sein." className={fieldClass} />
      </Field>
      <TimeRange draft={draft} set={set} />
      <Field label="Bildschirme" help="Auf diesen Bildschirmen erscheint der Klausur-Hinweis.">
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Bildschirme">
          {screens.map((s) => <Checkbox key={s.id} label={s.name} checked={draft.screen_ids.includes(s.id)} onChange={() => toggle(s.id)} />)}
        </div>
      </Field>
      <Field label="Darstellung" help={EXAM_DISPLAY_HELP[draft.display_mode]}>
        <Segmented label="Darstellung" options={EXAM_DISPLAY_OPTIONS} value={draft.display_mode} onChange={(v) => set('display_mode', v)} />
      </Field>
      {draft.display_mode === 'split' && (
        <Field label="Seite" help="Auf dieser Seite steht der Klausur-Hinweis.">
          <div className="max-w-xs">
            <Segmented label="Seite" options={EXAM_SIDE_OPTIONS} value={draft.split_side} onChange={(v) => set('split_side', v)} />
          </div>
        </Field>
      )}
    </div>
  )
}

function EventForm({ draft, set, screens, views }) {
  const nameId = useId()
  const descriptionId = useId()
  const rows = draft.assignments
  const setRow = (i, key, value) => set('assignments', rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  const toNumber = (v) => (v ? Number(v) : null)
  return (
    <div className="space-y-5">
      <Field label="Name" htmlFor={nameId}>
        <input id={nameId} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="zum Beispiel Elternsprechtag" className={fieldClass} />
      </Field>
      <Field label="Beschreibung" htmlFor={descriptionId}>
        <input id={descriptionId} value={draft.description} onChange={(e) => set('description', e.target.value)} className={fieldClass} />
      </Field>
      <TimeRange draft={draft} set={set} help="Ohne Zeitraum wird der Termin nur von Hand in der Liste aktiviert." />
      <Field label="Zuordnung" help="Während des Termins zeigt jeder Bildschirm die gewählte Ansicht.">
        <ul className="space-y-2" data-assignments>
          {rows.map((row, i) => (
            <li key={i} className="flex items-center gap-2">
              <select aria-label={`Bildschirm ${i + 1}`} value={row.screen_id ?? ''} onChange={(e) => setRow(i, 'screen_id', toNumber(e.target.value))}
                className={`${fieldClass} ${row.screen_id == null ? 'border-bad' : ''}`}>
                <option value="">Bildschirm wählen</option>
                {screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span className="text-fg-subtle" aria-hidden="true">→</span>
              <select aria-label={`Ansicht ${i + 1}`} value={row.view_id ?? ''} onChange={(e) => setRow(i, 'view_id', toNumber(e.target.value))}
                className={`${fieldClass} ${row.view_id == null ? 'border-bad' : ''}`}>
                <option value="">Ansicht wählen</option>
                {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button type="button" className={iconButton} onClick={() => set('assignments', rows.filter((_, j) => j !== i))}
                aria-label={`Zuordnung ${i + 1} entfernen`} title="Zuordnung entfernen">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="ghost" icon={Plus} className="mt-2"
          onClick={() => set('assignments', [...rows, { screen_id: null, view_id: null }])}>
          Zuordnung hinzufügen
        </Button>
      </Field>
    </div>
  )
}

function AnnouncementForm({ draft, set }) {
  const titleId = useId()
  const textId = useId()
  return (
    <div className="space-y-5">
      <Field label="Titel" htmlFor={titleId}>
        <input id={titleId} value={draft.title} onChange={(e) => set('title', e.target.value)} className={fieldClass} />
      </Field>
      <Field label="Text" htmlFor={textId}>
        <textarea id={textId} rows={4} value={draft.text} onChange={(e) => set('text', e.target.value)} className={fieldClass} />
      </Field>
      <Field label="Priorität" help="Dringende Ankündigungen stehen in der Info-Ansicht oben.">
        <Segmented label="Priorität" options={PRIORITY_OPTIONS} value={draft.priority} onChange={(v) => set('priority', v)} />
      </Field>
      <Checkbox label="Aktiv" help="Nur aktive Ankündigungen erscheinen auf den Bildschirmen." checked={draft.is_active} onChange={(v) => set('is_active', v)} />
      <TimeRange draft={draft} set={set} optional />
    </div>
  )
}

function TemplateMenu({ templates, onPick, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        Aus Vorlage<ChevronDown className="w-3.5 h-3.5" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-72 bg-overlay border border-line rounded-lg shadow-overlay py-1">
          {templates.length === 0 && (
            <p className="px-3 py-2 text-sm text-fg-muted">Noch keine Vorlagen. Eine Klausur lässt sich im Formular mit „Als Vorlage speichern“ ablegen.</p>
          )}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center hover:bg-raised">
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick(t) }}
                className="flex-1 min-w-0 text-left px-3 py-2 focus:outline-none focus-visible:bg-raised">
                <span className="block text-sm text-fg truncate">{t.name}</span>
                <span className="block text-xs text-fg-subtle">{t.duration_minutes} Minuten · {EXAM_DISPLAY_OPTIONS.find((o) => o.value === t.display_mode)?.label ?? 'Vollbild'}</span>
              </button>
              <button type="button" className={`${iconButton} mr-1`} onClick={() => { setOpen(false); onDelete(t) }}
                aria-label={`Vorlage ${t.name} löschen`} title="Vorlage löschen">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, onEdit, onDelete, onToggle }) {
  const badge = TYPE_BADGE[item.type]
  const when = item.from ? formatRange(item.from, item.until) : 'Nur von Hand'
  return (
    <li className="flex items-start gap-4 px-4 py-3 border-b border-line-subtle last:border-0" data-item={item.key}>
      <div className="w-20 shrink-0 pt-0.5"><StatusBadge label={badge.label} tone={badge.tone} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onEdit} className="text-sm font-semibold text-fg hover:underline underline-offset-2 focus:outline-none focus-visible:underline text-left">
            {item.title}
          </button>
          {item.active && <StatusBadge label="Manuell aktiv" tone="positive" dot />}
        </div>
        <div className="text-xs text-fg-muted mt-0.5">
          {item.screens.length ? item.screens.join(', ') : item.type === 'exam' ? 'Auf keinem Bildschirm' : 'Ohne Zuordnung'}
        </div>
      </div>
      <div className="text-sm text-fg-muted tabular-nums whitespace-nowrap pt-0.5">{when}</div>
      <div className="flex items-center shrink-0 -my-1">
        {item.type === 'event' && (
          <Button size="sm" variant="ghost" icon={Power} onClick={onToggle} aria-pressed={item.active}
            aria-label={`${item.title} ${item.active ? 'deaktivieren' : 'aktivieren'}`}>
            {item.active ? 'Deaktivieren' : 'Aktivieren'}
          </Button>
        )}
        <button type="button" className={iconButton} onClick={onEdit} aria-label={`${item.title} bearbeiten`} title="Bearbeiten"><Pencil className="w-4 h-4" /></button>
        <button type="button" className={iconButton} onClick={onDelete} aria-label={`${item.title} löschen`} title="Löschen"><Trash2 className="w-4 h-4" /></button>
      </div>
    </li>
  )
}

function GroupShell({ title, count, action, empty, children, ...rest }) {
  return (
    <section className="bg-surface rounded-lg" {...rest}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
          {title}{count > 0 && <span className="ml-2 text-sm font-sans font-normal text-fg-subtle">{count}</span>}
        </h2>
        {action}
      </div>
      {count ? <ul>{children}</ul> : <p className="px-4 pb-4 text-sm text-fg-subtle">{empty}</p>}
    </section>
  )
}

function Group({ title, items, empty, onEdit, onDelete, onToggle, name }) {
  return (
    <GroupShell title={title} count={items.length} empty={empty} data-group={name}>
      {items.map((item) => (
        <ItemRow key={item.key} item={item} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} onToggle={() => onToggle(item)} />
      ))}
    </GroupShell>
  )
}

function announcementRange(a) {
  if (a.active_from && a.active_until) return formatRange(a.active_from, a.active_until)
  if (a.active_from) return `ab ${formatRange(a.active_from)}`
  if (a.active_until) return `bis ${formatRange(a.active_until)}`
  return 'Ohne Zeitraum'
}

const fetchAll = () => Promise.allSettled([
  api.getExams(), api.getEvents(), api.getAnnouncements(), api.getScreens(), api.getViews(), api.getExamTemplates(),
])

export default function Exams() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [panel, setPanel] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const apply = useCallback(([exams, events, announcements, screens, views, templates]) => {
    setNow(new Date())
    if (exams.status === 'rejected' || events.status === 'rejected') {
      setError(exams.reason ?? events.reason)
      return
    }
    setError(null)
    const value = (r) => (r.status === 'fulfilled' ? r.value : [])
    setData({
      exams: exams.value, events: events.value, announcements: value(announcements),
      screens: value(screens), views: value(views), templates: value(templates),
    })
  }, [])
  const load = useCallback(() => fetchAll().then(apply), [apply])

  useEffect(() => {
    let alive = true
    fetchAll().then((results) => { if (alive) apply(results) })
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => { alive = false; clearInterval(timer) }
  }, [apply])

  const dirty = !!panel && !deepEqual(panel.original, panel.draft)
  useUnsavedGuard(dirty)

  const open = (kind, id, draft) => setPanel({ kind, id, original: draft, draft })
  const setField = (key, value) => setPanel((p) => ({ ...p, draft: { ...p.draft, [key]: value } }))
  const close = () => {
    if (dirty && !window.confirm(LEAVE_QUESTION)) return
    setPanel(null)
  }

  const editItem = (item) => (item.type === 'exam'
    ? open('exam', item.id, examDraft(item.record))
    : open('event', item.id, eventDraft(item.record)))

  const save = async () => {
    const problem = PROBLEMS[panel.kind](panel.draft)
    if (problem) {
      toast.error(problem)
      return
    }
    setSaving(true)
    try {
      await SAVE[panel.kind](panel.id, PAYLOADS[panel.kind](panel.draft))
      setPanel(null)
      toast.success('Gespeichert')
      await load()
    } catch (e) {
      toast.error(errorText(e))
    }
    setSaving(false)
  }

  const toggleEvent = async (item) => {
    try {
      await (item.active ? api.deactivateEvent(item.id) : api.activateEvent(item.id))
      toast.success(item.active ? `„${item.title}“ ist deaktiviert.` : `„${item.title}“ ist aktiv.`)
      await load()
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const saveTemplate = async () => {
    const problem = examProblems({ ...panel.draft, screen_ids: [0] })
    if (problem) {
      toast.error(problem)
      return
    }
    try {
      const template = await api.createExamTemplate(templateFromExam(panel.draft))
      setData((d) => ({ ...d, templates: [...d.templates, template] }))
      toast.success(`Vorlage „${template.name}“ gespeichert.`)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const askDelete = (kind, id, title) => setConfirm({
    title: `„${title}“ löschen?`,
    body: kind === 'template' ? 'Die Vorlage wird entfernt. Bestehende Klausuren bleiben.' : 'Der Eintrag wird endgültig entfernt.',
    action: async () => {
      await (kind === 'template' ? api.deleteExamTemplate(id) : REMOVE[kind](id))
      toast.success('Gelöscht')
      await load()
    },
  })

  const runConfirm = async () => {
    setSaving(true)
    try {
      await confirm.action()
      setConfirm(null)
    } catch (e) {
      toast.error(errorText(e))
    }
    setSaving(false)
  }

  const state = error ? 'error' : data ? 'ready' : 'loading'
  const groups = data ? groupItems(scheduleItems(data.exams, data.events, data.screens), now) : null
  const text = panel ? KIND_TEXT[panel.kind] : null

  return (
    <div data-admin-page="exams" data-state={state}>
      <PageHeader title="Klausuren & Termine"
        actions={data ? (
          <>
            <TemplateMenu templates={data.templates}
              onPick={(t) => open('exam', null, examFromTemplate(t, new Date()))}
              onDelete={(t) => askDelete('template', t.id, t.name)} />
            <Button icon={CalendarClock} onClick={() => open('event', null, eventDraft(null, new Date()))}>Neuer Termin</Button>
            <Button variant="primary" icon={Plus} onClick={() => open('exam', null, examDraft(null, new Date()))}>Neue Klausur</Button>
          </>
        ) : null} />

      {error ? (
        <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
          Klausuren und Termine konnten nicht geladen werden. {errorText(error, 'Bitte die Seite neu laden.')}
        </div>
      ) : groups ? (
        <div className="space-y-4">
          <Group name="running" title="Läuft gerade" items={groups.running} empty="Gerade läuft keine Klausur und kein Termin."
            onEdit={editItem} onDelete={(i) => askDelete(i.type, i.id, i.title)} onToggle={toggleEvent} />
          <Group name="upcoming" title="Kommt" items={groups.upcoming} empty="Nichts geplant."
            onEdit={editItem} onDelete={(i) => askDelete(i.type, i.id, i.title)} onToggle={toggleEvent} />
          <Group name="past" title="Vergangen" items={groups.past} empty="Noch nichts vergangen."
            onEdit={editItem} onDelete={(i) => askDelete(i.type, i.id, i.title)} onToggle={toggleEvent} />

          <GroupShell title="Ankündigungen" count={data.announcements.length} data-section="announcements"
            empty="Keine Ankündigungen. Sie erscheinen in Info-Ansichten."
            action={<Button size="sm" variant="ghost" icon={Megaphone} onClick={() => open('announcement', null, announcementDraft(null))}>Neue Ankündigung</Button>}>
            {data.announcements.map((a) => {
              const badge = PRIORITY_BADGE[a.priority]
              return (
                <li key={a.id} className="flex items-start gap-4 px-4 py-3 border-b border-line-subtle last:border-0" data-announcement={a.id}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => open('announcement', a.id, announcementDraft(a))}
                        className="text-sm font-semibold text-fg hover:underline underline-offset-2 focus:outline-none focus-visible:underline text-left truncate">
                        {a.title}
                      </button>
                      {badge && <StatusBadge label={badge.label} tone={badge.tone} />}
                      {!a.is_active && <StatusBadge label="Inaktiv" />}
                    </div>
                    {a.text && <p className="text-xs text-fg-muted mt-0.5 line-clamp-1">{a.text}</p>}
                  </div>
                  <div className="text-sm text-fg-muted tabular-nums whitespace-nowrap pt-0.5">{announcementRange(a)}</div>
                  <div className="flex shrink-0 -my-1">
                    <button type="button" className={iconButton} onClick={() => open('announcement', a.id, announcementDraft(a))}
                      aria-label={`${a.title} bearbeiten`} title="Bearbeiten"><Pencil className="w-4 h-4" /></button>
                    <button type="button" className={iconButton} onClick={() => askDelete('announcement', a.id, a.title)}
                      aria-label={`${a.title} löschen`} title="Löschen"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </li>
              )
            })}
          </GroupShell>
        </div>
      ) : null}

      {panel && (
        <SidePanel eyebrow={text.eyebrow} title={panel.id ? text.edit : text.create} onClose={close} data-exam-panel={panel.kind}
          footer={(
            <>
              {panel.kind === 'exam' && <Button variant="ghost" icon={BookmarkPlus} onClick={saveTemplate} disabled={saving}>Als Vorlage speichern</Button>}
              <span className="flex-1" />
              <Button variant="ghost" onClick={close} disabled={saving}>Abbrechen</Button>
              <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</Button>
            </>
          )}>
          {panel.kind === 'exam' && <ExamForm draft={panel.draft} set={setField} screens={data.screens} />}
          {panel.kind === 'event' && <EventForm draft={panel.draft} set={setField} screens={data.screens} views={data.views} />}
          {panel.kind === 'announcement' && <AnnouncementForm draft={panel.draft} set={setField} />}
        </SidePanel>
      )}

      {confirm && (
        <ConfirmDialog title={confirm.title} body={confirm.body} confirmLabel="Löschen" tone="danger" busy={saving}
          onConfirm={runConfirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
