/**
 * EmptyState — Leerzustand, der „fertig" wirkt und zur ersten Aktion einlädt
 * (statt grauem „…nichts vorhanden").
 *
 * Props:
 *   icon         — lucide-Icon-Komponente (frei stehend, 24 px, `fg-subtle`, keine Kachel)
 *   title        — eine klare Zeile
 *   description? — ein Satz Kontext
 *   action?      — genau eine klare Aktion (Button)
 *
 * Beispiel:
 *   <EmptyState icon={CalendarX2} title="Keine Veranstaltungen"
 *     description="Leg deine erste Veranstaltung an."
 *     action={<Button variant="primary" icon={Plus}>Neue Veranstaltung</Button>} />
 */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      {Icon && <Icon className="w-6 h-6 text-fg-subtle mb-4" />}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="text-sm text-fg-muted mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
