import { ClockBox, Frame } from '../frame'
import { CiStripe, CiWheel, frameRootClass } from '../frame/parts'
import { formatTime } from '../lib/format'
import { useClockMinute } from '../lib/useClock'

function titleFontRem(title, widthRem, maxRem, oneLine) {
  const words = String(title || '').split(/\s+/)
  const longest = Math.max(1, ...words.map((w) => [...w].length))
  const total = Math.max(1, [...String(title || '')].length)
  let rem = Math.min(maxRem, widthRem / (0.45 * longest))
  if (oneLine && total <= 24) rem = Math.min(rem, widthRem / (0.45 * total))
  return Math.max(3.5, rem)
}

export default function ExamMode({ mode, orientation, panel = null, staleSince = null }) {
  if (panel) return <ExamPanel mode={mode} side={panel} orientation={orientation} />
  const portrait = orientation === 'portrait'
  return (
    <Frame orientation={orientation}>
      <div data-display-state="mode" data-mode-kind="exam" className="relative h-full">
        <ClockBox variant="compact" staleSince={staleSince} className="absolute right-0 top-[1.75rem] text-[6.5rem]" />
        <div className={portrait ? 'pt-[14rem]' : 'pl-[2.5rem] pt-[9.5rem]'}>
          <ExamContent mode={mode} titleRem={titleFontRem(mode.title, portrait ? 52 : 72, 12, true)} />
        </div>
      </div>
    </Frame>
  )
}

// In portrait (stacked) no wheel: the view carries the band with three wheels there
function ExamPanel({ mode, side, orientation }) {
  const wheel = side === 'left' && orientation !== 'portrait'
  return (
    <div data-display-state="mode" data-mode-kind="exam" className={frameRootClass('light', 'normal')}>
      {wheel && <CiWheel />}
      {!wheel && <CiStripe className="w-[4rem]" />}
      <div className={`absolute inset-y-0 z-10 flex flex-col justify-center ${wheel ? 'left-[21.25rem] right-[3rem]' : 'left-[4rem] right-[8rem]'}`}>
        <ExamContent mode={mode} titleRem={titleFontRem(mode.title, 21, 6.25, false)} compact />
      </div>
    </div>
  )
}

function ExamContent({ mode, titleRem, compact = false }) {
  const kicker = ['Klausur', mode.location].filter(Boolean).join(' · ')
  return (
    <>
      <div className={`d-kicker d-head uppercase leading-[1.1] tracking-[0.06em] text-(--d-red) ${compact ? 'text-[2rem]' : 'text-[2.25rem]'}`}>
        {kicker}
      </div>
      <h1 className="d-head mt-[1.25rem] leading-[1.05] tracking-[-0.005em]" style={{ fontSize: `${titleRem}rem` }}>
        {mode.title}
      </h1>
      {mode.text && (
        <p className={`d-text text-(--d-fg-soft) ${compact ? 'mt-[1.5rem] text-[1.875rem] leading-[1.45]' : 'mt-[2.25rem] max-w-[66rem] text-[2.5rem] leading-[1.5]'}`}>
          {mode.text}
        </p>
      )}
      <dl
        className={`d-line-top flex ${compact
          ? 'mt-[3rem] gap-[2rem] pt-[2rem] [&_dd]:text-[3rem] [&_dt]:text-[1.375rem]'
          : 'mt-[4.5rem] max-w-[72rem] gap-[5.5rem] pt-[2.5rem] [&_dd]:text-[5.75rem] [&_dt]:text-[1.75rem]'}`}
      >
        <TimeItem label="Beginn">{formatTime(mode.active_from)}</TimeItem>
        <TimeItem label="Ende">{formatTime(mode.active_until)}</TimeItem>
        <Remaining until={mode.active_until} />
      </dl>
    </>
  )
}

function TimeItem({ label, children }) {
  if (!children) return null
  return (
    <div>
      <dt className="d-head uppercase tracking-[0.05em] text-(--d-muted)">{label}</dt>
      <dd className="d-head mt-[0.5rem] leading-none">{children}</dd>
    </div>
  )
}

// Own leaf component: re-renders only when the minute changes
function Remaining({ until }) {
  const now = useClockMinute()
  const end = until ? new Date(until).getTime() : NaN
  const minutes = Math.ceil((end - now.getTime()) / 60000)
  if (!(minutes > 0)) return null
  const text = minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h` : `${minutes} min`
  return <TimeItem label="Noch">{text}</TimeItem>
}
