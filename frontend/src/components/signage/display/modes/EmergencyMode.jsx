import { ClockBox } from '../frame'
import { formatTime } from '../lib/format'

// Notfall (Entwurf mode-emergency.png): weiß, roter Balken "NOTFALL" mit Uhr, die Anweisung so groß
// wie möglich, darunter der Zusatz und "Ausgelöst HH:MM". Keine Animation. Immer Vollbild.

// Schriftgröße der Anweisung nach Länge: kurze Anweisungen maximal groß, lange bleiben vollständig sichtbar
function textFontRem(text) {
  const len = [...(text || '')].length
  if (len <= 60) return 9.5
  if (len <= 110) return 7.25
  if (len <= 180) return 5.5
  return 4.25
}

// staleSince: letzte gültige Daten bei veralteten Daten oder verlorener Verbindung ("Stand HH:MM" an der Uhr)
export default function EmergencyMode({ mode, staleSince = null }) {
  const since = formatTime(mode.since)
  return (
    <div data-display-state="mode" data-mode-kind="emergency" className="d-root d-scheme-light absolute inset-0 flex flex-col overflow-hidden">
      <header
        className="flex h-[12.5rem] shrink-0 items-center justify-between bg-(--d-red) px-[6.25rem] text-[#fff]"
        style={{ '--d-fg-soft': '#ffffff', '--d-muted': '#ffffffcc' }}
      >
        <span className="d-oswald text-[7.25rem] font-medium uppercase leading-none tracking-[0.08em]">Notfall</span>
        <ClockBox variant="compact" staleSince={staleSince} className="text-[5.25rem]" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-[6.25rem] pb-[4.5rem] pt-[6.75rem]">
        <p className="d-oswald font-semibold leading-[1.08] text-[#111]" style={{ fontSize: `${textFontRem(mode.text)}rem` }}>
          {mode.text}
        </p>
        {mode.note && <p className="d-lato mt-[3.25rem] line-clamp-4 max-w-[78rem] text-[2.875rem] leading-[1.5] text-[#333]">{mode.note}</p>}
        {since && (
          <p className="d-oswald mt-auto pt-[2rem] text-[2.25rem] uppercase leading-none tracking-[0.03em] text-(--d-muted)">
            Ausgelöst {since}
          </p>
        )}
      </div>
    </div>
  )
}
