// Combobox pattern; stale responses are ignored.
import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { searchStops } from './api'
import { errorText } from './errorText'
import { fieldClass } from './form'

const SEARCH_DELAY_MS = 300

const PRODUCT_GROUPS = [
  ['Bus', ['bus']],
  ['Zug', ['regional', 'regionalExpress', 'suburban']],
  ['Fernzug', ['national', 'nationalExpress']],
  ['U-Bahn', ['subway']],
  ['Tram', ['tram']],
  ['Fähre', ['ferry']],
]

function productLabel(products) {
  const set = new Set(products ?? [])
  return PRODUCT_GROUPS.filter(([, keys]) => keys.some((k) => set.has(k))).map(([label]) => label).join(', ')
}

export default function StopSearch({ onSelect, excludeIds = [], label = 'Haltestelle suchen', autoFocus = false, search = searchStops }) {
  const inputId = useId()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ query: '', results: [], error: null })
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const seq = useRef(0)
  const term = query.trim()

  useEffect(() => {
    if (term.length < 2) return undefined
    const mine = ++seq.current
    const timer = setTimeout(() => {
      search(term).then(
        (results) => { if (mine === seq.current) setState({ query: term, results: Array.isArray(results) ? results : [], error: null }) },
        (error) => { if (mine === seq.current) setState({ query: term, results: [], error }) },
      )
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [term, search])

  const loading = term.length >= 2 && state.query !== term
  const results = term.length >= 2 && !loading ? state.results : []
  const showList = open && term.length >= 2

  const choose = (result) => {
    if (!result || excludeIds.includes(result.id)) return
    onSelect(result)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      if (showList) { e.stopPropagation(); setOpen(false) }
    }
  }

  const optionId = (i) => `${listId}-${i}`
  return (
    <div className="relative" data-stop-search>
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" aria-hidden="true" />
        <input id={inputId} role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? optionId(active) : undefined}
          autoFocus={autoFocus} value={query} placeholder="Name der Haltestelle, zum Beispiel Kohlmarkt"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
          className={`${fieldClass} pl-9`} />
      </div>
      {showList && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-overlay border border-line rounded-md shadow-overlay overflow-hidden">
          {loading && <p className="px-3 py-2 text-sm text-fg-muted">Sucht…</p>}
          {!loading && state.error && <p className="px-3 py-2 text-sm text-bad">{errorText(state.error)}</p>}
          {!loading && !state.error && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-fg-muted">Keine Haltestelle gefunden. Bitte den Namen anders schreiben.</p>
          )}
          <ul id={listId} role="listbox" aria-label="Treffer" className="max-h-64 overflow-y-auto">
            {results.map((r, i) => {
              const taken = excludeIds.includes(r.id)
              return (
                <li key={r.id} id={optionId(i)} role="option" aria-selected={i === active} aria-disabled={taken}
                  onMouseDown={(e) => { e.preventDefault(); choose(r) }} onMouseEnter={() => setActive(i)}
                  className={`px-3 py-2 text-sm flex items-baseline justify-between gap-3 ${taken ? 'text-fg-disabled' : 'text-fg cursor-pointer'} ${i === active ? 'bg-hover' : ''}`}>
                  <span className="truncate">{r.name}</span>
                  <span className="text-xs text-fg-subtle shrink-0">{taken ? 'schon in der Liste' : productLabel(r.products)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
