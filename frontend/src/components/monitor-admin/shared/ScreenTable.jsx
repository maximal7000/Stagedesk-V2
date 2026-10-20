// Gemeinsame Bildschirm-Tabelle für Übersicht und Bildschirm-Liste: gleiche Fläche, Kopfzeile, Zeilen
// und Namensspalte. Die Seiten liefern ihre Spalten (columns) und die Zellen.
import { Link } from 'react-router-dom'

export const iconButton = 'p-2 rounded-md text-fg-muted hover:text-fg hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:text-fg-disabled disabled:pointer-events-none'

// columns: [{ key, label, className? }]; label null = nur für Screenreader ("Aktionen")
export function ScreenTable({ columns, children }) {
  return (
    <div className="bg-surface rounded-lg">
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs text-fg-subtle border-b border-line-subtle">
            {columns.map((c) => (
              <th key={c.key} className={`font-medium px-4 py-2.5 ${c.className || ''}`}>
                {c.label ?? <span className="sr-only">{c.srLabel}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function ScreenRow({ screen, children }) {
  return <tr className="border-b border-line-subtle last:border-0" data-screen={screen.slug}>{children}</tr>
}

export function Cell({ className = '', children }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>
}

// Name und Ort; mit `to` ist der Name ein Link zum Detail
export function ScreenNameCell({ screen, to }) {
  const meta = [screen.location, screen.orientation === 'portrait' ? 'Hochformat' : null].filter(Boolean).join(' · ')
  return (
    <Cell>
      {to ? (
        <Link to={to}
          className="text-sm font-semibold text-fg hover:underline underline-offset-2 focus:outline-none focus-visible:underline">
          {screen.name}
        </Link>
      ) : (
        <div className="text-sm font-semibold text-fg">{screen.name}</div>
      )}
      <div className="text-xs text-fg-muted">{meta}</div>
    </Cell>
  )
}
