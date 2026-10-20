import { ClockBox, Frame } from '../frame'

// Gemeinsamer Aufbau der Zustandsbildschirme (immer Stil A): Uhr oben rechts, Kicker, großer Titel, Text.
export default function StateScreen({ state, orientation, kicker, title, titleClassName = '', children }) {
  const portrait = orientation === 'portrait'
  return (
    <Frame style="ci" orientation={orientation}>
      <div data-display-state={state} className="relative h-full">
        <ClockBox variant="compact" className="absolute right-0 top-[1.75rem] text-[6.5rem]" />
        <div className={portrait ? 'pt-[14rem]' : 'pl-[2.5rem] pt-[9.5rem]'}>
          {kicker && (
            <div className="d-kicker d-oswald text-[2.25rem] uppercase leading-[1.1] tracking-[0.06em] text-(--d-red)">{kicker}</div>
          )}
          <h1 className={`d-oswald mt-[1.25rem] text-[8.5rem] font-light leading-[1.15] tracking-[-0.005em] ${titleClassName}`}>{title}</h1>
          {children}
        </div>
      </div>
    </Frame>
  )
}

export function StateText({ children }) {
  return <p className="d-lato mt-[2rem] max-w-[60rem] text-[1.9375rem] leading-[1.6] text-(--d-fg-soft)">{children}</p>
}
