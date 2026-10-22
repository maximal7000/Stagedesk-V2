// Each section has its own draft (useDraft); the shared SaveBar saves every changed draft with its own
// request holding only that draft's fields, because the sections need different permissions.
import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Copy, Eye, KeyRound, MonitorOff, RotateCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, EmptyState, Button } from '../../../ui'
import { useUser } from '../../../../contexts/UserContext'
import { screenStatus } from '../shared/screenStatus'
import { useDraft } from '../shared/useDraft'
import SaveBar from '../shared/SaveBar'
import ConfirmDialog from '../shared/ConfirmDialog'
import ExceptionEditor from '../shared/ExceptionEditor'
import ScreenScheduleEditor from '../shared/ScreenScheduleEditor'
import { useUnsavedGuard } from '../shared/UnsavedChangesProvider'
import { exceptionProblems, scheduleProblems } from '../shared/schedule'
import { errorText } from '../shared/errorText'
import { formatDayTime } from '../shared/explain'
import { Checkbox, Field, Section, Segmented, fieldClass } from '../shared/form'
import DeviceBox from '../shared/DeviceBox'
import DeviceLog from '../shared/DeviceLog'
import { isPaired } from '../shared/deviceCommands'
import {
  COLOR_SCHEME_OPTIONS, DEVICE_FIELDS, DISPLAY_FIELDS, ORIENTATION_OPTIONS, OVERRIDE_CLEAR, POWER_FIELDS, POWER_METHOD_OPTIONS, POWER_MODE_OPTIONS,
  SCALE_OPTIONS, WEEKDAY_OPTIONS, activeOverride, cecLabel, configFor, deviceDefaults, deviceProblems, kioskUrl, lastReport,
  overridePayload, overrideProblem, pickFields, sectionPayload,
} from './screenData'
import * as api from '../shared/api'

const DOT = { online: 'bg-ok', offline: 'bg-bad', off: 'bg-fg-subtle', unknown: 'bg-fg-subtle' }

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
        <Field label="Farbschema" className="sm:col-span-2"
          help="„Wie eingestellt“ übernimmt das Farbschema aus den Einstellungen.">
          <div className="max-w-md">
            <Segmented label="Farbschema" options={COLOR_SCHEME_OPTIONS} value={draft.color_scheme ?? 'inherit'} disabled={disabled}
              onChange={(v) => set('color_scheme', v)} />
          </div>
        </Field>
      </div>
    </Section>
  )
}

const METHOD_HELP = {
  cec: 'Schaltet den Bildschirm über CEC.',
  hdmi: 'Schaltet den HDMI-Ausgang des Pi ab, der Bildschirm geht von selbst in Standby.',
  hybrid: 'Aus über das Netzwerk (SICP), an über CEC.',
  ddc: 'Schaltet den Bildschirm über DDC/CI am HDMI-Kabel.',
}
const CONFIG_FIELDS = {
  cec: [{ key: 'cec_device', label: 'CEC-Gerät', help: 'Nummer am CEC-Bus, meist 0.' }],
  hdmi: [{ key: 'output', label: 'HDMI-Ausgang', help: 'Name des Ausgangs, zum Beispiel HDMI-A-1.' }],
  hybrid: [
    { key: 'display_ip', label: 'SICP-IP', help: 'IP-Adresse des Bildschirms im Netzwerk.', placeholder: '192.0.2.30' },
    { key: 'display_port', label: 'Port', inputMode: 'numeric' },
    { key: 'monitor_id', label: 'Monitor-ID', inputMode: 'numeric' },
    { key: 'cec_device', label: 'CEC-Gerät', help: 'Damit wird der Bildschirm eingeschaltet.' },
  ],
  ddc: [
    { key: 'vcp_on', label: 'DDC-Wert an', help: 'Hexwert für „an“, Standard 01.' },
    { key: 'vcp_off', label: 'DDC-Wert aus', help: 'Hexwert für „aus“, Standard 04.' },
  ],
}

