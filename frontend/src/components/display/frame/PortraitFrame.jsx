import ClockBox from './ClockBox'
import { CiStripe, CiWheel, FrameFooter, frameRootClass } from './parts'

// Hochformat (Vorlage "Hintergrund dreifach"): Band mit drei Rädern links, roter Streifen rechts.
// Dieselben zwei Aufteilungen wie im Querformat: "Normal" mit Kopfzeile, "Breit" über die ganze Breite
// mit Uhr-Kasten unten, das Band dann unter dem Inhalt.
export default function PortraitFrame({ layout = 'normal', scheme, clock, footer, wheel = true, stripe = true, children }) {
  const wide = layout === 'wide'
  const weather = clock?.showWeather ? clock.weather : null
  const inset = wide
    ? `left-[2rem] gap-[1.25rem] pb-[1.5rem] pt-[1.75rem] ${stripe ? 'right-[3.5rem]' : 'right-[2rem]'}`
    : `pb-[3.5rem] pt-[4.25rem] ${wheel ? 'left-[13.5rem]' : 'left-[5rem]'} ${stripe ? 'right-[7rem]' : 'right-[5rem]'}`
  return (
    <div className={frameRootClass(scheme, layout)}>
      {wheel && <CiWheel triple />}
      {stripe && <CiStripe className={wide ? 'w-[1.5rem]' : 'w-[4rem]'} />}
      <div className={`absolute inset-y-0 z-10 flex flex-col ${inset}`}>
        {clock && !wide && <ClockBox variant="header" weather={weather} staleSince={clock.staleSince} stacked />}
        <main className="relative min-h-0 flex-1">{children}</main>
        {wide && (footer || clock) && (
          <div className="flex h-[4.75rem] shrink-0 gap-[1.25rem]">
            <div className="min-w-0 flex-1">{footer}</div>
            {clock && <ClockBox variant="box" weather={weather} staleSince={clock.staleSince} />}
          </div>
        )}
        {!wide && <FrameFooter>{footer}</FrameFooter>}
      </div>
    </div>
  )
}
