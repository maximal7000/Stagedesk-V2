import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useBoxSize, wrapColumns } from '../lib/fit'
import { formatTemperature, formatTime, formatWeekday } from '../lib/format'
import { chipTextColor } from '../lib/lines'
import { paginateByHeight, useChildHeights, usePager } from '../lib/pager'
import {
  assignColumns, delayLabel, disruptionLabel, formatDepartureTime, isBus, isDeparted, lineColor, lineLabel,
  stripCommonCity, visibleDisruptions,
} from '../lib/transit'
import { useClockMinute } from '../lib/useClock'

const ROW_REM = 1.1875
const ROW_EM = 1.55
const GAP_REM = 1.25
// Below these widths a column cannot show time, chip and a readable destination (trains also need the
// platform); the columns then wrap into several rows (portrait, split screen).
const MIN_COLUMN_REM = { bus: 16, train: 22, disruptions: 16 }
const LONG_CHIP = 7
// Time and chip are shared by all rows of a list so destinations line up; the platform sits inside the
// destination cell per row, so one wide platform change does not narrow every destination.
const ROW_TEMPLATE = 'minmax(4.3em, max-content) max-content minmax(6em, 1fr)'
const HEADING_REM = [1.875, 1.625, 1.4375, 1.25]
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
  // A set column puts the messages below that column's stops instead of into a column of their own
  const shared = withDisruptions && Number.isInteger(data.disruption_column) && data.disruption_column >= 1
    ? Math.min(data.disruption_column, columns.length) - 1
    : null
  const ownColumn = withDisruptions && shared === null

  if (!stations.length) {
    return <p className="d-oswald pt-[2rem] text-[2rem] text-(--d-muted)">Keine Haltestellen eingerichtet.</p>
  }

  const cells = columns.length + (ownColumn ? 1 : 0)
  const mins = [
    ...columns.map((list) => MIN_COLUMN_REM[list.some(hasTrains) ? 'train' : 'bus']),
    ...(ownColumn ? [MIN_COLUMN_REM.disruptions] : []),
  ]
  const fit = wrapColumns(mins, width / remPx, GAP_REM)
  const wrapped = fit < cells
  const grid = wrapped
    ? {
      gridTemplateColumns: `repeat(${fit}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${Math.ceil(cells / fit)}, minmax(0, 1fr))`,
    }
    : {
      gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))${ownColumn ? ' minmax(0, 0.95fr)' : ''}`,
      gridTemplateRows: 'minmax(0, 1fr)',
    }
  const disruptionSpan = wrapped ? fit - (columns.length % fit) : 1

  return (
    <div ref={ref} className="grid h-full gap-[1.25rem]" style={grid}>
      {columns.map((list, i) => {
        const rows = list.length + (shared === i ? 1 : 0)
        return (
          <div
            key={i}
            data-station-column
            className="grid min-h-0 min-w-0 gap-[1.25rem]"
            style={{ gridTemplateRows: `repeat(${Math.max(1, rows)}, minmax(0, 1fr))` }}
          >
            {list.map((s, pos) => (
              <StationCard
                key={`${s.station_id}-${s.index ?? `p${pos}`}`} station={s} name={nameOf(s.station_name)} format={data.time_format}
              />
            ))}
            {shared === i && <DisruptionColumn items={disruptions} seconds={view.page_seconds} heading />}
          </div>
        )
      })}
      {ownColumn && (
        <DisruptionColumn items={disruptions} seconds={view.page_seconds} span={disruptionSpan} />
      )}
    </div>
  )
}

const hasTrains = (station) => (station.departures ?? []).some((d) => !isBus(d))

// Long names ("ZOB/Hauptbahnhof") step down in size until they fit next to the walking time.
function useFittedHeading(ref, name, width) {
  const [step, setStep] = useState(0)
  useLayoutEffect(() => {
    let alive = true
    const fit = () => {
      const el = ref.current
      if (!alive || !el) return
      const previous = el.style.fontSize
      let next = 0
      for (; next < HEADING_REM.length - 1; next++) {
        el.style.fontSize = `${HEADING_REM[next]}rem`
        // Sub-pixel widths: scrollWidth rounds up, clientWidth down
        if (el.scrollWidth <= el.clientWidth + 1) break
      }
      // React does not rewrite the style when the step stays the same
      el.style.fontSize = previous
      setStep(next)
    }
    fit()
    document.fonts?.ready?.then(fit)
    return () => { alive = false }
  }, [ref, name, width])
  return HEADING_REM[step]
}

function StationCard({ station, name, format }) {
  const cardRef = useRef(null)
  const headingRef = useRef(null)
  const { width } = useBoxSize(cardRef)
  const headingRem = useFittedHeading(headingRef, name, width)
  const now = useClockMinute()
  // Departed trips stay hidden between two server updates instead of reading "jetzt".
  const deps = (station.departures ?? []).filter((d) => !isDeparted(d, now))
  const split = station.split_modes !== false && deps.some(isBus) && deps.some((d) => !isBus(d))
  const sections = split
    ? [['bus', 'Busse', deps.filter(isBus)], ['train', 'Züge', deps.filter((d) => !isBus(d))]]
    : [[null, null, deps]]
  return (
    <section ref={cardRef} className="d-card @container flex min-h-0 min-w-0 flex-col px-[1.375rem] pb-[0.75rem] pt-[1.125rem]">
      <header className="d-line-bottom mb-[0.25rem] flex items-baseline justify-between gap-[0.75rem] pb-[0.375rem]">
        <h2
          ref={headingRef}
          className="d-kicker d-oswald min-w-0 truncate font-normal uppercase leading-[1.15] tracking-[0.03em]"
          style={{ fontSize: `${headingRem}rem` }}
        >
          {name}
        </h2>
        {station.walk_minutes > 0 && (
          <span className="d-lato shrink-0 whitespace-nowrap text-[0.9375rem] text-(--d-muted)">{station.walk_minutes} min</span>
        )}
      </header>
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
// At least one row, so a very low card still shows the next departure.
function DepartureList({ deps, format }) {
  const ref = useRef(null)
  const { height, remPx } = useBoxSize(ref)
  const rowPx = ROW_EM * ROW_REM * remPx
  const shown = height > 0 ? deps.slice(0, Math.max(1, Math.floor(height / rowPx))) : deps
  return (
    <div
      ref={ref}
      data-departure-list
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
      <span data-destination className="flex min-w-0 items-center gap-x-[0.4em]">
        <span className={`d-lato min-w-0 flex-1 truncate ${cancelled ? 'text-(--d-muted) line-through' : ''}`}>{dep.direction}</span>
        {cancelled
          ? <span data-cancelled className="d-oswald shrink-0 whitespace-nowrap text-[0.85em] uppercase tracking-[0.02em] text-(--d-red)">fällt aus</span>
          : !isBus(dep) && dep.platform && <Platform dep={dep} />}
      </span>
    </div>
  )
}

function Platform({ dep }) {
  const planned = dep.platform_planned
  if (planned && planned !== dep.platform) {
    return (
      <span data-platform className="d-oswald shrink-0 whitespace-nowrap text-[0.85em]">
        <s className="pr-[0.35em] text-(--d-muted) decoration-[0.1em]"><PlatformPrefix />{planned}</s>{' '}
        <span data-platform-new className="text-(--d-warn)"><PlatformPrefix />{dep.platform}</span>
      </span>
    )
  }
  return (
    <span data-platform className="d-oswald shrink-0 whitespace-nowrap text-[0.85em] text-(--d-muted)">
      <PlatformPrefix />{dep.platform}
    </span>
  )
}

// Only in very narrow cards the number alone, so the destination keeps its room; the 4K landscape
// columns (about 19rem) keep "Gl.".
const PlatformPrefix = () => <span data-platform-prefix className="@max-[16rem]:hidden">Gl. </span>

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

// Images take the full width in their own aspect ratio, but at most this share of the box height, so
// one tall map does not push every message onto its own page. A box shared with stops is lower and
// allows a larger share, or the image would not reach the full width.
const IMAGE_SHARE = { column: 0.4, shared: 0.6 }

function DisruptionColumn({ items, seconds, span = 1, heading = false }) {
  const bodyRef = useRef(null)
  const measureRef = useRef(null)
  const { width, height, remPx } = useBoxSize(bodyRef)
  const imageMax = height > 0 ? Math.round(height * IMAGE_SHARE[heading ? 'shared' : 'column']) : undefined
  const heights = useChildHeights(measureRef, [items, width, remPx, imageMax])
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
      {heading && (
        <header className="d-line-bottom mb-[0.625rem] pb-[0.375rem]">
          <h2 className="d-kicker d-oswald truncate text-[1.875rem] font-normal uppercase leading-[1.15] tracking-[0.03em]">Störungen</h2>
        </header>
      )}
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden">
        {items.length === 0
          ? <p className="d-lato text-[1.0625rem] text-(--d-muted)">Keine Störungen</p>
          : page.map((d, i) => <Disruption key={d.id ?? i} item={d} imageMax={imageMax} />)}
        <div ref={measureRef} aria-hidden="true" className="invisible absolute inset-x-0 top-0">
          {items.map((d, i) => <Disruption key={d.id ?? i} item={d} imageMax={imageMax} />)}
        </div>
      </div>
      {count > 1 && (
        <span className="d-oswald self-end pt-[0.5rem] text-[1rem] text-(--d-muted)">{index + 1} / {count}</span>
      )}
    </section>
  )
}

// Spacing as padding, not margin: the measured heights must contain it.
function Disruption({ item, imageMax }) {
  return (
    <article className="pb-[0.875rem]">
      <div className="d-line-bottom pb-[0.75rem]">
        <div className="d-oswald text-[0.9375rem] uppercase tracking-[0.05em] text-(--d-red)">{disruptionLabel(item)}</div>
        {item.title && <div className="d-lato mt-[0.1875rem] text-[1.0625rem] font-bold leading-[1.3]">{item.title}</div>}
        {item.text && <p className="d-lato mt-[0.1875rem] text-[0.96875rem] leading-[1.35]">{item.text}</p>}
        {item.image && (
          <img
            src={item.image} alt="" data-disruption-image
            className="mt-[0.5rem] block h-auto w-full object-contain"
            style={imageMax ? { maxHeight: `${imageMax}px` } : undefined}
          />
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
  const parts = [
    ['date', `${formatWeekday(now)}, ${DAY_MONTH_LONG.format(now)}`, ''],
    temperature && ['weather', [temperature, weather.description].filter(Boolean).join(' '), ''],
    stand && ['stand', `Stand ${stand}`, 'text-[1rem] text-(--d-muted)'],
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
