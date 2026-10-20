// Einstellungen (Spec §6.2): WebUntis-Zugang mit "Verbindung testen", ÖPNV-Grundeinstellungen und Störungsfilter,
// Notfall-Vorlagen (sortierbar), On-Air-Darstellung und Wetter-Schlüssel. Eine SaveBar für die ganze Seite; jeder
// geänderte Teil wird mit eigener Anfrage gespeichert, weil die Rechte getrennt sind: WebUntis, ÖPNV und Wetter
// brauchen monitor.setup, On-Air monitor.onair, Notfall-Vorlagen monitor.emergency. Ohne Recht ist ein Abschnitt
// nur lesend (Notfall-Vorlagen und ÖPNV fehlen dann ganz, weil schon das Lesen das Recht braucht).
// Zugangsdaten sind write-only (Ruling R22): ein leeres Feld behält den gespeicherten Wert.
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Eye, EyeOff, Plug, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button, StatusBadge } from '../../ui'
import { useUser } from '../../../contexts/UserContext'
import { useDraft } from '../shared/useDraft'
import SaveBar from '../shared/SaveBar'
import ConfirmDialog from '../shared/ConfirmDialog'
import DragHandle from '../shared/DragHandle'
import { dragRowClass, useListDrag } from '../shared/useListDrag'
import { useUnsavedGuard } from '../shared/UnsavedChangesProvider'
import { errorText } from '../shared/errorText'
import { Checkbox, Field, Section, Segmented, fieldClass } from '../shared/form'
import { formatDayTime } from '../shared/explain'
import { moveItem } from './viewData'
import {
  ON_AIR_ANIMATION_HELP, ON_AIR_ANIMATION_OPTIONS, ON_AIR_FIELDS, SETUP_FIELDS, TRANSIT_DURATION, TRANSIT_FIELDS,
  changedIn, checkSentence, departureViews, settingsPayload, sourceSentence, templateChangeCount, templateChanges,
  templateProblems, transitPayload, transitProblem,
} from './settingsData'
import * as api from '../shared/api'

const WEBUNTIS_FIELDS = ['webuntis_server', 'webuntis_school', 'webuntis_username', 'webuntis_password']
const TONE_TEXT = { ok: 'text-ok', bad: 'text-bad' }

const readOnlyNote = (what) => <span className="text-xs text-fg-subtle">Nur lesend, Recht für {what} fehlt</span>

function SecretInput({ id, value, onChange, isSet, disabled, label }) {
  return (
    <input id={id} type="password" autoComplete="new-password" value={value ?? ''} disabled={disabled} aria-label={label}
      placeholder={isSet ? 'Gespeichert' : 'Nicht gesetzt'} onChange={(e) => onChange(e.target.value)} className={fieldClass} />
  )
}

