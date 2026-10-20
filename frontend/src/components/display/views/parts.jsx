// Gemeinsame Bausteine der Ansichten

// Überschrift mit rotem CI-Balken; rechts optional ein Zusatz (Fußweg, Seitenzahl)
export function Heading({ children, aside, size = 'text-[1.75rem]', className = '' }) {
  return (
    <header className={`flex items-baseline justify-between gap-[1rem] ${className}`}>
      <h2 className={`d-kicker d-oswald min-w-0 truncate font-normal uppercase leading-[1.15] tracking-[0.03em] ${size}`}>{children}</h2>
      {aside}
    </header>
  )
}

// "Seite n / m", nur wenn es mehr als eine Seite gibt (Spec §5.2: blättern nur, was nicht passt)
export function PageCount({ index, count, className = 'text-[1.375rem]' }) {
  if (count <= 1) return null
  return (
    <span className={`d-oswald shrink-0 whitespace-nowrap text-(--d-muted) ${className}`}>
      Seite {index + 1} / {count}
    </span>
  )
}
