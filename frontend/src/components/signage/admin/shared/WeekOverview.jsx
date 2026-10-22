// Where a view borders the next one a darker line separates them; a gap in background colour
// would look like off time (the screen stays on).
import { DAY_MINUTES, WEEKDAYS, seriesSlots, weekBars } from './schedule'

const SERIES = ['bg-series-1', 'bg-series-2', 'bg-series-3', 'bg-series-4', 'bg-series-5', 'bg-series-6']
const HOURS = [0, 6, 12, 18, 24]
const HATCH = { backgroundImage: 'repeating-linear-gradient(135deg, var(--sd-line) 0 1px, transparent 1px 6px)' }

const pad = (n) => String(n).padStart(2, '0')
const hhmm = (minutes) => (minutes >= DAY_MINUTES ? '24:00' : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`)
const percent = (minutes) => `${(minutes / DAY_MINUTES) * 100}%`

export default function WeekOverview({ rows, views }) {
  const names = new Map((views ?? []).map((v) => [v.id, v.name]))
  const nameOf = (viewId) => (viewId === null ? 'Standard-Ansicht' : names.get(viewId) ?? 'Nicht mehr verfügbar')
  const slots = seriesSlots(rows, SERIES.length)
  const bars = weekBars(rows)
  const legend = [...slots.keys()].filter((id) => bars.some((b) => b.viewId === id))

  return (
    <div data-week-overview>
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 gap-y-1 items-center" role="img"
        aria-label="Wochenübersicht des Zeitplans, die Zeilen darunter enthalten dieselben Angaben">
        {WEEKDAYS.map((label, day) => (
          <div key={label} className="contents">
            <span className="text-xs text-fg-muted">{label}</span>
            <div className="relative h-3.5 rounded-sm bg-raised overflow-hidden" style={HATCH} data-week-day={day}>
              {[6, 12, 18].map((h) => (
                <span key={h} className="absolute inset-y-0 w-px bg-line" style={{ left: percent(h * 60) }} aria-hidden="true" />
              ))}
              {bars.filter((b) => b.day === day).map((b, i, list) => (
                <span key={b.start} data-view-id={b.viewId ?? 'default'}
                  title={`${label} ${hhmm(b.start)} bis ${hhmm(b.end)} · ${nameOf(b.viewId)}`}
                  className={`absolute inset-y-0 ${SERIES[slots.get(b.viewId)]} ${i > 0 && list[i - 1].end === b.start ? 'border-l border-black/30' : ''}`}
                  style={{ left: percent(b.start), width: percent(b.end - b.start) }} />
              ))}
            </div>
          </div>
        ))}
        <span />
        <div className="relative h-4 text-[11px] text-fg-subtle tabular-nums" aria-hidden="true">
          {HOURS.map((h) => (
            <span key={h} className={`absolute top-0 ${h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: percent(h * 60) }}>{pad(h)}</span>
          ))}
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-fg-muted" data-week-legend>
        {legend.map((id) => (
          <li key={id ?? 'default'} className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${SERIES[slots.get(id)]}`} aria-hidden="true" />
            {nameOf(id)}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-raised border border-line" style={HATCH} aria-hidden="true" />
          Aus
        </li>
      </ul>
    </div>
  )
}
