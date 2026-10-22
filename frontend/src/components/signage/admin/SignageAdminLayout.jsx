import { Outlet } from 'react-router-dom'

export default function SignageAdminLayout() {
  return (
    <div data-signage-admin>
      <Outlet />
    </div>
  )
}
