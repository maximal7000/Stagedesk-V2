import { useMemo, useRef } from 'react'
import { fitRows, useBoxSize } from '../lib/fit'
import { chipTextColor } from '../lib/lines'
import { usePager } from '../lib/pager'
import { disruptionLabel, isBus, lineColor, lineLabel, minutesUntil, visibleDisruptions } from '../lib/transit'
import { useClockMinute } from '../lib/useClock'
import { Heading } from './parts'

// Abfahrten (Aufteilung "Breit", Entwurf departures.png): ein Block pro Haltestelle. Haltestellen mit Zügen
// (Hauptbahnhof/ZOB) stehen in einer eigenen hohen Spalte, die übrigen in einem Raster mit zwei Reihen.

const LINE = 1.64 // Zeilenhöhe / Zeilenschrift
const MIN_REM = 0.95 // Mindest-Zeilenschrift (Spec §5.2)
const PREF_REM = 1.375 // Zeilenschrift laut Entwurf
const SUBHEAD_REM = 2.25 // Zwischenüberschrift "Züge" / "Busse"
// Mindestbreite einer Zeile in em der Zeilenschrift, damit das Ziel lesbar bleibt. In schmalen Karten
// (Splitscreen) wird die Schrift dafür kleiner, höchstens bis MIN_REM.
const ROW_EM = { bus: 21, train: 26 }
const CARD_PAD_REM = 2.75 // horizontale Kartenpolster
const GAP_REM = 1.25

const hasTrains = (station) => (station.departures || []).some((d) => !isBus(d))

