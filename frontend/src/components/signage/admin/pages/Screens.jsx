import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, MonitorOff, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, EmptyState, Button } from '../../../ui'
import { useUser } from '../../../../contexts/UserContext'
import ScreenStatus from '../shared/ScreenStatus'
import { Cell, ScreenNameCell, ScreenRow, ScreenTable } from '../shared/ScreenTable'
import { errorText } from '../shared/errorText'
import { powerSummary } from './screenData'
import * as api from '../shared/api'

const COLUMNS = [
  { key: 'name', label: 'Bildschirm', className: 'w-[24%]' },
  { key: 'status', label: 'Status', className: 'w-[18%]' },
  { key: 'view', label: 'Standard-Ansicht', className: 'w-[20%]' },
  { key: 'power', label: 'Ein- und Ausschalten' },
  { key: 'open', label: null, srLabel: 'Öffnen', className: 'w-px' },
]

const fieldClass = 'w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-sm text-fg placeholder:text-fg-subtle'

function NewScreenDialog({ views, busy, onCreate, onCancel }) {
  const titleId = useId()
  const nameId = useId()
  const viewId = useId()
  const [name, setName] = useState('')
  const [defaultView, setDefaultView] = useState('')
  const onCancelRef = useRef(onCancel)
  useEffect(() => { onCancelRef.current = onCancel })
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancelRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (e) => {
    e.preventDefault()
    if (name.trim()) onCreate({ name: name.trim(), default_view_id: defaultView ? Number(defaultView) : null })
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} data-new-screen-dialog
        className="bg-overlay border border-line rounded-lg shadow-overlay max-w-md w-full p-5">
        <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight text-fg">Neuer Bildschirm</h2>
        <label htmlFor={nameId} className="block text-sm font-medium text-fg mt-4 mb-1.5">Name</label>
        <input id={nameId} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="zum Beispiel Eingangshalle" className={fieldClass} />
        <p className="text-xs text-fg-subtle mt-1.5">Aus dem Namen entsteht die Adresse des Bildschirms in der Kiosk-URL.</p>
        <label htmlFor={viewId} className="block text-sm font-medium text-fg mt-4 mb-1.5">Standard-Ansicht</label>
        <select id={viewId} value={defaultView} onChange={(e) => setDefaultView(e.target.value)} className={fieldClass}>
          <option value="">Keine</option>
          {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <p className="text-xs text-fg-subtle mt-1.5">Wird gezeigt, wenn kein Termin oder Sondermodus aktiv ist.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Anlegen</Button>
        </div>
      </form>
    </div>
  )
}

export default function Screens() {
  const navigate = useNavigate()
  const canSetup = useUser().hasPermission('signage.setup')
  const [screens, setScreens] = useState(null)
  const [views, setViews] = useState([])
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.allSettled([api.getScreens(), api.getViews()]).then(([screensRes, viewsRes]) => {
      if (!alive) return
      setNow(new Date())
      if (viewsRes.status === 'fulfilled') setViews(viewsRes.value)
      if (screensRes.status === 'fulfilled') {
        setScreens(screensRes.value)
        setError(null)
      } else {
        setError(screensRes.reason)
      }
    })
    return () => { alive = false }
  }, [])

  const create = async (body) => {
    setBusy(true)
    try {
      const created = await api.createScreen(body)
      navigate(`/signage-admin/screens/${created.id}`)
    } catch (e) {
      toast.error(errorText(e))
      setBusy(false)
    }
  }

  const viewNames = Object.fromEntries(views.map((v) => [v.id, v.name]))
  const state = error ? 'error' : screens ? 'ready' : 'loading'
  const count = screens ? (screens.length === 1 ? '1 Bildschirm' : `${screens.length} Bildschirme`) : null

  return (
    <div data-admin-page="screens" data-state={state}>
      <PageHeader title="Bildschirme" meta={count}
        actions={canSetup ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Neuer Bildschirm</Button> : null} />

      {error ? (
        <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
          Bildschirme konnten nicht geladen werden. {errorText(error, '')}
        </div>
      ) : screens && screens.length === 0 ? (
        <div className="bg-surface rounded-lg">
          <EmptyState icon={MonitorOff} title="Noch keine Bildschirme" />
        </div>
      ) : screens ? (
        <ScreenTable columns={COLUMNS}>
          {screens.map((s) => {
            const to = `/signage-admin/screens/${s.id}`
            return (
              <ScreenRow key={s.id} screen={s}>
                <ScreenNameCell screen={s} to={to} />
                <Cell><ScreenStatus screen={s} now={now} /></Cell>
                <Cell className="text-sm">
                  {s.default_view_id && viewNames[s.default_view_id]
                    ? <span className="text-fg">{viewNames[s.default_view_id]}</span>
                    : <span className="text-fg-subtle">Keine</span>}
                </Cell>
                <Cell>
                  <div className="text-sm text-fg">{powerSummary(s)}</div>
                  {s.power_mode === 'auto' && (
                    <div className="text-xs text-fg-muted">{s.off_during_holidays ? 'In den Ferien aus' : 'Auch in den Ferien an'}</div>
                  )}
                </Cell>
                <Cell>
                  <Button size="sm" variant="ghost" onClick={() => navigate(to)} aria-label={`${s.name} öffnen`}>
                    Öffnen<ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </Cell>
              </ScreenRow>
            )
          })}
        </ScreenTable>
      ) : null}

      {creating && (
        <NewScreenDialog views={views} busy={busy} onCreate={create} onCancel={() => setCreating(false)} />
      )}
    </div>
  )
}
