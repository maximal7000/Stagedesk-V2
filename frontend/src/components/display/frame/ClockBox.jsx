import { useClock } from '../lib/useClock'
import { formatLongDate, formatTemperature, formatTime, formatWeekday } from '../lib/format'

// Uhr der Anzeige. Einzige sekündlich rendernde Stelle neben useClock-Nutzern wie dem Wiederholungs-Countdown.
//   variant "header":  große Uhr links, Datum (und Wetter) rechts, Linie darunter (Stil A und C);
//                      stacked stapelt Datum und Wetter (Hochformat)
//   variant "box":     dunkle Box unten rechts (Stil B, dichte Ansichten)
//   variant "compact": nur die Uhrzeit (Zustandsbildschirme, Ruhemodus)
// staleSince setzt den Hinweis "Stand HH:MM" (letzte gültige Daten).
export default function ClockBox({ now, weather, staleSince, variant = 'header', stacked = false, className = '' }) {
  const tick = useClock()
  const time = now ?? tick
  if (variant === 'box') return <BoxClock time={time} weather={weather} staleSince={staleSince} className={className} />
  if (variant === 'compact') return <CompactClock time={time} staleSince={staleSince} className={className} />
  return <HeaderClock time={time} weather={weather} staleSince={staleSince} stacked={stacked} className={className} />
}

function StaleHint({ since, className = '' }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <span className="d-oswald uppercase tracking-[0.06em] text-(--d-muted)">Stand</span>{' '}
      <span className="d-lato">{formatTime(since)}</span>
    </span>
  )
}

function HeaderClock({ time, weather, staleSince, stacked, className }) {
  return (
    <header className={`flex items-end justify-between gap-[3rem] d-rule-bottom pb-[1.125rem] ${className}`}>
      <div className="flex items-baseline gap-[2.25rem]">
        <span className="d-oswald text-[8.25rem] font-light leading-[0.9] tracking-[-0.01em]">{formatTime(time)}</span>
        {staleSince != null && <StaleHint since={staleSince} className="text-[1.75rem] text-(--d-fg-soft)" />}
      </div>
      <div className={`flex pb-[0.5rem] ${stacked ? 'flex-col items-end gap-[1.25rem]' : 'items-end gap-[3.5rem]'}`}>
        <div className="d-oswald text-right text-[2.25rem] font-normal uppercase leading-[1.3] tracking-[0.06em] text-(--d-fg-soft)">
          <div>{formatWeekday(time)}</div>
          <div>{formatLongDate(time)}</div>
        </div>
        {weather && <WeatherBlock weather={weather} />}
      </div>
    </header>
  )
}

function WeatherBlock({ weather }) {
  return (
    <div className="text-right">
      <div className="d-oswald text-[4.25rem] font-light leading-[1]">{formatTemperature(weather.temperature)}</div>
      {weather.description && <div className="d-lato text-[1.375rem] leading-[1.3] text-(--d-muted)">{weather.description}</div>}
    </div>
  )
}

function BoxClock({ time, weather, staleSince, className }) {
  const side = weather || staleSince != null
  return (
    <div className={`flex min-w-[15rem] items-center justify-center gap-[1.75rem] bg-[#2b2b2b] px-[1.75rem] text-[#fff] ${className}`}>
      {side && (
        <div className="flex flex-col items-end text-[1.25rem] leading-[1.35]">
          {weather && (
            <span className="d-lato whitespace-nowrap">
              {formatTemperature(weather.temperature)}
              {weather.description && <span className="text-[#ffffffb3]"> {weather.description}</span>}
            </span>
          )}
          {staleSince != null && (
            <span className="whitespace-nowrap">
              <span className="d-oswald uppercase tracking-[0.06em] text-[#ffffffb3]">Stand</span>{' '}
              <span className="d-lato">{formatTime(staleSince)}</span>
            </span>
          )}
        </div>
      )}
      <span className="d-oswald text-[3.75rem] font-light leading-none">{formatTime(time)}</span>
    </div>
  )
}

function CompactClock({ time, staleSince, className }) {
  return (
    <div className={`flex flex-col items-end ${className}`}>
      <span className="d-oswald font-light leading-[0.9]">{formatTime(time)}</span>
      {staleSince != null && <StaleHint since={staleSince} className="mt-[0.75rem] text-[1.5rem] text-(--d-fg-soft)" />}
    </div>
  )
}
