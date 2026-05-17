/**
 * Keyboard-Shortcuts Hilfe-Modal.
 * Wird via `?` geöffnet und zeigt alle globalen Tastaturkürzel an.
 */
import { X } from 'lucide-react';

const Kbd = ({ children }) => (
  <kbd className="inline-block px-2 py-0.5 text-xs font-mono bg-gray-800 border border-gray-700 rounded text-gray-200">
    {children}
  </kbd>
);

const Group = ({ title, children }) => (
  <div>
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const Row = ({ keys, desc }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm text-gray-300">{desc}</span>
    <div className="flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-600 text-xs">dann</span>}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </div>
  </div>
);

export default function ShortcutsModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Tastatur-Shortcuts</h2>
          <button onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Group title="Global">
            <Row keys={['?']} desc="Diese Hilfe" />
            <Row keys={['Ctrl', 'K']} desc="Globale Suche" />
            <Row keys={['/']} desc="Lokale Suche fokussieren" />
            <Row keys={['n']} desc="Neu anlegen (kontext-abhängig)" />
            <Row keys={['Esc']} desc="Schließen / Abbrechen" />
          </Group>

          <Group title="Navigation">
            <Row keys={['g', 'h']} desc="Dashboard" />
            <Row keys={['g', 'v']} desc="Veranstaltungen" />
            <Row keys={['g', 'k']} desc="Kalender" />
            <Row keys={['g', 'i']} desc="Inventar" />
            <Row keys={['g', 'a']} desc="Anwesenheit" />
            <Row keys={['g', 'b']} desc="Haushalte" />
            <Row keys={['g', 't']} desc="Aufgaben" />
          </Group>

          <Group title="Tabellen-Auswahl">
            <Row keys={['Shift', 'Klick']} desc="Bereich auswählen (Haushalt)" />
          </Group>

          <Group title="Bearbeiten">
            <Row keys={['Enter']} desc="Speichern (in Inline-Edit)" />
            <Row keys={['Esc']} desc="Abbrechen" />
          </Group>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          Shortcuts wirken nicht, während du in einem Eingabefeld tippst — außer{' '}
          <Kbd>Esc</Kbd>.
        </p>
      </div>
    </div>
  );
}
