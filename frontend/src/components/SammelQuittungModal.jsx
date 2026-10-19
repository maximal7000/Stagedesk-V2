/**
 * Modal: Eine Quittung hochladen und mit mehreren Artikeln verknüpfen.
 */
import { useState } from 'react';
import { X, Upload, Camera, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../lib/api';

export default function SammelQuittungModal({ haushaltId, artikel, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [uploading, setUploading] = useState(false);

  const toggle = (id) => setSelectedIds((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const selectAll = () => setSelectedIds(new Set(artikel.map(a => a.id)));
  const clearAll = () => setSelectedIds(new Set());

  const submit = async () => {
    if (!file) { toast.error('Datei fehlt'); return; }
    if (selectedIds.size === 0) { toast.error('Mindestens einen Artikel auswählen'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('datei', file);
      form.append('name', name);
      form.append('artikel_ids', Array.from(selectedIds).join(','));
      await apiClient.post(`/haushalte/${haushaltId}/sammelquittungen`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Quittung an ${selectedIds.size} Artikel verknüpft`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Hochladen fehlgeschlagen');
    } finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-overlay border border-line rounded-lg shadow-overlay w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-subtle">
          <div className="flex items-center gap-2 text-fg">
            <Receipt className="w-5 h-5 text-fg-subtle" />
            <h2 className="font-display text-xl font-semibold tracking-tight">Quittung für mehrere Artikel</h2>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="text-fg-subtle hover:text-fg rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1">Name (optional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Conrad-Bestellung 12.05."
              className="w-full px-3 py-2 text-sm bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">Quittung-Datei</label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-raised hover:bg-hover text-fg text-sm rounded-md cursor-pointer">
                <Camera className="w-4 h-4" /> Foto
                <input type="file" className="hidden"
                  accept="image/*" capture="environment"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-raised hover:bg-hover text-fg text-sm rounded-md cursor-pointer">
                <Upload className="w-4 h-4" /> Hochladen
                <input type="file" className="hidden"
                  accept="image/*,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              {file && <span className="text-xs text-fg-muted truncate">{file.name}</span>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-fg-muted">Artikel ({selectedIds.size} gewählt)</label>
              <div className="flex gap-1">
                <button onClick={selectAll}
                  className="text-xs text-info hover:text-fg rounded-sm">Alle</button>
                <span className="text-fg-subtle text-xs">·</span>
                <button onClick={clearAll}
                  className="text-xs text-fg-muted hover:text-fg rounded-sm">Keine</button>
              </div>
            </div>
            <div className="bg-surface rounded-md max-h-64 overflow-y-auto divide-y divide-line-subtle">
              {artikel.length === 0 ? (
                <p className="text-sm text-fg-subtle p-3 text-center">Keine Artikel im Haushalt</p>
              ) : artikel.map((a) => (
                <label key={a.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-hover cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(a.id)}
                    onChange={() => toggle(a.id)}
                    className="rounded-sm border-line bg-raised accent-accent" />
                  <span className="text-sm text-fg flex-1">{a.name}</span>
                  <span className="text-xs text-fg-subtle">{a.kategorie}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-line-subtle">
          <button onClick={onClose} disabled={uploading}
            className="flex-1 px-4 py-2 bg-raised hover:bg-hover text-fg rounded-md disabled:text-fg-disabled">
            Abbrechen
          </button>
          <button onClick={submit} disabled={uploading || !file || selectedIds.size === 0}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-raised disabled:text-fg-disabled disabled:pointer-events-none text-white font-semibold rounded-md inline-flex items-center justify-center gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Hochladen
          </button>
        </div>
      </div>
    </div>
  );
}
