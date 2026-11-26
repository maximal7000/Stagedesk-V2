import { useClock } from '../lib/useClock'
import { formatLongDate, formatTemperature, formatTime, formatTimeSeconds, formatWeekday } from '../lib/format'

// Cabin's digits differ in width ("1" is half a "0"). Only the two seconds digits sit in a field as wide as
// "00", left-aligned with their normal spacing, so a changing second moves nothing; the rest of the time
// keeps its natural width and is placed normally (centred in boxes). It moves at most once a minute.
function ClockTime({ time, seconds, className }) {
  const text = seconds ? formatTimeSeconds(time) : formatTime(time)
  return (
    <span className={`d-head d-clock whitespace-nowrap ${className}`}>
      {seconds ? <>{text.slice(0, -2)}<span className="d-clock-sec">{text.slice(-2)}</span></> : text}
    </span>
  )
}

// The only per-second rendering besides useClock users such as the retry countdown.
// `seconds`: per view (DisplayView.clock_seconds); off shows HH:MM.
// `row` (compact only): the "Stand" hint beside the time instead of below it, for a one-line footer.
export default function ClockBox({ now, weather, staleSince, variant = 'header', stacked = false, seconds = true, row = false, className = '' }) {
  const tick = useClock()
  const time = now ?? tick
  if (variant === 'box') return <BoxClock time={time} weather={weather} staleSince={staleSince} seconds={seconds} className={className} />
  if (variant === 'corner') return <CornerClock time={time} staleSince={staleSince} seconds={seconds} className={className} />
  if (variant === 'inline') return <InlineClock time={time} staleSince={staleSince} seconds={seconds} className={className} />
  if (variant === 'compact') return <CompactClock time={time} staleSince={staleSince} seconds={seconds} row={row} className={className} />
  return <HeaderClock time={time} weather={weather} staleSince={staleSince} stacked={stacked} seconds={seconds} className={className} />
}

function StaleHint({ since, className = '' }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <span className="d-head uppercase tracking-[0.06em] text-(--d-muted)">Stand</span>{' '}
      <span className="d-text">{formatTime(since)}</span>
    </span>
  )
}

function HeaderClock({ time, weather, staleSince, stacked, seconds, className }) {
  return (
    <header className={`flex items-end justify-between gap-[3rem] d-rule-bottom pb-[1.125rem] ${className}`}>
      <div className="flex items-baseline gap-[2.25rem]">
        <ClockTime time={time} seconds={seconds} className="text-[8.25rem] leading-[0.9] tracking-[-0.01em]" />
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

function BoxClock({ time, weather, staleSince, seconds, className }) {
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
      <ClockTime time={time} seconds={seconds} className="text-[3.5rem] leading-none" />
    </div>
  )
}

// Bottom left in the logo column of the frame: time, weekday and date, left-aligned.
function CornerClock({ time, staleSince, seconds, className }) {
  return (
    <div data-clock="corner" className={`flex flex-col items-start ${className}`}>
      <ClockTime time={time} seconds={seconds} className="leading-[0.9]" />
      <div className="d-head mt-[0.875rem] text-[1.75rem] font-normal uppercase leading-[1.3] tracking-[0.06em] text-(--d-fg-soft)">
        <div>{formatWeekday(time)}</div>
        <div>{formatLongDate(time)}</div>
      </div>
      {staleSince != null && <StaleHint since={staleSince} className="mt-[0.75rem] text-[1.5rem] text-(--d-fg-soft)" />}
    </div>
  )
}

// One row: time, then weekday and date (footer under the pages, left)
function InlineClock({ time, staleSince, seconds, className }) {
  return (
    <div data-clock="inline" className={`flex items-baseline gap-[1.75rem] ${className}`}>
      <ClockTime time={time} seconds={seconds} className="leading-[0.9]" />
      <span className="d-head text-[1.75rem] uppercase tracking-[0.06em] text-(--d-fg-soft)">{formatWeekday(time)}, {formatLongDate(time)}</span>
      {staleSince != null && <StaleHint since={staleSince} className="text-[1.5rem] text-(--d-fg-soft)" />}
    </div>
  )
}

function CompactClock({ time, staleSince, seconds, row, className }) {
  if (row) {
    return (
      <div className={`flex flex-row items-baseline gap-[1.5rem] ${className}`}>
        {staleSince != null && <StaleHint since={staleSince} className="text-[1.5rem] text-(--d-fg-soft)" />}
        <ClockTime time={time} seconds={seconds} className="leading-[0.9]" />
      </div>
    )
  }
  return (
    <div className={`flex flex-col items-end ${className}`}>
      <ClockTime time={time} seconds={seconds} className="leading-[0.9]" />
      {staleSince != null && <StaleHint since={staleSince} className="mt-[0.75rem] text-[1.5rem] text-(--d-fg-soft)" />}
    </div>
  )
}