export default function DeparturesView({ view }) {
  const ref = useRef(null)
  const { width, remPx } = useBoxSize(ref)
  const stations = view.data?.stations ?? []
  const tall = stations.filter(hasTrains)
  const grid = stations.filter((s) => !hasTrains(s))
  const rows = grid.length > 1 ? 2 : 1
  const cols = Math.ceil(grid.length / rows)

  if (!stations.length) {
    return <p className="d-oswald pt-[2rem] text-[2rem] text-(--d-muted)">Keine Haltestellen eingerichtet.</p>
  }
  // Zu schmal für alle Spalten (Splitscreen, viele Haltestellen): ein gleichmäßiges Raster mit so vielen
  // Spalten, wie die Mindestbreite einer Karte zulässt, statt abgeschnittener Ziele.
  const cardPx = (ROW_EM[tall.length ? 'train' : 'bus'] * MIN_REM + CARD_PAD_REM) * remPx
  const gapPx = GAP_REM * remPx
  const wanted = cols + tall.length
  const fitCols = Math.max(1, Math.floor((width + gapPx) / (cardPx + gapPx)))
  if (width > 0 && fitCols < wanted) {
    return (
      <div
        ref={ref}
        className="grid h-full gap-[1.25rem]"
        style={{
          gridTemplateColumns: `repeat(${fitCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${Math.ceil(stations.length / fitCols)}, minmax(0, 1fr))`,
        }}
      >
        {[...tall, ...grid].map((s, i) => <StationCard key={`${s.station_id}-${i}`} station={s} />)}
      </div>
    )
  }
  return (
    <div ref={ref} className="flex h-full gap-[1.25rem]">
      {grid.length > 0 && (
        <div
          className="grid min-w-0 gap-[1.25rem]"
          style={{
            flex: `${cols} 1 0%`,
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {grid.map((s, i) => <StationCard key={`${s.station_id}-${i}`} station={s} />)}
        </div>
      )}
      {tall.map((s, i) => (
        <div key={`${s.station_id}-${i}`} className="min-w-0" style={{ flex: '1.2 1 0%' }}>
          <StationCard station={s} />
        </div>
      ))}
    </div>
  )
}

function StationCard({ station }) {
  const listRef = useRef(null)
  const { width, height, remPx } = useBoxSize(listRef)
  const deps = station.departures ?? []
  const grouped = deps.some(isBus) && deps.some((d) => !isBus(d))
  const reserve = grouped ? 2 * SUBHEAD_REM * remPx : 0
  // Breite begrenzt die Wunschgröße; fitRows rechnet Zeilen und Schrift dann mit genau dieser Größe
  const rowEm = hasTrains(station) ? ROW_EM.train : ROW_EM.bus
  const widthRem = width > 0 ? width / rowEm / remPx : PREF_REM
  const { rows, fontPx } = fitRows({
    height: height - reserve, remPx, count: deps.length, max: station.max_departures,
    minRem: MIN_REM, prefRem: Math.max(MIN_REM, Math.min(PREF_REM, widthRem)), lineFactor: LINE,
  })
  const shown = deps.slice(0, rows)
  const groups = grouped
    ? [['Züge', shown.filter((d) => !isBus(d)), true], ['Busse', shown.filter(isBus), false]].filter(([, list]) => list.length)
    : [[null, shown, hasTrains(station)]]

  return (
    <section className="d-card flex h-full min-h-0 flex-col px-[1.375rem] pb-[0.75rem] pt-[1.125rem]">
      <Heading
        className="d-line-bottom pb-[0.375rem]"
        aside={station.walk_minutes > 0 && (
          <span className="d-lato shrink-0 whitespace-nowrap text-[1.0625rem] text-(--d-muted)">{station.walk_minutes} min Fußweg</span>
        )}
      >
        {station.station_name}
      </Heading>
      <div ref={listRef} className="min-h-0 flex-1 overflow-hidden" style={{ fontSize: `${fontPx}px` }}>
        {deps.length === 0 ? (
          <p className="d-lato pt-[0.75rem] text-[1.375rem] text-(--d-muted)">
            {station.error ? 'Abfahrten derzeit nicht abrufbar' : 'Keine Abfahrten in nächster Zeit'}
          </p>
        ) : groups.map(([label, list, trains]) => (
          <div key={label ?? 'all'}>
            {label && (
              <div
                className="d-oswald d-line-bottom flex items-end pb-[0.25rem] text-[1.125rem] uppercase tracking-[0.06em] text-(--d-muted)"
                style={{ height: `${SUBHEAD_REM}rem` }}
              >
                {label}
              </div>
            )}
            {list.map((dep, i) => <DepartureRow key={`${dep.line}-${dep.departure}-${i}`} dep={dep} trains={trains} />)}
          </div>
        ))}
      </div>
    </section>
  )
}

// Spalten: Zeit, Linie, Ziel, (Gleis), Minuten. Alle Maße in em der Zeilenschrift.
const ROW_COLUMNS = { bus: '3.4em 2.4em minmax(0,1fr) auto', train: '3.4em 3.4em minmax(0,1fr) auto auto' }

function DepartureRow({ dep, trains }) {
  const color = lineColor(dep)
  const cancelled = !!dep.cancelled
  return (
    <div
      className="d-line-bottom grid items-center gap-x-[0.55em]"
      style={{ height: `${LINE}em`, gridTemplateColumns: trains ? ROW_COLUMNS.train : ROW_COLUMNS.bus }}
    >
      <span className={`d-oswald text-[1.05em] ${cancelled ? 'text-(--d-muted) line-through' : ''}`}>{dep.departure}</span>
      <span
        className="d-oswald flex h-[1.36em] items-center justify-center rounded-[0.0625rem] text-[0.95em] font-medium leading-none"
        style={{ background: color ?? 'var(--d-chip)', color: color ? chipTextColor(color) : 'var(--d-chip-fg)' }}
      >
        {lineLabel(dep)}
      </span>
      <span className={`d-lato min-w-0 truncate ${cancelled ? 'text-(--d-muted) line-through' : ''}`}>{dep.direction}</span>
      {trains && (
        <span className="d-oswald whitespace-nowrap pl-[0.5em] text-[0.8em] text-(--d-muted)">
          {dep.platform ? `Gl. ${dep.platform}` : ''}
        </span>
      )}
      <span className="d-oswald whitespace-nowrap pl-[0.5em] text-right text-[1.05em]">
        {cancelled
          ? <span className="uppercase tracking-[0.02em] text-(--d-red)">Fällt aus</span>
          : <Minutes dep={dep} />}
      </span>
    </div>
  )
}

// Eigene Blattkomponente: rendert nur beim Minutenwechsel neu
function Minutes({ dep }) {
  const now = useClockMinute()
  const min = minutesUntil(dep, now)
  const delay = Number(dep.delay) || 0
  return (
    <>
      {min == null ? '' : min <= 0 ? 'jetzt' : `${min} min`}
      {delay > 0 && <span className="pl-[0.2em] text-[0.8em] text-(--d-warn)">+{delay}</span>}
    </>
  )
}

// Störungsleiste links neben der Uhr-Box; blättert alle page_seconds
function DisruptionBar({ view }) {
  const items = useMemo(() => visibleDisruptions(view.data?.disruptions), [view.data?.disruptions])
  const { index, count } = usePager(items, view.page_seconds)
  if (!count) return null
  const d = items[index]
  return (
    <div className="d-card d-footer-item flex h-full items-center gap-[1.75rem] px-[1.375rem]">
      <span className="d-oswald shrink-0 whitespace-nowrap text-[1.5rem] uppercase tracking-[0.04em] text-(--d-red)">
        {disruptionLabel(d)}
      </span>
      <p className="d-lato line-clamp-2 min-w-0 flex-1 text-[1.375rem] leading-[1.3]">
        {d.title && <strong className="font-bold">{d.title}{d.text ? ':' : ''}</strong>}
        {d.title && d.text ? ' ' : ''}
        {d.text}
      </p>
      {count > 1 && (
        <span className="d-oswald shrink-0 whitespace-nowrap text-[1.375rem] text-(--d-muted)">{index + 1} / {count}</span>
      )}
    </div>
  )
}

DeparturesView.Footer = DisruptionBar
