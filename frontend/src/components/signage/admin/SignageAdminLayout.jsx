// Rahmen der Monitor-Admin-Seiten (Spec §6.1). Die Unterseiten erscheinen über <Outlet />, die
// Navigation zwischen ihnen steht in der Sidebar (DashboardLayout) unter "Monitore".
import { Outlet } from 'react-router-dom'

export default function SignageAdminLayout() {
  return (
    <div className="max-w-[1400px]" data-monitor-admin>
      <Outlet />
    </div>
  )
}
