// Leiste für ungespeicherte Änderungen (Spec §6.2). Erscheint nur, solange count > 0.
import { Button } from '../../ui'

function changesLabel(count) {
  return count === 1 ? '1 ungespeicherte Änderung' : `${count} ungespeicherte Änderungen`
}

export default function SaveBar({ count, onSave, onDiscard, saving = false }) {
  if (!count) return null
  return (
    <div role="region" aria-label="Ungespeicherte Änderungen"
      className="sticky bottom-0 z-30 -mx-4 lg:-mx-8 mt-6 px-4 lg:px-8 py-3 bg-surface border-t border-line flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-warn shrink-0" aria-hidden="true" />
      <span className="text-sm text-fg flex-1 min-w-0 truncate">{changesLabel(count)}</span>
      <Button variant="ghost" onClick={onDiscard} disabled={saving}>Verwerfen</Button>
      <Button variant="primary" onClick={onSave} disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</Button>
    </div>
  )
}
