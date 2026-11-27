import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { expandWanted } from '../lib/expand'
import { useBoxSize } from '../lib/fit'
import { formatDayMonth, formatTime, formatWeekday, parseLocalDate } from '../lib/format'
import { paginateByHeight, paginatePair, useChildHeights, usePager } from '../lib/pager'
import { Heading, PageCount } from './parts'

const ROW_MIN_REM = 2.1875
const KIND_TONE = { cancelled: 'text-(--d-red)', room_change: 'text-(--d-info)' }
const KIND_FALLBACK = { substitution: 'Vertretung', cancelled: 'Entfall', room_change: 'Raumänderung', other: 'Änderung' }

// Breaks are allowed after "/" too ("R101/R102/R103").
function Breakable({ text }) {
  const parts = String(text).split('/')
  return parts.map((part, i) => <span key={i}>{part}{i < parts.length - 1 && <>/<wbr /></>}</span>)
}

// Replaced values struck through, new ones after them. The old value stays together with the first word of
// the new one ("~~113~~ 015"); the rest wraps inside the column, so a long text from WebUntis
// ("Aula (Generalprobe Theater)", "R101/R102/R103") never runs into the next column. Only a short word is
// kept unbroken: a long one could not wrap at all.
const GLUE_MAX = 8

function Item({ old, text }) {
  const [word = '', ...more] = text.split(/\s+/)
  const strike = old ? <s className="text-(--d-muted)">{old}</s> : null
  const head = word.length <= GLUE_MAX
    ? <span className="whitespace-nowrap">{strike}{strike && word ? ' ' : ''}{word}</span>
    : <>{strike && <span className="whitespace-nowrap">{strike}</span>}{strike ? ' ' : ''}<Breakable text={word} /></>
  return <>{head}{more.length > 0 && <> <Breakable text={more.join(' ')} /></>}</>
}

function Replaced({ old, value }) {
  const [first = '', ...rest] = String(value ?? '').split(/,\s*/)
  return (
    <>
      <Item old={old} text={first} />
      {rest.map((item, i) => <span key={i}>, <Item text={item} /></span>)}
    </>
  )
}

// Columns: flag = switch in data.columns (format options from WebUntis), without flag always visible.
// nowrap: short values ("8.–9.", "La1") never break inside; class, teacher, room, kind and note wrap, so an
// unusually long text from WebUntis stays inside its column.
const COLUMN_DEFS = {
  group: { head: 'Kürzel', fr: 7, nowrap: true, cls: 'd-head font-medium', lead: true, cell: (row) => row.group },
  class: { head: 'Klasse', fr: 8, flag: 'class', cls: 'd-head font-medium', cell: (row) => row.classes_label },
  periods: { head: 'Std.', fr: 6, nowrap: true, cls: 'd-head', cell: (row) => row.periods },
  subject: {
    // Wraps like the room: a long subject ("Nachschreiben") stays in its column instead of running into the
    // teacher column; short subjects fit on one line anyway
    head: 'Fach', fr: 6, flag: 'subject', cls: 'd-text hyphens-auto',
    // A cancelled lesson: the subject struck through like a replaced value
    cell: (row) => (row.kind === 'cancelled' && row.subject ? <s className="text-(--d-muted)">{row.subject}</s> : row.subject),
  },
  teacher: { head: 'Lehrkraft', fr: 12, flag: 'teacher', cls: 'd-text', cell: (row) => <Replaced old={row.teacher_old} value={row.teacher} /> },
  room: { head: 'Raum', fr: 10, flag: 'room', cls: 'd-text', cell: (row) => <Replaced old={row.room_old} value={row.room} /> },
  kind: {
    head: 'Art', fr: 16, cls: 'd-head text-[1.25rem] uppercase',
    tone: (row) => KIND_TONE[row.kind] ?? '',
    cell: (row) => row.kind_label || KIND_FALLBACK[row.kind] || KIND_FALLBACK.other,
  },
  note: { head: 'Hinweis', fr: 27, flag: 'note', cls: 'd-text text-[1.25rem] text-(--d-fg-soft)', cell: (row) => row.note },
}
const ORDER = {
  class: ['class', 'periods', 'subject', 'teacher', 'room', 'kind', 'note'],
  teacher: ['group', 'periods', 'class', 'subject', 'teacher', 'room', 'kind', 'note'],
}

