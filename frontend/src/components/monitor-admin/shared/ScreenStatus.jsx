// Status eines Bildschirms in Textform (Spec §6.2, §7.1).
// Mit gekoppeltem Gerät (GET /devices) gilt dessen Ampel. Ohne Gerät, also bei altem Skript, bleibt der
// Rückfall: online, wenn der letzte CEC-Status höchstens 5 min alt ist.
import { deviceFacts, deviceStatusView } from './deviceStatus'

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

// Spalte "Gerät": nur Hardware-Angaben, keine zweite Ampel (die zeigt "Status").
// Ohne Gerät: Text mit nächstem Schritt.
export function DeviceCell({ device }) {
  const paired = device && device.id != null && !device.legacy
  if (!paired) {
    const legacy = !!device?.legacy
    return (
      <div className="min-w-0 text-sm" data-device-state={legacy ? 'legacy' : 'unpaired'}>
        <div className={legacy ? 'text-fg' : 'text-fg-subtle'}>{deviceStatusView(device).label}</div>
        {legacy && <div className="text-xs text-fg-muted">Agent installieren</div>}
      </div>
    )
  }
  const { agent, metrics } = deviceFacts(device)
  return (
    <div className="min-w-0" data-device-state={device.status}>
      {agent && <div className="text-sm text-fg">{agent}</div>}
      {metrics.length > 0 && (
        <div className="text-xs text-fg-muted tabular-nums">
          {metrics.map((m, i) => (
            <span key={m.text}>{i > 0 && ' · '}<span className={m.warn ? 'text-warn' : ''}>{m.text}</span></span>
          ))}
        </div>
      )}
    </div>
  )
}
