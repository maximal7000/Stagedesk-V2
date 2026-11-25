export function Heading({ children, aside, size = 'text-[1.75rem]', className = '' }) {
  return (
    <header className={`flex items-baseline justify-between gap-[1rem] ${className}`}>
      <h2 className={`d-kicker d-head min-w-0 truncate font-normal uppercase leading-[1.15] tracking-[0.03em] ${size}`}>{children}</h2>
      {aside}
    </header>
  )
}

// `to`: a range of pages shown at once ("Seite 1–2 / 5", a pair of cards)
export function PageCount({ index, to = null, count, className = 'text-[1.375rem]' }) {
  if (count <= 1) return null
  const shown = to != null && to > index ? `${index + 1}–${to + 1}` : `${index + 1}`
  return (
    <span className={`d-head shrink-0 whitespace-nowrap text-(--d-muted) ${className}`}>
      Seite {shown} / {count}
    </span>
  )
}