function tableColumns(data) {
  const groupBy = data.group_by === 'teacher' ? 'teacher' : 'class'
  const flags = data.columns ?? {}
  const keys = ORDER[groupBy].filter((key) => {
    const flag = COLUMN_DEFS[key].flag
    return !flag || flags[flag] !== false
  })
  const lead = groupBy === 'teacher' ? 'group' : 'class'
  const fr = Object.fromEntries(keys.map((key) => [key, COLUMN_DEFS[key].fr]))
  // The extra subject width comes from the note (it wraps anyway), so kind values like "Raumänderung" keep
  // their room; without a note column the others give a little each
  const extra = keys.includes('subject') ? subjectFr(data) - fr.subject : 0
  fr.subject += extra
  if (fr.note) fr.note -= extra
  return {
    keys,
    lead: (row) => (lead === 'group' ? row.group : row.classes_label),
    leadKey: lead,
    template: keys.map((key) => `minmax(0, ${fr[key]}fr)`).join(' '),
  }
}

// Every row is its own grid with the same template, so a column cannot grow per row. A long subject word
// ("Nachschreiben") widens the subject column for the whole plan, about 1.2 fr per letter, up to a limit;
// beyond it the subject wraps in its column.
const SUBJECT_FR_MAX = 18
function subjectFr(data) {
  const longest = (data.days ?? []).flatMap((day) => day.rows ?? [])
    .flatMap((row) => String(row.subject ?? '').split(/\s+/))
    .reduce((max, word) => Math.max(max, word.length), 0)
  return Math.min(SUBJECT_FR_MAX, Math.max(COLUMN_DEFS.subject.fr, Math.ceil(longest * 1.2) + 1))
}

function isLive(data) {
  return data.mode === 'live' && (data.days ?? []).length > 0
}

// onPageCount: reports today's page count (split view decides on it); twoColumns: today as a pair of pages.
export default function SubstitutionsView({ view, onPageCount, twoColumns = false }) {
  const data = view.data ?? {}
  if (!isLive(data)) {
    if (data.embed_url) return <EmbedFrame url={data.embed_url} />
    // source null: data exists only with a valid key; otherwise WebUntis is unreachable
    return (
      <div className="d-card h-full px-[2rem] py-[1.75rem]">
        <Heading>Vertretungsplan</Heading>
        <p className="d-text mt-[1.25rem] text-[1.5rem] text-(--d-fg-soft)">
          {data.source == null
            ? 'Kiosk-URL ohne Schlüssel.'
            : 'Vertretungsplan nicht verfügbar.'}
        </p>
      </div>
    )
  }
  return <DayColumns data={data} seconds={view.page_seconds} onPageCount={onPageCount} twoColumns={twoColumns} />
}

// Two days side by side; in an area taller than wide (portrait screen) one above the other. In narrow
// areas (layout "Normal", split screen) there is no room for both days with their headers: then one day
// after the other, each with all its pages.
const STACK_BELOW_REM = 100
const MIN_DAY_HEIGHT_REM = 30

