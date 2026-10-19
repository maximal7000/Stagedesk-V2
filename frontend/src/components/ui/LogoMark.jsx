/**
 * LogoMark: Stagedesk-Zeichen. Drei Fader-Schienen wie an einem Licht- oder
 * Tonpult, der mittlere Fader-Knopf in TUES-Rot. Gleiches Motiv wie Favicon
 * und App-Icon (public/favicon.svg, public/icons/icon.svg).
 *
 * Props:
 *   className — Größe/Abstände (Standard: w-6 h-6)
 *   title     — optionaler Zugänglichkeitsname; ohne title ist das Zeichen dekorativ
 *
 * Beispiel:
 *   <LogoMark className="w-7 h-7" />
 */
export default function LogoMark({ className = 'w-6 h-6', title }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* Schienen */}
      <rect x="4" y="2" width="2" height="20" rx="1" className="fill-line-strong" />
      <rect x="11" y="2" width="2" height="20" rx="1" className="fill-line-strong" />
      <rect x="18" y="2" width="2" height="20" rx="1" className="fill-line-strong" />
      {/* Fader-Knöpfe auf unterschiedlicher Höhe */}
      <rect x="2" y="13" width="6" height="4" rx="1" className="fill-fg-muted" />
      <rect x="9" y="5" width="6" height="4" rx="1" className="fill-accent" />
      <rect x="16" y="15" width="6" height="4" rx="1" className="fill-fg-muted" />
    </svg>
  );
}
