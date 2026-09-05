/**
 * StatusBadge — konsistenter Status-Chip (ersetzt die uneinheitlichen Badges).
 *
 * Props:
 *   label  — Text (z.B. "Verfügbar")
 *   tone?  — "neutral" | "positive" | "warning" | "danger" | "info" | "accent"
 *   dot?   — kleinen Statuspunkt voranstellen
 *
 * Beispiel:
 *   <StatusBadge tone="positive" dot label="Verfügbar" />
 *   <StatusBadge tone="neutral" label="Abgeschlossen" />
 */
const tones = {
  neutral: 'bg-gray-700/40 text-gray-300 ring-1 ring-inset ring-gray-600/30',
  positive: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25',
  danger: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/25',
  info: 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/25',
  accent: 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/25',
};

export default function StatusBadge({ label, tone = 'neutral', dot = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[11px] font-semibold leading-none tracking-wide ${tones[tone] || tones.neutral}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {label}
    </span>
  );
}
