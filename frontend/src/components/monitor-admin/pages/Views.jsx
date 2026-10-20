// Ansichten-Liste (Spec §6.2): Name, Typ und "Verwendet auf"; "Neue Ansicht" führt zur Typ-Wahl.
// Nach dem Löschen (ViewEdit) erscheint hier die Meldung mit "Rückgängig" (Wiederherstellen aus dem Papierkorb).
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, LayoutTemplate, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, EmptyState, Button } from '../../ui'
import { Cell, ScreenTable } from '../shared/ScreenTable'
import UndoToast from '../shared/UndoToast'
import { errorText } from '../shared/errorText'
import { kindLabel, usedOn } from './viewData'
import * as api from '../shared/api'

const COLUMNS = [
  { key: 'name', label: 'Ansicht', className: 'w-[30%]' },
  { key: 'kind', label: 'Typ', className: 'w-[16%]' },
  { key: 'used', label: 'Verwendet auf' },
  { key: 'open', label: null, srLabel: 'Öffnen', className: 'w-px' },
]

export default function Views() {
  const navigate = useNavigate()
  const location = useLocation()
  const [views, setViews] = useState(null)
  const [screens, setScreens] = useState([])
  const [error, setError] = useState(null)
  const [deleted, setDeleted] = useState(() => location.state?.deleted ?? null)

  const load = useCallback(() => Promise.allSettled([api.getViews(), api.getScreens()]), [])

  useEffect(() => {
    let alive = true
    load().then(([viewsRes, screensRes]) => {
      if (!alive) return
      if (screensRes.status === 'fulfilled') setScreens(screensRes.value)
      if (viewsRes.status === 'fulfilled') {
        setViews(viewsRes.value)
        setError(null)
      } else {
        setError(viewsRes.reason)
      }
    })
    return () => { alive = false }
  }, [load])

  // Die Meldung gilt einmal: beim Neuladen der Seite nicht erneut zeigen
  useEffect(() => {
    if (location.state?.deleted) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])

  const undoDelete = async () => {
    const { id, name } = deleted
    try {
      await api.restoreFromTrash('view', id)
      const [viewsRes] = await load()
      if (viewsRes.status === 'fulfilled') setViews(viewsRes.value)
      toast.success(`„${name}“ ist wiederhergestellt.`)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const state = error ? 'error' : views ? 'ready' : 'loading'
  const count = views ? (views.length === 1 ? '1 Ansicht' : `${views.length} Ansichten`) : null

  return (
    <div data-admin-page="views" data-state={state}>
      <PageHeader title="Ansichten" meta={count}
        actions={<Button variant="primary" icon={Plus} onClick={() => navigate('/monitor-admin/views/new')}>Neue Ansicht</Button>} />

      {error ? (
        <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
          Ansichten konnten nicht geladen werden. {errorText(error, 'Bitte die Seite neu laden.')}
        </div>
      ) : views && views.length === 0 ? (
        <div className="bg-surface rounded-lg">
          <EmptyState icon={LayoutTemplate} title="Noch keine Ansichten" />
        </div>
      ) : views ? (
        <ScreenTable columns={COLUMNS}>
          {views.map((v) => {
            const to = `/monitor-admin/views/${v.id}`
            const used = usedOn(v.id, screens)
            return (
              <tr key={v.id} className="border-b border-line-subtle last:border-0" data-view={v.slug}>
                <Cell className="text-sm">
                  <Link to={to} className="font-semibold text-fg hover:underline underline-offset-2 focus:outline-none focus-visible:underline">
                    {v.name}
                  </Link>
                </Cell>
                <Cell className="text-sm text-fg-muted">{kindLabel(v.kind)}</Cell>
                <Cell className="text-sm">
                  {used.length
                    ? <span className="text-fg">{used.map((u) => u.name).join(', ')}</span>
                    : <span className="text-fg-subtle">Auf keinem Bildschirm</span>}
                </Cell>
                <Cell>
                  <Button size="sm" variant="ghost" onClick={() => navigate(to)} aria-label={`${v.name} öffnen`}>
                    Öffnen<ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </Cell>
              </tr>
            )
          })}
        </ScreenTable>
      ) : null}

      {deleted && (
        <UndoToast key={deleted.id} message={`„${deleted.name}“ ist im Papierkorb.`} onUndo={undoDelete} onClose={() => setDeleted(null)} />
      )}
    </div>
  )
}
