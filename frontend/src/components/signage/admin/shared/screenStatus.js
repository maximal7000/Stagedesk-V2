// With a paired device (GET /devices) its status light applies. Without one (legacy script) the
// fallback: online if the last CEC status is at most 5 min old.
import { deviceStatusView } from './deviceStatus'

const ONLINE_WINDOW_MS = 5 * 60 * 1000

const CEC_LABELS = { on: 'Bildschirm an', standby: 'Bildschirm im Standby' }

const pad = (n) => String(n).padStart(2, '0')

function formatSeen(date, now) {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.toDateString() === now.toDateString()) return time
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}., ${time}`
}

export function screenStatus(screen, now = new Date(), device = null) {
  if (device && device.id != null && !device.legacy) {
    const view = deviceStatusView(device)
    const state = view.tone === 'ok' || view.tone === 'warn' ? 'online' : view.tone === 'bad' ? 'offline' : view.tone === 'off' ? 'off' : 'unknown'
    return { state, label: view.label, detail: view.detail, tone: view.tone }
  }
  const at = screen?.cec_status_at ? new Date(screen.cec_status_at) : null
  if (!at || Number.isNaN(at.getTime())) return { state: 'unknown', label: 'Unbekannt', detail: '' }
  if (now.getTime() - at.getTime() <= ONLINE_WINDOW_MS) {
    return { state: 'online', label: 'Online', detail: CEC_LABELS[screen.cec_status] ?? '' }
  }
  return { state: 'offline', label: 'Offline', detail: `zuletzt gesehen ${formatSeen(at, now)}` }
}
