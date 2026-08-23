/**
 * StatTile — kompakte Kennzahl, überall gleich (Dashboard + Modul-Header).
 * Ersetzt die zwei verschiedenen Darstellungen derselben Zahlen.
 *
 * Props:
 *   icon?  — optionale lucide-Icon-Komponente
 *   label  — Beschriftung (z.B. "Items gesamt")
 *   value  — Wert (Zahl/Text)
 *   tone?  — "default" | "positive" | "warning" | "danger"  (Farbe des Werts)
 *
 * Beispiel:
 *   <StatTile icon={Boxes} label="Items gesamt" value={2} />
 *   <StatTile icon={AlertTriangle} label="Überfällig" value={0} tone="danger" />
 */
const toneColor = {
  default: 'text-white',
  positive: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

export default function StatTile({ icon: Icon, label, value, tone = 'default' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-gray-500 mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
        <span className="text-xs truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums leading-none ${toneColor[tone] || toneColor.default}`}>
        {value}
      </div>
    </div>
  );
}
