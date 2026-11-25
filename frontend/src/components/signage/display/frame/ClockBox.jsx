import { useClock } from '../lib/useClock'
import { formatLongDate, formatTemperature, formatTime, formatTimeSeconds, formatWeekday } from '../lib/format'

// Cabin's digits differ in width ("1" is half a "0"), so the changing seconds sat a little left or right
// every second. The two seconds digits get cells as wide as the widest digit ("0", 0.61 em); hours and
// minutes stay proportional and only move once a minute.
export function ClockDigits({ time }) {
  const text = formatTimeSeconds(time)
  const head = text.slice(0, -2)
  return (
    <>
      {head}
      {[...text.slice(-2)].map((digit, i) => (
        <span key={i} className="inline-block w-[0.61em] text-center">{digit}</span>
      ))}
    </>
  )
}

// The only per-second rendering besides useClock users such as the retry countdown.
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
      <span className="d-head uppercase tracking-[0.06em] text-(--d-muted)">Stand</span>{' '}
      <span className="d-text">{formatTime(since)}</span>
    </span>
  )
}

function HeaderClock({ time, weather, staleSince, stacked, className }) {
  return (
    <header className={`flex items-end justify-between gap-[3rem] d-rule-bottom pb-[1.125rem] ${className}`}>
      <div className="flex items-baseline gap-[2.25rem]">
        <span className="d-head d-clock text-[8.25rem] leading-[0.9] tracking-[-0.01em] whitespace-nowrap"><ClockDigits time={time} /></span>
        {staleSince != null && <StaleHint since={staleSince} className="text-[1.75rem] text-(--d-fg-soft)" />}
      </div>
      <div className={`flex pb-[0.5rem] ${stacked ? 'flex-col items-end gap-[1.25rem]' : 'items-end gap-[3.5rem]'}`}>
        <div className="d-head text-right text-[2.25rem] font-normal uppercase leading-[1.3] tracking-[0.06em] text-(--d-fg-soft)">
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
      <div className="d-head text-[4.25rem] leading-[1]">{formatTemperature(weather.temperature)}</div>
      {weather.description && <div className="d-text text-[1.375rem] leading-[1.3] text-(--d-muted)">{weather.description}</div>}
    </div>
  )
}

function BoxClock({ time, weather, staleSince, className }) {
  const side = weather || staleSince != null
  return (
    <div data-clock="box" className={`d-card flex min-w-[18rem] items-center justify-center gap-[1.75rem] px-[1.75rem] text-(--d-fg) ${className}`}>
      {side && (
        <div className="flex flex-col items-end text-[1.25rem] leading-[1.35]">
          {weather && (
            <span className="d-text whitespace-nowrap">
              {formatTemperature(weather.temperature)}
              {weather.description && <span className="text-(--d-muted)"> {weather.description}</span>}
            </span>
          )}
          {staleSince != null && (
            <span className="whitespace-nowrap">
              <span className="d-head uppercase tracking-[0.06em] text-(--d-muted)">Stand</span>{' '}
              <span className="d-text">{formatTime(staleSince)}</span>
            </span>
          )}
        </div>
      )}
      <span className="d-head d-clock text-center text-[3.5rem] leading-none whitespace-nowrap"><ClockDigits time={time} /></span>
    </div>
  )
}

function CompactClock({ time, staleSince, className }) {
  return (
    <div className={`flex flex-col items-end ${className}`}>
      <span className="d-head d-clock text-right leading-[0.9] whitespace-nowrap"><ClockDigits time={time} /></span>
      {staleSince != null && <StaleHint since={staleSince} className="mt-[0.75rem] text-[1.5rem] text-(--d-fg-soft)" />}
    </div>
  )
}
