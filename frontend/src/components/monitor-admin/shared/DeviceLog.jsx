// Abschnitt "Protokoll" im Bildschirm-Detail (Spec §8): Ereignisse und Befehle, neueste zuerst, Filter nach Art.
import { useEffect, useId, useState } from 'react'
import { Section, fieldClass } from './form'
import { formatDayTime } from './explain'
import { errorText } from './errorText'
import * as api from './api'

const LIMIT = 100

// Filtergruppen: Wert -> Arten des Servers (der Server filtert nach genau einer Art)
const LOG_GROUPS = [
  { value: 'all', label: 'Alle', kinds: [] },
  { value: 'connection', label: 'Verbindung', kinds: ['online', 'offline'] },
  { value: 'warnings', label: 'Warnungen', kinds: ['warning', 'warning_cleared'] },
  { value: 'updates', label: 'Updates', kinds: ['update', 'update_failed', 'agent_updated'] },
  { value: 'commands', label: 'Befehle', kinds: ['command'] },
  { value: 'pairing', label: 'Kopplung', kinds: ['paired', 'unpaired', 'token_revoked'] },
]

const KIND_LABELS = {
  online: 'Verbindung', offline: 'Verbindung', warning: 'Warnung', warning_cleared: 'Warnung', update: 'Update',
  update_failed: 'Update', agent_updated: 'Update', command: 'Befehl', paired: 'Kopplung', unpaired: 'Kopplung', token_revoked: 'Kopplung',
}
const KIND_TONE = { offline: 'text-bad', warning: 'text-warn', update_failed: 'text-bad', token_revoked: 'text-warn' }

const kindLabel = (kind) => KIND_LABELS[kind] ?? kind

async function fetchEvents(screenId, group) {
  if (!group.kinds.length) return api.getScreenEvents(screenId, { limit: LIMIT })
  const lists = await Promise.all(group.kinds.map((kind) => api.getScreenEvents(screenId, { kind, limit: LIMIT })))
  return lists.flat().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id)).slice(0, LIMIT)
}

export default function DeviceLog({ screenId, reloadKey = 0 }) {
  const filterId = useId()
  const [filter, setFilter] = useState('all')
  const [state, setState] = useState({ loading: true, events: [], error: null })

  useEffect(() => {
    let alive = true
    const group = LOG_GROUPS.find((g) => g.value === filter) ?? LOG_GROUPS[0]
    fetchEvents(screenId, group).then(
      (events) => { if (alive) setState({ loading: false, events, error: null }) },
      (error) => { if (alive) setState({ loading: false, events: [], error }) },
    )
    return () => { alive = false }
  }, [screenId, filter, reloadKey])

  return (
    <Section title="Protokoll" data-section="log"
      aside={(
        <span className="flex items-center gap-2">
          <label htmlFor={filterId} className="text-xs text-fg-subtle">Art</label>
          <select id={filterId} value={filter} onChange={(e) => setFilter(e.target.value)} className={`${fieldClass} !w-auto py-1`}>
            {LOG_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </span>
      )}>
      {state.error ? (
        <p role="alert" className="text-sm text-bad">
          Das Protokoll konnte nicht geladen werden. {errorText(state.error, 'Bitte die Seite neu laden.')}
        </p>
      ) : state.loading ? (
        <p className="text-sm text-fg-subtle">Lädt…</p>
      ) : state.events.length === 0 ? (
        <p className="text-sm text-fg-muted">Noch keine Einträge.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-subtle">
                <th scope="col" className="font-medium pb-2 pr-4 whitespace-nowrap">Zeit</th>
                <th scope="col" className="font-medium pb-2 pr-4">Art</th>
                <th scope="col" className="font-medium pb-2 pr-4">Text</th>
                <th scope="col" className="font-medium pb-2">Person</th>
              </tr>
            </thead>
            <tbody>
              {state.events.map((e) => (
                <tr key={e.id} className="border-t border-line-subtle align-top">
                  <td className="py-2 pr-4 text-fg-muted tabular-nums whitespace-nowrap">{formatDayTime(e.created_at)}</td>
                  <td className={`py-2 pr-4 whitespace-nowrap ${KIND_TONE[e.kind] ?? 'text-fg'}`}>{kindLabel(e.kind)}</td>
                  <td className="py-2 pr-4 text-fg min-w-0 break-words">{e.text}</td>
                  <td className="py-2 text-fg-muted whitespace-nowrap">{e.person || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