function WebuntisSection({ settings, draft, set, disabled, readOnly, dirty, onClear }) {
  const ids = { server: useId(), school: useId(), user: useId(), password: useId() }
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)

  const test = async () => {
    setChecking(true)
    try {
      setResult(checkSentence(await api.checkWebuntis(), null, settings))
    } catch (e) {
      setResult(checkSentence(null, e, settings))
    }
    setChecking(false)
  }

  return (
    <Section title="WebUntis" data-section="webuntis" aside={readOnly ? readOnlyNote('die Einrichtung') : null}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Server" htmlFor={ids.server} help="Nur der Name, zum Beispiel neilo.webuntis.com.">
          <input id={ids.server} value={draft.webuntis_server ?? ''} disabled={disabled} onChange={(e) => set('webuntis_server', e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Schule" htmlFor={ids.school} help="Schulname wie in der WebUntis-Adresse.">
          <input id={ids.school} value={draft.webuntis_school ?? ''} disabled={disabled} onChange={(e) => set('webuntis_school', e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Benutzer" htmlFor={ids.user}>
          <input id={ids.user} value={draft.webuntis_username ?? ''} disabled={disabled} autoComplete="off" onChange={(e) => set('webuntis_username', e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Passwort" htmlFor={ids.password}>
          <SecretInput id={ids.password} value={draft.webuntis_password} isSet={settings.webuntis_password_set} disabled={disabled}
            onChange={(v) => set('webuntis_password', v)} />
          <p className="text-xs text-fg-subtle mt-1.5">
            {settings.webuntis_password_set ? 'Leer lassen, um das gespeicherte Passwort zu behalten.' : 'Wird gespeichert und danach nicht mehr angezeigt.'}
          </p>
          {settings.webuntis_password_set && !disabled && (
            <button type="button" onClick={onClear} className="mt-1 text-xs text-fg-muted hover:text-bad focus:outline-none focus-visible:underline">
              Gespeichertes Passwort entfernen
            </button>
          )}
        </Field>
      </div>
      <div className="mt-5 pt-4 border-t border-line-subtle">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={Plug} onClick={test} disabled={checking || dirty || readOnly}>{checking ? 'Testet…' : 'Verbindung testen'}</Button>
          {result && <p className={`text-sm ${TONE_TEXT[result.tone]}`} role="status" data-check-result={result.tone}>{result.text}</p>}
        </div>
        <p className="text-xs text-fg-subtle mt-2">
          {dirty
            ? 'Erst speichern, dann testen: der Test nutzt die gespeicherten Zugangsdaten.'
            : result
              ? 'Die Bildschirme nutzen ab jetzt diese Quelle.'
              : settings.webuntis_checked_at
              ? `Zuletzt getestet ${formatDayTime(settings.webuntis_checked_at)}: ${sourceSentence(settings.webuntis_source)}`
              : sourceSentence(settings.webuntis_source)}
        </p>
      </div>
    </Section>
  )
}

function TransitSection({ views, viewId, onViewChange, draft, set, disruptions, disruptionsError, disabled }) {
  const ids = { view: useId(), duration: useId() }
  const hidden = draft?.transit_disruption_hidden ?? []
  const toggleHidden = (id) => set('transit_disruption_hidden', hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id])
  return (
    <Section title="ÖPNV" data-section="transit">
      {views.length === 0 ? (
        <p className="text-sm text-fg-subtle">Keine Ansicht zeigt Abfahrten. Abfahrts-Ansichten entstehen unter Ansichten.</p>
      ) : (
        <div className="space-y-5">
          <Field label="Ansicht" htmlFor={ids.view} help="Die Werte gelten für diese Abfahrts-Ansicht. Haltestellen und Linien stehen in der Ansicht selbst.">
            <select id={ids.view} value={viewId ?? ''} onChange={(e) => onViewChange(Number(e.target.value))} className={fieldClass}>
              {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          {draft && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vorausschau" htmlFor={ids.duration} help="So viele Minuten im Voraus werden Abfahrten abgefragt.">
                  <div className="relative">
                    <input id={ids.duration} type="number" min={TRANSIT_DURATION.min} max={TRANSIT_DURATION.max} disabled={disabled}
                      value={draft.transit_duration ?? ''} onChange={(e) => set('transit_duration', e.target.value === '' ? '' : Number(e.target.value))}
                      className={`${fieldClass} pr-14 tabular-nums`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle pointer-events-none">min</span>
                  </div>
                </Field>
                <Field label="Quellen">
                  <div className="space-y-2 pt-1">
                    <Checkbox label="Deutsche Bahn" checked={draft.transit_source_db} disabled={disabled} onChange={(v) => set('transit_source_db', v)} />
                    <Checkbox label="NAH.SH" checked={draft.transit_source_nahsh} disabled={disabled} onChange={(v) => set('transit_source_nahsh', v)} />
                  </div>
                </Field>
              </div>
              <Checkbox label="Zwischenhalte anzeigen" help="Zeigt unter dem Ziel die nächsten Halte, sofern die Quelle sie liefert."
                checked={draft.transit_show_via} disabled={disabled} onChange={(v) => set('transit_show_via', v)} />
              <div>
                <div className="text-sm font-medium text-fg mb-1.5">Störungsfilter</div>
                <p className="text-xs text-fg-subtle mb-2">Ausgeblendete Meldungen erscheinen nicht auf dem Bildschirm. Endet eine Meldung beim Anbieter, fällt sie aus der Liste.</p>
                {disruptionsError ? (
                  <p className="text-sm text-bad">Störungen konnten nicht geladen werden. {errorText(disruptionsError, 'Bitte später erneut versuchen.')}</p>
                ) : disruptions == null ? null : disruptions.length === 0 ? (
                  <p className="text-sm text-fg-subtle">Aktuell keine Störungen.</p>
                ) : (
                  <ul className="divide-y divide-line-subtle border-y border-line-subtle" data-disruptions>
                    {disruptions.map((d) => {
                      const isHidden = hidden.includes(d.id)
                      return (
                        <li key={d.id} className="flex items-start gap-3 py-2.5" data-disruption-hidden={isHidden ? '' : undefined}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <StatusBadge label={d.kind === 'construction' ? 'Baumaßnahme' : 'Störung'} tone={d.kind === 'construction' ? 'warning' : 'danger'} />
                              {d.lines?.length > 0 && <span className="text-xs text-fg-muted truncate">{d.lines.join(', ')}</span>}
                            </div>
                            <div className={`text-sm mt-1 ${isHidden ? 'text-fg-subtle line-through' : 'text-fg'}`}>{d.title}</div>
                          </div>
                          <Button size="sm" variant="ghost" icon={isHidden ? Eye : EyeOff} disabled={disabled} onClick={() => toggleHidden(d.id)}>
                            {isHidden ? 'Einblenden' : 'Ausblenden'}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Section>
  )
}

let nextTemplateKey = 0

function TemplatesSection({ list, setList }) {
  const drag = useListDrag(list.length, (a, b) => setList(moveItem(list, a, b)))
  const update = (i, patch) => setList(list.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  return (
    <Section title="Notfall-Vorlagen" data-section="emergency-templates"
      aside={list.length > 1 ? <span className="text-xs text-fg-subtle">Reihenfolge per Ziehen</span> : null}>
      <p className="text-sm text-fg-muted -mt-2 mb-3">Erscheinen in dieser Reihenfolge im Notfall-Dialog der Übersicht.</p>
      {list.length ? (
        <ol className="divide-y divide-line-subtle" data-templates>
          {list.map((t, i) => {
            const label = t.title?.trim() || `Vorlage ${i + 1}`
            return (
              <li key={t.id ?? t.key} {...drag.rowProps(i)} className={`flex items-start gap-2 py-3 ${dragRowClass}`}>
                <div className="pt-1.5"><DragHandle label={`${label} verschieben`} onKeyDown={drag.handleKeyDown(i)} /></div>
                <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <input aria-label={`Titel von ${label}`} value={t.title} placeholder="Titel" onChange={(e) => update(i, { title: e.target.value })}
                    className={`${fieldClass} ${t.title?.trim() ? '' : 'border-bad'}`} />
                  <input aria-label={`Text von ${label}`} value={t.text} placeholder="Text auf dem Bildschirm" onChange={(e) => update(i, { text: e.target.value })}
                    className={`${fieldClass} ${t.text?.trim() ? '' : 'border-bad'}`} />
                  <input aria-label={`Hinweis von ${label}`} value={t.note ?? ''} placeholder="Hinweis, zum Beispiel Sammelplatz" onChange={(e) => update(i, { note: e.target.value })}
                    className={`${fieldClass} sm:col-start-2`} />
                </div>
                <button type="button" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label={`${label} entfernen`} title={`${label} entfernen`}
                  className="mt-1 p-1.5 rounded-md text-fg-subtle hover:text-bad hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-sm text-fg-subtle">Noch keine Vorlagen. Ohne Vorlage wird der Text im Notfall-Dialog frei eingegeben.</p>
      )}
      <Button size="sm" variant="ghost" icon={Plus} className="mt-3"
        onClick={() => setList([...list, { key: `new-${++nextTemplateKey}`, title: '', text: '', note: '' }])}>
        Vorlage hinzufügen
      </Button>
    </Section>
  )
}

function OnAirSection({ draft, set, disabled, readOnly }) {
  const textId = useId()
  return (
    <Section title="On-Air" data-section="on-air" aside={readOnly ? readOnlyNote('On-Air') : null}>
      <div className="space-y-5">
        <Field label="Text" htmlFor={textId} help="Steht groß auf dem Schild, solange On-Air an ist.">
          <input id={textId} value={draft.on_air_text ?? ''} maxLength={100} disabled={disabled} onChange={(e) => set('on_air_text', e.target.value)} className={`${fieldClass} max-w-sm`} />
        </Field>
        <Field label="Animation" help={ON_AIR_ANIMATION_HELP[draft.on_air_animation]}>
          <div className="max-w-sm">
            <Segmented label="Animation" options={ON_AIR_ANIMATION_OPTIONS} value={draft.on_air_animation} disabled={disabled} onChange={(v) => set('on_air_animation', v)} />
          </div>
        </Field>
        <Checkbox label="Uhr anzeigen" help="Zeigt die aktuelle Uhrzeit unter dem Schild." checked={draft.on_air_show_clock} disabled={disabled}
          onChange={(v) => set('on_air_show_clock', v)} />
      </div>
    </Section>
  )
}

function WeatherSection({ settings, draft, set, disabled, readOnly, onClear }) {
  const keyId = useId()
  return (
    <Section title="Wetter" data-section="weather" aside={readOnly ? readOnlyNote('die Einrichtung') : null}>
      <Field label="Schlüssel" htmlFor={keyId}>
        <div className="max-w-sm">
          <SecretInput id={keyId} value={draft.weather_api_key} isSet={settings.weather_api_key_set} disabled={disabled} onChange={(v) => set('weather_api_key', v)} />
        </div>
        <p className="text-xs text-fg-subtle mt-1.5">
          {settings.weather_api_key_set ? 'Schlüssel von OpenWeatherMap. Leer lassen, um den gespeicherten zu behalten.' : 'Schlüssel von OpenWeatherMap; ohne ihn bleibt die Wetteranzeige leer.'}
        </p>
        {settings.weather_api_key_set && !disabled && (
          <button type="button" onClick={onClear} className="mt-1 text-xs text-fg-muted hover:text-bad focus:outline-none focus-visible:underline">
            Gespeicherten Schlüssel entfernen
          </button>
        )}
      </Field>
    </Section>
  )
}

const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj?.[f] ?? '']))
const CLEAR = {
  webuntis_password: { title: 'Passwort entfernen?', body: 'Ohne Passwort ruft das System keine Vertretungen mehr ab; die Bildschirme zeigen dann die Rückfall-Links.' },
  weather_api_key: { title: 'Schlüssel entfernen?', body: 'Ohne Schlüssel bleibt die Wetteranzeige leer.' },
}

export default function Settings() {
  const { hasPermission } = useUser()
  const canSetup = hasPermission('monitor.setup')
  const canOnAir = hasPermission('monitor.onair')
  const canEmergency = hasPermission('monitor.emergency')

  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [templates, setTemplates] = useState(null)       // gespeichert
  const [templateList, setTemplateList] = useState([])   // Entwurf
  const [views, setViews] = useState([])
  const [viewId, setViewId] = useState(null)
  const [transitView, setTransitView] = useState(null)
  const [disruptions, setDisruptions] = useState(null)
  const [disruptionsError, setDisruptionsError] = useState(null)
  const [clearing, setClearing] = useState(null)
  const [busy, setBusy] = useState(false)

  const fetchAll = useCallback(() => Promise.allSettled([
    api.getSettings(),
    canEmergency ? api.getEmergencyTemplates() : Promise.resolve(null),
    canSetup ? api.getViews() : Promise.resolve([]),
  ]), [canEmergency, canSetup])

  const apply = useCallback(([settingsRes, templatesRes, viewsRes]) => {
    if (settingsRes.status === 'rejected') {
      setError(settingsRes.reason)
      return
    }
    setError(null)
    setSettings(settingsRes.value)
    if (templatesRes.status === 'fulfilled' && templatesRes.value) {
      const sorted = [...templatesRes.value].sort((x, y) => x.sort_order - y.sort_order)
      setTemplates(sorted)
      setTemplateList(sorted)
    }
    if (viewsRes.status === 'fulfilled') {
      const list = departureViews(viewsRes.value)
      setViews(list)
      setViewId((current) => (list.some((v) => v.id === current) ? current : list[0]?.id ?? null))
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetchAll().then((results) => { if (alive) apply(results) })
    return () => { alive = false }
  }, [fetchAll, apply])

  // Gewählte Abfahrts-Ansicht laden (Felder und aktuelle Störungen); beim Wechsel zählt nur die letzte Antwort
  useEffect(() => {
    if (viewId == null) return undefined
    let alive = true
    Promise.allSettled([api.getView(viewId), api.getDisruptions(viewId)]).then(([viewRes, disruptionsRes]) => {
      if (!alive) return
      if (viewRes.status === 'fulfilled') setTransitView(viewRes.value)
      else toast.error(errorText(viewRes.reason))
      setDisruptions(disruptionsRes.status === 'fulfilled' ? disruptionsRes.value : null)
      setDisruptionsError(disruptionsRes.status === 'rejected' ? disruptionsRes.reason : null)
    })
    return () => { alive = false }
  }, [viewId])

  const settingsOriginal = useMemo(() => (settings ? pick(settings, [...SETUP_FIELDS, ...ON_AIR_FIELDS]) : null), [settings])
  const transitOriginal = useMemo(() => (transitView ? pick(transitView, TRANSIT_FIELDS) : null), [transitView])
  const values = useDraft(settingsOriginal)
  const transit = useDraft(transitOriginal)

  const setupCount = settings ? changedIn(settingsOriginal, values.draft, SETUP_FIELDS) : 0
  const onAirCount = settings ? changedIn(settingsOriginal, values.draft, ON_AIR_FIELDS) : 0
  const transitCount = transitOriginal ? Object.keys(transitPayload(transitOriginal, transit.draft)).length : 0
  const templateCount = templates ? templateChangeCount(templates, templateList) : 0
  const dirtyCount = setupCount + onAirCount + transitCount + templateCount
  const webuntisDirty = settings ? changedIn(settingsOriginal, values.draft, WEBUNTIS_FIELDS) > 0 : false
  useUnsavedGuard(dirtyCount > 0)

  const changeView = (id) => {
    if (transitCount && !window.confirm('Die ÖPNV-Änderungen der bisherigen Ansicht gehen verloren. Trotzdem wechseln?')) return
    setTransitView(null)
    setDisruptions(null)
    setDisruptionsError(null)
    setViewId(id)
  }

  const saveAll = async () => {
    if (transitCount) {
      const problem = transitProblem(transit.draft)
      if (problem) { toast.error(problem); return }
    }
    if (templateCount) {
      const problem = templateProblems(templateList)
      if (problem) { toast.error(problem); return }
    }
    setBusy(true)
    let failed = false
    const run = async (fn) => {
      try {
        return await fn()
      } catch (e) {
        failed = true
        toast.error(errorText(e))
        return null
      }
    }
    // Einstellungen: erst nach beiden Anfragen übernehmen, sonst setzte die erste Antwort den Entwurf der zweiten zurück.
    // Schlägt eine fehl, bleibt der Entwurf stehen; erneutes Speichern schickt dieselben Werte noch einmal.
    let latest = null
    let settingsFailed = false
    for (const [count, fields] of [[setupCount, SETUP_FIELDS], [onAirCount, ON_AIR_FIELDS]]) {
      if (!count) continue
      const result = await run(() => api.updateSettings(settingsPayload(settingsOriginal, values.draft, fields)))
      if (result) latest = result
      else settingsFailed = true
    }
    if (latest && !settingsFailed) setSettings(latest)
    if (transitCount) {
      const updated = await run(() => api.updateView(viewId, transitPayload(transitOriginal, transit.draft)))
      if (updated) setTransitView(updated)
    }
    if (templateCount) {
      await run(async () => {
        const { create, update, remove } = templateChanges(templates, templateList)
        for (const id of remove) await api.deleteEmergencyTemplate(id)
        for (const { id, body } of update) await api.updateEmergencyTemplate(id, body)
        for (const body of create) await api.createEmergencyTemplate(body)
      })
      // Immer den Stand des Servers übernehmen, damit ein erneutes Speichern nichts doppelt anlegt
      try {
        const fresh = [...await api.getEmergencyTemplates()].sort((a, b) => a.sort_order - b.sort_order)
        setTemplates(fresh)
        setTemplateList(fresh)
      } catch (e) {
        toast.error(errorText(e))
      }
    }
    if (!failed) toast.success('Gespeichert')
    setBusy(false)
  }

  const discard = () => {
    values.reset()
    transit.reset()
    setTemplateList(templates ?? [])
  }

  const clearSecret = async () => {
    setBusy(true)
    try {
      const updated = await api.updateSettings({ [`${clearing}_clear`]: true })
      setSettings(updated)
      setClearing(null)
      toast.success('Entfernt')
    } catch (e) {
      toast.error(errorText(e))
    }
    setBusy(false)
  }

  const state = error ? 'error' : settings ? 'ready' : 'loading'
  const setupDisabled = !canSetup || busy
  const onAirDisabled = !canOnAir || busy

  return (
    <div data-admin-page="settings" data-state={state}>
      <PageHeader title="Einstellungen" />
      {error ? (
        <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
          Die Einstellungen konnten nicht geladen werden. {errorText(error, 'Bitte die Seite neu laden.')}
        </div>
      ) : settings && values.draft ? (
        <div className="space-y-4 max-w-4xl">
          <WebuntisSection settings={settings} draft={values.draft} set={values.set} disabled={setupDisabled} readOnly={!canSetup}
            dirty={webuntisDirty} onClear={() => setClearing('webuntis_password')} />
          {canSetup && (
            <TransitSection views={views} viewId={viewId} onViewChange={changeView} draft={transit.draft} set={transit.set}
              disruptions={disruptions} disruptionsError={disruptionsError} disabled={busy} />
          )}
          {canEmergency && templates && <TemplatesSection list={templateList} setList={setTemplateList} />}
          <OnAirSection draft={values.draft} set={values.set} disabled={onAirDisabled} readOnly={!canOnAir} />
          <WeatherSection settings={settings} draft={values.draft} set={values.set} disabled={setupDisabled} readOnly={!canSetup}
            onClear={() => setClearing('weather_api_key')} />
          <SaveBar count={dirtyCount} onSave={saveAll} onDiscard={discard} saving={busy} />
        </div>
      ) : null}
      {clearing && (
        <ConfirmDialog title={CLEAR[clearing].title} body={CLEAR[clearing].body} confirmLabel="Entfernen" tone="danger" busy={busy}
          onConfirm={clearSecret} onCancel={() => setClearing(null)} />
      )}
    </div>
  )
}
