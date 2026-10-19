/**
 * StatusBadge — konsistenter Status-Chip (ersetzt die uneinheitlichen Badges).
 * Optik: `bg-raised rounded-sm`, Text und Punkt in der Statusfarbe, kein Ring, keine Tönung.
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
  neutral: 'text-fg-muted',
  positive: 'text-ok',
  warning: 'text-warn',
  danger: 'text-bad',
  info: 'text-info',
  accent: 'text-accent-fg',
};

const dotColor = {
  neutral: 'bg-fg-subtle',
  positive: 'bg-ok',
  warning: 'bg-warn',
  danger: 'bg-bad',
  info: 'bg-info',
  accent: 'bg-accent-fg',
};

export default function StatusBadge({ label, tone = 'neutral', dot = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-sm bg-raised text-[11px] font-semibold leading-none tracking-wide ${tones[tone] || tones.neutral}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor[tone] || dotColor.neutral}`} />}
      {label}
    </span>
  );
}
