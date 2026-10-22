import ClockBox from './ClockBox'
import { CiStripe, CiWheel, FrameFooter, frameRootClass } from './parts'

// clock = null hides the header with the clock (state screens bring their own clock).
export default function NormalFrame({ scheme, clock, footer, wheel = true, stripe = true, children }) {
  return (
    <div className={frameRootClass(scheme, 'normal')}>
      {wheel && <CiWheel />}
      {stripe && <CiStripe className="w-[8rem]" />}
      <div
        className={`absolute inset-y-0 z-10 flex flex-col pb-[3.5rem] pt-[4.25rem] ${wheel ? 'left-[23.75rem]' : 'left-[6rem]'} ${stripe ? 'right-[13.75rem]' : 'right-[6rem]'}`}
      >
        {clock && <ClockBox variant="header" weather={clock.showWeather ? clock.weather : null} staleSince={clock.staleSince} />}
        <main className="relative min-h-0 flex-1">{children}</main>
        <FrameFooter>{footer}</FrameFooter>
      </div>
    </div>
  )
}
