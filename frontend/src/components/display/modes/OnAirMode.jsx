import { ClockBox } from '../frame'
import { formatTime } from '../lib/format'

// On-Air (Entwurf mode-on-air.png): Studio-Leuchtschild, rote Fläche mit weißer Schrift auf Schwarz.
// Darunter "seit HH:MM", im Vollbild davor die Uhr (show_clock). Im Splitscreen (panel) ohne Uhr,
// die zeigt dort der Rahmen der Ansicht. Animation: still, pulse oder blink (display.css).
const ANIMATION = { pulse: 'd-onair-pulse', blink: 'd-onair-blink' }

// Schriftgröße nach Textlänge, damit auch ein langer eigener Text ins Schild passt
function signFontRem(text, panel) {
  const len = Math.max(1, [...text].length)
  return panel ? Math.min(10.5, 68 / len) : Math.min(17, 150 / len)
}

export default function OnAirMode({ mode, panel = null }) {
  const text = mode.text || 'ON AIR'
  const since = formatTime(mode.since)
  const showClock = !panel && mode.show_clock
  return (
    <div
      data-display-state="mode"
      data-mode-kind="on_air"
      className="d-root d-tone-dark absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#111]"
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
      {(showClock || since) && (
        <div
          className={`d-oswald flex items-baseline gap-[0.75rem] whitespace-nowrap font-light leading-none text-[#cfcfcf] ${panel
            ? 'mt-[4rem] text-[4rem]'
            : 'absolute bottom-[7.5rem] text-[4.25rem]'}`}
        >
          {showClock && <ClockBox variant="compact" className="font-normal text-[#fff] [&>span]:font-normal" />}
          {showClock && since && <span className="text-[#9a9a9a]">·</span>}
          {since && <span>seit {since}</span>}
        </div>
      )}
    </div>
  )
}
