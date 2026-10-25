import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Check, Power, X } from 'lucide-react'
import { Button } from '../../../ui'
import { configFor } from '../pages/screenData'
import { isFinished, watchCommand } from './deviceCommands'
import { errorText } from './errorText'
import { methodLabel, nextMethod } from './powerCheck'
import * as api from './api'

const TEST_SECONDS = 15
const TICK_MS = 250
const NONE_TEXT = 'Das Display bleibt an und zeigt außerhalb des Zeitplans einen dunklen Bildschirm mit Uhr.'

const pad = (n) => String(n).padStart(2, '0')
const clockTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const countdownText = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`

// off_at comes from the Pi's clock; it only shortens the countdown when both clocks roughly agree.
function startedTest(result, receivedAt) {
  let data
  try { data = JSON.parse(result) } catch { return null }
  const seconds = Number(data?.seconds) || TEST_SECONDS
  const offAt = data?.off_at ? new Date(data.off_at) : null
  const valid = offAt && !Number.isNaN(offAt.getTime())
  const elapsed = valid ? receivedAt - offAt.getTime() : 0
  const trusted = elapsed >= 0 && elapsed <= 5000
  return {
    offAt: valid ? offAt : new Date(receivedAt),
    seconds,
    endAt: receivedAt + seconds * 1000 - (trusted ? elapsed : 0),
  }
}

function Step({ done, children }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      {done ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-raised text-ok"><Check className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /></span>
      )}
      <span className={done ? 'text-fg-muted' : 'text-fg'}>{children}</span>
    </li>
  )
}

export default function PowerTestDialog({ device, screen, method, config, order, onAdopt, onClose }) {
  const titleId = useId()
  const [current, setCurrent] = useState(method)
  const [phase, setPhase] = useState('starting')
  const [test, setTest] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const dialogRef = useRef(null)
  const alive = useRef(true)
  const stopWatch = useRef(null)
  // True while the display may be off because of this dialog: closing then has to switch it back on.
  const live = useRef(false)

  const endTest = useCallback(() => {
    stopWatch.current?.()
    stopWatch.current = null
    if (!live.current) return
    live.current = false
    api.sendDeviceCommand(device.id, 'power_test_end').catch(() => {})
  }, [device.id])

  const start = useCallback(async (next) => {
    stopWatch.current?.()
    setCurrent(next)
    setPhase('starting')
    setTest(null)
    setError('')
    live.current = true
    const failed = (text) => {
      live.current = false
      setError(text)
      setPhase('failed')
    }
    const finish = (command) => {
      if (!alive.current) return
      if (command.status === 'ok') {
        const received = Date.now()
        const started = startedTest(command.result, received)
        if (started) {
          setTest(started)
          setNow(received)
          setPhase('running')
          return
        }
      }
      failed((command.result || '').trim() || 'Test fehlgeschlagen.')
    }
    try {
      const command = await api.sendDeviceCommand(device.id, 'power_test', {
        method: next, config: configFor(next, config), seconds: TEST_SECONDS,
      })
      if (!alive.current) return
      if (isFinished(command.status)) { finish(command); return }
      stopWatch.current = watchCommand({
        get: () => api.getDeviceCommand(device.id, command.id),
        onDone: (done) => { stopWatch.current = null; finish(done) },
        onTimeout: () => {
          stopWatch.current = null
          if (!alive.current) return
          // The test may still have started late: live stays set so closing switches back on.
          setError('Keine Antwort vom Gerät.')
          setPhase('failed')
        },
      })
    } catch (e) {
      if (alive.current) failed(errorText(e, 'Test konnte nicht gestartet werden.'))
    }
  }, [device.id, config])

  useEffect(() => {
    alive.current = true
    const opener = document.activeElement
    start(method)
    return () => {
      alive.current = false
      endTest()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
    // Runs once per dialog; "Nein" starts the next method through start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'running') return undefined
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [phase])

  const remaining = test ? Math.max(0, Math.ceil((test.endAt - now) / 1000)) : TEST_SECONDS
  useEffect(() => {
    if (phase === 'running' && remaining <= 0) {
      live.current = false
      setPhase('question')
    }
  }, [phase, remaining])

  useEffect(() => {
    dialogRef.current?.querySelector('[data-autofocus]')?.focus()
  }, [phase, current])

  const close = () => { endTest(); onClose?.() }
  const adopt = (m) => { endTest(); onAdopt?.(m, m === 'none' ? {} : configFor(m, config)); onClose?.() }
  const following = nextMethod(order, current)
  const label = methodLabel(current)
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
  }

  const title = phase === 'none' ? 'Keine Steuerung' : `${label} testen`
  const place = [`Bildschirm „${screen?.name ?? ''}“`, screen?.location].filter(Boolean).join(' · ')
  const progress = test ? Math.min(1, 1 - (test.endAt - now) / (test.seconds * 1000)) : 0

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onKeyDown={onKeyDown}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-power-test={phase}
        className="relative overflow-hidden bg-overlay border border-line rounded-lg shadow-overlay max-w-lg w-full">
        {(phase === 'starting' || phase === 'running') && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-line-subtle" aria-hidden="true">
            <div className="h-full bg-accent transition-[width] duration-300 ease-linear motion-reduce:transition-none"
              style={{ width: `${Math.max(0, progress) * 100}%` }} />
          </div>
        )}
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-raised border border-line text-fg-muted">
            <Power className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight text-fg">{title}</h2>
            <p className="text-sm text-fg-muted truncate">{place}</p>
          </div>
          <button type="button" onClick={close} aria-label="Schließen"
            className="-mr-1.5 -mt-1 p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-5 pb-5" aria-live="polite">
          {phase === 'starting' && (
            <ol className="space-y-3">
              <Step>Ausschalten wird gesendet</Step>
              <li className="flex items-center gap-3 text-sm text-fg-subtle">
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-line" />
                Einschalten nach {TEST_SECONDS} Sekunden
              </li>
            </ol>
          )}
          {phase === 'running' && test && (
            <>
              <div className="flex items-baseline gap-3" role="timer" aria-live="off">
                <span data-countdown className="font-display text-6xl font-semibold leading-none tabular-nums tracking-tight text-fg">
                  {countdownText(remaining)}
                </span>
                <span className="text-sm text-fg-muted">bis zum Einschalten</span>
              </div>
              <ol className="mt-5 space-y-3">
                <Step done>Ausschalten gesendet ({clockTime(test.offAt)})</Step>
                <Step>Einschalten in {remaining} {remaining === 1 ? 'Sekunde' : 'Sekunden'}</Step>
              </ol>
            </>
          )}
          {phase === 'question' && (
            <>
              <p className="text-base font-semibold text-fg">Ist der Bildschirm aus- und wieder angegangen?</p>
              <p className="mt-1.5 text-sm text-fg-muted">Nur „Ja“, wenn er wirklich dunkel war, nicht nur „Kein Signal“ gezeigt hat.</p>
            </>
          )}
          {phase === 'failed' && (
            <div role="alert" className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-fg">Der Bildschirm wurde nicht ausgeschaltet.</p>
                <p className="mt-1 text-fg-muted break-words">{error}</p>
              </div>
            </div>
          )}
          {phase === 'none' && (
            <>
              <p className="text-sm font-medium text-fg">Keine der getesteten Methoden hat den Bildschirm geschaltet.</p>
              <p className="mt-1.5 text-sm text-fg-muted">{NONE_TEXT}</p>
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line-subtle px-5 py-3.5">
          {(phase === 'starting' || phase === 'running') && (
            <Button variant="secondary" icon={Power} onClick={close} data-autofocus>Abbrechen und einschalten</Button>
          )}
          {phase === 'question' && (
            <>
              <Button variant="ghost" onClick={() => (following ? start(following) : setPhase('none'))}>
                {following ? 'Nein, nächste Methode testen' : 'Nein'}
              </Button>
              <Button variant="primary" onClick={() => adopt(current)} data-autofocus>Ja, {label} übernehmen</Button>
            </>
          )}
          {phase === 'failed' && (
            <>
              {following && <Button variant="ghost" onClick={() => start(following)}>Nächste Methode testen</Button>}
              <Button variant="secondary" onClick={() => start(current)} data-autofocus>Erneut testen</Button>
            </>
          )}
          {phase === 'none' && (
            <>
              <Button variant="ghost" onClick={close}>Schließen</Button>
              <Button variant="primary" onClick={() => adopt('none')} data-autofocus>Keine Steuerung übernehmen</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
