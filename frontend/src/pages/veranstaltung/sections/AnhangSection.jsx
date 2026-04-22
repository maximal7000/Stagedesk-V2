import { useState } from 'react';
import { Paperclip, Plus, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

export default function AnhangSection({ data, refetch, canEdit, eventId }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [adding, setAdding] = useState(false);

  const download = async (anhang) => {
    if (!anhang.datei_url && anhang.url) { window.open(anhang.url, '_blank'); return; }
    try {
      const res = await apiClient.get(`/veranstaltung/anhaenge/${anhang.id}/download`, { responseType: 'blob' });
      const u = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = u; a.download = anhang.name; a.click();
      URL.revokeObjectURL(u);
    } catch { toast.error('Download fehlgeschlagen'); }
  };

  const add = async (e) => {
    e.preventDefault();
    const n = name.trim() || (file?.name ?? 'Anhang');
    if (!n) return;
    setAdding(true);
    try {
      const formData = new FormData();
      formData.append('name', n); formData.append('url', url.trim());
      if (file) formData.append('datei', file);
      await apiClient.post(`/veranstaltung/${eventId}/anhaenge`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setName(''); setUrl(''); setFile(null); refetch();
    } catch { toast.error('Anhang konnte nicht hinzugefügt werden.'); }
    finally { setAdding(false); }
  };

  const remove = async (id) => {
    try { await apiClient.delete(`/veranstaltung/${eventId}/anhaenge/${id}`); refetch(); }
    catch (err) { console.error('Anhang löschen:', err); }
  };

  if (!canEdit && !(data?.anhaenge?.length > 0)) return null;

  return (
    <CollapsibleSection icon={Paperclip} title="Anhänge">
      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap gap-2 mb-4">
          <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 w-32" />
          <input type="url" placeholder="URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 flex-1 min-w-[120px]" />
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm max-w-[200px]" />
          <button type="submit" disabled={adding || (!name.trim() && !file)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg">
            {adding ? '…' : <><Plus className="w-4 h-4 inline mr-1" /><span>Hinzufügen</span></>}
          </button>
        </form>
      )}
      <ul className="space-y-2">
        {(data?.anhaenge || []).map((a) => (
          <li key={a.id} className="flex items-center justify-between py-2 px-3 bg-gray-800 rounded-lg">
            <button type="button" onClick={() => download(a)}
              className="text-blue-400 hover:underline flex items-center gap-1.5 text-left">
              <Download className="w-3.5 h-3.5 flex-shrink-0" /> {a.name}
            </button>
            {canEdit && (
              <button type="button" onClick={() => remove(a.id)} className="text-gray-400 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
        {(!data?.anhaenge || data.anhaenge.length === 0) && <li className="text-gray-500 text-sm">Keine Anhänge</li>}
      </ul>
    </CollapsibleSection>
  );
}
