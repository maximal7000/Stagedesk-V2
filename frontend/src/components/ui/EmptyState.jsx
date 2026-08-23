/**
 * EmptyState — Leerzustand, der „fertig" wirkt und zur ersten Aktion einlädt
 * (statt grauem „…nichts vorhanden").
 *
 * Props:
 *   icon         — lucide-Icon-Komponente (dezent)
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
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-gray-800/60 border border-gray-700/60 flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-gray-500" />
        </div>
      )}
      <h3 className="text-white font-semibold">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
