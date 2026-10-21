// Status eines Bildschirms in Textform (Spec §6.2, §7.1).
// Mit gekoppeltem Gerät (GET /devices) gilt dessen Ampel. Ohne Gerät, also bei altem Skript, bleibt der
// Rückfall: online, wenn der letzte CEC-Status höchstens 5 min alt ist.
import { deviceMetrics, deviceStatusView } from './deviceStatus'

const ONLINE_WINDOW_MS = 5 * 60 * 1000

const CEC_LABELS = { on: 'Bildschirm an', standby: 'Bildschirm im Standby' }

const pad = (n) => String(n).padStart(2, '0')

function formatSeen(date, now) {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.toDateString() === now.toDateString()) return time
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}., ${time}`
}

// eslint-disable-next-line react-refresh/only-export-components
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

const DOT = { online: 'bg-ok', offline: 'bg-bad', off: 'bg-fg-subtle', unknown: 'bg-fg-subtle' }
const TONE_DOT = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', off: 'bg-fg-subtle', none: 'bg-fg-subtle' }

export default function ScreenStatus({ screen, now, device }) {
  const { state, label, detail, tone } = screenStatus(screen, now, device)
  return (
    <div className="min-w-0" data-screen-state={state}>
      <div className="flex items-center gap-2 text-sm text-fg">
        <span className={`w-2 h-2 rounded-full shrink-0 ${tone ? TONE_DOT[tone] : DOT[state]}`} aria-hidden="true" />
        {label}
      </div>
      {detail && <div className="text-xs text-fg-muted truncate" title={detail}>{detail}</div>}
    </div>
  )
}

// Spalte "Gerät" der Übersicht: Ampel und Text, darunter WLAN, Temperatur und Agent-Version
export function DeviceCell({ device }) {
  const paired = device && device.id != null && !device.legacy
  const view = deviceStatusView(device)
  const metrics = paired ? deviceMetrics(device) : []
  if (!paired) {
    return (
      <div className="min-w-0 text-sm" data-device-state={device?.legacy ? 'legacy' : 'unpaired'}>
        <span className={device?.legacy ? 'text-warn' : 'text-fg-subtle'}>{view.label}</span>
      </div>
    )
  }
  return (
    <div className="min-w-0" data-device-state={device.status}>
      <div className="flex items-center gap-2 text-sm text-fg">
        <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[view.tone]}`} aria-hidden="true" />
        <span className="truncate">{view.label}</span>
      </div>
      {metrics.length > 0 && <div className="text-xs text-fg-muted tabular-nums">{metrics.join(' · ')}</div>}
    </div>
  )
}
