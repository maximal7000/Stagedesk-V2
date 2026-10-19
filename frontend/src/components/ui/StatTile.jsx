/**
 * StatTile — kompakte Kennzahl, überall gleich (Dashboard + Modul-Header).
 * Optik: Kennzahl auf `surface` ohne Rahmen (`rounded-lg`), Wertfarben über Status-Tokens.
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
  default: 'text-fg',
  positive: 'text-ok',
  warning: 'text-warn',
  danger: 'text-bad',
};

export default function StatTile({ icon: Icon, label, value, tone = 'default' }) {
  return (
    <div className="bg-surface rounded-lg px-4 py-3">
      <div className="flex items-center gap-1.5 text-fg-subtle mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
        <span className="text-xs font-medium truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums leading-none tracking-tight ${toneColor[tone] || toneColor.default}`}>
        {value}
      </div>
    </div>
  );
}
