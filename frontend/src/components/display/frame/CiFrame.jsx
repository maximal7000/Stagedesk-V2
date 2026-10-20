import ClockBox from './ClockBox'
import { CiStripe, CiWheel } from './parts'

// Stil A "CI": weiße Fläche, schwarzes Rad links angeschnitten, roter Streifen rechts.
// clock = null blendet die Kopfzeile mit Uhr aus (Zustandsbildschirme bringen ihre eigene Uhr mit).
export default function CiFrame({ clock, children }) {
  return (
    <div className="d-root d-tone-light fixed inset-0 overflow-hidden">
      <CiWheel look="solid" />
      <CiStripe className="w-[8rem]" />
      <div className="absolute inset-y-0 left-[23.75rem] right-[13.75rem] flex flex-col pb-[3.5rem] pt-[4.25rem]">
        {clock && <ClockBox variant="header" weather={clock.showWeather ? clock.weather : null} staleSince={clock.staleSince} />}
        <main className="relative min-h-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
