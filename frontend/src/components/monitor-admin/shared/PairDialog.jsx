// Dialog "Bildschirm koppeln" (Spec §3.1, §8): Schritt 1 Code vom Bildschirm, Schritt 2 vorhandener oder neuer Bildschirm.
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../ui'
import { Field, Segmented, fieldClass } from './form'
import { errorText } from './errorText'
import { isCompleteCode, normalizeCode } from './deviceStatus'
import * as api from './api'

const MODES = [
  { value: 'existing', label: 'Vorhandener Bildschirm' },
  { value: 'new', label: 'Neuer Bildschirm' },
]

// screens: [{ id, name, hasDevice? }] (hasDevice null = unbekannt, die Geräteliste ließ sich nicht laden); onPaired lädt die Liste neu, onClose schließt
export default function PairDialog({ screens, onClose, onPaired }) {
  const titleId = useId()
  const codeId = useId()
  const screenId = useId()
  const nameId = useId()
  const locationId = useId()
  const [step, setStep] = useState(1)
  const [code, setCode] = useState('')
  const [mode, setMode] = useState(screens.length ? 'existing' : 'new')
  const [existingId, setExistingId] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  // Fokus auf das erste Bedienelement des Schritts (Code, Auswahl oder Name)
  useEffect(() => { dialogRef.current?.querySelector('input, select')?.focus() }, [step, mode])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (!busy) onClose?.() }
  }

  const replaced = screens.find((s) => String(s.id) === existingId)
  const ready = mode === 'existing' ? existingId !== '' : name.trim() !== ''

  const pair = async (e) => {
    e.preventDefault()
    if (!ready || busy) return
    const target = mode === 'existing' ? { screen_id: Number(existingId) } : { new_screen: { name: name.trim(), location: location.trim() } }
    setBusy(true)
    setError('')
    try {
      await api.pairDevice({ code: normalizeCode(code), ...target })
      toast.success(`Bildschirm ${mode === 'existing' ? replaced?.name : name.trim()} ist gekoppelt.`)
      onPaired?.()
      onClose?.()
    } catch (err) {
      if (mounted.current) {
        setError(errorText(err, 'Das Koppeln ist fehlgeschlagen. Bitte erneut versuchen.'))
        // Fehler des Codes (ungültig, abgelaufen, zu viele Versuche): zurück zur Codeeingabe
        if (err?.response?.status === 400 || err?.response?.status === 429) setStep(1)
      }
    }
    if (mounted.current) setBusy(false)
  }

  const next = (e) => {
    e.preventDefault()
    if (isCompleteCode(code)) { setError(''); setStep(2) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onKeyDown={onKeyDown}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}>
      <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-pair-dialog={step}
        onSubmit={step === 1 ? next : pair}
        className="bg-overlay border border-line rounded-lg shadow-overlay max-w-md w-full p-5">
        <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight text-fg">Bildschirm koppeln</h2>
        <p className="mt-1 text-xs text-fg-subtle">Schritt {step} von 2</p>

        {step === 1 ? (
          <div className="mt-4">
            <Field label="Kopplungscode" htmlFor={codeId} help="Den Code zeigt der Raspberry Pi nach der Installation auf seinem Bildschirm. Er gilt 15 Minuten.">
              <input id={codeId} className={`${fieldClass} font-display text-2xl tracking-[0.2em] tabular-nums`} inputMode="numeric"
                autoComplete="off" placeholder="482 913" maxLength={9} value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <Segmented label="Zuordnung" options={MODES} value={mode} onChange={(m) => { setMode(m); setError('') }} disabled={busy} />
            {mode === 'existing' ? (
              <Field label="Bildschirm" htmlFor={screenId}
                help={replaced?.hasDevice === null
                  ? 'Ob dieser Bildschirm schon ein Gerät hat, ließ sich nicht laden. Hat er eines, verliert das alte Gerät damit seinen Zugang.'
                  : replaced?.hasDevice ? 'Dieser Bildschirm hat schon ein Gerät. Das alte Gerät verliert damit seinen Zugang.' : undefined}>
                <select id={screenId} className={fieldClass} value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                  <option value="">Bildschirm wählen</option>
                  {screens.map((s) => <option key={s.id} value={s.id}>{s.name}{s.hasDevice ? ' (Gerät gekoppelt)' : ''}</option>)}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Name" htmlFor={nameId}>
                  <input id={nameId} name="name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Foyer" />
                </Field>
                <Field label="Ort" htmlFor={locationId}>
                  <input id={locationId} name="location" className={fieldClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Eingangshalle" />
                </Field>
              </>
            )}
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-bad">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {step === 2 && <Button variant="ghost" type="button" disabled={busy} onClick={() => { setStep(1); setError('') }}>Zurück</Button>}
          <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>Abbrechen</Button>
          {step === 1 ? (
            <Button variant="primary" type="submit" disabled={!isCompleteCode(code)}>Weiter</Button>
          ) : (
            <Button variant="primary" type="submit" disabled={!ready || busy}>Koppeln</Button>
          )}
        </div>
      </form>
    </div>
  )
}
