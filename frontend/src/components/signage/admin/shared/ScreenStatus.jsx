// Anzeige des Bildschirm-Status und der Geräte-Spalte. Die Berechnung steht in screenStatus.js.
import { deviceFacts, deviceStatusView } from './deviceStatus'
import { screenStatus } from './screenStatus'

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
// Ohne Gerät: Text mit nächstem Schritt. unknown: die Geräteliste ließ sich nicht laden, ob ein Gerät
// gekoppelt ist, ist also nicht bekannt.
export function DeviceCell({ device, unknown = false }) {
  if (unknown) {
    return (
      <div className="min-w-0 text-sm" data-device-state="unknown">
        <div className="text-fg-subtle">Unbekannt</div>
      </div>
    )
  }
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