function PowerMethodBlock({ device, original, canDevices, problems }) {
  const methodId = useId()
  const idBase = useId()
  const values = deviceDefaults(device.draft)
  const method = values.power_method
  const disabled = !canDevices || device.saving
  const changeMethod = (next) => {
    const base = original.power_method ?? 'cec'
    device.set('power_method', next)
    device.set('power_config', next === base && original.power_config ? original.power_config : configFor(next, device.draft.power_config))
  }
  return (
    <div className="pt-5 border-t border-line-subtle" data-power-method>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Steuerung des Bildschirms" htmlFor={methodId} className="sm:col-span-2"
          help={canDevices ? METHOD_HELP[method] : `${METHOD_HELP[method]} Zum Ändern fehlt das Recht für Geräte.`}>
          <select id={methodId} value={method} disabled={disabled} onChange={(e) => changeMethod(e.target.value)} className={fieldClass}>
            {POWER_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {CONFIG_FIELDS[method].map((f) => (
          <Field key={`${method}-${f.key}`} label={f.label} htmlFor={`${idBase}-${f.key}`} help={f.help}>
            <input id={`${idBase}-${f.key}`} value={values.power_config[f.key] ?? ''} disabled={disabled} inputMode={f.inputMode}
              placeholder={f.placeholder} onChange={(e) => device.set(`power_config.${f.key}`, e.target.value)}
              aria-invalid={problems.config[f.key] ? true : undefined} className={fieldClass} />
            {problems.config[f.key] && <p className="text-xs text-bad mt-1.5">{problems.config[f.key]}</p>}
          </Field>
        ))}
      </div>
    </div>
  )
}

function PowerSection({ draft, set, disabled, readOnly, problems, methodBlock }) {
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
        {methodBlock}
      </div>
    </Section>
  )
}

