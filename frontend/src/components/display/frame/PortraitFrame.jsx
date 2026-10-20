import ClockBox from './ClockBox'
import { CiStripe, CiWheel, FrameFooter } from './parts'

// Hochformat (Vorlage "Hintergrund dreifach"): Band mit drei Rädern links, roter Streifen rechts.
// Der Ton folgt dem Stil: ci hell, dark dunkel, dense hellgrau mit Uhr-Box unten.
const TONE = { ci: 'd-tone-light', dark: 'd-tone-dark', dense: 'd-tone-dense' }
const WHEEL = { ci: 'solid', dark: 'watermark-dark', dense: 'watermark-light' }

export default function PortraitFrame({ style = 'ci', clock, footer, wheel = true, stripe = true, children }) {
  const tone = TONE[style] ? style : 'ci'
  const dense = tone === 'dense'
  const weather = clock?.showWeather ? clock.weather : null
  const inset = dense
    ? `left-[2rem] gap-[1.25rem] pb-[1.5rem] pt-[1.75rem] ${stripe ? 'right-[3.5rem]' : 'right-[2rem]'}`
    : `pb-[3.5rem] pt-[4.25rem] ${wheel ? 'left-[13.5rem]' : 'left-[5rem]'} ${stripe ? 'right-[7rem]' : 'right-[5rem]'}`
  return (
    <div className={`d-root ${TONE[tone]} absolute inset-0 overflow-hidden`}>
      {wheel && <CiWheel look={WHEEL[tone]} triple />}
      {stripe && <CiStripe className={dense ? 'w-[1.5rem]' : 'w-[4rem]'} />}
      <div className={`absolute inset-y-0 flex flex-col ${inset}`}>
        {clock && !dense && <ClockBox variant="header" weather={weather} staleSince={clock.staleSince} stacked />}
        <main className="relative min-h-0 flex-1">{children}</main>
        {dense && (footer || clock) && (
          <div className="flex h-[4.75rem] shrink-0 gap-[1.25rem]">
            <div className="min-w-0 flex-1">{footer}</div>
            {clock && <ClockBox variant="box" weather={weather} staleSince={clock.staleSince} />}
          </div>
        )}
        {!dense && <FrameFooter>{footer}</FrameFooter>}
      </div>
    </div>
  )
}
