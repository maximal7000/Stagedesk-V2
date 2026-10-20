// Rahmen der Monitor-Admin-Seiten (Spec §6.1). Die Unterseiten erscheinen über <Outlet />, die
// Navigation zwischen ihnen steht in der Sidebar (DashboardLayout) unter "Monitore".
import { Outlet } from 'react-router-dom'
import { Construction } from 'lucide-react'
import { PageHeader, EmptyState } from '../ui'

export default function MonitorAdminLayout() {
  return (
    <div className="max-w-[1400px]" data-monitor-admin>
      <Outlet />
    </div>
  )
}

// Platzhalter für Unterseiten, die in den folgenden Bauschritten entstehen
export function PendingPage({ title }) {
  return (
    <div data-admin-page="pending">
      <PageHeader eyebrow="Monitore" title={title} />
      <div className="bg-surface rounded-lg">
        <EmptyState icon={Construction} title="Diese Seite ist noch im Aufbau." />
      </div>
    </div>
  )
}
