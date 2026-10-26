import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { daysUntil, eventDetail } from '../lib/events'
import { packByHeight, useBoxSize } from '../lib/fit'
import { formatShortDate } from '../lib/format'
import { usePager } from '../lib/pager'
import { useClockMinute } from '../lib/useClock'
import { Heading, PageCount } from './parts'

const STACK_BELOW_REM = 70

// Row heights in the stacked layout come from the natural height (all items), never from the shown page:
// if everything fits each section gets exactly its height; otherwise a short section keeps its height
// and the other gets the rest; if both exceed half, they share the area equally.
function stackedRows({ natural, height, remPx, qr, hasA, hasB }) {
  if (!hasA) return '0px minmax(0,1fr)'
  if (!hasB) return 'minmax(0,1fr) auto'
  const { a, b } = natural
  if (a == null || b == null || !(height > 0)) return 'minmax(0,1fr) minmax(0,1fr)'
  const avail = height - (3.75 + 2.5) * remPx
  const bFull = b + (qr ? 10 * remPx : 0)
  if (a + bFull <= avail) return `${a}px ${bFull}px`
  if (a <= avail / 2) return `${a}px minmax(0,1fr)`
  if (bFull <= avail / 2) return `minmax(0,1fr) ${bFull}px`
  return 'minmax(0,1fr) minmax(0,1fr)'
}

export default function InfoView({ view }) {
  const { announcements = [], events = [], countdown = null } = view.data ?? {}
  const seconds = view.page_seconds
  const ref = useRef(null)
  const { width, height, remPx } = useBoxSize(ref)
  const [natural, setNatural] = useState({ a: null, b: null })
  const setA = useCallback((v) => setNatural((n) => (n.a === v ? n : { ...n, a: v })), [])
  const setB = useCallback((v) => setNatural((n) => (n.b === v ? n : { ...n, b: v })), [])
  const stacked = width > 0 && width / remPx < STACK_BELOW_REM
  if (!announcements.length && !events.length && !countdown) {
    return <p className="d-head pt-[3.75rem] text-[2rem] text-(--d-muted)">Keine Ankündigungen oder Termine.</p>
  }
  return (
    <div
      ref={ref}
      className={`relative grid h-full gap-x-[5rem] pt-[3.75rem] ${stacked
        ? 'grid-cols-[minmax(0,1fr)] content-start gap-y-[2.5rem]'
        : 'grid-cols-[minmax(0,1fr)_minmax(0,0.77fr)]'}`}
      style={stacked ? { gridTemplateRows: stackedRows({ natural, height, remPx, qr: Boolean(view.qr), hasA: announcements.length > 0, hasB: events.length > 0 }) } : undefined}
    >
      <div className="flex min-h-0 flex-col">
        {announcements.length > 0 && (
          <PagedSection title="Ankündigungen" items={announcements} seconds={seconds} renderItem={renderAnnouncement} onNatural={setA} />
        )}
      </div>
      <div className={`flex min-h-0 flex-col ${view.qr ? 'pb-[10rem]' : ''}`}>
        {events.length > 0 ? (
          <PagedSection
            title="Termine" items={events} seconds={seconds} renderItem={renderEvent} onNatural={setB}
            after={countdown && <Countdown countdown={countdown} />}
          />
        ) : countdown && <Countdown countdown={countdown} first />}
      </div>
      {view.qr && <QrCorner qr={view.qr} />}
    </div>
  )
}

