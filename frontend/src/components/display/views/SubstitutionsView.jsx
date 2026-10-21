import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useBoxSize } from '../lib/fit'
import { formatDayMonth, formatTime, formatWeekday, parseLocalDate } from '../lib/format'
import { paginateByHeight, usePager } from '../lib/pager'
import { Heading, PageCount } from './parts'

// Vertretungsplan (Spec §1.3): je Tag ein Kasten mit Kopf (Abwesend, Betroffen, Nachrichten) und Tabelle.
// Schüleransicht nach Klasse, Lehrkräfte-Ansicht nach Kürzel. Klasse und Hinweis brechen um; die Zeilen werden
// in einer versteckten Messschicht gemessen und danach seitenweise geblättert.
// mode 'embed': die WebUntis-Seite im Rahmen (gewählt, Ausweichen oder ohne Schlüssel).

const ROW_MIN_REM = 2.1875
const KIND_TONE = { cancelled: 'text-(--d-red)', room_change: 'text-(--d-info)' }
const KIND_FALLBACK = { substitution: 'Vertretung', cancelled: 'Entfall', room_change: 'Raumänderung', other: 'Änderung' }

// Ersetztes durchgestrichen, Neues dahinter
function Replaced({ old, value }) {
  return (
    <>
      {old && <s className="text-(--d-muted)">{old}</s>}
      {old && value ? ' ' : ''}
      {value}
    </>
  )
}

// Spalten: flag = Schalter in data.columns (Format-Optionen aus WebUntis), ohne flag immer sichtbar
const COLUMN_DEFS = {
  group: { head: 'Kürzel', fr: 6, cls: 'd-oswald font-medium', lead: true, cell: (row) => row.group },
  class: { head: 'Klasse', fr: 8, flag: 'class', cls: 'd-oswald font-medium', cell: (row) => row.classes_label },
  periods: { head: 'Std.', fr: 5, cls: 'd-oswald', cell: (row) => row.periods },
  subject: { head: 'Fach', fr: 6, flag: 'subject', cls: 'd-lato', cell: (row) => row.subject },
  teacher: { head: 'Lehrkraft', fr: 12, flag: 'teacher', cls: 'd-lato', cell: (row) => <Replaced old={row.teacher_old} value={row.teacher} /> },
  room: { head: 'Raum', fr: 9, flag: 'room', cls: 'd-lato', cell: (row) => <Replaced old={row.room_old} value={row.room} /> },
  kind: {
    head: 'Art', fr: 15, cls: 'd-oswald text-[1.25rem] uppercase',
    tone: (row) => KIND_TONE[row.kind] ?? '',
    cell: (row) => row.kind_label || KIND_FALLBACK[row.kind] || KIND_FALLBACK.other,
  },
  note: { head: 'Hinweis', fr: 30, flag: 'note', cls: 'd-lato text-[1.25rem] text-(--d-fg-soft)', cell: (row) => row.note },
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
  // Schüleransicht: die Klasse führt die Gruppe an (nur bei Wechsel gezeigt)
  const lead = groupBy === 'teacher' ? 'group' : 'class'
  return {
    keys,
    lead: (row) => (lead === 'group' ? row.group : row.classes_label),
    leadKey: lead,
    template: keys.map((key) => `minmax(0, ${COLUMN_DEFS[key].fr}fr)`).join(' '),
  }
}

function isLive(data) {
  return data.mode === 'live' && (data.days ?? []).length > 0
}

export default function SubstitutionsView({ view }) {
  const data = view.data ?? {}
  if (!isLive(data)) {
    if (data.embed_url) return <EmbedFrame url={data.embed_url} />
    // source null: Daten gibt es nur mit gültigem Schlüssel; sonst ist WebUntis nicht erreichbar
    return (
      <div className="d-card h-full px-[2rem] py-[1.75rem]">
        <Heading>Vertretungsplan</Heading>
        <p className="d-lato mt-[1.25rem] text-[1.5rem] text-(--d-fg-soft)">
          {data.source == null
            ? 'Für den Vertretungsplan fehlt der Bildschirm-Schlüssel in der Kiosk-URL.'
            : 'Der Vertretungsplan ist derzeit nicht abrufbar. Im Admin unter Monitore → Einstellungen die WebUntis-Verbindung prüfen.'}
        </p>
      </div>
    )
  }
  return <DayColumns data={data} seconds={view.page_seconds} />
}

// Zwei Tage nebeneinander. In schmalen Flächen (Aufteilung "Normal", Splitscreen) ist für beide Tage samt Kopf
// übereinander kein Platz: dann ein Tag nach dem anderen, jeweils mit allen seinen Seiten.
const STACK_BELOW_REM = 100

function DayColumns({ data, seconds }) {
  const ref = useRef(null)
  const { width, remPx } = useBoxSize(ref)
  const [turn, setTurn] = useState(0)
  const next = useCallback(() => setTurn((t) => t + 1), [])
  const days = data.days
  const columns = useMemo(() => tableColumns(data), [data])
  const oneByOne = days.length > 1 && width > 0 && width / remPx < STACK_BELOW_REM
  const shown = oneByOne ? [turn % days.length] : days.map((_, i) => i)
  return (
    <div ref={ref} className="flex h-full gap-[1.25rem]">
      {shown.map((i) => (
        <DayCard
          key={days[i].date ?? i} day={days[i]} news={i === 0 ? data.news : null} columns={columns} seconds={seconds}
          onDone={oneByOne ? next : null}
        />
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

const withPeriods = (entry) => (entry.periods ? `${entry.name} (${entry.periods})` : entry.name)

// "Abwesend" (Lehrkräfte, dann Klassen) und "Betroffen" (Klassen, dann Lehrkräfte); nur Zeilen mit Einträgen
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
          <dt className="d-oswald uppercase tracking-[0.06em] text-(--d-muted)">{label}</dt>
          <dd className="d-lato line-clamp-2">{items.join(', ')}</dd>
        </div>
      ))}
    </dl>
  )
}

