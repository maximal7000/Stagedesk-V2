import { Outlet } from 'react-router-dom'

export default function SignageAdminLayout() {
  return (
    <div className="max-w-[1400px]" data-signage-admin>
      <Outlet />
    </div>
  )
}
