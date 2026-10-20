import ClockBox from './ClockBox'
import { CiStripe, CiWheel, FrameFooter } from './parts'

// Stil C "Dunkel": wie A auf Schwarz, Rad als dunkles Wasserzeichen, schmaler Streifen.
export default function DarkFrame({ clock, footer, wheel = true, stripe = true, children }) {
  return (
    <div className="d-root d-tone-dark absolute inset-0 overflow-hidden">
      {wheel && <CiWheel look="watermark-dark" />}
      {stripe && <CiStripe className="w-[1.5rem]" />}
      <div className={`absolute inset-y-0 left-[8.75rem] flex flex-col pb-[3.5rem] pt-[4.25rem] ${stripe ? 'right-[6.5rem]' : 'right-[5rem]'}`}>
        {clock && <ClockBox variant="header" weather={clock.showWeather ? clock.weather : null} staleSince={clock.staleSince} />}
        <main className="relative min-h-0 flex-1">{children}</main>
        <FrameFooter>{footer}</FrameFooter>
      </div>
    </div>
  )
}
