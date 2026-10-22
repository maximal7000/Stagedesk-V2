import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { chipTextColor, swlColorForLine } from '../../display/lib/lines'

export const fieldClass = 'w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-sm text-fg placeholder:text-fg-subtle disabled:text-fg-disabled disabled:hover:border-line'

export function Section({ title, aside, children, ...rest }) {
  return (
    <section className="bg-surface rounded-lg p-5" {...rest}>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-display text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, help, htmlFor, children, className = '' }) {
  return (
    <div className={className}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-fg mb-1.5">{label}</label>
      ) : (
        <div className="text-sm font-medium text-fg mb-1.5">{label}</div>
      )}
      {children}
      {help && <p className="text-xs text-fg-subtle mt-1.5">{help}</p>}
    </div>
  )
}

export function Segmented({ options, value, onChange, disabled, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full bg-raised border border-line rounded-md p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} disabled={disabled} onClick={() => onChange(o.value)}
            className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? `bg-hover font-medium ${disabled ? 'text-fg-muted' : 'text-fg'}` : `${disabled ? 'text-fg-disabled' : 'text-fg-muted hover:text-fg'}`
            } disabled:pointer-events-none`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Checkbox({ label, help, checked, onChange, disabled }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="inline-flex items-center gap-2.5 text-sm text-fg cursor-pointer">
        <input id={id} type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-accent" />
        {label}
      </label>
      {help && <p className="text-xs text-fg-subtle mt-1 ml-6.5">{help}</p>}
    </div>
  )
}

export function LineChip({ line, onRemove }) {
  const color = swlColorForLine(line)
  const style = color ? { backgroundColor: color, color: chipTextColor(color) } : undefined
  return (
    <span style={style} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${color ? '' : 'bg-hover text-fg'}`}>
      {line}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`${line} entfernen`} title={`${line} entfernen`}
          className="-mr-0.5 rounded-sm opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

export function ListInput({ id, value, onChange, placeholder, disabled, chips = true }) {
  const [text, setText] = useState('')
  const list = value ?? []
  const commit = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean).filter((s) => !list.includes(s))
    if (parts.length) onChange([...list, ...parts])
    setText('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-raised border border-line rounded-md px-2 py-1.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
      {list.map((item, i) => (chips
        ? <LineChip key={item} line={item} onRemove={disabled ? null : () => onChange(list.filter((_, j) => j !== i))} />
        : <span key={item} className="text-sm text-fg">{item}</span>))}
      <input id={id} value={text} disabled={disabled} placeholder={list.length ? '' : placeholder}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
          if (e.key === 'Backspace' && !text && list.length) onChange(list.slice(0, -1))
        }}
        className="flex-1 min-w-24 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none py-0.5" />
    </div>
  )
}
