// Notfall-Dialog (Spec §6.2): Vorlage wählen oder Text frei eingeben, dazu ein Zusatz. "Weiter" führt zur
// zweiten Bestätigung. Ist der Notfall aktiv, bietet der Dialog nur "Notfall beenden".
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../../ui'
import ConfirmDialog from './ConfirmDialog'

const FREE = 'free'

const fieldClass = 'w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-sm text-fg'

function Shell({ titleId, onCancel, children }) {
  const onCancelRef = useRef(onCancel)
  useEffect(() => { onCancelRef.current = onCancel })
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancelRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} data-emergency-dialog
        className="bg-overlay border border-line rounded-lg shadow-overlay max-w-lg w-full p-5 max-h-[calc(100vh-2rem)] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

function TemplateOption({ checked, onSelect, title, text, name }) {
  return (
    <label className={`flex gap-3 items-start rounded-md px-3 py-2.5 cursor-pointer border ${checked ? 'border-line-strong bg-raised' : 'border-transparent hover:bg-raised'}`}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1 accent-accent" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        {text && <span className="block text-xs text-fg-muted truncate">{text}</span>}
      </span>
    </label>
  )
}

export default function EmergencyDialog({ active = false, currentText = '', currentNote = '', templates, busy = false, onTrigger, onEnd, onCancel }) {
  const titleId = useId()
  const groupName = useId()
  const [choice, setChoice] = useState(FREE)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Erste Vorlage vorauswählen, sobald die Liste da ist
  const [preselected, setPreselected] = useState(false)
  if (!preselected && templates?.length) {
    setPreselected(true)
    setChoice(templates[0].id)
    setText(templates[0].text)
    setNote(templates[0].note || '')
  }

  if (active) {
    return (
      <ConfirmDialog
        title="Notfall beenden?"
        body={(
          <>
            <p>Die Bildschirme zeigen danach wieder ihre Ansichten und folgen ihren Zeitplänen.</p>
            {currentText && <p className="mt-2 text-fg">Aktuelle Meldung: {currentText}</p>}
            {currentNote && <p className="text-fg-muted">{currentNote}</p>}
          </>
        )}
        confirmLabel="Notfall beenden"
        busy={busy}
        onConfirm={onEnd}
        onCancel={onCancel}
      />
    )
  }

  if (confirming) {
    return (
      <ConfirmDialog
        title="Notfall auslösen"
        body={(
          <>
            <p>Notfall auf allen Bildschirmen anzeigen und ausgeschaltete Bildschirme einschalten?</p>
            <p className="mt-3 text-fg font-medium">{text.trim()}</p>
            {note.trim() && <p className="text-fg-muted">{note.trim()}</p>}
          </>
        )}
        confirmLabel="Notfall auslösen"
        tone="danger"
        busy={busy}
        onConfirm={() => onTrigger?.({ text: text.trim(), note: note.trim() })}
        onCancel={() => setConfirming(false)}
      />
    )
  }

  const pick = (template) => {
    if (template) {
      setChoice(template.id)
      setText(template.text)
      setNote(template.note || '')
    } else {
      setChoice(FREE)
    }
  }

  return (
    <Shell titleId={titleId} onCancel={onCancel}>
      <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight text-fg">Notfall auslösen</h2>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-fg-muted mb-1.5">Vorlage</legend>
        <div className="space-y-1">
          {templates == null && <p className="text-sm text-fg-subtle px-3 py-2">Vorlagen werden geladen…</p>}
          {(templates || []).map((t) => (
            <TemplateOption key={t.id} name={groupName} checked={choice === t.id} onSelect={() => pick(t)} title={t.title} text={t.text} />
          ))}
          <TemplateOption name={groupName} checked={choice === FREE} onSelect={() => pick(null)} title="Eigener Text" />
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor={`${titleId}-text`} className="block text-sm font-medium text-fg-muted mb-1.5">Meldung</label>
        <textarea id={`${titleId}-text`} rows={3} value={text} onChange={(e) => setText(e.target.value)} className={fieldClass} />
        <p className="text-xs text-fg-subtle mt-1">Erscheint groß auf allen Bildschirmen.</p>
      </div>
      <div className="mt-3">
        <label htmlFor={`${titleId}-note`} className="block text-sm font-medium text-fg-muted mb-1.5">Zusatz</label>
        <input id={`${titleId}-note`} type="text" value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
        <p className="text-xs text-fg-subtle mt-1">Optional, erscheint klein unter der Meldung.</p>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <Button variant="primary" onClick={() => setConfirming(true)} disabled={!text.trim()}>Weiter</Button>
      </div>
    </Shell>
  )
}
