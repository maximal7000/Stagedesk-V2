import ClockBox from './ClockBox'
import { CiStripe, CiWheel } from './parts'

// Hochformat (Vorlage "Hintergrund dreifach"): Band mit drei Rädern links, roter Streifen rechts.
// Der Ton folgt dem Stil: ci hell, dark dunkel, dense hellgrau mit Uhr-Box unten.
const TONE = { ci: 'd-tone-light', dark: 'd-tone-dark', dense: 'd-tone-dense' }
const WHEEL = { ci: 'solid', dark: 'watermark-dark', dense: 'watermark-light' }

export default function PortraitFrame({ style = 'ci', clock, footer, children }) {
  const tone = TONE[style] ? style : 'ci'
  const dense = tone === 'dense'
  const weather = clock?.showWeather ? clock.weather : null
  return (
    <div className={`d-root ${TONE[tone]} fixed inset-0 overflow-hidden`}>
      <CiWheel look={WHEEL[tone]} triple />
      <CiStripe className={dense ? 'w-[1.5rem]' : 'w-[4rem]'} />
      <div
        className={`absolute inset-y-0 flex flex-col ${dense
          ? 'left-[2rem] right-[3.5rem] gap-[1.25rem] pb-[1.5rem] pt-[1.75rem]'
          : 'left-[13.5rem] right-[7rem] pb-[3.5rem] pt-[4.25rem]'}`}
      >
        {clock && !dense && <ClockBox variant="header" weather={weather} staleSince={clock.staleSince} stacked />}
        <main className="relative min-h-0 flex-1">{children}</main>
        {dense && (footer || clock) && (
          <div className="flex h-[4.75rem] shrink-0 gap-[1.25rem]">
            <div className="min-w-0 flex-1">{footer}</div>
            {clock && <ClockBox variant="box" weather={weather} staleSince={clock.staleSince} />}
          </div>
        )}
      </div>
    </div>
  )
}
