import { ClockBox, Frame } from '../frame'

// Ruhemodus (Power-Steuerung "aus"): ruhiges dunkles CI-Bild mit kleiner Uhr statt alter Inhalte.
export default function IdleScreen({ orientation }) {
  return (
    <Frame style="dark" orientation={orientation}>
      <div data-display-state="idle" className="relative h-full">
        <ClockBox variant="compact" className="absolute bottom-0 right-0 text-[4.5rem] text-(--d-muted)" />
      </div>
    </Frame>
  )
}