// Busy days (more pages than data.expand_pages): today takes both areas as a pair of pages instead of
// tomorrow. Decided on the page count shown now; a pair card is never wider than a day card, so it has at
// least as many pages and switching back needs the count to really drop (no flicker).
function DayColumns({ data, seconds, onPageCount, twoColumns }) {
  const ref = useRef(null)
  const { width, height, remPx } = useBoxSize(ref)
  const [turn, setTurn] = useState(0)
  const [todayPages, setTodayPages] = useState(0)
  const next = useCallback(() => setTurn((t) => t + 1), [])
  const reportToday = useCallback((n) => { setTodayPages(n); onPageCount?.(n) }, [onPageCount])
  // Stable callbacks: a new one on every render would report again and render again, endlessly
  const reportTodayPages = useCallback((pages) => reportToday(pages.length), [reportToday])
  const days = data.days
  const columns = useMemo(() => tableColumns(data), [data])
  const stacked = days.length > 1 && height > width && height / remPx >= days.length * MIN_DAY_HEIGHT_REM
  const oneByOne = !stacked && days.length > 1 && width > 0 && width / remPx < STACK_BELOW_REM
  const paired = twoColumns || (days.length > 1 && !oneByOne && expandWanted(todayPages, data.expand_pages))
  const shown = oneByOne ? [turn % days.length] : days.map((_, i) => i)
  return (
    <div ref={ref} data-days={paired ? 'pair' : stacked ? 'stacked' : oneByOne ? 'one-by-one' : 'side-by-side'}
      className={`flex h-full gap-[1.25rem] ${stacked ? 'flex-col' : ''}`}>
      {paired
        ? <DayPair day={days[0]} news={data.news} columns={columns} seconds={seconds} onPageCount={reportToday} />
        : shown.map((i) => (
          <DayCard
            key={days[i].date ?? i} day={days[i]} news={i === 0 ? data.news : null} columns={columns} seconds={seconds}
            onDone={oneByOne ? next : null} onPages={i === 0 ? reportTodayPages : null}
          />
        ))}
    </div>
  )
}

// Today as two cards: the first shows pages 1, 3, ..., the second (rows only: no title, no head lines, no
// column heads) the pages 2, 4, ... and holds more rows. The first card measures the rows and its own room,
// the second only its room; one pager drives both.
function DayPair({ day, news, columns, seconds, onPageCount }) {
  // Measurements belong to the rows they were made from: after a refresh the cards wait for new ones
  const [first, setFirst] = useState(null)
  const [secondRoom, setSecondRoom] = useState(0)
  const rows = day.rows
  const current = first && first.rows === rows ? first : null
  const pages = useMemo(
    () => (current ? paginatePair(current.heights, current.room, secondRoom || current.room) : []),
    [current, secondRoom],
  )
  const pairs = useMemo(() => Array.from({ length: Math.ceil(pages.length / 2) }, (_, i) => i), [pages.length])
  const { index } = usePager(pairs, seconds)
  const measureFirst = useCallback(({ heights, room }) => {
    setFirst((prev) => (prev && prev.rows === rows && prev.room === room && prev.heights.join() === heights.join()
      ? prev : { rows, heights, room }))
  }, [rows])
  const measureSecond = useCallback(({ room }) => setSecondRoom(room), [])
  // The decision (pair or not) uses the count a single card would have, as in the normal layout: the pair
  // itself has fewer pages, and deciding on those would switch back and forth
  const singleCount = useMemo(() => (current ? paginateByHeight(current.heights, current.room).length : null), [current])
  useEffect(() => { if (singleCount != null) onPageCount?.(singleCount) }, [onPageCount, singleCount])
  const range = pages.length ? { from: 2 * index, to: Math.min(2 * index + 1, pages.length - 1), count: pages.length } : null
  return (
    <>
      <DayCard day={day} news={news} columns={columns} seconds={seconds} pageIndex={2 * index} pagesFrom={pages}
        onMeasure={measureFirst} pageRange={range} />
      <DayCard day={day} columns={columns} seconds={seconds} pageIndex={2 * index + 1} pagesFrom={pages}
        onMeasure={measureSecond} continuation />
    </>
  )
}

function dayTitle(day) {
  const date = parseLocalDate(day.date)
  const weekday = formatWeekday(date)
  if (!weekday) return day.label ?? ''
  const label = day.label && day.label.toLowerCase() !== weekday.toLowerCase() ? `${day.label} · ` : ''
  return `${label}${weekday} ${formatDayMonth(date)}`
}

const withPeriods = (entry) => (entry.periods ? `${entry.name} (${entry.periods})` : entry.name)

