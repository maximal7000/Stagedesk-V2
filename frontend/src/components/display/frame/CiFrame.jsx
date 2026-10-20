import ClockBox from './ClockBox'
import { CiStripe, CiWheel, FrameFooter } from './parts'

// Stil A "CI": weiße Fläche, schwarzes Rad links angeschnitten, roter Streifen rechts.
// clock = null blendet die Kopfzeile mit Uhr aus (Zustandsbildschirme bringen ihre eigene Uhr mit).
export default function CiFrame({ clock, footer, wheel = true, stripe = true, children }) {
  return (
    <div className="d-root d-tone-light absolute inset-0 overflow-hidden">
      {wheel && <CiWheel look="solid" />}
      {stripe && <CiStripe className="w-[8rem]" />}
      <div
        className={`absolute inset-y-0 flex flex-col pb-[3.5rem] pt-[4.25rem] ${wheel ? 'left-[23.75rem]' : 'left-[6rem]'} ${stripe ? 'right-[13.75rem]' : 'right-[6rem]'}`}
      >
        {clock && <ClockBox variant="header" weather={clock.showWeather ? clock.weather : null} staleSince={clock.staleSince} />}
        <main className="relative min-h-0 flex-1">{children}</main>
        <FrameFooter>{footer}</FrameFooter>
      </div>
    </div>
  )
}
