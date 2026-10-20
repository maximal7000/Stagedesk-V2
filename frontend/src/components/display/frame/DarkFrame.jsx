import ClockBox from './ClockBox'
import { CiStripe, CiWheel } from './parts'

// Stil C "Dunkel": wie A auf Schwarz, Rad als dunkles Wasserzeichen, schmaler Streifen.
export default function DarkFrame({ clock, children }) {
  return (
    <div className="d-root d-tone-dark fixed inset-0 overflow-hidden">
      <CiWheel look="watermark-dark" />
      <CiStripe className="w-[1.5rem]" />
      <div className="absolute inset-y-0 left-[8.75rem] right-[6.5rem] flex flex-col pb-[3.5rem] pt-[4.25rem]">
        {clock && <ClockBox variant="header" weather={clock.showWeather ? clock.weather : null} staleSince={clock.staleSince} />}
        <main className="relative min-h-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
