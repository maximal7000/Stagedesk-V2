// Ansicht anlegen und bearbeiten (Spec §6.2, Mockup admin-view-edit.png).
// Ohne id (Route views/new): zuerst der Typ, dann der Name; "Anlegen" öffnet die neue Ansicht.
// Mit id: links Allgemein und der Editor des Typs, rechts Live-Vorschau und "Verwendet auf", unten die
// SaveBar. Gespeichert und in die Vorschau geschickt werden nur geänderte Felder (viewData.viewPayload).
import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ClipboardList, Columns2, Copy, Images, Info, LayoutTemplate, Repeat, Trash2, TramFront,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, EmptyState, Button } from '../../ui'
import { useDraft } from '../shared/useDraft'
import SaveBar from '../shared/SaveBar'
import ConfirmDialog from '../shared/ConfirmDialog'
import LivePreview from '../shared/LivePreview'
import { useUnsavedGuard } from '../shared/UnsavedChangesProvider'
import { errorText } from '../shared/errorText'
import { Checkbox, Field, Section, Segmented, fieldClass } from '../shared/form'
import DeparturesEditor from '../view-editors/Departures'
import SubstitutionsEditor from '../view-editors/Substitutions'
import SplitEditor from '../view-editors/Split'
import MediaEditor from '../view-editors/Media'
import InfoEditor from '../view-editors/Info'
import RotationEditor from '../view-editors/Rotation'
import {
  KIND_OPTIONS, ON_AIR_OPTIONS, SIDE_OPTIONS, STYLE_OPTIONS, changedKeys, draftFromView, kindLabel, previewPayload,
  styleHelp, usedOn, viewPayload, viewProblems,
} from './viewData'
import * as api from '../shared/api'

const EDITORS = {
  departures: DeparturesEditor,
  substitutions: SubstitutionsEditor,
  split: SplitEditor,
  media: MediaEditor,
  info: InfoEditor,
  rotation: RotationEditor,
}

const KIND_ICONS = {
  departures: TramFront,
  substitutions: ClipboardList,
  split: Columns2,
  media: Images,
  info: Info,
  rotation: Repeat,
}

function Breadcrumb({ current, confirmLeave }) {
  return (
    <nav aria-label="Brotkrümel" className="text-sm text-fg-subtle mb-2">
      <Link to="/monitor-admin/views" className="hover:text-fg focus:outline-none focus-visible:underline"
        onClick={(e) => { if (confirmLeave && !confirmLeave('/monitor-admin/views')) e.preventDefault() }}>
        Ansichten
      </Link>
      {current && <span aria-hidden="true"> / </span>}
      {current && <span className="text-fg-muted">{current}</span>}
    </nav>
  )
}

// ── Neue Ansicht: Typ wählen, dann Name ────────────────────────────

