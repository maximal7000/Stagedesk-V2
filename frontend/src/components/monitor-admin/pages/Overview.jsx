// Monitor-Übersicht (Spec §6.2): Sondermodi, Bildschirme mit Status und "Zeigt gerade",
// Datenquellen und "Demnächst". Sofortige Schalter speichern direkt und bieten 8 s "Rückgängig".
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Link2, MonitorOff, MoreVertical, Power, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, EmptyState, Button } from '../../ui'
import { useUser } from '../../../contexts/UserContext'
import { formatTime } from '../../display/lib/format'
import ScreenStatus, { DeviceCell } from '../shared/ScreenStatus'
import { Cell, ScreenNameCell, ScreenRow, ScreenTable, iconButton } from '../shared/ScreenTable'
import PairDialog from '../shared/PairDialog'
import ConfirmDialog from '../shared/ConfirmDialog'
import EmergencyDialog from '../shared/EmergencyDialog'
import UndoToast from '../shared/UndoToast'
import { describeShown, explainScreen, formatDayTime } from '../shared/explain'
import { errorText } from '../shared/errorText'
import { allOffUntil, dataSources, formatRange, nextExam, powerMenu, screensMeta, upcoming } from './overviewData'
import { OVERRIDE_CLEAR, activeOverride, kioskUrl } from './screenData'
import * as api from '../shared/api'

const REFRESH_MS = 60 * 1000

const settle = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }))

function Box({ className = '', children }) {
  return <div className={`bg-surface rounded-lg px-4 py-3.5 flex items-center gap-4 min-w-0 ${className}`}>{children}</div>
}

function BoxText({ title, children }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-fg">{title}</div>
      {/* Unterzeile bleibt als Platz erhalten, damit die Titel der drei Kästen auf einer Linie stehen */}
      <div className="text-xs text-fg-muted mt-0.5 min-h-4">{children}</div>
    </div>
  )
}

