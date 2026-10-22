import { ClockBox } from '../frame'

// On-Air (Entwurf mode-on-air.png): Studio-Leuchtschild, rote Fläche mit weißer Schrift auf Schwarz.
// Darunter im Vollbild die aktuelle Uhr (show_clock), bei veralteten Daten mit "Stand HH:MM". Im
// Splitscreen (panel) nichts darunter, die Uhr zeigt dort der Rahmen der Ansicht.
// Animation: still, pulse oder blink (display.css).
const ANIMATION = { pulse: 'd-onair-pulse', blink: 'd-onair-blink' }

// Schriftgröße nach Textlänge, damit auch ein langer eigener Text ins Schild passt
function signFontRem(text, panel) {
  const len = Math.max(1, [...text].length)
  return panel ? Math.min(10.5, 68 / len) : Math.min(17, 150 / len)
}

export default function OnAirMode({ mode, panel = null, staleSince = null }) {
  const text = mode.text || 'ON AIR'
  const showClock = !panel && mode.show_clock
  return (
    <div
      data-display-state="mode"
      data-mode-kind="on_air"
      className="d-root d-scheme-dark absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#111]"
    >
      <div
        className={`flex max-w-[90%] items-center justify-center bg-(--d-red) ${ANIMATION[mode.animation] ?? ''} ${panel
          ? 'mx-[2.25rem] self-stretch px-[2rem] py-[4rem]'
          : 'mb-[6rem] px-[9.5rem] py-[4.25rem]'}`}
      >
        <span
          className="d-oswald text-center font-semibold leading-[1] tracking-[0.04em] text-[#fff]"
          style={{ fontSize: `${signFontRem(text, panel)}rem` }}
        >
          {text}
        </span>
      </div>
      {showClock && (
        <div className="absolute bottom-[7.5rem] text-[4.25rem] text-[#fff]">
          <ClockBox variant="compact" staleSince={staleSince} className="[&>span:first-child]:font-normal" />
        </div>
      )}
    </div>
  )
}