function NewView() {
  const navigate = useNavigate()
  const nameId = useId()
  const [kind, setKind] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    if (!kind || !name.trim()) return
    setBusy(true)
    try {
      const created = await api.createView({ name: name.trim(), kind })
      navigate(`/monitor-admin/views/${created.id}`, { replace: true })
    } catch (err) {
      toast.error(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div data-admin-page="view-new" data-state="ready">
      <Breadcrumb current="Neue Ansicht" />
      <PageHeader title="Neue Ansicht" />
      <form onSubmit={create} className="space-y-4 max-w-4xl">
        <Section title="Typ wählen" aside={<span className="text-xs text-fg-subtle">Schritt 1 von 2</span>}>
          <div role="radiogroup" aria-label="Typ" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-kind-tiles>
            {KIND_OPTIONS.map((k) => {
              const Icon = KIND_ICONS[k.value]
              const active = kind === k.value
              return (
                <button key={k.value} type="button" role="radio" aria-checked={active} onClick={() => setKind(k.value)}
                  className={`text-left rounded-lg border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active ? 'border-accent bg-raised' : 'border-line hover:border-line-strong hover:bg-raised'}`}>
                  <Icon className={`w-5 h-5 ${active ? 'text-accent' : 'text-fg-muted'}`} aria-hidden="true" />
                  <div className="mt-3 text-sm font-semibold text-fg">{k.label}</div>
                  <p className="mt-1 text-xs text-fg-muted leading-relaxed">{k.description}</p>
                </button>
              )
            })}
          </div>
        </Section>
        {kind && (
          <Section title="Name" aside={<span className="text-xs text-fg-subtle">Schritt 2 von 2</span>}>
            <Field label="Name" htmlFor={nameId} help="Nur im Admin sichtbar, zum Beispiel nach Ort oder Zweck.">
              <input id={nameId} autoFocus value={name} onChange={(e) => setName(e.target.value)}
                placeholder={`zum Beispiel ${kindLabel(kind)} Eingangshalle`} className={`${fieldClass} max-w-md`} />
            </Field>
            <div className="mt-4 flex gap-2">
              <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Anlegen</Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/monitor-admin/views')} disabled={busy}>Abbrechen</Button>
            </div>
          </Section>
        )}
      </form>
    </div>
  )
}

// ── Ansicht bearbeiten ─────────────────────────────────────────────

function GeneralSection({ draft, set, kind }) {
  const ids = { name: useId(), city: useId(), qrUrl: useId(), qrLabel: useId() }
  const nameMissing = !String(draft.name ?? '').trim()
  return (
    <Section title="Allgemein" data-editor-section="general">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.name} className="block text-sm font-medium text-fg mb-1.5">Name</label>
          <input id={ids.name} value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} aria-invalid={nameMissing}
            className={fieldClass} />
          <p className={`text-xs mt-1.5 ${nameMissing ? 'text-bad' : 'text-fg-subtle'}`}>
            {nameMissing ? 'Der Name fehlt. Bitte einen Namen eintragen.' : 'Nur im Admin sichtbar.'}
          </p>
        </div>
        <Field label="Stil" className="sm:col-span-2" help={styleHelp(draft.style, kind)}>
          <div className="max-w-md">
            <Segmented label="Stil" options={STYLE_OPTIONS} value={draft.style ?? 'auto'} onChange={(v) => set('style', v)} />
          </div>
        </Field>
        <div className="sm:col-span-2 space-y-3">
          <Checkbox label="Wetter in der Uhr-Box" checked={draft.show_weather} onChange={(v) => set('show_weather', v)} />
          {draft.show_weather && (
            <div className="ml-6.5 max-w-sm">
              <label htmlFor={ids.city} className="sr-only">Ort für das Wetter</label>
              <input id={ids.city} value={draft.weather_city ?? ''} onChange={(e) => set('weather_city', e.target.value)}
                placeholder="Ort, zum Beispiel Lübeck" className={fieldClass} />
              <p className="text-xs text-fg-subtle mt-1.5">Der Wetter-Schlüssel steht unter Einstellungen.</p>
            </div>
          )}
          <Checkbox label="QR-Code in der Ecke" checked={draft.show_qr_code} onChange={(v) => set('show_qr_code', v)} />
          {draft.show_qr_code && (
            <div className="ml-6.5 grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor={ids.qrUrl} className="sr-only">Adresse des QR-Codes</label>
                <input id={ids.qrUrl} type="url" value={draft.qr_code_url ?? ''} onChange={(e) => set('qr_code_url', e.target.value)}
                  placeholder="https://…" className={fieldClass} />
              </div>
              <div>
                <label htmlFor={ids.qrLabel} className="sr-only">Beschriftung des QR-Codes</label>
                <input id={ids.qrLabel} value={draft.qr_code_label ?? ''} onChange={(e) => set('qr_code_label', e.target.value)}
                  placeholder="Beschriftung" className={fieldClass} />
              </div>
            </div>
          )}
        </div>
        <Field label="Bei On-Air" className="sm:col-span-2"
          help={draft.on_air_behavior === 'none' ? 'Die Ansicht bleibt bei On-Air unverändert.' : draft.on_air_behavior === 'split'
            ? 'Das On-Air-Schild steht neben der Ansicht.' : 'Das On-Air-Schild füllt den Bildschirm.'}>
          <div className="flex flex-wrap gap-3">
            <div className="w-full max-w-sm">
              <Segmented label="Bei On-Air" options={ON_AIR_OPTIONS} value={draft.on_air_behavior ?? 'fullscreen'} onChange={(v) => set('on_air_behavior', v)} />
            </div>
            {draft.on_air_behavior === 'split' && (
              <div className="w-40">
                <Segmented label="Seite des On-Air-Schilds" options={SIDE_OPTIONS} value={draft.on_air_split_side ?? 'right'} onChange={(v) => set('on_air_split_side', v)} />
              </div>
            )}
          </div>
        </Field>
      </div>
    </Section>
  )
}

