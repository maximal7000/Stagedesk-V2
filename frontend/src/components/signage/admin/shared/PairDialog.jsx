import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../../ui'
import { Field, Segmented, fieldClass } from './form'
import { errorText } from './errorText'
import { isCompleteCode, normalizeCode } from './deviceStatus'
import * as api from './api'

const MODES = [
  { value: 'existing', label: 'Vorhandener Bildschirm' },
  { value: 'new', label: 'Neuer Bildschirm' },
]

// Six single fields grouped 3 + 3 as on the Pi ("482 913"). cells: array of six chars, empty = ''; gaps are kept.
const EMPTY_CELLS = ['', '', '', '', '', '']

function CodeInput({ cells, onChange }) {
  const groupRef = useRef(null)
  const focusAt = (i) => {
    const el = groupRef.current?.querySelector(`[data-code-index="${Math.max(0, Math.min(5, i))}"]`)
    el?.focus()
    el?.select?.()
  }
  const put = (i, typed) => {
    if (!typed) return
    const next = [...cells]
    const chunk = typed.slice(0, 6 - i)
    chunk.split('').forEach((d, k) => { next[i + k] = d })
    onChange(next)
    focusAt(Math.min(i + chunk.length, 5))
  }
  const clear = (i) => onChange(cells.map((c, k) => (k === i ? '' : c)))
  const onInput = (i) => (e) => {
    const raw = e.target.value
    if (raw === '') { clear(i); return }
    const old = cells[i]
    // Newly typed digit: remove the old character once, wherever the cursor was
    const typed = normalizeCode(old && raw.includes(old) && raw.length === 2 ? raw.replace(old, '') : raw)
    if (typed) put(i, typed.length <= 2 ? typed.slice(-1) : typed)
  }
  const onKey = (i) => (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (cells[i]) clear(i)
      else if (i > 0) { clear(i - 1); focusAt(i - 1) }
    } else if (e.key === 'Delete') { e.preventDefault(); clear(i) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(i - 1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(i + 1) }
  }
  return (
    <div ref={groupRef} role="group" aria-label="Kopplungscode" className="flex items-center gap-2">
      {cells.map((c, i) => (
        <input key={i} data-code-index={i} aria-label={`Ziffer ${i + 1} von 6`} type="text" inputMode="numeric" autoComplete="one-time-code"
          value={c} onChange={onInput(i)} onKeyDown={onKey(i)} onFocus={(e) => e.target.select()}
          onPaste={(e) => { e.preventDefault(); put(i, normalizeCode(e.clipboardData.getData('text'))) }}
          className={`${fieldClass} !w-11 px-0 text-center font-display text-2xl tabular-nums ${i === 3 ? 'ml-4' : ''}`} />
      ))}
    </div>
  )
}

export default function PairDialog({ screens, onClose, onPaired }) {
  const titleId = useId()
  const screenId = useId()
  const nameId = useId()
  const locationId = useId()
  const [step, setStep] = useState(1)
  const [cells, setCells] = useState(EMPTY_CELLS)
  const code = cells.join('')
  const [mode, setMode] = useState(screens.length ? 'existing' : 'new')
  const [existingId, setExistingId] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const codeFocus = useRef(null)
  useEffect(() => {
    const root = dialogRef.current
    if (!root) return
    if (step === 1) {
      const at = codeFocus.current ?? (cells.indexOf('') === -1 ? 5 : cells.indexOf(''))
      codeFocus.current = null
      root.querySelector(`[data-code-index="${at}"]`)?.focus()
    } else {
      root.querySelector('input, select')?.focus()
    }
    // code deliberately not in the deps: focus only on step change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode])

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
        if (err?.response?.status === 400 || err?.response?.status === 429) { codeFocus.current = 0; setStep(1) }
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
            <div className="text-sm font-medium text-fg mb-1.5">Kopplungscode</div>
            <CodeInput cells={cells} onChange={setCells} />
            <p className="text-xs text-fg-subtle mt-1.5">Den Code zeigt der Raspberry Pi nach der Installation auf seinem Bildschirm. Er gilt 15 Minuten.</p>
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