function Switch({ on, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${on ? 'bg-accent' : 'bg-hover'} disabled:cursor-not-allowed disabled:bg-raised`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

const OVERVIEW_COLUMNS = [
  { key: 'name', label: 'Bildschirm', className: 'w-[22%]' },
  { key: 'status', label: 'Status', className: 'w-[16%]' },
  { key: 'shown', label: 'Zeigt gerade' },
  { key: 'device', label: 'Gerät', className: 'w-[22%]' },
  { key: 'actions', label: null, srLabel: 'Aktionen', className: 'w-px' },
]

function RowMenu({ items, hint }) {
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
      <button type="button" className={iconButton} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        aria-label="Weitere Aktionen" title="Weitere Aktionen">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 min-w-[230px] bg-overlay border border-line rounded-lg shadow-overlay py-1">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect() }}
              className="w-full text-left px-3 py-2 text-sm text-fg hover:bg-raised focus:outline-none focus-visible:bg-raised disabled:text-fg-disabled disabled:pointer-events-none">
              {item.label}
            </button>
          ))}
          {hint && <p className="px-3 pt-1 pb-2 text-xs text-fg-subtle max-w-[240px]">{hint}</p>}
        </div>
      )}
    </div>
  )
}

const TONE_TEXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', muted: 'text-fg-subtle' }

function InfoList({ title, rows, empty }) {
  return (
    <div className="bg-surface rounded-lg px-4 py-3.5">
      <h3 className="text-sm font-semibold text-fg mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">{empty}</p>
      ) : (
        <dl className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-fg-muted min-w-0 truncate">{r.label}</dt>
              <dd className={`tabular-nums whitespace-nowrap ${r.className || 'text-fg'}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export default function Overview() {
  const { hasPermission } = useUser()
  const can = {
    power: hasPermission('monitor.power'),
    onair: hasPermission('monitor.onair'),
    emergency: hasPermission('monitor.emergency'),
    setup: hasPermission('monitor.setup'),
    exams: hasPermission('monitor.exams'),
    devices: hasPermission('monitor.devices'),
  }

  const [screens, setScreens] = useState(null)
  const [error, setError] = useState(null)
  const [extra, setExtra] = useState({ settings: null, views: [], exams: [], events: [], holidays: null })
  const [displays, setDisplays] = useState(null)
  const [devicesError, setDevicesError] = useState(null)
  const [devices, setDevices] = useState({}) // screen_id -> Gerät (auch altes Skript); leer bei Fehler
  const [now, setNow] = useState(() => new Date())
  const [undo, setUndo] = useState(null)
  const [dialog, setDialog] = useState(null) // 'all-off' | 'emergency'
  const [templates, setTemplates] = useState(null)
  const [busy, setBusy] = useState(false)
  const [onAirBusy, setOnAirBusy] = useState(false)
  // Nur die jüngste Ladung zählt; nach dem Abbau wird nichts mehr gesetzt
  const loadSeq = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const canPower = can.power
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const current = () => mounted.current && seq === loadSeq.current
    const [screensRes, devicesRes, settingsRes, viewsRes, examsRes, eventsRes, holidaysRes] = await Promise.all([
      settle(api.getScreens()),
      settle(api.getDevices()),
      settle(api.getSettings()),
      settle(api.getViews()),
      settle(api.getExams()),
      settle(api.getEvents()),
      canPower ? settle(api.getHolidays()) : Promise.resolve({ ok: false }),
    ])
    if (!current()) return
    setNow(new Date())
    // Sondermodi unabhängig von den Bildschirmen: On-Air und Notfall bleiben auch ohne Bildschirm-Liste schaltbar
    setExtra({
      settings: settingsRes.ok ? settingsRes.value : null,
      views: viewsRes.ok ? viewsRes.value : [],
      exams: examsRes.ok ? examsRes.value : [],
      events: eventsRes.ok ? eventsRes.value : [],
      holidays: holidaysRes.ok ? holidaysRes.value : null,
    })
    // Ohne Geräteliste greift pro Bildschirm der Rückfall auf den CEC-Status
    setDevicesError(devicesRes.ok ? null : devicesRes.error)
    setDevices(devicesRes.ok ? Object.fromEntries(devicesRes.value.filter((d) => d.screen_id != null).map((d) => [d.screen_id, d])) : {})
    if (!screensRes.ok) {
      setError(screensRes.error)
      return
    }
    setError(null)
    setScreens(screensRes.value)
    const results = await Promise.all(screensRes.value.map((s) => settle(api.getDisplay(s.slug))))
    if (!current()) return
    setDisplays(Object.fromEntries(screensRes.value.map((s, i) => [s.slug, results[i].ok ? results[i].value : null])))
  }, [canPower])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  // Sofortige Aktion: ausführen, neu laden, Bestätigung mit "Rückgängig" zeigen
  const instant = async (action, message, revert) => {
    try {
      const result = await action()
      const text = typeof message === 'function' ? message(result) : message
      // Neue id je Aktion: die Meldung hängt sich neu ein und die 8 s laufen von vorn
      setUndo((prev) => ({ id: (prev?.id ?? 0) + 1, message: text, revert }))
    } catch (e) {
      toast.error(errorText(e))
    }
    await load()
  }
  const runUndo = async (revert) => {
    try { await revert() } catch (e) { toast.error(errorText(e)) }
    load()
  }

  const settings = extra.settings
  const onAir = !!settings?.on_air_active
  const emergencyActive = !!settings?.emergency_active
  const viewNames = Object.fromEntries(extra.views.map((v) => [v.id, v.name]))
  const offUntil = screens ? allOffUntil(screens, now) : null
  const exam = nextExam(extra.exams, now)
  const screenNames = Object.fromEntries((screens || []).map((s) => [s.id, s.name]))
  const examScreens = (exam?.screen_ids || []).map((id) => screenNames[id]).filter(Boolean)
  const sources = dataSources(displays ? Object.values(displays).filter(Boolean) : [], settings)
  const soon = upcoming(extra.holidays, extra.events, now)
  const state = error ? 'error' : screens && displays ? 'ready' : 'loading'

  const toggleOnAir = async (value) => {
    setOnAirBusy(true)
    try {
      await instant(
        () => api.setOnAir(value),
        value ? 'On-Air eingeschaltet' : 'On-Air ausgeschaltet',
        () => api.setOnAir(!value),
      )
    } finally {
      if (mounted.current) setOnAirBusy(false)
    }
  }

  const powerOffAll = async () => {
    setBusy(true)
    try {
      const result = await api.powerOffToday()
      if (result?.off_until) {
        setScreens((list) => list.map((s) => (result.off_until[String(s.id)] ? { ...s, off_until: result.off_until[String(s.id)] } : s)))
      }
      setDialog(null)
    } catch (e) {
      toast.error(errorText(e))
    }
    setBusy(false)
    load()
  }

  const undoAllOff = async () => {
    try {
      await api.undoPowerOffToday()
      setScreens((list) => list.map((s) => ({ ...s, off_until: null })))
    } catch (e) {
      toast.error(errorText(e))
    }
    load()
  }

  const openEmergency = () => {
    setDialog('emergency')
    if (!emergencyActive && templates == null) {
      api.getEmergencyTemplates().then(setTemplates, (e) => { setTemplates([]); toast.error(errorText(e)) })
    }
  }

  const changeEmergency = async (body) => {
    setBusy(true)
    try {
      await api.setEmergency(body)
      setDialog(null)
    } catch (e) {
      toast.error(errorText(e))
    }
    setBusy(false)
    load()
  }

  // Zeilenmenü: Ein- und Ausschalten mit monitor.power, "Manuelle Ansicht aufheben" mit monitor.setup
  const screenMenu = (s) => {
    const isOn = displays?.[s.slug]?.screen?.power ?? s.power_mode !== 'manual_off'
    const { items, hint } = can.power ? powerMenu(s, { now, isOn, emergencyActive }) : { items: [], hint: '' }
    if (can.setup && activeOverride(s, now, extra.views)) items.push({ key: 'clear-override', label: 'Manuelle Ansicht aufheben' })
    const previousMode = s.power_mode
    const previousOverride = { override_view_id: s.override_view_id, override_until: s.override_until ?? null }
    const actions = {
      'clear-override': () => instant(
        () => api.updateScreen(s.id, OVERRIDE_CLEAR), `${s.name} zeigt wieder die geplante Ansicht`,
        () => api.updateScreen(s.id, previousOverride)),
      'off-today': () => instant(
        () => api.powerOffToday([s.id]),
        (r) => (r?.off_until?.[String(s.id)] ? `${s.name} aus bis ${formatDayTime(r.off_until[String(s.id)])}` : `${s.name} bis Tagesende aus`),
        () => api.undoPowerOffToday([s.id])),
      // Rückgängig setzt genau den bisherigen Zeitpunkt wieder (off_until ist mit monitor.power schreibbar)
      'clear-off': (item) => instant(
        () => api.undoPowerOffToday([s.id]), `${s.name} folgt wieder dem Zeitplan`,
        () => api.updateScreen(s.id, { off_until: item.previous })),
      manual: (item) => instant(
        () => api.updateScreen(s.id, { power_mode: item.mode }),
        `${s.name} ${item.mode === 'manual_off' ? 'ausgeschaltet' : 'eingeschaltet'}`,
        () => api.updateScreen(s.id, { power_mode: previousMode })),
      auto: () => instant(
        () => api.updateScreen(s.id, { power_mode: 'auto' }),
        `${s.name} folgt wieder dem Zeitplan`,
        () => api.updateScreen(s.id, { power_mode: previousMode })),
    }
    return { hint, items: items.map((item) => ({ ...item, onSelect: () => actions[item.key](item) })) }
  }

  const reload = async (s) => {
    try {
      await api.reloadScreen(s.id)
      toast.success(`${s.name} lädt neu`)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const headerActions = (can.power || can.devices) ? (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {can.power && !offUntil && screens?.length > 0 && (
          <Button icon={Power} onClick={() => setDialog('all-off')}>Alle bis Tagesende aus</Button>
        )}
        {can.devices && <Button variant="primary" icon={Link2} onClick={() => setDialog('pair')}>Bildschirm koppeln</Button>}
      </div>
    </div>
  ) : null

  return (
    <div data-admin-page="overview" data-state={state}>
      <PageHeader title="Monitore" meta={screens ? screensMeta(screens, now, devices) : null} actions={headerActions} />

      {offUntil && (
        <div className="bg-surface rounded-lg px-4 py-2.5 mb-4 flex items-center gap-3" data-all-off>
          <Power className="w-4 h-4 text-warn shrink-0" />
          <span className="text-sm text-fg flex-1 min-w-0">Alle Bildschirme aus bis {formatDayTime(offUntil)}</span>
          {can.power && <Button size="sm" variant="secondary" onClick={undoAllOff}>Rückgängig</Button>}
        </div>
      )}

      {settings && (
        <div className="grid gap-3 md:grid-cols-3 mb-6">
          <Box>
            <BoxText title="On-Air">
              {onAir ? (formatTime(settings.on_air_since) ? `An seit ${formatTime(settings.on_air_since)}` : 'An') : 'Aus'}
            </BoxText>
            {can.onair && <Switch on={onAir} onChange={toggleOnAir} disabled={onAirBusy} label="On-Air" />}
          </Box>
          <Box className={emergencyActive ? 'ring-1 ring-bad' : ''}>
            {emergencyActive ? (
              <BoxText title={<span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-bad" aria-hidden="true" />Notfall aktiv</span>}>
                {formatTime(settings.emergency_since) ? `Aktiv seit ${formatTime(settings.emergency_since)}` : 'Aktiv'}
              </BoxText>
            ) : (
              <BoxText title="Notfall" />
            )}
            {can.emergency && (
              <Button variant="danger" className="ring-1 ring-inset ring-bad" onClick={openEmergency}>
                {emergencyActive ? 'Beenden…' : 'Auslösen…'}
              </Button>
            )}
          </Box>
          <Box>
            <BoxText title={exam && new Date(exam.active_from) <= now ? 'Klausur läuft' : 'Nächste Klausur'}>
              {exam ? (
                <>
                  {exam.title} · {formatRange(exam.active_from, exam.active_until)}
                  {examScreens.length > 0 && ` · ${examScreens.join(', ')}`}
                </>
              ) : 'Keine Klausur geplant'}
            </BoxText>
            {can.exams && <Button as={Link} to="/monitor-admin/exams">Öffnen</Button>}
          </Box>
        </div>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-lg font-semibold tracking-tight text-fg">Bildschirme</h2>
        {screens && <span className="text-xs text-fg-subtle">Stand {formatTime(now)}</span>}
      </div>
      {error ? (
        <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
          Bildschirme konnten nicht geladen werden. {errorText(error, 'Bitte die Seite neu laden.')}
        </div>
      ) : screens && screens.length === 0 ? (
        <div className="bg-surface rounded-lg">
          <EmptyState icon={MonitorOff} title="Noch keine Bildschirme" />
        </div>
      ) : screens ? (
        <>
        {devicesError && (
          <p role="status" data-devices-error className="text-xs text-warn mb-2">
            Gerätedaten nicht verfügbar: {errorText(devicesError, 'Bitte die Seite neu laden.')} Der Status stammt aus der letzten Meldung des Bildschirms.
          </p>
        )}
        <ScreenTable columns={OVERVIEW_COLUMNS}>
          {screens.map((s) => {
            const payload = displays?.[s.slug]
            const known = displays && payload !== undefined
            const reason = known ? explainScreen(s, payload, { now, events: extra.events, holidays: extra.holidays }) : ''
            const menu = screenMenu(s)
            return (
              <ScreenRow key={s.id} screen={s}>
                <ScreenNameCell screen={s} to={(can.setup || can.power || can.devices) ? `/monitor-admin/screens/${s.id}` : undefined} />
                <Cell><ScreenStatus screen={s} now={now} device={devices[s.id]} /></Cell>
                <Cell className="min-w-0">
                  {!known ? (
                    <div className="text-sm text-fg-subtle">Wird geladen…</div>
                  ) : payload ? (
                    <>
                      <div className={`text-sm ${payload.screen?.power === false ? 'text-fg-muted' : 'text-fg'}`}>{describeShown(payload, viewNames)}</div>
                      {reason && <div className="text-xs text-fg-muted">{reason}</div>}
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-fg-muted">Unbekannt</div>
                      <div className="text-xs text-fg-muted">Anzeige-Daten nicht abrufbar{reason ? ` · ${reason}` : ''}</div>
                    </>
                  )}
                </Cell>
                <Cell className="min-w-0"><DeviceCell device={devices[s.id]} unknown={!!devicesError} /></Cell>
                <Cell>
                  <div className="flex items-center justify-end gap-1">
                    {can.setup && (
                      <>
                        <a className={iconButton} href={kioskUrl('', s)}
                          target="_blank" rel="noreferrer" aria-label={`Vorschau ${s.name}`} title="Vorschau">
                          <Eye className="w-4 h-4" />
                        </a>
                        <button type="button" className={iconButton} onClick={() => reload(s)} aria-label={`${s.name} neu laden`} title="Neu laden">
                          <RotateCw className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {menu.items.length > 0 && <RowMenu {...menu} />}
                  </div>
                </Cell>
              </ScreenRow>
            )
          })}
        </ScreenTable>
        </>
      ) : null}

      {screens && (
        <div className="grid gap-3 md:grid-cols-2 mt-4">
          <InfoList title="Datenquellen" empty="" rows={[
            { key: 'departures', label: 'Abfahrten', value: sources.departures.text, className: TONE_TEXT[sources.departures.tone] },
            { key: 'webuntis', label: 'WebUntis', value: sources.webuntis.text, className: TONE_TEXT[sources.webuntis.tone] },
            { key: 'disruptions', label: 'Störungsmeldungen', value: sources.disruptions.text, className: TONE_TEXT[sources.disruptions.tone] },
          ]} />
          <InfoList title="Demnächst" empty="Keine Ferien oder Termine eingetragen." rows={soon} />
        </div>
      )}

      {dialog === 'pair' && screens && (
        <PairDialog
          screens={screens.map((s) => ({ id: s.id, name: s.name, hasDevice: devicesError ? null : devices[s.id]?.id != null && !devices[s.id]?.legacy }))}
          onClose={() => setDialog(null)}
          onPaired={load}
        />
      )}
      {dialog === 'all-off' && (
        <ConfirmDialog
          title="Alle Bildschirme bis Tagesende aus?"
          body="Die Bildschirme gehen mit dem nächsten Zeitplan-Fenster wieder an, ohne Zeitplan morgen um 05:00."
          confirmLabel="Alle ausschalten"
          busy={busy}
          onConfirm={powerOffAll}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'emergency' && (
        <EmergencyDialog
          active={emergencyActive}
          currentText={settings?.emergency_text}
          currentNote={settings?.emergency_note}
          templates={templates}
          busy={busy}
          onTrigger={({ text, note }) => changeEmergency({ active: true, text, note })}
          onEnd={() => changeEmergency({ active: false })}
          onCancel={() => setDialog(null)}
        />
      )}
      {undo && (
        <UndoToast key={undo.id} message={undo.message} onUndo={() => runUndo(undo.revert)} onClose={() => setUndo(null)} />
      )}
    </div>
  )
}
