import ClockBox from './ClockBox'
import { CiStripe, CiWheel, frameRootClass } from './parts'

export default function WideFrame({ scheme, clock, footer, wheel = true, stripe = true, children }) {
  return (
    <div className={frameRootClass(scheme, 'wide')}>
      {wheel && <CiWheel />}
      {stripe && <CiStripe className="w-[1.5rem]" />}
      <div className={`absolute inset-y-0 left-[2rem] z-10 flex flex-col gap-[1.25rem] pb-[1.5rem] pt-[1.75rem] ${stripe ? 'right-[3.5rem]' : 'right-[2rem]'}`}>
        <main className="relative min-h-0 flex-1">{children}</main>
        {(footer || clock) && (
          <div className="flex h-[4.75rem] shrink-0 gap-[1.25rem]">
            <div className="min-w-0 flex-1">{footer}</div>
            {clock && <ClockBox variant="box" weather={clock.showWeather ? clock.weather : null} staleSince={clock.staleSince} />}
          </div>
        )}
      </div>
    </div>
  )
}
