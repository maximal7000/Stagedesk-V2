import { useMemo, useRef } from 'react'
import { useBoxSize } from '../lib/fit'
import { formatTemperature, formatTime, formatWeekday } from '../lib/format'
import { chipTextColor } from '../lib/lines'
import { paginateByHeight, useChildHeights, usePager } from '../lib/pager'
import {
  assignColumns, delayLabel, disruptionLabel, formatDepartureTime, isBus, lineColor, lineLabel, stripCommonCity,
  visibleDisruptions,
} from '../lib/transit'
import { useClockMinute } from '../lib/useClock'
import { Heading } from './parts'

const ROW_REM = 1.1875
const ROW_EM = 1.55
const GAP_REM = 1.25
// Below this width a column cannot show time, chip and a readable destination; the columns then wrap
// into several rows (portrait, split screen).
const MIN_COLUMN_REM = 16
const LONG_CHIP = 7
const ROW_TEMPLATE = 'minmax(4.3em, max-content) max-content minmax(0, 1fr) max-content'
const SOURCE_NAMES = [['db', 'DB'], ['nahsh', 'NAH.SH']]
const DAY_MONTH_LONG = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })

const clampColumns = (value) => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 ? Math.min(5, n) : 4
}

export default function DeparturesView({ view }) {
  const ref = useRef(null)
  const { width, remPx } = useBoxSize(ref)
  const data = view.data ?? {}
  const stations = useMemo(() => data.stations ?? [], [data.stations])
  const columns = useMemo(() => assignColumns(stations, clampColumns(data.columns)), [stations, data.columns])
  const nameOf = useMemo(
    () => (data.strip_city === false ? (name) => name : stripCommonCity(stations.map((s) => s.station_name))),
    [stations, data.strip_city],
  )
  const disruptions = useMemo(() => visibleDisruptions(data.disruptions), [data.disruptions])
  const withDisruptions = data.show_disruptions !== false

  if (!stations.length) {
    return <p className="d-oswald pt-[2rem] text-[2rem] text-(--d-muted)">Keine Haltestellen eingerichtet.</p>
  }

  const cells = columns.length + (withDisruptions ? 1 : 0)
  const gapPx = GAP_REM * remPx
  const fit = width > 0 ? Math.max(1, Math.floor((width + gapPx) / (MIN_COLUMN_REM * remPx + gapPx))) : cells
  const wrapped = fit < cells
  const grid = wrapped
    ? {
      gridTemplateColumns: `repeat(${fit}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${Math.ceil(cells / fit)}, minmax(0, 1fr))`,
    }
    : {
      gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))${withDisruptions ? ' minmax(0, 0.95fr)' : ''}`,
      gridTemplateRows: 'minmax(0, 1fr)',
    }
  const disruptionSpan = wrapped ? fit - (columns.length % fit) : 1

  return (
    <div ref={ref} className="grid h-full gap-[1.25rem]" style={grid}>
      {columns.map((list, i) => (
        <div
          key={i}
          data-station-column
          className="grid min-h-0 min-w-0 gap-[1.25rem]"
          style={{ gridTemplateRows: `repeat(${Math.max(1, list.length)}, minmax(0, 1fr))` }}
        >
          {list.map((s) => (
            <StationCard key={`${s.station_id}-${s.index}`} station={s} name={nameOf(s.station_name)} format={data.time_format} />
          ))}
        </div>
      ))}
      {withDisruptions && (
        <DisruptionColumn items={disruptions} seconds={view.page_seconds} span={disruptionSpan} />
      )}
    </div>
  )
}

function StationCard({ station, name, format }) {
  const deps = station.departures ?? []
  const split = station.split_modes !== false && deps.some(isBus) && deps.some((d) => !isBus(d))
  const sections = split
    ? [['bus', 'Busse', deps.filter(isBus)], ['train', 'Züge', deps.filter((d) => !isBus(d))]]
    : [[null, null, deps]]
  return (
    <section className="d-card flex min-h-0 min-w-0 flex-col px-[1.375rem] pb-[0.75rem] pt-[1.125rem]">
      <Heading
        size="text-[1.875rem]"
        className="d-line-bottom mb-[0.25rem] pb-[0.375rem]"
        aside={station.walk_minutes > 0 && (
          <span className="d-lato shrink-0 whitespace-nowrap text-[0.9375rem] text-(--d-muted)">{station.walk_minutes} min</span>
        )}
      >
        {name}
      </Heading>
      {deps.length === 0 ? (
        <p className="d-lato pt-[0.625rem] text-[1.0625rem] text-(--d-muted)">
          {station.error ? 'Abfahrten nicht verfügbar' : 'Keine Abfahrten'}
        </p>
      ) : sections.map(([key, label, list]) => (
        <div key={key ?? 'all'} data-section={key ?? undefined} className="flex min-h-0 flex-1 flex-col">
          {label && (
            <div data-section-label className="d-oswald mt-[0.375rem] text-[1rem] uppercase tracking-[0.06em] text-(--d-muted)">
              {label}
            </div>
          )}
          <DepartureList deps={list} format={format} />
        </div>
      ))}
    </section>
  )
}

// Only whole rows: as many as fit into the measured height, the rest is cut off (no paging).
function DepartureList({ deps, format }) {
  const ref = useRef(null)
  const { height, remPx } = useBoxSize(ref)
  const rowPx = ROW_EM * ROW_REM * remPx
  const shown = height > 0 ? deps.slice(0, Math.floor(height / rowPx)) : deps
  return (
    <div
      ref={ref}
      className="grid min-h-0 flex-1 content-start gap-x-[0.5em] overflow-hidden"
      style={{ fontSize: `${ROW_REM}rem`, gridTemplateColumns: ROW_TEMPLATE, gridAutoRows: `${ROW_EM}em` }}
    >
      {shown.map((dep, i) => <DepartureRow key={`${dep.line}-${dep.departure}-${i}`} dep={dep} format={format} />)}
    </div>
  )
}

function DepartureRow({ dep, format }) {
  const color = lineColor(dep)
  const cancelled = !!dep.cancelled
  const label = lineLabel(dep)
  const long = label.length >= LONG_CHIP
  const end = cancelled || (!isBus(dep) && !!dep.platform)
  return (
    <div data-departure-row className="d-line-bottom col-span-full grid grid-cols-subgrid items-center">
      <DepartureTime dep={dep} format={format} cancelled={cancelled} />
      <span
        data-chip
        className={`d-oswald flex items-center justify-center justify-self-start whitespace-nowrap rounded-[0.0625rem] px-[0.3em] font-medium leading-none ${
          long ? 'h-[1.615em] min-w-[2.85em] text-[0.8em]' : 'h-[1.36em] min-w-[2.4em] text-[0.95em]'
        }`}
        style={{ background: color ?? 'var(--d-chip)', color: color ? chipTextColor(color) : 'var(--d-chip-fg)' }}
      >
        {label}
      </span>
      {/* Without platform or cancellation the destination may use the last column too */}
      <span className={`d-lato min-w-0 truncate ${end ? '' : 'col-span-2'} ${cancelled ? 'text-(--d-muted) line-through' : ''}`}>
        {dep.direction}
      </span>
      {cancelled
        ? <span className="d-oswald whitespace-nowrap text-[0.85em] uppercase tracking-[0.02em] text-(--d-red)">fällt aus</span>
        : end && <Platform dep={dep} />}
    </div>
  )
}

function Platform({ dep }) {
  const planned = dep.platform_planned
  if (planned && planned !== dep.platform) {
    return (
      <span data-platform className="d-oswald whitespace-nowrap text-[0.85em] text-(--d-warn)">
        <s className="text-(--d-muted)">Gl. {planned}</s> Gl. {dep.platform}
      </span>
    )
  }
  return <span data-platform className="d-oswald whitespace-nowrap text-[0.85em] text-(--d-muted)">Gl. {dep.platform}</span>
}

// Own leaf component: re-renders only when the minute changes
function DepartureTime({ dep, format, cancelled }) {
  const now = useClockMinute()
  const delay = cancelled ? null : delayLabel(dep)
  return (
    <span className={`d-oswald whitespace-nowrap text-[1.12em] ${cancelled ? 'text-(--d-muted) line-through' : ''}`}>
      {formatDepartureTime(dep, now, format)}
      {delay && <span data-delay className="pl-[0.25em] text-[0.7em] text-(--d-warn)">{delay}</span>}
    </span>
  )
}

function DisruptionColumn({ items, seconds, span }) {
  const bodyRef = useRef(null)
  const measureRef = useRef(null)
  const { width, height, remPx } = useBoxSize(bodyRef)
  const heights = useChildHeights(measureRef, [items, width, remPx])
  const pages = useMemo(() => {
    if (!items.length) return []
    if (heights.length !== items.length) return [items.map((_, i) => i)]
    return paginateByHeight(heights, height)
  }, [items, heights, height])
  const { index, count } = usePager(pages, seconds)
  const page = (pages[index] ?? []).map((i) => items[i])
  return (
    <section
      data-disruptions
      className="d-card flex min-h-0 min-w-0 flex-col px-[1.375rem] pb-[0.875rem] pt-[1.125rem]"
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden">
        {items.length === 0
          ? <p className="d-lato text-[1.0625rem] text-(--d-muted)">Keine Störungen</p>
          : page.map((d, i) => <Disruption key={d.id ?? i} item={d} />)}
        <div ref={measureRef} aria-hidden="true" className="invisible absolute inset-x-0 top-0">
          {items.map((d, i) => <Disruption key={d.id ?? i} item={d} />)}
        </div>
      </div>
      {count > 1 && (
        <span className="d-oswald self-end pt-[0.5rem] text-[1rem] text-(--d-muted)">{index + 1} / {count}</span>
      )}
    </section>
  )
}

// Spacing as padding, not margin: the measured heights must contain it.
function Disruption({ item }) {
  return (
    <article className="pb-[0.875rem]">
      <div className="d-line-bottom pb-[0.75rem]">
        <div className="d-oswald text-[0.9375rem] uppercase tracking-[0.05em] text-(--d-red)">{disruptionLabel(item)}</div>
        {item.title && <div className="d-lato mt-[0.1875rem] text-[1.0625rem] font-bold leading-[1.3]">{item.title}</div>}
        {item.text && <p className="d-lato mt-[0.1875rem] line-clamp-6 text-[0.96875rem] leading-[1.35]">{item.text}</p>}
        {item.image && (
          <img src={item.image} alt="" className="mt-[0.5rem] block h-[7.375rem] w-full bg-(--d-soft) object-contain" />
        )}
      </div>
    </article>
  )
}

function StatusBox({ view }) {
  const now = useClockMinute()
  const data = view.data ?? {}
  const weather = view.show_weather ? view.weather : null
  const temperature = weather ? formatTemperature(weather.temperature) : ''
  const stand = formatTime(data.status?.fetched_at)
  const sources = data.status?.sources ?? {}
  const parts = [
    ['date', `${formatWeekday(now)}, ${DAY_MONTH_LONG.format(now)}`, ''],
    temperature && ['weather', [temperature, weather.description].filter(Boolean).join(' '), ''],
    stand && ['stand', `Stand ${stand}`, 'text-[1rem] text-(--d-muted)'],
    ...SOURCE_NAMES.filter(([key]) => sources[key] === 'error')
      .map(([key, label]) => [key, `${label} nicht erreichbar`, 'text-[1rem] text-(--d-warn)']),
  ].filter(Boolean)
  return (
    <div className="d-card d-footer-item flex h-full min-w-0 items-center gap-[1.75rem] overflow-hidden px-[1.625rem] text-[1.1875rem]">
      {parts.map(([key, text, cls], i) => (
        <span key={key} className="contents">
          {i > 0 && <span aria-hidden="true" className="text-(--d-muted)">·</span>}
          <span data-footer-part className={`d-lato whitespace-nowrap ${cls}`}>{text}</span>
        </span>
      ))}
    </div>
  )
}

DeparturesView.Footer = StatusBox
// The footer box shows the weather, so the clock next to it does not repeat it.
DeparturesView.weatherInFooter = true
