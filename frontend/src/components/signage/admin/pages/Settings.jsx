// Each changed part is saved with its own request because the permissions differ: WebUntis and
// weather need signage.setup, on-air signage.onair, emergency templates signage.emergency.
// Credentials are write-only: an empty field keeps the stored value.
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Copy, Plug, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button } from '../../../ui'
import { useUser } from '../../../../contexts/UserContext'
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
  COLOR_SCHEME_OPTIONS, ON_AIR_ANIMATION_HELP, ON_AIR_ANIMATION_OPTIONS, ON_AIR_FIELDS, SCHEME_FIELDS, SETUP_FIELDS,
  DEVICE_NUMBER_FIELDS, changedIn, checkSentence, deviceProblems, installCommand, legacyScreenNames, settingsPayload, sourceSentence, templateChangeCount, templateChanges, templateProblems,
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

function DevicesSection({ draft, set, disabled, readOnly, legacyNames }) {
  const ids = useMemo(() => Object.fromEntries(DEVICE_NUMBER_FIELDS.map((f) => [f.key, `device-${f.key}`])), [])
  const command = installCommand(window.location.origin)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      toast.success('Befehl kopiert')
    } catch {
      toast.error('Kopieren war nicht möglich. Den Befehl im Feld markieren und mit Strg+C kopieren.')
    }
  }
  const units = { device_offline_minutes: 'Minuten', warn_temperature_c: '°C', warn_disk_percent: '%', warn_wifi_dbm: 'dBm', warn_reboot_days: 'Tage' }
  const tokenHelp = legacyNames == null ? null
    : legacyNames.length ? `Noch mit altem Skript: ${legacyNames.join(', ')}.` : 'Aktuell meldet sich kein Bildschirm mit altem Skript. Ausgeschaltete Bildschirme mit altem Skript erscheinen hier nicht. Vor dem Einschalten prüfen, ob alle Pis den Agent nutzen.'
  return (
    <Section title="Geräte" data-section="devices" aside={readOnly ? readOnlyNote('die Einrichtung') : null}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEVICE_NUMBER_FIELDS.map(({ key, label, min, max }) => (
          <Field key={key} label={label} htmlFor={ids[key]} help={`${min} bis ${max} ${units[key]}`}>
            <input id={ids[key]} type="number" inputMode="numeric" min={min} max={max} step={1} value={draft[key] ?? ''} disabled={disabled}
              onChange={(e) => set(key, e.target.value)} className={fieldClass} />
          </Field>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-line-subtle">
        <Checkbox label="Nur Geräte mit Token zulassen" help={tokenHelp} checked={draft.require_device_token} disabled={disabled}
          onChange={(v) => set('require_device_token', v)} />
      </div>
      <div className="mt-5 pt-4 border-t border-line-subtle">
        <div className="text-sm font-medium text-fg mb-1.5">Installation auf dem Raspberry Pi</div>
        <div className="flex flex-wrap items-center gap-2">
          <code data-install-command className="flex-1 min-w-0 break-all bg-raised border border-line rounded-md px-3 py-2 text-xs font-mono text-fg">{command}</code>
          <Button icon={Copy} onClick={copy}>Kopieren</Button>
        </div>
      </div>
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

function ColorSchemeSection({ settings, draft, set, disabled, readOnly }) {
  const fromId = useId()
  const untilId = useId()
  const daylight = settings.daylight_today
  return (
    <Section title="Farbschema" data-section="color-scheme" aside={readOnly ? readOnlyNote('die Einrichtung') : null}>
      <div className="space-y-4">
        <div className="max-w-md">
          <Segmented label="Farbschema" options={COLOR_SCHEME_OPTIONS} value={draft.color_scheme} disabled={disabled} onChange={(v) => set('color_scheme', v)} />
        </div>
        {draft.color_scheme === 'daylight' && daylight && (
          <p className="text-sm text-fg-muted">Heute hell von {daylight.sunrise} bis {daylight.sunset}.</p>
        )}
        {draft.color_scheme === 'schedule' && (
          <div className="grid gap-4 sm:grid-cols-2 max-w-md">
            <Field label="Hell von" htmlFor={fromId}>
              <input id={fromId} type="time" value={draft.light_from ?? ''} disabled={disabled} onChange={(e) => set('light_from', e.target.value)} className={fieldClass} />
            </Field>
            <Field label="bis" htmlFor={untilId}>
              <input id={untilId} type="time" value={draft.light_until ?? ''} disabled={disabled} onChange={(e) => set('light_until', e.target.value)} className={fieldClass} />
            </Field>
          </div>
        )}
        <p className="text-xs text-fg-subtle">Einzelne Bildschirme können auf der Bildschirm-Seite immer hell oder immer dunkel bleiben.</p>
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
  const canSetup = hasPermission('signage.setup')
  const canOnAir = hasPermission('signage.onair')
  const canEmergency = hasPermission('signage.emergency')

  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [legacyNames, setLegacyNames] = useState(null)
  const [templates, setTemplates] = useState(null)       // saved
  const [templateList, setTemplateList] = useState([])   // draft
  const [clearing, setClearing] = useState(null)
  const [busy, setBusy] = useState(false)
  // Counts successful saves: even if only a secret was saved (values stay ''), the draft
  // starts over
  const [savedRound, setSavedRound] = useState(0)

  const fetchAll = useCallback(() => Promise.allSettled([
    api.getSettings(),
    canEmergency ? api.getEmergencyTemplates() : Promise.resolve(null),
    Promise.all([api.getDevices(), api.getScreens()]),
  ]), [canEmergency])

  const apply = useCallback(([settingsRes, templatesRes, devicesRes]) => {
    if (settingsRes.status === 'rejected') {
      setError(settingsRes.reason)
      return
    }
    setError(null)
    setSettings(settingsRes.value)
    // Without a device list the hint under the switch is omitted
    if (devicesRes.status === 'fulfilled') setLegacyNames(legacyScreenNames(devicesRes.value[0], devicesRes.value[1]))
    if (templatesRes.status === 'fulfilled' && templatesRes.value) {
      const sorted = [...templatesRes.value].sort((x, y) => x.sort_order - y.sort_order)
      setTemplates(sorted)
      setTemplateList(sorted)
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetchAll().then((results) => { if (alive) apply(results) })
    return () => { alive = false }
  }, [fetchAll, apply])

  // New baseline when the values change or after a save; a changed *_set switch (remove)
  // does not reset the draft
  const originalKey = settings ? JSON.stringify([savedRound, pick(settings, [...SETUP_FIELDS, ...ON_AIR_FIELDS, ...SCHEME_FIELDS])]) : null
  const settingsOriginal = useMemo(() => (originalKey ? JSON.parse(originalKey)[1] : null), [originalKey])
  const values = useDraft(settingsOriginal)

  const setupCount = settings ? changedIn(settingsOriginal, values.draft, SETUP_FIELDS) : 0
  const schemeCount = settings ? changedIn(settingsOriginal, values.draft, SCHEME_FIELDS) : 0
  const onAirCount = settings ? changedIn(settingsOriginal, values.draft, ON_AIR_FIELDS) : 0
  const templateCount = templates ? templateChangeCount(templates, templateList) : 0
  const dirtyCount = setupCount + schemeCount + onAirCount + templateCount
  const webuntisDirty = settings ? changedIn(settingsOriginal, values.draft, WEBUNTIS_FIELDS) > 0 : false
  useUnsavedGuard(dirtyCount > 0)

  const saveAll = async () => {
    if (templateCount) {
      const problem = templateProblems(templateList)
      if (problem) { toast.error(problem); return }
    }
    if (setupCount) {
      const problem = deviceProblems(settingsOriginal, values.draft)
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
    // Settings: apply only after both requests, otherwise the first response would reset the second one's draft.
    // If one fails the draft stays; saving again sends the same values once more.
    let latest = null
    let settingsFailed = false
    for (const [count, fields] of [[setupCount, SETUP_FIELDS], [schemeCount, SCHEME_FIELDS], [onAirCount, ON_AIR_FIELDS]]) {
      if (!count) continue
      const result = await run(() => api.updateSettings(settingsPayload(settingsOriginal, values.draft, fields)))
      if (result) latest = result
      else settingsFailed = true
    }
    if (latest && !settingsFailed) {
      setSettings(latest)
      setSavedRound((n) => n + 1)
    }
    if (templateCount) {
      await run(async () => {
        const { create, update, remove } = templateChanges(templates, templateList)
        for (const id of remove) await api.deleteEmergencyTemplate(id)
        for (const { id, body } of update) await api.updateEmergencyTemplate(id, body)
        for (const body of create) await api.createEmergencyTemplate(body)
      })
      // Always take the server state so saving again creates nothing twice
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
    setTemplateList(templates ?? [])
  }

  const clearSecret = async () => {
    setBusy(true)
    try {
      await api.updateSettings({ [`${clearing}_clear`]: true })
      // Take only the switch; unsaved changes to the other fields stay in the draft
      setSettings((s) => ({ ...s, [`${clearing}_set`]: false }))
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
          {canEmergency && templates && <TemplatesSection list={templateList} setList={setTemplateList} />}
          <ColorSchemeSection settings={settings} draft={values.draft} set={values.set} disabled={setupDisabled} readOnly={!canSetup} />
          <OnAirSection draft={values.draft} set={values.set} disabled={onAirDisabled} readOnly={!canOnAir} />
          <WeatherSection settings={settings} draft={values.draft} set={values.set} disabled={setupDisabled} readOnly={!canSetup}
            onClear={() => setClearing('weather_api_key')} />
          <DevicesSection draft={values.draft} set={values.set} disabled={setupDisabled} readOnly={!canSetup} legacyNames={legacyNames} />
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
