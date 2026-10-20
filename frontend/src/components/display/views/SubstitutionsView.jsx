import { useMemo, useRef } from 'react'
import { useBoxSize } from '../lib/fit'
import { formatDayMonth, formatTime, formatWeekday, parseLocalDate } from '../lib/format'
import { paginate, usePager } from '../lib/pager'
import { Heading, PageCount } from './parts'

// Vertretungsplan (Stil B, Entwurf substitutions.png): Heute und Morgen nebeneinander, die Nachricht
// zum Tag als Kasten. Ohne eigene Daten (kein Schlüssel, WebUntis nicht erreichbar) das WebUntis-iframe.

const LIVE_SOURCES = ['substitutions', 'timetable']
const ROW_REM = 2.1875
const COLUMNS = '7fr 5fr 6fr 14fr 15fr 20fr 23fr'
const KIND = {
  substitution: { label: 'Vertretung', tone: '' },
  cancelled: { label: 'Entfall', tone: 'text-(--d-red)' },
  room_change: { label: 'Raumänderung', tone: 'text-(--d-info)' },
  other: { label: 'Änderung', tone: '' },
}

export default function SubstitutionsView({ view }) {
  const data = view.data ?? {}
  const days = data.days ?? []
  const live = LIVE_SOURCES.includes(data.source) && days.length > 0
  if (!live) {
    if (data.fallback_url) return <FallbackFrame url={data.fallback_url} />
    // source null: Daten gibt es nur mit gültigem Schlüssel; sonst ist WebUntis nicht erreichbar
    return (
      <div className="d-card h-full px-[2rem] py-[1.75rem]">
        <Heading>Vertretungsplan</Heading>
        <p className="d-lato mt-[1.25rem] text-[1.5rem] text-(--d-fg-soft)">
          {data.source == null
            ? 'Für den Vertretungsplan fehlt der Bildschirm-Schlüssel in der Kiosk-URL.'
            : 'Der Vertretungsplan ist derzeit nicht abrufbar. Im Admin unter Monitore die WebUntis-Verbindung prüfen.'}
        </p>
      </div>
    )
  }
  return <DayColumns days={days} news={data.news} seconds={view.page_seconds} />
}

// Zwei Tage nebeneinander; in schmalen Flächen (Splitscreen) untereinander, damit die Spalten lesbar bleiben
const STACK_BELOW_REM = 100

function DayColumns({ days, news, seconds }) {
  const ref = useRef(null)
  const { width, remPx } = useBoxSize(ref)
  const stacked = days.length > 1 && width > 0 && width / remPx < STACK_BELOW_REM
  return (
    <div ref={ref} className={`flex h-full gap-[1.25rem] ${stacked ? 'flex-col' : ''}`}>
      {days.map((day, i) => (
        <DayCard key={day.date ?? i} day={day} news={i === 0 ? news : null} seconds={seconds} />
      ))}
    </div>
  )
}

function dayTitle(day) {
  const date = parseLocalDate(day.date)
  const weekday = formatWeekday(date)
  if (!weekday) return day.label ?? ''
  const label = day.label && day.label.toLowerCase() !== weekday.toLowerCase() ? `${day.label} · ` : ''
  return `${label}${weekday} ${formatDayMonth(date)}`
}