function DayHead({ day }) {
  const list = day.absent ?? []
  const absent = [...list.filter((a) => a.kind !== 'class'), ...list.filter((a) => a.kind === 'class')].map(withPeriods)
  const affected = [...(day.affected?.classes ?? []), ...(day.affected?.teachers ?? [])]
  if (!absent.length && !affected.length) return null
  const lines = [['Abwesend', absent], ['Betroffen', affected]].filter(([, items]) => items.length)
  return (
    <dl data-day-head className="mt-[1rem] grid grid-cols-[auto_minmax(0,1fr)] gap-x-[1rem] gap-y-[0.375rem] text-[1.25rem] leading-[1.35]">
      {lines.map(([label, items]) => (
        <div key={label} className="contents">
          <dt className="d-head uppercase tracking-[0.06em] text-(--d-muted)">{label}</dt>
          <dd className="d-text line-clamp-2">{items.join(', ')}</dd>
        </div>
      ))}
    </dl>
  )
}

function Message({ subject, children }) {
  return (
    <p className="d-text mt-[0.75rem] line-clamp-3 bg-(--d-soft) px-[0.875rem] py-[0.625rem] text-[1.25rem] leading-[1.35]">
      <span className="d-head pr-[0.5rem] uppercase tracking-[0.06em] text-(--d-muted)">{subject || 'Nachricht'}</span>
      {children}
    </p>
  )
}

// pageIndex: shown page given from outside (pair); pagesFrom: use these pages instead of own paging;
// onPages: reports the measured pages; onMeasure: reports row heights and the room for rows (pair);
// pageRange: "Seite 1-2 / 5" for the first card of a pair; continuation: rows only (second card of a pair).
function DayCard({ day, news, columns, seconds, onDone, pageIndex = null, pagesFrom = null, onPages = null,
  onMeasure = null, pageRange = null, continuation = false }) {
  const bodyRef = useRef(null)
  const measureRef = useRef(null)
  const { width, height, remPx } = useBoxSize(bodyRef)
  const rows = useMemo(() => day.rows ?? [], [day.rows])
  const heights = useChildHeights(measureRef, [rows, columns, width, remPx])
  const ownPages = useMemo(() => {
    if (!rows.length) return []
    if (heights.length !== rows.length) return [rows.map((_, i) => i)]
    return paginateByHeight(heights, height)
  }, [rows, heights, height])
  const pages = pagesFrom ?? ownPages
  // Report only measured pages: a fresh card counts all rows as one page until it has measured them, and
  // that would switch the pair off and on again endlessly
  const measured = !rows.length || heights.length === rows.length
  useEffect(() => { if (measured) onPages?.(ownPages) }, [onPages, ownPages, measured])
  // The continuation card measures no rows (the first card does), only its room
  useEffect(() => {
    if (onMeasure && (measured || continuation) && height > 0) onMeasure({ heights, room: height })
  }, [onMeasure, measured, continuation, heights, height])
  const pager = usePager(pageIndex == null ? pages : [], seconds)
  const index = pageIndex ?? pager.index
  const count = pages.length
  // filter: pages from an older row list never reach a row that is gone
  const page = (pages[index] ?? []).map((i) => rows[i]).filter(Boolean)
  useEffect(() => {
    if (!onDone || !(seconds > 0)) return undefined
    const id = setTimeout(onDone, Math.max(1, count) * seconds * 1000)
    return () => clearTimeout(id)
  }, [onDone, count, seconds])

  const pageLabel = pageRange
    ? <PageCount index={pageRange.from} to={pageRange.to} count={pageRange.count} />
    : index < count ? <PageCount index={index} count={count} /> : null
  return (
    <section data-day-card={continuation ? 'continuation' : 'day'}
      className={`d-card flex min-h-0 min-w-0 flex-1 flex-col px-[1.5rem] pb-[1rem] ${continuation ? 'pt-[1rem]' : 'pt-[1.375rem]'}`}>
      {!continuation && (
        <>
          <Heading size="text-[2rem]" aside={pageLabel}>{dayTitle(day)}</Heading>
          <DayHead day={day} />
          {news && <Message>{news}</Message>}
          {(day.messages ?? []).map((m, i) => <Message key={i} subject={m.subject}>{m.body}</Message>)}
          <div
            className="d-head d-rule-bottom mt-[1.25rem] grid gap-x-[0.75rem] pb-[0.375rem] text-[1rem] uppercase tracking-[0.08em] text-(--d-muted)"
            style={{ gridTemplateColumns: columns.template }}
          >
            {columns.keys.map((key) => <span key={key} data-column-head className="min-w-0">{COLUMN_DEFS[key].head}</span>)}
          </div>
        </>
      )}
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden">
        {rows.length === 0
          ? <p className="d-text pt-[1rem] text-[1.375rem] text-(--d-muted)">Keine Vertretungen</p>
          : (
            <div data-substitutions-table>
              {page.map((row, i) => (
                <SubstitutionRow
                  key={i} row={row} columns={columns}
                  showLead={i === 0 || columns.lead(page[i - 1]) !== columns.lead(row)}
                />
              ))}
            </div>
          )}
        {/* Measuring layer: all rows full width, invisible; provides the heights for paging (the pair's first
            card measures for both cards) */}
        {!continuation && (
          <div ref={measureRef} aria-hidden="true" className="invisible absolute inset-x-0 top-0">
            {rows.map((row, i) => <SubstitutionRow key={i} row={row} columns={columns} showLead />)}
          </div>
        )}
      </div>
    </section>
  )
}

