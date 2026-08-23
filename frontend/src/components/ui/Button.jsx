/**
 * Button — einheitliches Aktions-System.
 * Konvention: genau EINE `primary` (gefüllt, Akzent) pro View; alles andere
 * `secondary`/`ghost`. Icon-only nur mit `title` (Tooltip) und `aria-label`.
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
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg whitespace-nowrap transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-gray-950 disabled:opacity-50 disabled:pointer-events-none';

const sizes = {
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-3.5 py-2',
};

const variants = {
  primary: 'bg-accent hover:bg-accent-hover text-white shadow-sm',
  secondary: 'bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200',
  ghost: 'text-gray-300 hover:text-white hover:bg-gray-800/70',
  danger: 'bg-red-600/90 hover:bg-red-600 text-white',
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
