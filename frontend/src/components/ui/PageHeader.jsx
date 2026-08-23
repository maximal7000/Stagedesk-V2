/**
 * PageHeader — einheitlicher Seitenkopf für alle Module.
 * Ersetzt die uneinheitlichen Header (kein doppelter Titel mehr — die Topbar
 * benennt den Bereich, der Content trägt Eyebrow + Titel).
 *
 * Props:
 *   eyebrow?  — kleine Uppercase-Kategorie (z.B. "Inventar")
 *   title     — Seitentitel (Pflicht)
 *   meta?     — kurze Meta-Info neben dem Titel (Text oder Node, z.B. "2 Items · 2 frei")
 *   actions?  — rechtsbündige Aktionen (Buttons)
 *
 * Beispiel:
 *   <PageHeader eyebrow="Inventar" title="Alle Artikel" meta="2 Items · 2 frei"
 *     actions={<Button variant="primary" icon={Plus}>Neu</Button>} />
 */
export default function PageHeader({ eyebrow, title, meta, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 mb-1">
            {eyebrow}
          </p>
        )}
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-display text-[1.6rem] leading-none font-bold text-white truncate">{title}</h1>
          {meta && <span className="text-sm text-gray-400">{meta}</span>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">{actions}</div>}
    </div>
  );
}
