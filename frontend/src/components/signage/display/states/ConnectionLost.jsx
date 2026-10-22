import { useState } from 'react'
import { useClock } from '../lib/useClock'
import { formatTime, formatTimeSeconds } from '../lib/format'
import StateScreen, { StateText } from './StateScreen'

export default function ConnectionLost({ screenName, lastOkAt, nextRetryAt, orientation }) {
  const [shownAt] = useState(() => Date.now())
  const since = lastOkAt ?? shownAt
  return (
    <StateScreen state="lost" orientation={orientation} kicker={screenName ? `Bildschirm ${screenName}` : null} title="Verbindung verloren">
      <StateText>
        Der Server ist seit {formatTime(since)} nicht erreichbar.
        {nextRetryAt != null && <> <RetryCountdown nextRetryAt={nextRetryAt} /></>}
        {' '}Die Anzeige läuft automatisch weiter, sobald die Verbindung zurück ist.
      </StateText>
      {lastOkAt != null && (
        <dl className="mt-[3.5rem] grid max-w-[68.75rem] grid-cols-[auto_1fr] items-baseline gap-x-[3.25rem] gap-y-[1rem] d-line-top pt-[2.75rem]">
          <dt className="d-oswald text-[1.75rem] uppercase tracking-[0.05em] text-(--d-muted)">Letzte Daten</dt>
          <dd className="d-lato text-[1.75rem]">{formatTimeSeconds(lastOkAt)}</dd>
        </dl>
      )}
    </StateScreen>
  )
}

// Own component so only this sentence re-renders every second
function RetryCountdown({ nextRetryAt }) {
  const now = useClock()
  const seconds = Math.max(0, Math.ceil((nextRetryAt - now.getTime()) / 1000))
  return <>Neuer Versuch in {seconds} s.</>
}
