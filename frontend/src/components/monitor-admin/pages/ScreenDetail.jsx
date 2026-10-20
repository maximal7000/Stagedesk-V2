// Bildschirm-Detail (Spec §6.2, Mockup admin-screen-detail.png): Anzeige, Ein- und Ausschalten, Kiosk-URL
// und rechts das Gerät. Anzeige und Ein- und Ausschalten haben je einen Entwurf (useDraft); die gemeinsame
// SaveBar speichert jeden geänderten Abschnitt mit einer eigenen Anfrage, die nur dessen Felder enthält.
// Anzeige braucht monitor.setup, Ein- und Ausschalten monitor.power (ohne Recht nur lesend).
import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Copy, Eye, KeyRound, MonitorOff, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, EmptyState, Button } from '../../ui'
import { useUser } from '../../../contexts/UserContext'
import { screenStatus } from '../shared/ScreenStatus'
import { useDraft } from '../shared/useDraft'
import SaveBar from '../shared/SaveBar'
import ConfirmDialog from '../shared/ConfirmDialog'
import ScheduleEditor, { ExceptionEditor } from '../shared/ScheduleEditor'
import { useUnsavedGuard } from '../shared/UnsavedChangesProvider'
import { exceptionProblems, scheduleProblems } from '../shared/schedule'
import { errorText } from '../shared/errorText'
import { Field, Section, Segmented, fieldClass } from '../shared/form'
import {
  DISPLAY_FIELDS, ORIENTATION_OPTIONS, POWER_FIELDS, POWER_MODE_OPTIONS, SCALE_OPTIONS,
  cecLabel, kioskUrl, lastReport, pickFields, sectionPayload,
} from './screenData'
import * as api from '../shared/api'

const DOT = { online: 'bg-ok', offline: 'bg-bad', unknown: 'bg-fg-subtle' }

const isoToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function DisplaySection({ draft, set, views, disabled, readOnly }) {
  const ids = { name: useId(), location: useId(), view: useId(), scale: useId() }
  return (
    <Section title="Anzeige" data-section="display"
      aside={readOnly ? <span className="text-xs text-fg-subtle">Nur lesend, Recht für die Einrichtung fehlt</span> : null}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={ids.name}>
          <input id={ids.name} value={draft.name ?? ''} disabled={disabled} onChange={(e) => set('name', e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Ort" htmlFor={ids.location}>
          <input id={ids.location} value={draft.location ?? ''} disabled={disabled} placeholder="zum Beispiel Eingangshalle"
            onChange={(e) => set('location', e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Standard-Ansicht" htmlFor={ids.view} className="sm:col-span-2"
          help="Wird gezeigt, wenn kein Termin oder Sondermodus aktiv ist.">
          <select id={ids.view} value={draft.default_view_id ?? ''} disabled={disabled}
            onChange={(e) => set('default_view_id', e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
            <option value="">Keine</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Skalierung" htmlFor={ids.scale} help="Automatisch passt die Größe an die Auflösung des Bildschirms an.">
          <select id={ids.scale} value={draft.scale ?? 'auto'} disabled={disabled} onChange={(e) => set('scale', e.target.value)} className={fieldClass}>
            {SCALE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Ausrichtung">
          <Segmented label="Ausrichtung" options={ORIENTATION_OPTIONS} value={draft.orientation ?? 'landscape'} disabled={disabled}
            onChange={(v) => set('orientation', v)} />
        </Field>
      </div>
    </Section>
  )
}

function PowerSection({ draft, set, disabled, readOnly, problems }) {
  const holidaysId = useId()
  const auto = draft.power_mode === 'auto'
  return (
    <Section title="Ein- und Ausschalten" data-section="power"
      aside={readOnly ? <span className="text-xs text-fg-subtle">Nur lesend, Recht für Ein- und Ausschalten fehlt</span> : null}>
      <div className="space-y-5">
        <Field label="Steuerung" help={auto
          ? 'Der Bildschirm folgt dem Zeitplan, den Ferien und den Ausnahmen.'
          : 'Zeitplan, Ferien und Ausnahmen gelten erst wieder mit Automatisch. Ein Notfall schaltet trotzdem ein.'}>
          <div className="max-w-md">
            <Segmented label="Steuerung" options={POWER_MODE_OPTIONS} value={draft.power_mode ?? 'auto'} disabled={disabled}
              onChange={(v) => set('power_mode', v)} />
          </div>
        </Field>
        <Field label="Zeitplan" help="Der Bildschirm ist nur in diesen Zeiten an. Ist „Bis“ früher als „Von“, ist er an den gewählten Tagen ab „Von“ bis Mitternacht und ab 0 Uhr bis „Bis“ an.">
          <ScheduleEditor value={draft.power_schedule} onChange={(v) => set('power_schedule', v)} disabled={disabled} problems={problems.schedule} />
        </Field>
        <div>
          <label htmlFor={holidaysId} className="inline-flex items-center gap-2.5 text-sm text-fg cursor-pointer">
            <input id={holidaysId} type="checkbox" checked={!!draft.off_during_holidays} disabled={disabled}
              onChange={(e) => set('off_during_holidays', e.target.checked)} className="w-4 h-4 accent-accent" />
            In den Ferien ausgeschaltet
          </label>
          <p className="text-xs text-fg-subtle mt-1 ml-6.5">Die Ferienzeiträume stehen unter Ferien &amp; Zeitpläne.</p>
        </div>
        <Field label="Ausnahmen nach Datum" help="An diesen Tagen gilt nur die angegebene Zeit, auch in den Ferien. Ohne Zeit ist der Bildschirm den ganzen Tag an.">
          <ExceptionEditor value={draft.power_exceptions} onChange={(v) => set('power_exceptions', v)} disabled={disabled}
            problems={problems.exceptions} today={isoToday()} />
        </Field>
      </div>
    </Section>
  )
}

function KioskSection({ screen, onRegenerate }) {
  const inputId = useId()
  const url = kioskUrl(window.location.origin, screen)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link kopiert')
    } catch {
      document.getElementById(inputId)?.select()
      toast.error('Kopieren war nicht möglich. Der Link ist markiert und lässt sich mit Strg+C kopieren.')
    }
  }
  return (
    <Section title="Kiosk-URL" data-section="kiosk">
      <input id={inputId} readOnly value={url} aria-label="Kiosk-URL" onFocus={(e) => e.target.select()}
        className={`${fieldClass} font-mono text-xs`} />
      <p className="text-xs text-fg-subtle mt-1.5">
        Diese Adresse im Kiosk-Browser des Bildschirms eintragen. Der Schlüssel darin gibt den Vertretungsplan frei.
      </p>
      <div className="flex gap-2 mt-3">
        <Button icon={Copy} onClick={copy}>Kopieren</Button>
        <Button variant="ghost" icon={KeyRound} onClick={onRegenerate}>Neu erzeugen</Button>
      </div>
    </Section>
  )
}

function DeviceSection({ screen, now, onReload }) {
  // onReload fehlt ohne monitor.setup (Backend: reload_screen braucht setup)
  return (
    <Section title="Gerät" data-section="device">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Bildschirm (CEC)</dt>
          <dd className="text-fg">{cecLabel(screen.cec_status)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Zuletzt gemeldet</dt>
          <dd className="text-fg tabular-nums">{lastReport(screen.cec_status_at, now)}</dd>
        </div>
      </dl>
      {onReload && (
        <div className="mt-4">
          <Button icon={RotateCw} onClick={onReload}>Neu laden</Button>
          <p className="text-xs text-fg-subtle mt-1.5">Lädt die Anzeige im Browser des Bildschirms neu.</p>
        </div>
      )}
      <p className="text-sm text-fg-muted mt-5 pt-4 border-t border-line-subtle">
        Kein Agent installiert. WLAN, Temperatur und Updates erscheinen hier, sobald der Geräte-Agent eingerichtet ist.
      </p>
    </Section>
  )
}

export default function ScreenDetail() {
  const { id } = useParams()
  const screenId = Number(id)
  const { hasPermission } = useUser()
  const canSetup = hasPermission('monitor.setup')
  const canPower = hasPermission('monitor.power')

  const [screen, setScreen] = useState(null)
  // Ausgangsstände der Abschnitte: nur beim Laden und nach vollständigem Speichern neu gesetzt, damit ein
  // gespeicherter Abschnitt den Entwurf des anderen nicht zurücksetzt
  const [originals, setOriginals] = useState(null)
  const [views, setViews] = useState([])
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [confirmKey, setConfirmKey] = useState(false)
  const [busy, setBusy] = useState(false)

  // Anderer Bildschirm (gleiche Komponente, neue id): alten Stand sofort verwerfen, auch die Entwürfe
  const [shownId, setShownId] = useState(screenId)
  if (shownId !== screenId) {
    setShownId(screenId)
    setScreen(null)
    setOriginals(null)
    setError(null)
    setMissing(false)
    setConfirmKey(false)
  }

  const adopt = useCallback((s) => {
    setScreen(s)
    setOriginals({ display: pickFields(s, DISPLAY_FIELDS), power: pickFields(s, POWER_FIELDS) })
  }, [])

  // Beim Wechsel zu einem anderen Bildschirm oder nach dem Abbau zählt eine späte Antwort nicht mehr
  useEffect(() => {
    let alive = true
    Promise.allSettled([api.getScreens(), api.getViews()]).then(([screensRes, viewsRes]) => {
      if (!alive) return
      setNow(new Date())
      if (viewsRes.status === 'fulfilled') setViews(viewsRes.value)
      if (screensRes.status === 'rejected') {
        setError(screensRes.reason)
        return
      }
      setError(null)
      const found = screensRes.value.find((s) => s.id === screenId)
      setMissing(!found)
      if (found) adopt(found)
    })
    return () => { alive = false }
  }, [screenId, adopt])

  const display = useDraft(originals?.display)
  const power = useDraft(originals?.power)
  const dirtyCount = display.changedCount + power.changedCount
  const { confirmLeave } = useUnsavedGuard(dirtyCount > 0)

  const problems = {
    schedule: scheduleProblems(power.draft?.power_schedule),
    exceptions: exceptionProblems(power.draft?.power_exceptions),
  }

  const saveAll = async () => {
    if (display.changedCount && !(display.draft.name ?? '').trim()) {
      toast.error('Der Name fehlt. Bitte einen Namen für den Bildschirm eintragen.')
      return
    }
    if (power.changedCount && [...problems.schedule, ...problems.exceptions].some(Boolean)) {
      toast.error('Zeitplan oder Ausnahmen sind unvollständig. Bitte die markierten Zeilen korrigieren.')
      return
    }
    const sections = [['display', display], ['power', power]].filter(([, d]) => d.changedCount > 0)
    let latest = null
    let failed = false
    for (const [name, d] of sections) {
      try {
        latest = await d.save((draft) => api.updateScreen(screenId, sectionPayload(name, draft)))
      } catch (e) {
        failed = true
        toast.error(errorText(e))
      }
    }
    if (latest && !failed) {
      adopt(latest)
      toast.success('Gespeichert')
    } else if (latest) {
      setScreen(latest)
    }
  }

  const discard = () => {
    display.reset()
    power.reset()
  }

  const regenerate = async () => {
    setBusy(true)
    try {
      const updated = await api.regenerateScreenKey(screenId)
      setScreen((s) => ({ ...s, access_key: updated.access_key }))
      setConfirmKey(false)
      toast.success('Neuer Schlüssel erzeugt. Die neue Kiosk-URL jetzt auf dem Bildschirm eintragen.')
    } catch (e) {
      toast.error(errorText(e))
    }
    setBusy(false)
  }

  const reload = async () => {
    try {
      await api.reloadScreen(screenId)
      toast.success(`${screen.name} lädt neu`)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const state = error ? 'error' : missing ? 'missing' : screen ? 'ready' : 'loading'
  const status = screen ? screenStatus(screen, now) : null

  const breadcrumb = (
    <nav aria-label="Brotkrümel" className="text-sm text-fg-subtle mb-2">
      <Link to="/monitor-admin/screens" className="hover:text-fg focus:outline-none focus-visible:underline"
        onClick={(e) => { if (!confirmLeave('/monitor-admin/screens')) e.preventDefault() }}>
        Bildschirme
      </Link>
      {screen && <span aria-hidden="true"> / </span>}
      {screen && <span className="text-fg-muted">{screen.name}</span>}
    </nav>
  )

  if (error || missing) {
    return (
      <div data-admin-page="screen-detail" data-state={state}>
        {breadcrumb}
        <PageHeader title="Bildschirm" />
        {error ? (
          <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
            Der Bildschirm konnte nicht geladen werden. {errorText(error, 'Bitte die Seite neu laden.')}
          </div>
        ) : (
          <div className="bg-surface rounded-lg">
            <EmptyState icon={MonitorOff} title="Diesen Bildschirm gibt es nicht mehr" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div data-admin-page="screen-detail" data-state={state}>
      {breadcrumb}
      {screen && originals && (
        <>
          <PageHeader
            title={screen.name}
            meta={(
              <span className="inline-flex items-center gap-2" data-screen-state={status.state}>
                <span className={`w-2 h-2 rounded-full ${DOT[status.state]}`} aria-hidden="true" />
                {[status.label, status.detail].filter(Boolean).join(' · ')}
              </span>
            )}
            actions={canSetup ? (
              <Button as="a" href={kioskUrl('', screen)} target="_blank" rel="noreferrer" icon={Eye}>Vorschau</Button>
            ) : null}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
            <div className="space-y-4 min-w-0">
              <DisplaySection draft={display.draft} set={display.set} views={views} readOnly={!canSetup} disabled={!canSetup || display.saving} />
              <PowerSection draft={power.draft} set={power.set} readOnly={!canPower} disabled={!canPower || power.saving} problems={problems} />
              {canSetup && <KioskSection screen={screen} onRegenerate={() => setConfirmKey(true)} />}
            </div>
            <DeviceSection screen={screen} now={now} onReload={canSetup ? reload : null} />
          </div>
          <SaveBar count={dirtyCount} onSave={saveAll} onDiscard={discard} saving={display.saving || power.saving} />
        </>
      )}
      {confirmKey && (
        <ConfirmDialog
          title="Neuen Schlüssel erzeugen?"
          body="Der alte Link funktioniert danach nicht mehr für den Vertretungsplan."
          confirmLabel="Neu erzeugen"
          busy={busy}
          onConfirm={regenerate}
          onCancel={() => setConfirmKey(false)}
        />
      )}
    </div>
  )
}