function SubstitutionRow({ row, columns, showLead }) {
  return (
    <div
      data-substitution-row
      className="d-line-bottom grid items-baseline gap-x-[0.75rem] py-[0.375rem] text-[1.375rem] leading-[1.3]"
      style={{ gridTemplateColumns: columns.template, minHeight: `${ROW_MIN_REM}rem` }}
    >
      {columns.keys.map((key) => {
        const def = COLUMN_DEFS[key]
        const hidden = key === columns.leadKey && !showLead
        return (
          <span key={key} data-column={key} className={`min-w-0 ${def.nowrap ? 'whitespace-nowrap' : 'whitespace-normal [overflow-wrap:anywhere]'} ${def.cls} ${def.tone?.(row) ?? ''}`}>
            {hidden ? '' : def.cell(row)}
          </span>
        )
      })}
    </div>
  )
}

// WebUntis page in the frame, no colour filter; scaled up to the rem base so it stays readable on 4K
function EmbedFrame({ url }) {
  const ref = useRef(null)
  const { width, height, remPx } = useBoxSize(ref)
  const scale = remPx / 16
  const size = width > 0
    ? { width: `${width / scale}px`, height: `${height / scale}px`, transform: `scale(${scale})` }
    : { width: '100%', height: '100%' }
  return (
    <div ref={ref} className="d-card relative h-full overflow-hidden">
      <iframe
        title="Vertretungsplan"
        src={url}
        className="absolute left-0 top-0 origin-top-left border-0 bg-[#fff]"
        style={size}
      />
    </div>
  )
}

function stamp(data) {
  if (data.updated_at) {
    const day = formatDayMonth(data.updated_at)
    const time = formatTime(data.updated_at)
    if (time) return `WebUntis · ${day} ${time}`
  }
  return formatTime(data.fetched_at)
}

// The iframe shows its own data age.
function SourceNote({ view }) {
  const data = view.data ?? {}
  const when = isLive(data) ? stamp(data) : ''
  if (!when) return null
  return (
    <div className="d-card d-footer-item flex h-full items-center gap-[1.5rem] px-[1.375rem] text-[1.375rem]">
      <span className="d-text min-w-0 truncate">
        <span className="d-head uppercase tracking-[0.06em] text-(--d-muted)">Stand</span> {when}
      </span>
    </div>
  )
}

SubstitutionsView.Footer = SourceNote