function UsedOnSection({ used, confirmLeave }) {
  return (
    <Section title="Verwendet auf" data-editor-section="used-on">
      {used.length ? (
        <dl className="space-y-2 text-sm">
          {used.map((u) => (
            <div key={u.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
              <dt>
                <Link to={`/monitor-admin/screens/${u.id}`} className="text-fg-muted hover:text-fg hover:underline underline-offset-2 focus:outline-none focus-visible:underline"
                  onClick={(e) => { if (!confirmLeave(`/monitor-admin/screens/${u.id}`)) e.preventDefault() }}>
                  {u.name}
                </Link>
              </dt>
              <dd className="text-fg">{u.role}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-fg-muted">Auf keinem Bildschirm eingestellt. Unter Bildschirme lässt sich die Ansicht als Standard-Ansicht wählen.</p>
      )}
    </Section>
  )
}

function EditView({ viewId }) {
  const navigate = useNavigate()
  const [view, setView] = useState(null)
  const [base, setBase] = useState(null)
  const [views, setViews] = useState([])
  const [screens, setScreens] = useState([])
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.allSettled([api.getView(viewId), api.getViews(), api.getScreens()]).then(([viewRes, viewsRes, screensRes]) => {
      if (!alive) return
      if (viewsRes.status === 'fulfilled') setViews(viewsRes.value)
      if (screensRes.status === 'fulfilled') setScreens(screensRes.value)
      if (viewRes.status === 'fulfilled') {
        setView(viewRes.value)
        setBase(draftFromView(viewRes.value))
      } else if (viewRes.reason?.response?.status === 404) {
        setMissing(true)
      } else {
        setError(viewRes.reason)
      }
    })
    return () => { alive = false }
  }, [viewId])

  const draft = useDraft(base)
  const { confirmLeave } = useUnsavedGuard(draft.changedCount > 0)
  const payload = useMemo(() => (view && draft.draft ? previewPayload(view.id, base, draft.draft) : null), [view, base, draft.draft])
  const used = useMemo(() => usedOn(viewId, screens), [viewId, screens])

  const save = async () => {
    const problems = viewProblems({ ...draft.draft, kind: view.kind })
    if (problems.length) {
      toast.error(problems[0])
      return
    }
    try {
      const saved = await draft.save((d) => api.updateView(viewId, viewPayload(d, changedKeys(base, d))))
      setView(saved)
      setBase(draftFromView(saved))
      toast.success('Gespeichert')
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const duplicate = async () => {
    if (!confirmLeave()) return
    setBusy(true)
    try {
      const created = await api.createView({ name: `${view.name} (Kopie)`, kind: view.kind, clone_from_id: view.id })
      toast.success(`„${created.name}“ angelegt`)
      navigate(`/monitor-admin/views/${created.id}`)
    } catch (e) {
      toast.error(errorText(e))
    }
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true)
    try {
      const res = await api.deleteView(viewId)
      if (res && res.success === false) {
        toast.error(res.message || 'Die Ansicht ließ sich nicht löschen.')
        setBusy(false)
        setConfirmDelete(false)
        return
      }
      navigate('/monitor-admin/views', { state: { deleted: { id: viewId, name: view.name } } })
    } catch (e) {
      toast.error(errorText(e))
      setBusy(false)
    }
  }

  const state = error ? 'error' : missing ? 'missing' : view ? 'ready' : 'loading'
  if (error || missing) {
    return (
      <div data-admin-page="view-edit" data-state={state}>
        <Breadcrumb confirmLeave={confirmLeave} />
        <PageHeader title="Ansicht" />
        {error ? (
          <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
            Die Ansicht konnte nicht geladen werden. {errorText(error, 'Bitte die Seite neu laden.')}
          </div>
        ) : (
          <div className="bg-surface rounded-lg">
            <EmptyState icon={LayoutTemplate} title="Diese Ansicht gibt es nicht mehr" />
          </div>
        )}
      </div>
    )
  }

  const Editor = view ? EDITORS[view.kind] : null
  return (
    <div data-admin-page="view-edit" data-state={state} data-view-kind={view?.kind}>
      <Breadcrumb current={view?.name} confirmLeave={confirmLeave} />
      {view && base && (
        <>
          <PageHeader
            title={view.name}
            meta={<span className="inline-block rounded-md border border-line px-2 py-0.5 text-xs text-fg-muted">Typ: {kindLabel(view.kind)}</span>}
            actions={(
              <>
                <Button icon={Copy} onClick={duplicate} disabled={busy}>Duplizieren</Button>
                {!view.is_default && <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)} disabled={busy}>Löschen</Button>}
              </>
            )}
          />
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <div className="space-y-4 min-w-0">
              <GeneralSection draft={draft.draft} set={draft.set} kind={view.kind} />
              {Editor && <Editor draft={draft.draft} set={draft.set} views={views} viewId={view.id} />}
            </div>
            <div className="space-y-4 min-w-0 lg:sticky lg:top-4">
              <LivePreview payload={payload} screens={screens} defaultScreenId={used[0]?.id ?? null} />
              <UsedOnSection used={used} confirmLeave={confirmLeave} />
            </div>
          </div>
          <SaveBar count={draft.changedCount} onSave={save} onDiscard={draft.reset} saving={draft.saving} />
        </>
      )}
      {confirmDelete && view && (
        <ConfirmDialog
          title="Ansicht löschen?"
          body={`„${view.name}“ kommt in den Papierkorb und lässt sich dort wiederherstellen.${used.length
            ? ` Sie ist noch auf ${used.map((u) => u.name).join(', ')} eingestellt; dort erscheint danach eine andere Ansicht.` : ''}`}
          confirmLabel="In den Papierkorb"
          tone="danger"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

export default function ViewEdit() {
  const { id } = useParams()
  if (!id) return <NewView />
  // key: eine andere Ansicht beginnt mit frischem Stand und Entwurf
  return <EditView key={id} viewId={Number(id)} />
}