function UpdatesSection({ device, canDevices, problem }) {
  const ids = { weekday: useId(), from: useId(), until: useId() }
  const values = deviceDefaults(device.draft)
  const w = values.update_window
  const disabled = !canDevices || device.saving
  return (
    <Section title="Updates" data-section="updates"
      aside={!canDevices ? <span className="text-xs text-fg-subtle">Nur lesend, Recht für Geräte fehlt</span> : null}>
      <div className="space-y-5">
        <Checkbox label="Automatische Updates" checked={values.auto_updates} disabled={disabled}
          help="Der Pi installiert Updates im Zeitfenster. Neustart nur, wenn nötig und nicht während Termin, Klausur, Notfall oder On-Air."
          onChange={(v) => device.set('auto_updates', v)} />
        <div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="Wochentag" htmlFor={ids.weekday}>
              <select id={ids.weekday} value={w.weekday} disabled={disabled || !values.auto_updates}
                onChange={(e) => device.set('update_window', { ...w, weekday: Number(e.target.value) })} className={fieldClass}>
                {WEEKDAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Von" htmlFor={ids.from}>
              <input id={ids.from} type="time" value={w.from ?? ''} disabled={disabled || !values.auto_updates}
                onChange={(e) => device.set('update_window', { ...w, from: e.target.value })} className={fieldClass} />
            </Field>
            <Field label="Bis" htmlFor={ids.until}>
              <input id={ids.until} type="time" value={w.until ?? ''} disabled={disabled || !values.auto_updates}
                onChange={(e) => device.set('update_window', { ...w, until: e.target.value })} className={fieldClass} />
            </Field>
          </div>
          {problem
            ? <p className="text-xs text-bad mt-1.5">{problem}</p>
            : <p className="text-xs text-fg-subtle mt-1.5">Das Fenster liegt an einem Tag, ein Fenster über Mitternacht ist nicht möglich.</p>}
        </div>
        <Checkbox label="Täglicher Neustart um 04:00" checked={values.daily_reboot} disabled={disabled}
          help="Mit derselben Sperre wie die Updates."
          onChange={(v) => device.set('daily_reboot', v)} />
      </div>
    </Section>
  )
}

function OverrideSection({ screen, views, now, canEdit, onApply, onClear, busy }) {
  const ids = { view: useId(), until: useId() }
  const [viewId, setViewId] = useState('')
  const [until, setUntil] = useState('')
  const active = activeOverride(screen, now, views)
  const name = active ? (views.find((v) => v.id === active.viewId)?.name ?? 'Ansicht') : null
  const apply = async () => {
    const problem = overrideProblem(viewId, until, new Date())
    if (problem) { toast.error(problem); return }
    if (await onApply(overridePayload(viewId, until))) { setViewId(''); setUntil('') }
  }
  return (
    <Section title="Andere Ansicht vorübergehend" data-section="override"
      aside={!canEdit ? <span className="text-xs text-fg-subtle">Nur lesend, Recht für die Einrichtung fehlt</span> : null}>
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm text-fg flex-1 min-w-0">
          {active
            ? `Zeigt „${name}“ ${active.until ? `bis ${formatDayTime(active.until)}` : 'bis auf Weiteres'}`
            : 'Zeigt die Standard-Ansicht, den Zeitplan und Termine.'}
        </p>
        {active && canEdit && <Button size="sm" variant="secondary" onClick={onClear} disabled={busy}>Aufheben</Button>}
      </div>
      {canEdit && (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end mt-4">
            <Field label="Ansicht" htmlFor={ids.view}>
              <select id={ids.view} value={viewId} onChange={(e) => setViewId(e.target.value)} className={fieldClass}>
                <option value="">Ansicht wählen</option>
                {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Bis" htmlFor={ids.until}>
              <input id={ids.until} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={fieldClass} />
            </Field>
            <Button onClick={apply} disabled={busy}>Anwenden</Button>
          </div>
          <p className="text-xs text-fg-subtle mt-1.5">
            Hat Vorrang vor Zeitplan und Terminen, nicht vor Notfall, Klausur und On-Air. Ohne „Bis“ gilt sie bis zum Aufheben.
          </p>
        </>
      )}
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
      toast.error('Kopieren nicht möglich. Link ist markiert.')
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

function DeviceSection({ screen, device, devicesError, now, onReload }) {
  // onReload is missing without signage.setup (backend: reload_screen needs setup)
  const legacy = !!device?.legacy
  const state = devicesError ? 'unknown' : legacy ? 'legacy' : 'unpaired'
  return (
    <Section title="Gerät" data-section="device" data-device-state={state}>
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
      <div className="text-sm text-fg-muted mt-5 pt-4 border-t border-line-subtle">
        {devicesError ? (
          <>
            <p className="text-fg">Unbekannt</p>
            <p className="mt-1">Gerätedaten konnten nicht geladen werden. {errorText(devicesError, '')}</p>
          </>
        ) : legacy ? (
          <p>Altes Skript. Den Geräte-Agent auf dem Raspberry Pi installieren, dann erscheinen WLAN, Temperatur und Updates hier.</p>
        ) : (
          <p>Kein Gerät gekoppelt. Den Kopplungscode des Raspberry Pi unter Monitore mit „Bildschirm koppeln“ eingeben.</p>
        )}
      </div>
    </Section>
  )
}

export default function ScreenDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const screenId = Number(id)
  const { hasPermission } = useUser()
  const canSetup = hasPermission('signage.setup')
  const canPower = hasPermission('signage.power')
  const canDevices = hasPermission('signage.devices')

  const [screen, setScreen] = useState(null)
  // Section baselines: only reset on load and after a complete save, so saving one section does not
  // reset the other section's draft
  const [originals, setOriginals] = useState(null)
  const [views, setViews] = useState([])
  const [devices, setDevices] = useState(null)
  const [devicesError, setDevicesError] = useState(null)
  const [logKey, setLogKey] = useState(0)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [confirmKey, setConfirmKey] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  // Different screen (same component, new id): drop the old state at once, drafts included
  const [shownId, setShownId] = useState(screenId)
  if (shownId !== screenId) {
    setShownId(screenId)
    setScreen(null)
    setOriginals(null)
    setDevices(null)
    setDevicesError(null)
    setError(null)
    setMissing(false)
    setConfirmKey(false)
    setConfirmDelete(false)
  }

  const adopt = useCallback((s) => {
    setScreen(s)
    setOriginals({ display: pickFields(s, DISPLAY_FIELDS), power: pickFields(s, POWER_FIELDS), device: pickFields(s, DEVICE_FIELDS) })
  }, [])

  // After switching screens or unmounting, a late response no longer counts
  useEffect(() => {
    let alive = true
    Promise.allSettled([api.getScreens(), api.getViews(), api.getDevices()]).then(([screensRes, viewsRes, devicesRes]) => {
      if (!alive) return
      setNow(new Date())
      if (viewsRes.status === 'fulfilled') setViews(viewsRes.value)
      setDevices(devicesRes.status === 'fulfilled' ? devicesRes.value : null)
      setDevicesError(devicesRes.status === 'rejected' ? devicesRes.reason : null)
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

  const reloadDevices = useCallback(async () => {
    try {
      const list = await api.getDevices()
      setDevices(list)
      setDevicesError(null)
    } catch (e) {
      setDevicesError(e)
    }
    setNow(new Date())
    setLogKey((k) => k + 1)
  }, [])

  // Telemetry arrives every minute: reload device and log at the same pace
  useEffect(() => {
    const timer = setInterval(reloadDevices, 60 * 1000)
    return () => clearInterval(timer)
  }, [reloadDevices])

  const display = useDraft(originals?.display)
  const power = useDraft(originals?.power)
  const deviceDraft = useDraft(originals?.device)
  const dirtyCount = display.changedCount + power.changedCount + deviceDraft.changedCount
  const { confirmLeave } = useUnsavedGuard(dirtyCount > 0)

  const problems = {
    schedule: scheduleProblems(power.draft?.schedule, views.length ? views : null),
    exceptions: exceptionProblems(power.draft?.power_exceptions),
  }

  const deviceIssues = deviceProblems(deviceDraft.draft, originals?.device)

  const saveAll = async () => {
    if (display.changedCount && !(display.draft.name ?? '').trim()) {
      toast.error('Name fehlt.')
      return
    }
    if (power.changedCount && [...problems.schedule, ...problems.exceptions].some(Boolean)) {
      toast.error('Zeitplan oder Ausnahmen unvollständig.')
      return
    }
    if (deviceDraft.changedCount && (deviceIssues.window || Object.values(deviceIssues.config).some(Boolean))) {
      toast.error(deviceIssues.window || Object.values(deviceIssues.config).find(Boolean))
      return
    }
    const sections = [['display', display], ['power', power], ['device', deviceDraft]].filter(([, d]) => d.changedCount > 0)
    let latest = null
    let failed = false
    for (const [name, d] of sections) {
      try {
        latest = await d.save((draft) => api.updateScreen(screenId, sectionPayload(name, draft, originals[name])))
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
    deviceDraft.reset()
  }

  const regenerate = async () => {
    setBusy(true)
    try {
      const updated = await api.regenerateScreenKey(screenId)
      setScreen((s) => ({ ...s, access_key: updated.access_key }))
      setConfirmKey(false)
      toast.success('Neuer Schlüssel erzeugt. Kiosk-URL geändert.')
    } catch (e) {
      toast.error(errorText(e))
    }
    setBusy(false)
  }

  // Take only the override fields: the section drafts stay untouched
  const changeOverride = async (body) => {
    setBusy(true)
    try {
      const updated = await api.updateScreen(screenId, body)
      setScreen((s) => ({ ...s, override_view_id: updated.override_view_id ?? null, override_until: updated.override_until ?? null }))
      setNow(new Date())
      toast.success(body.override_view_id ? 'Ansicht gesetzt' : 'Manuelle Ansicht aufgehoben')
      return true
    } catch (e) {
      toast.error(errorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteScreen(screenId)
      toast.success(`„${screen.name}“ ist gelöscht.`)
      navigate('/signage-admin/screens')
    } catch (e) {
      toast.error(errorText(e))
      setBusy(false)
    }
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
  const device = devices?.find((d) => d.screen_id === screenId) ?? null
  const status = screen ? screenStatus(screen, now, device) : null

  const breadcrumb = (
    <nav aria-label="Brotkrümel" className="text-sm text-fg-subtle mb-2">
      <Link to="/signage-admin/screens" className="hover:text-fg focus:outline-none focus-visible:underline"
        onClick={(e) => { if (!confirmLeave('/signage-admin/screens')) e.preventDefault() }}>
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
            Bildschirm konnte nicht geladen werden. {errorText(error, '')}
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
                <span className={`w-2 h-2 rounded-full ${status.tone === 'warn' ? 'bg-warn' : DOT[status.state]}`} aria-hidden="true" />
                {[status.label, status.detail].filter(Boolean).join(' · ')}
              </span>
            )}
            actions={canSetup ? (
              <>
                <Button as="a" href={kioskUrl('', screen)} target="_blank" rel="noreferrer" icon={Eye}>Vorschau</Button>
                <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)} disabled={busy}>Löschen</Button>
              </>
            ) : null}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
            <div className="space-y-4 min-w-0">
              <DisplaySection draft={display.draft} set={display.set} views={views} readOnly={!canSetup} disabled={!canSetup || display.saving} />
              {(canSetup || activeOverride(screen, now, views)) && (
                <OverrideSection screen={screen} views={views} now={now} canEdit={canSetup} busy={busy}
                  onApply={changeOverride} onClear={() => changeOverride(OVERRIDE_CLEAR)} />
              )}
              <ScreenScheduleEditor value={power.draft.schedule} onChange={(v) => power.set('schedule', v)} views={views}
                problems={problems.schedule} readOnly={!canPower} disabled={!canPower || power.saving} />
              <PowerSection draft={power.draft} set={power.set} readOnly={!canPower} disabled={!canPower || power.saving} problems={problems}
                methodBlock={<PowerMethodBlock device={deviceDraft} original={originals.device} canDevices={canDevices} problems={deviceIssues} />} />
              {(canDevices || isPaired(device)) && <UpdatesSection device={deviceDraft} canDevices={canDevices} problem={deviceIssues.window} />}
              {canSetup && <KioskSection screen={screen} onRegenerate={() => setConfirmKey(true)} />}
              {canDevices && <DeviceLog screenId={screenId} reloadKey={logKey} />}
            </div>
            {isPaired(device)
              ? <DeviceBox device={device} screen={screen} can={hasPermission} onChanged={reloadDevices} onReload={canSetup && !canDevices ? reload : null} />
              : <DeviceSection screen={screen} device={device} devicesError={devicesError} now={now} onReload={canSetup ? reload : null} />}
          </div>
          <SaveBar count={dirtyCount} onSave={saveAll} onDiscard={discard} saving={display.saving || power.saving || deviceDraft.saving} />
        </>
      )}
      {confirmDelete && screen && (
        <ConfirmDialog
          title={`„${screen.name}“ löschen?`}
          body={`Der Bildschirm wird endgültig gelöscht, es gibt keinen Papierkorb. Zeitplan, Ausnahmen und Termin-Zuordnungen gehen verloren, Klausuren gelten nur noch für die übrigen Bildschirme. Die Kiosk-URL zeigt danach „Bildschirm nicht gefunden“.`}
          confirmLabel="Endgültig löschen"
          tone="danger"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
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
