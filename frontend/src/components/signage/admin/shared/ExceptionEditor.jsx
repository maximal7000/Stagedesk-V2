import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../../ui'
import { iconButton } from './ScreenTable'

export const inputClass = 'bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-2.5 py-1.5 text-sm text-fg disabled:text-fg-disabled disabled:hover:border-line'

function Problem({ text }) {
  return text ? <p className="text-xs text-bad mt-1.5">{text}</p> : null
}

// Without times: on all day.
export default function ExceptionEditor({ value, onChange, problems = [], disabled = false, today }) {
  const rows = Array.isArray(value) ? value : []
  const update = (index, patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const add = () => onChange([...rows, { from_date: today, until_date: today, from: '', until: '', note: '' }])

  return (
    <div data-exception-editor>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Keine Ausnahmen eingetragen.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li key={index}>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" aria-label="Erster Tag" value={row.from_date || ''} disabled={disabled}
                  onChange={(e) => update(index, { from_date: e.target.value })} className={inputClass} />
                <span className="text-sm text-fg-muted">bis</span>
                <input type="date" aria-label="Letzter Tag" value={row.until_date || ''} disabled={disabled}
                  onChange={(e) => update(index, { until_date: e.target.value })} className={inputClass} />
                <span className="text-sm text-fg-muted ml-2">an von</span>
                <input type="time" aria-label="An von" value={row.from || ''} disabled={disabled}
                  onChange={(e) => update(index, { from: e.target.value })} className={inputClass} />
                <span className="text-sm text-fg-muted">bis</span>
                <input type="time" aria-label="An bis" value={row.until || ''} disabled={disabled}
                  onChange={(e) => update(index, { until: e.target.value })} className={inputClass} />
                {!disabled && (
                  <button type="button" className={`${iconButton} ml-auto`} onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    aria-label={`Ausnahme ${index + 1} entfernen`} title="Ausnahme entfernen">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input type="text" aria-label="Anlass" value={row.note || ''} disabled={disabled} placeholder="Anlass, zum Beispiel Tag der offenen Tür"
                onChange={(e) => update(index, { note: e.target.value })}
                className={`${inputClass} w-full mt-2 placeholder:text-fg-subtle`} />
              <Problem text={problems[index]} />
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <Button size="sm" variant="ghost" icon={Plus} className="mt-2 -ml-2.5" onClick={add}>Ausnahme hinzufügen</Button>
      )}
    </div>
  )
}
