import ClockBox from './ClockBox'
import { CiStripe, CiWheel, FrameFooter, frameRootClass } from './parts'

// corner: something at the bottom of the logo column (under the wheel, right of the sword), inside the frame so
// it has the frame's font and colours.
export default function NormalFrame({ scheme, clock, footer, corner = null, wheel = true, stripe = true, children }) {
  return (
    <div className={frameRootClass(scheme, 'normal')}>
      {wheel && <CiWheel />}
      {stripe && <CiStripe className="w-[5rem]" />}
      <div
        className={`absolute inset-y-0 z-10 flex flex-col pb-[3.5rem] pt-[4.25rem] ${wheel ? 'left-[23.75rem]' : 'left-[6rem]'} ${stripe ? 'right-[10.75rem]' : 'right-[6rem]'}`}
      >
        {clock && <ClockBox variant="header" weather={clock.showWeather ? clock.weather : null} staleSince={clock.staleSince} seconds={clock.seconds !== false} />}
        <main className="relative min-h-0 flex-1">{children}</main>
        <FrameFooter>{footer}</FrameFooter>
      </div>
      {wheel && corner && <div data-frame-corner className="absolute bottom-[3.5rem] left-[6.5rem] z-10">{corner}</div>}
    </div>
  )
}