function Message({ subject, children }) {
  return (
    <p className="d-lato mt-[0.75rem] line-clamp-3 bg-(--d-soft) px-[0.875rem] py-[0.625rem] text-[1.25rem] leading-[1.35]">
      <span className="d-oswald pr-[0.5rem] uppercase tracking-[0.06em] text-(--d-muted)">{subject || 'Nachricht'}</span>
      {children}
    </p>
  )
}

function DayCard({ day, news, columns, seconds, onDone }) {
  const bodyRef = useRef(null)
  const measureRef = useRef(null)
  const { width, height, remPx } = useBoxSize(bodyRef)
  const rows = useMemo(() => day.rows ?? [], [day.rows])
  const heights = useRowHeights(measureRef, [rows, columns, width, remPx])
  const pages = useMemo(() => {
    if (!rows.length) return []
    if (heights.length !== rows.length) return [rows.map((_, i) => i)]
    return paginateByHeight(heights, height)
  }, [rows, heights, height])
  const { index, count } = usePager(pages, seconds)
  const page = (pages[index] ?? []).map((i) => rows[i])
  // Ein Tag nach dem anderen: nach allen Seiten dieses Tages weiter zum nächsten
  useEffect(() => {
    if (!onDone || !(seconds > 0)) return undefined
    const id = setTimeout(onDone, Math.max(1, count) * seconds * 1000)
    return () => clearTimeout(id)
  }, [onDone, count, seconds])

  return (
    <section className="d-card flex min-h-0 min-w-0 flex-1 flex-col px-[1.5rem] pb-[1rem] pt-[1.375rem]">
      <Heading size="text-[2rem]" aside={<PageCount index={index} count={count} />}>{dayTitle(day)}</Heading>
      <DayHead day={day} />
      {news && <Message>{news}</Message>}
      {(day.messages ?? []).map((m, i) => <Message key={i} subject={m.subject}>{m.body}</Message>)}
      <div
        className="d-oswald d-rule-bottom mt-[1.25rem] grid gap-x-[0.75rem] pb-[0.375rem] text-[1rem] uppercase tracking-[0.08em] text-(--d-muted)"
        style={{ gridTemplateColumns: columns.template }}
      >
        {columns.keys.map((key) => <span key={key} data-column-head className="min-w-0">{COLUMN_DEFS[key].head}</span>)}
      </div>
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden">
        {rows.length === 0
          ? <p className="d-lato pt-[1rem] text-[1.375rem] text-(--d-muted)">Keine Vertretungen</p>
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
        {/* Messschicht: alle Zeilen in voller Breite, unsichtbar; liefert die Höhen für das Blättern */}
        <div ref={measureRef} aria-hidden="true" className="invisible absolute inset-x-0 top-0">
          {rows.map((row, i) => <SubstitutionRow key={i} row={row} columns={columns} showLead />)}
        </div>
      </div>
    </section>
  )
}

// Höhen der Kinder von ref (px), neu gemessen bei geänderten deps und nach dem Laden der Schriften
function useRowHeights(ref, deps) {
  const [heights, setHeights] = useState([])
  useLayoutEffect(() => {
    let alive = true
    const measure = () => {
      const el = ref.current
      if (!alive || !el) return
      const next = [...el.children].map((child) => child.getBoundingClientRect().height)
      setHeights((prev) => (prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next))
    }
    measure()
    document.fonts?.ready?.then(measure)
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return heights
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
          <span key={key} data-column={key} className={`min-w-0 whitespace-normal break-words ${def.cls} ${def.tone?.(row) ?? ''}`}>
            {hidden ? '' : def.cell(row)}
          </span>
        )
      })}
    </div>
  )
}

// WebUntis-Seite im Rahmen, ohne Farbfilter; auf die rem-Basis hochskaliert, damit sie auf 4K lesbar bleibt
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

// "WebUntis · 21.10. 07:42" aus dem Stand der Monitor-Schnittstelle, sonst der Abrufzeitpunkt "07:42"
function stamp(data) {
  if (data.updated_at) {
    const day = formatDayMonth(data.updated_at)
    const time = formatTime(data.updated_at)
    if (time) return `WebUntis · ${day} ${time}`
  }
  return formatTime(data.fetched_at)
}

// Fußleiste: Stand der Daten (nur bei eigenen Daten, das iframe zeigt ihn selbst) und Hinweis auf die Ersatzquelle
function SourceNote({ view }) {
  const data = view.data ?? {}
  const when = isLive(data) ? stamp(data) : ''
  if (!when && !data.fallback) return null
  return (
    <div className="d-card d-footer-item flex h-full items-center gap-[1.5rem] px-[1.375rem] text-[1.375rem]">
      {when && (
        <span className="d-lato min-w-0 truncate">
          <span className="d-oswald uppercase tracking-[0.06em] text-(--d-muted)">Stand</span> {when}
        </span>
      )}
      {data.fallback && <span className="d-oswald shrink-0 uppercase tracking-[0.06em] text-(--d-warn)">Ersatzquelle</span>}
    </div>
  )
}

SubstitutionsView.Footer = SourceNote
