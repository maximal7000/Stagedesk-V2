/**
 * Button — einheitliches Aktions-System.
 * Konvention: genau EINE `primary` (gefüllt, Akzent) pro View; alles andere
 * `secondary`/`ghost`. Flächen ohne Rahmen: secondary liegt auf `raised`, ghost und
 * danger sind transparent. Gefülltes Rot nur im Bestätigungsdialog (per `className`).
 * Alle Varianten `rounded-md`; deaktiviert = Text `fg-disabled`, keine Transparenz. Icon-only nur mit `title` (Tooltip) und `aria-label`.
 *
 * Props:
 *   variant  — "primary" | "secondary" | "ghost" | "danger"  (default "secondary")
 *   size     — "sm" | "md"                                    (default "md")
 *   icon     — optionale lucide-Icon-Komponente (links)
 *   as       — Element/Component, z.B. "a" oder Link          (default "button")
 *   ...props — onClick, href, disabled, title, aria-label …
 *
 * Beispiel:
 *   <Button variant="primary" icon={Plus} onClick={...}>Neu</Button>
 *   <Button as="a" href="/x" variant="secondary" icon={ExternalLink}>Öffnen</Button>
 */
const base =
  'inline-flex items-center justify-center gap-2 font-medium leading-none rounded-md whitespace-nowrap transition-colors duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-canvas disabled:text-fg-disabled disabled:pointer-events-none';

const sizes = {
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-3.5 py-2',
};

const variants = {
  primary: 'bg-accent hover:bg-accent-hover active:bg-accent-hover text-white disabled:bg-raised disabled:text-fg-disabled',
  secondary: 'bg-raised hover:bg-hover active:bg-hover text-fg',
  ghost: 'text-fg-muted hover:text-fg hover:bg-raised active:bg-raised',
  danger: 'text-bad hover:bg-raised active:bg-raised',
};

export default function Button({
  as: Comp = 'button',
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  ...props
}) {
  return (
    <Comp className={`${base} ${sizes[size] || sizes.md} ${variants[variant] || variants.secondary} ${className}`} {...props}>
      {Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'} />}
      {children}
    </Comp>
  );
}
