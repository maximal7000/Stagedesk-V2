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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2 text-white">
            <Receipt className="w-5 h-5" />
            <h2 className="font-semibold">Quittung für mehrere Artikel</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name (optional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Conrad-Bestellung 12.05."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Quittung-Datei</label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded cursor-pointer">
                <Camera className="w-4 h-4" /> Foto
                <input type="file" className="hidden"
                  accept="image/*" capture="environment"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded cursor-pointer">
                <Upload className="w-4 h-4" /> Hochladen
                <input type="file" className="hidden"
                  accept="image/*,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              {file && <span className="text-xs text-gray-300 truncate">{file.name}</span>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">Artikel ({selectedIds.size} gewählt)</label>
              <div className="flex gap-1">
                <button onClick={selectAll}
                  className="text-xs text-blue-400 hover:text-blue-300">Alle</button>
                <span className="text-gray-600 text-xs">·</span>
                <button onClick={clearAll}
                  className="text-xs text-gray-400 hover:text-white">Keine</button>
              </div>
            </div>
            <div className="border border-gray-800 rounded max-h-64 overflow-y-auto bg-gray-900/40">
              {artikel.length === 0 ? (
                <p className="text-sm text-gray-500 p-3 text-center">Keine Artikel im Haushalt</p>
              ) : artikel.map((a) => (
                <label key={a.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/60 cursor-pointer border-b border-gray-800 last:border-0">
                  <input type="checkbox" checked={selectedIds.has(a.id)}
                    onChange={() => toggle(a.id)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500" />
                  <span className="text-sm text-white flex-1">{a.name}</span>
                  <span className="text-xs text-gray-500">{a.kategorie}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-gray-800">
          <button onClick={onClose} disabled={uploading}
            className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg">
            Abbrechen
          </button>
          <button onClick={submit} disabled={uploading || !file || selectedIds.size === 0}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Hochladen
          </button>
        </div>
      </div>
    </div>
  );
}
