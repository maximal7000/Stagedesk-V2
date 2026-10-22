// For screens with a paired device; the other states (no device, legacy script, device list
// not loaded) are shown by ScreenDetail.
import { useEffect, useRef, useState } from 'react'
import { Camera, Download, Link2Off, MonitorPlay, Monitor, MonitorOff, Power, RotateCw, ShieldOff, X, AppWindow, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../../ui'
import { Section } from './form'
import ConfirmDialog from './ConfirmDialog'
import { commandResult, commandsFor, isFinished, timeoutText, watchCommand } from './deviceCommands'
import { reportTime, telemetryGroups } from './deviceStatus'
import { formatDayTime } from './explain'
import { errorText } from './errorText'
import * as api from './api'

const ICONS = {
  reload: RotateCw, restart_browser: AppWindow, reboot: Power, power_on: Monitor, power_off: MonitorOff,
  update_now: Download, screenshot: Camera, test_pattern: LayoutGrid,
}

function screenshotCaption(at) {
  const d = at ? new Date(at) : null
  if (!d || Number.isNaN(d.getTime())) return 'Screenshot'
  return `Screenshot von ${formatDayTime(d)}`
}

function LargeScreenshot({ url, caption, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  return (
    <div data-screenshot-large className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4 gap-3"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <img src={url} alt={caption} className="max-w-full max-h-[calc(100vh-6rem)] rounded-lg border border-line" />
      <div className="flex items-center gap-3">
        <span className="text-sm text-fg-muted">{caption}</span>
        <Button ref={closeRef} icon={X} onClick={onClose}>Schließen</Button>
      </div>
    </div>
  )
}

// onReload: only for users with signage.setup without signage.devices (reload as before the device agent)
export default function DeviceBox({ device, screen, can, onChanged, onReload }) {
  const [busy, setBusy] = useState({}) // kind -> true while the command runs
  const [confirm, setConfirm] = useState(null) // { kind, ... } | 'unpair' | 'revoke'
  const [working, setWorking] = useState(false)
  const [large, setLarge] = useState(false)
  const stops = useRef(new Set())
  const alive = useRef(true)
  const onChangedRef = useRef(onChanged)
  useEffect(() => { onChangedRef.current = onChanged })
  useEffect(() => {
    alive.current = true
    const active = stops.current
    return () => {
      alive.current = false
      active.forEach((stop) => stop())
      active.clear()
    }
  }, [])

  const { items, hint } = commandsFor(device, can)
  const groups = telemetryGroups(device)
  const stand = reportTime(device)
  const canManage = can('signage.devices')

  const finish = (kind, command) => {
    if (!alive.current) return
    setBusy((b) => ({ ...b, [kind]: false }))
    const result = commandResult(kind, command)
    if (result.ok) toast.success(result.text)
    else toast.error(result.text)
    onChangedRef.current?.()
  }

  const send = async (kind) => {
    setBusy((b) => ({ ...b, [kind]: true }))
    try {
      const command = await api.sendDeviceCommand(device.id, kind)
      if (!alive.current) return
      if (isFinished(command.status)) {
        finish(kind, command)
        return
      }
      const stop = watchCommand({
        get: () => api.getDeviceCommand(device.id, command.id),
        onDone: (done) => { stops.current.delete(stop); finish(kind, done) },
        onTimeout: () => {
          stops.current.delete(stop)
          if (!alive.current) return
          setBusy((b) => ({ ...b, [kind]: false }))
          toast.error(timeoutText(kind))
        },
      })
      stops.current.add(stop)
    } catch (e) {
      if (!alive.current) return
      setBusy((b) => ({ ...b, [kind]: false }))
      toast.error(errorText(e))
    }
  }

  const run = (item) => (item.confirm ? setConfirm(item) : send(item.kind))

  const detach = async (what) => {
    setWorking(true)
    try {
      if (what === 'unpair') await api.unpairDevice(device.id)
      else await api.revokeDevice(device.id)
      if (!alive.current) return
      setConfirm(null)
      toast.success(what === 'unpair' ? 'Gerät entkoppelt. Der Pi zeigt wieder einen Kopplungscode.' : 'Token zurückgezogen. Der Pi zeigt wieder einen Kopplungscode.')
      onChangedRef.current?.()
    } catch (e) {
      if (alive.current) toast.error(errorText(e))
    }
    if (alive.current) setWorking(false)
  }

  const name = screen?.name ? `„${screen.name}“` : 'Der Bildschirm'
  const caption = screenshotCaption(device.last_screenshot_at)

  return (
    <Section title="Gerät" data-section="device"
      aside={stand ? <span className="text-xs text-fg-subtle tabular-nums">Stand {stand}</span> : null}>
      {groups.length === 0 ? (
        <p className="text-sm text-fg-muted">Das Gerät hat noch keine Messwerte gemeldet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.title} data-telemetry-group={g.title}>
              <h3 className="text-xs font-semibold text-fg-muted mb-1.5">{g.title}</h3>
              <dl className="space-y-1.5 text-sm">
                {g.rows.map((r) => (
                  <div key={r.label} className="flex justify-between gap-4">
                    <dt className="text-fg-muted shrink-0">{r.label}</dt>
                    <dd className={`text-right min-w-0 break-words tabular-nums ${r.warn ? 'text-warn' : 'text-fg'}`}>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-5 pt-4 border-t border-line-subtle" data-device-commands>
          <div className="grid gap-1.5">
            {items.map((item) => (
              <Button key={item.kind} size="sm" icon={ICONS[item.kind] ?? MonitorPlay} disabled={!!busy[item.kind]} onClick={() => run(item)}
                className="w-full justify-start">
                {item.label}
              </Button>
            ))}
          </div>
          {hint && <p className="text-xs text-fg-subtle mt-2">{hint}</p>}
          {Object.values(busy).some(Boolean) && (
            <p role="status" className="text-xs text-fg-muted mt-2">
              Wartet auf das Gerät: {items.filter((i) => busy[i.kind]).map((i) => i.label).join(', ')}
            </p>
          )}
        </div>
      )}

      {items.length === 0 && onReload && (
        <div className="mt-5 pt-4 border-t border-line-subtle">
          <Button size="sm" icon={RotateCw} className="w-full justify-start" onClick={onReload}>Neu laden</Button>
          <p className="text-xs text-fg-subtle mt-1.5">Lädt die Anzeige im Browser des Bildschirms neu.</p>
        </div>
      )}

      {device.last_screenshot_url && (
        <div className="mt-5 pt-4 border-t border-line-subtle">
          <button type="button" aria-label="Screenshot groß anzeigen" onClick={() => setLarge(true)}
            className="block w-full rounded-lg overflow-hidden border border-line hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <img src={device.last_screenshot_url} alt="Letzter Screenshot des Bildschirms" className="w-full aspect-video object-cover bg-raised" />
          </button>
          <p className="text-xs text-fg-subtle mt-1.5 tabular-nums">{caption}</p>
        </div>
      )}

      {canManage && (
        <div className="mt-5 pt-4 border-t border-line-subtle flex flex-wrap gap-2">
          <Button size="sm" variant="danger" icon={Link2Off} onClick={() => setConfirm('unpair')}>Entkoppeln</Button>
          <Button size="sm" variant="danger" icon={ShieldOff} onClick={() => setConfirm('revoke')}>Token zurückziehen</Button>
        </div>
      )}

      {large && <LargeScreenshot url={device.last_screenshot_url} caption={caption} onClose={() => setLarge(false)} />}
      {confirm && confirm !== 'unpair' && confirm !== 'revoke' && (
        <ConfirmDialog title={confirm.confirm.title} body={confirm.confirm.body} confirmLabel={confirm.confirm.confirmLabel}
          onConfirm={() => { const kind = confirm.kind; setConfirm(null); send(kind) }} onCancel={() => setConfirm(null)} />
      )}
      {confirm === 'unpair' && (
        <ConfirmDialog tone="danger" title="Gerät entkoppeln?" confirmLabel="Entkoppeln" busy={working}
          body={`${name} hat danach kein Gerät mehr und verliert Telemetrie und Befehle. Der Pi zeigt danach wieder einen Kopplungscode.`}
          onConfirm={() => detach('unpair')} onCancel={() => setConfirm(null)} />
      )}
      {confirm === 'revoke' && (
        <ConfirmDialog tone="danger" title="Token zurückziehen?" confirmLabel="Token zurückziehen" busy={working}
          body="Der Zugang des Geräts wird sofort ungültig und die Verbindung endet. Der Pi zeigt danach wieder einen Kopplungscode."
          onConfirm={() => detach('revoke')} onCancel={() => setConfirm(null)} />
      )}
    </Section>
  )
}
