import { useState } from 'react';
import { Paperclip, Plus, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import { Button } from '../../../components/ui';

export default function AnhangSection({ data, refetch, canEdit, eventId }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [adding, setAdding] = useState(false);

  const download = async (anhang) => {
    if (!anhang.datei_url && anhang.url) { window.open(anhang.url, '_blank'); return; }
    try {
      const res = await apiClient.get(`/veranstaltung/anhaenge/${anhang.id}/download`, { responseType: 'blob' });
      // Dateiname aus Content-Disposition vom Server lesen (enthält Original-Endung).
      const cd = res.headers?.['content-disposition'] || '';
      const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
      const serverName = match ? decodeURIComponent(match[1]) : null;
      const u = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = u;
      a.download = serverName || anhang.name;
      a.click();
      URL.revokeObjectURL(u);
    } catch { toast.error('Download fehlgeschlagen'); }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!file && !url.trim()) {
      toast.error('Bitte Datei oder URL angeben');
      return;
    }
    const n = name.trim() || (file?.name ?? 'Anhang');
    setAdding(true);
    try {
      const formData = new FormData();
      formData.append('name', n); formData.append('url', url.trim());
      if (file) formData.append('datei', file);
      // Content-Type wird vom Browser/axios-Interceptor selbst gesetzt (Boundary nötig).
      await apiClient.post(`/veranstaltung/${eventId}/anhaenge`, formData);
      setName(''); setUrl(''); setFile(null); refetch();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Anhang konnte nicht hinzugefügt werden.');
    } finally { setAdding(false); }
  };

  const remove = async (id) => {
    try { await apiClient.delete(`/veranstaltung/${eventId}/anhaenge/${id}`); refetch(); }
    catch (err) { console.error('Anhang löschen:', err); }
  };

  if (!canEdit && !(data?.anhaenge?.length > 0)) return null;

  return (
    <CollapsibleSection icon={Paperclip} title="Anhänge">
      {canEdit && (
        <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mb-4">
          <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)}
            className="bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg placeholder:text-fg-subtle min-w-0" />
          <input type="url" placeholder="URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)}
            className="bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg placeholder:text-fg-subtle min-w-0" />
          <Button type="submit" variant="secondary" icon={adding ? undefined : Plus} disabled={adding || (!file && !url.trim())}>
            {adding ? '…' : 'Hinzufügen'}
          </Button>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="sm:col-span-3 bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg text-sm
                       file:mr-3 file:px-3 file:py-1 file:bg-hover file:text-fg file:border-0 file:rounded-sm
                       file:text-sm file:cursor-pointer hover:file:bg-line" />
        </form>
      )}
      <ul className="bg-surface rounded-lg divide-y divide-line-subtle">
        {(data?.anhaenge || []).map((a) => (
          <li key={a.id} className="flex items-center justify-between py-2 px-3">
            <button type="button" onClick={() => download(a)}
              className="text-accent-fg hover:underline flex items-center gap-1.5 text-left">
              <Download className="w-3.5 h-3.5 flex-shrink-0" /> {a.name}
            </button>
            {canEdit && (
              <button type="button" onClick={() => remove(a.id)} aria-label={`${a.name} löschen`} className="text-fg-muted hover:text-bad">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
        {(!data?.anhaenge || data.anhaenge.length === 0) && <li className="text-fg-subtle text-sm px-3 py-2">Keine Anhänge</li>}
      </ul>
    </CollapsibleSection>
  );
}