function PagedSection({ title, items, seconds, renderItem, after = null, onNatural = null }) {
  const sectionRef = useRef(null)
  const bodyRef = useRef(null)
  const measureRef = useRef(null)
  const { width, height } = useBoxSize(bodyRef)
  const [heights, setHeights] = useState([])
  const hasAfter = Boolean(after)
  useLayoutEffect(() => {
    const measure = () => {
      const el = measureRef.current
      if (!el) return
      const next = [...el.children].map((c) => c.getBoundingClientRect().height)
      setHeights((prev) => (prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next))
      const section = sectionRef.current
      const body = bodyRef.current
      if (onNatural && section && body) {
        const overhead = section.getBoundingClientRect().height - body.getBoundingClientRect().height
        onNatural(Math.ceil(overhead + el.getBoundingClientRect().height))
      }
    }
    measure()
    // Late-loading fonts change the heights
    const fonts = typeof document !== 'undefined' ? document.fonts : null
    fonts?.addEventListener?.('loadingdone', measure)
    return () => fonts?.removeEventListener?.('loadingdone', measure)
  }, [items, width, hasAfter, onNatural])
  const reserve = after ? heights[items.length] ?? 0 : 0
  const pages = useMemo(
    () => (height > 0 && heights.length >= items.length ? packByHeight(heights.slice(0, items.length), height - reserve) : []),
    [heights, height, reserve, items.length],
  )
  const { index, count } = usePager(pages, seconds)
  const page = pages[index] ?? []

  return (
    <section ref={sectionRef} className="flex min-h-0 flex-1 flex-col">
      <Heading size="text-[2.125rem]" aside={<PageCount index={index} count={count} className="text-[1.5rem]" />}>{title}</Heading>
      <div ref={bodyRef} className="relative mt-[1.75rem] min-h-0 flex-1 overflow-hidden">
        <div ref={measureRef} aria-hidden="true" className="invisible absolute inset-x-0 top-0">
          {items.map((item) => <div key={item.id}>{renderItem(item)}</div>)}
          {after}
        </div>
        {page.map((i) => <div key={items[i].id}>{renderItem(items[i])}</div>)}
        {after}
      </div>
    </section>
  )
}

function renderAnnouncement(a) {
  return (
    <article className="d-line-bottom py-[1.125rem]">
      {a.priority === 'urgent' && (
        <div className="d-head text-[1.375rem] uppercase leading-[1.3] tracking-[0.06em] text-(--d-red)">Dringend</div>
      )}
      <h3 className="d-head line-clamp-2 text-[3rem] font-normal leading-[1.15]">{a.title}</h3>
      {a.text && <p className="d-text mt-[0.25rem] line-clamp-2 text-[1.6875rem] leading-[1.35] text-(--d-muted)">{a.text}</p>}
    </article>
  )
}

function renderEvent(ev) {
  const detail = eventDetail(ev)
  return (
    <article className="d-line-bottom grid grid-cols-[10.625rem_minmax(0,1fr)] gap-x-[1rem] py-[1.125rem]">
      <div>
        <div className="d-head text-[2.125rem] leading-[1.15]">{formatShortDate(ev.date_from)}</div>
        {detail && <div className="d-text text-[1.1875rem] leading-[1.4] text-(--d-muted)">{detail}</div>}
      </div>
      <div className="min-w-0 pt-[0.25rem]">
        <div className="d-text line-clamp-2 text-[1.875rem] leading-[1.25]">{ev.name}</div>
        {ev.location && <div className="d-text truncate text-[1.375rem] leading-[1.4] text-(--d-muted)">{ev.location}</div>}
      </div>
    </article>
  )
}

function Countdown({ countdown, first = false }) {
  const now = useClockMinute()
  const days = daysUntil(countdown.date, now)
  if (days < 0) return null
  return (
    <section className={`flex shrink-0 items-end justify-between gap-[2rem] ${first ? '' : 'd-rule-top mt-[2.5rem] pt-[2rem]'}`}>
      <div className="min-w-0">
        <div className="d-head text-[1.75rem] uppercase tracking-[0.06em] text-(--d-fg-soft)">Countdown</div>
        <div className="d-head truncate text-[2.375rem] leading-[1.2]">{countdown.name}</div>
      </div>
      <div className="d-head flex shrink-0 items-baseline gap-[0.75rem] leading-none">
        {days === 0
          ? <span className="text-[4.5rem]">Heute</span>
          : (
            <>
              <span className="text-[6.25rem]">{days}</span>
              <span className="text-[2rem] text-(--d-fg-soft)">{days === 1 ? 'Tag' : 'Tage'}</span>
            </>
          )}
      </div>
    </section>
  )
}

function QrCorner({ qr }) {
  return (
    <div className="absolute bottom-0 right-0 flex items-end gap-[1rem]">
      {qr.label && <span className="d-text pb-[0.125rem] text-[1.25rem] text-(--d-fg-soft)">{qr.label}</span>}
      <div className="bg-[#fff] p-[0.5rem]">
        <QRCodeSVG value={qr.url} size={256} bgColor="#ffffff" fgColor="#222222" style={{ width: '6.5rem', height: '6.5rem', display: 'block' }} />
      </div>
    </div>
  )
}
