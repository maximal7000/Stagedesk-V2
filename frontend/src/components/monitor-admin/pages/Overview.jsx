// Monitor-Übersicht (Spec §6.2). Gerüst: Kopf und Bildschirm-Liste mit Status.
// Sondermodi, "Zeigt gerade", Datenquellen und "Demnächst" folgen in Task 15.
import { useEffect, useState } from 'react'
import { MonitorOff } from 'lucide-react'
import { PageHeader, EmptyState } from '../../ui'
import ScreenStatus, { screenStatus } from '../shared/ScreenStatus'
import { getScreens } from '../shared/api'

function screensMeta(screens) {
  const online = screens.filter((s) => screenStatus(s).state === 'online').length
  const count = screens.length === 1 ? '1 Bildschirm' : `${screens.length} Bildschirme`
  return `${count} · ${online} online`
}

export default function Overview() {
  const [screens, setScreens] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getScreens()
      .then((data) => { if (!cancelled) setScreens(data) })
      .catch((e) => { if (!cancelled) setError(e) })
    return () => { cancelled = true }
  }, [])

  const state = error ? 'error' : screens ? 'ready' : 'loading'

  return (
    <div data-admin-page="overview" data-state={state}>
      <PageHeader title="Monitore" meta={screens ? screensMeta(screens) : null} />

      <h2 className="font-display text-lg font-semibold tracking-tight text-fg mb-3">Bildschirme</h2>
      {error ? (
        <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
          Bildschirme konnten nicht geladen werden ({error.message}). Bitte die Seite neu laden.
        </div>
      ) : screens && screens.length === 0 ? (
        <div className="bg-surface rounded-lg">
          <EmptyState icon={MonitorOff} title="Noch keine Bildschirme" />
        </div>
      ) : screens ? (
        <div className="bg-surface rounded-lg overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-fg-subtle border-b border-line-subtle">
                <th className="font-medium px-4 py-2.5 w-1/3">Bildschirm</th>
                <th className="font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {screens.map((s) => (
                <tr key={s.id} className="border-b border-line-subtle last:border-0">
                  <td className="px-4 py-3 align-top">
                    <div className="text-sm font-semibold text-fg">{s.name}</div>
                    {s.location && <div className="text-xs text-fg-muted">{s.location}</div>}
                  </td>
                  <td className="px-4 py-3 align-top"><ScreenStatus screen={s} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