function DayCard({ day, news, seconds }) {
  const bodyRef = useRef(null)
  const { height, remPx } = useBoxSize(bodyRef)
  const rows = useMemo(() => day.rows ?? [], [day.rows])
  const perPage = Math.max(1, Math.floor(height / (ROW_REM * remPx)))
  const pages = useMemo(() => (height > 0 ? paginate(rows, perPage) : []), [rows, perPage, height])
  const { index, count } = usePager(pages, seconds)
  const page = pages[index] ?? []

  return (
    <section className="d-card flex min-h-0 min-w-0 flex-1 flex-col px-[1.5rem] pb-[1rem] pt-[1.375rem]">
      <Heading size="text-[2rem]" aside={<PageCount index={index} count={count} />}>{dayTitle(day)}</Heading>
      {news && (
        <p className="d-lato mt-[1rem] line-clamp-3 bg-(--d-soft) px-[0.875rem] py-[0.625rem] text-[1.25rem] leading-[1.35]">
          <span className="d-oswald pr-[0.5rem] uppercase tracking-[0.06em] text-(--d-muted)">Nachricht</span>
          {news}
        </p>
      )}
      <div
        className="d-oswald d-rule-bottom mt-[1.25rem] grid gap-x-[0.75rem] pb-[0.375rem] text-[1rem] uppercase tracking-[0.08em] text-(--d-muted)"
        style={{ gridTemplateColumns: COLUMNS }}
      >
        <span>Klasse</span><span>Std.</span><span>Fach</span><span>Lehrkraft</span><span>Raum</span><span>Art</span><span>Hinweis</span>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden">
        {rows.length === 0
          ? <p className="d-lato pt-[1rem] text-[1.375rem] text-(--d-muted)">Keine Vertretungen</p>
          : page.map((row, i) => (
            <SubstitutionRow key={i} row={row} showClass={i === 0 || page[i - 1].class !== row.class} />
          ))}
      </div>
    </section>
  )
}

// Ersetztes durchgestrichen, Neues dahinter
function Replaced({ old, value }) {
  return (
    <span className="min-w-0 truncate">
      {old && <s className="text-(--d-muted)">{old}</s>}
      {old && value ? ' ' : ''}
      {value}
    </span>
  )
}

function SubstitutionRow({ row, showClass }) {
  const kind = KIND[row.kind] ?? KIND.other
  return (
    <div
      className="d-line-bottom grid items-center gap-x-[0.75rem] text-[1.375rem]"
      style={{ gridTemplateColumns: COLUMNS, height: `${ROW_REM}rem` }}
    >
      <span className="d-oswald truncate font-medium">{showClass ? row.class : ''}</span>
      <span className="d-oswald truncate">{row.periods}</span>
      <span className="d-lato truncate">{row.subject}</span>
      <Replaced old={row.teacher_old} value={row.teacher} />
      <Replaced old={row.room_old} value={row.room} />
      <span className={`d-oswald truncate text-[1.25rem] uppercase tracking-[0.04em] ${kind.tone}`}>{kind.label}</span>
      <span className="d-lato truncate text-[1.25rem] text-(--d-fg-soft)">{row.note}</span>
    </div>
  )
}

// WebUntis-Seite im Rahmen, ohne Farbfilter; auf die rem-Basis hochskaliert, damit sie auf 4K lesbar bleibt
function FallbackFrame({ url }) {
  const ref = useRef(null)
  const { width, height, remPx } = useBoxSize(ref)
  const scale = remPx / 16
  return (
    <div ref={ref} className="d-card relative h-full overflow-hidden">
      {width > 0 && (
        <iframe
          title="Vertretungsplan"
          src={url}
          className="absolute left-0 top-0 origin-top-left border-0 bg-[#fff]"
          style={{ width: `${width / scale}px`, height: `${height / scale}px`, transform: `scale(${scale})` }}
        />
      )}
    </div>
  )
}

// Fußleiste links neben der Uhr: Stand der WebUntis-Daten (nur bei eigenen Daten, das iframe zeigt ihn selbst)
function SourceNote({ view }) {
  const data = view.data ?? {}
  if (!LIVE_SOURCES.includes(data.source) || !(data.days ?? []).length) return null
  const fetched = formatTime(data.fetched_at)
  return (
    <div className="d-card d-footer-item flex h-full items-center gap-[1.5rem] px-[1.375rem] text-[1.375rem]">
      <span className="d-oswald uppercase tracking-[0.06em] text-(--d-muted)">{fetched ? 'Stand' : 'Quelle'}</span>
      <span className="d-lato">{fetched ? `WebUntis · ${fetched}` : 'WebUntis'}</span>
    </div>
  )
}

SubstitutionsView.Footer = SourceNote
