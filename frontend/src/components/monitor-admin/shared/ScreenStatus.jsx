// Status eines Bildschirms in Textform (Spec §6.2, Plan Task 15).
// Bis zum Geräte-Agent (Teilprojekt C) gilt: online, wenn der letzte CEC-Status höchstens 5 min alt ist.
const ONLINE_WINDOW_MS = 5 * 60 * 1000

const CEC_LABELS = { on: 'Bildschirm an', standby: 'Bildschirm im Standby' }

const pad = (n) => String(n).padStart(2, '0')

function formatSeen(date, now) {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.toDateString() === now.toDateString()) return time
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}., ${time}`
}

// eslint-disable-next-line react-refresh/only-export-components
export function screenStatus(screen, now = new Date()) {
  const at = screen?.cec_status_at ? new Date(screen.cec_status_at) : null
  if (!at || Number.isNaN(at.getTime())) return { state: 'unknown', label: 'Unbekannt', detail: '' }
  if (now.getTime() - at.getTime() <= ONLINE_WINDOW_MS) {
    return { state: 'online', label: 'Online', detail: CEC_LABELS[screen.cec_status] ?? '' }
  }
  return { state: 'offline', label: 'Offline', detail: `zuletzt gesehen ${formatSeen(at, now)}` }
}

const DOT = { online: 'bg-ok', offline: 'bg-bad', unknown: 'bg-fg-subtle' }

export default function ScreenStatus({ screen, now }) {
  const { state, label, detail } = screenStatus(screen, now)
  return (
    <div className="min-w-0" data-screen-state={state}>
      <div className="flex items-center gap-2 text-sm text-fg">
        <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[state]}`} aria-hidden="true" />
        {label}
      </div>
      {detail && <div className="text-xs text-fg-muted truncate">{detail}</div>}
    </div>
  )
}
