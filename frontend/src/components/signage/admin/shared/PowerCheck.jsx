import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, PlugZap, RotateCw, WifiOff } from 'lucide-react'
import { Button, StatusBadge } from '../../../ui'
import { isFinished, watchCommand } from './deviceCommands'
import { errorText } from './errorText'
import { PROBE_LABELS, methodLabel, parseProbe, testOrder } from './powerCheck'
import PowerTestDialog from './PowerTestDialog'
import * as api from './api'

const STATES = {
  ok: { tone: 'positive', label: 'Antwortet' },
  warn: { tone: 'warning', label: 'Eingeschränkt' },
  fail: { tone: 'danger', label: 'Nicht verfügbar' },
  skip: { tone: 'neutral', label: 'Übersprungen' },
}
const NONE_TEXT = 'Das Display bleibt an und zeigt außerhalb des Zeitplans einen dunklen Bildschirm mit Uhr.'
const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-2.5'

const pad = (n) => String(n).padStart(2, '0')
const hourMinute = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function Notice({ icon, tone = 'muted', children }) {
  const Icon = icon
  return (
    <div className="flex items-start gap-3 rounded-lg bg-raised px-4 py-3 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'bad' ? 'text-bad' : 'text-fg-subtle'}`} />
      <div className="min-w-0 flex-1 text-fg-muted break-words">{children}</div>
    </div>
  )
}

function LoadingRows() {
  return Object.values(PROBE_LABELS).map((label) => (
    <li key={label} className={ROW} data-probe-loading>
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg-muted">{label}</div>
        <div className="mt-2 h-3 w-16 rounded-sm bg-raised animate-pulse motion-reduce:animate-none" />
      </div>
      <div className="col-span-2 sm:col-span-1 sm:col-start-2 row-start-2 sm:row-start-1 pt-1">
        <div className="h-3 w-3/4 rounded-sm bg-raised animate-pulse motion-reduce:animate-none" />
      </div>
    </li>
  ))
}

export default function PowerCheck({ device, screen, config, canTest, unsaved = false, onAdopt, onRecommended }) {
  const [probe, setProbe] = useState({ state: 'loading' })
  const [testing, setTesting] = useState(null)
  const alive = useRef(true)
  const stopWatch = useRef(null)
  const recommendedRef = useRef(onRecommended)
  useEffect(() => { recommendedRef.current = onRecommended }, [onRecommended])

  const deviceId = device?.id
  const legacy = !!device?.legacy || deviceId == null
  const offline = device?.status === 'offline'

  const probeNow = useCallback(async () => {
    stopWatch.current?.()
    const show = (command) => {
      if (!alive.current) return
      const parsed = parseProbe(command)
      if (parsed.error) {
        setProbe({ state: 'error', error: parsed.error })
        recommendedRef.current?.(null)
        return
      }
      setProbe({ state: 'done', parsed, checkedAt: parsed.checkedAt ?? new Date() })
      recommendedRef.current?.(parsed.recommended)
    }
    const fail = (text) => {
      if (!alive.current) return
      setProbe({ state: 'error', error: text })
      recommendedRef.current?.(null)
    }
    try {
      const command = await api.sendDeviceCommand(deviceId, 'power_probe')
      if (!alive.current) return
      if (isFinished(command.status)) { show(command); return }
      stopWatch.current = watchCommand({
        get: () => api.getDeviceCommand(deviceId, command.id),
        onDone: (done) => { stopWatch.current = null; show(done) },
        onTimeout: () => { stopWatch.current = null; fail('Keine Antwort vom Gerät.') },
      })
    } catch (e) {
      fail(errorText(e, 'Prüfung fehlgeschlagen.'))
    }
  }, [deviceId])

  const retry = () => {
    setProbe({ state: 'loading' })
    probeNow()
  }

  useEffect(() => {
    alive.current = true
    if (!legacy && !offline) probeNow()
    return () => {
      alive.current = false
      stopWatch.current?.()
      stopWatch.current = null
    }
  }, [legacy, offline, probeNow])

  if (legacy) {
    return (
      <div data-power-check="legacy">
        <Notice icon={PlugZap}>Die Prüfung braucht den Geräte-Agent. Das alte Skript kann die Steuerung nicht prüfen.</Notice>
      </div>
    )
  }
  if (offline) {
    return (
      <div data-power-check="offline">
        <Notice icon={WifiOff}>Bildschirm ist offline. Die Prüfung startet, sobald er wieder verbunden ist.</Notice>
      </div>
    )
  }

  const loading = probe.state === 'loading'
  const parsed = probe.state === 'done' ? probe.parsed : null
  const order = parsed ? testOrder(parsed) : []
  const recommended = parsed?.recommended
  const recommendTest = canTest && recommended && recommended !== 'none' && order.includes(recommended)

  return (
    <div data-power-check={probe.state} aria-busy={loading ? 'true' : 'false'} className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg">Prüfung</div>
          <p className="text-xs text-fg-subtle mt-0.5">
            {loading && 'Wird geprüft · ohne den Bildschirm auszuschalten'}
            {probe.state === 'done' && `Geprüft um ${hourMinute(probe.checkedAt)} · ohne den Bildschirm auszuschalten`}
            {probe.state === 'error' && 'Prüfung nicht möglich'}
          </p>
          {unsaved && (
            <p className="text-xs text-fg-muted mt-1" data-power-check-unsaved>
              Die Prüfung nutzt die gespeicherten Einstellungen. Erst speichern, dann erneut prüfen.
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" icon={RotateCw} onClick={retry} disabled={loading}>Erneut prüfen</Button>
      </div>

      {probe.state === 'error' ? (
        <Notice icon={AlertTriangle} tone="bad"><span role="alert">{probe.error}</span></Notice>
      ) : (
        <ul className="rounded-lg border border-line divide-y divide-line-subtle">
          {loading ? <LoadingRows /> : parsed.methods.map((m) => {
            const state = STATES[m.state] ?? STATES.skip
            return (
              <li key={m.probe} className={ROW} data-probe-row={m.probe} data-state={m.state}>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">{PROBE_LABELS[m.probe] ?? m.probe}</div>
                  <div className="mt-1"><StatusBadge tone={state.tone} dot label={state.label} /></div>
                </div>
                <p className="col-span-2 sm:col-span-1 sm:col-start-2 row-start-2 sm:row-start-1 text-sm text-fg-muted leading-relaxed break-words">
                  {m.text}
                </p>
                <div className="col-start-2 sm:col-start-3 row-start-1">
                  {canTest && m.testable && (
                    <Button size="sm" variant="secondary" onClick={() => setTesting(m.method)}
                      aria-label={`${PROBE_LABELS[m.probe] ?? m.probe} testen`} title="Schaltet den Bildschirm 15 Sekunden aus">Testen</Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {parsed && (
        <div className="rounded-lg bg-raised px-4 py-3 text-sm" data-recommendation={recommended}>
          {recommended === 'none' ? (
            <>
              <p className="font-semibold text-fg">Empfehlung: Keine Steuerung</p>
              <p className="mt-1 text-fg-muted">{NONE_TEXT}</p>
            </>
          ) : (
            <p className="text-fg-muted">
              <span className="font-semibold text-fg">Empfehlung: {methodLabel(recommended)}</span>
              {recommendTest && ' · mit „Testen“ bestätigen, dann übernehmen.'}
            </p>
          )}
        </div>
      )}

      {testing && (
        <PowerTestDialog device={device} screen={screen} method={testing} config={config} order={order}
          onAdopt={onAdopt} onClose={() => setTesting(null)} />
      )}
    </div>
  )
}
