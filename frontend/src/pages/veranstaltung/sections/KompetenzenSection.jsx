import { useEffect, useState, useMemo } from 'react';
import { Award, AlertTriangle, CheckCircle2, Plus, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

export default function KompetenzenSection({ data, refetch, canEdit, eventId }) {
  const [katalog, setKatalog] = useState([]);
  const [check, setCheck] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ erforderlich: [], empfohlen: [] });

  const erforderlichIds = data?.erforderliche_kompetenzen_ids || [];
  const empfohlenIds = data?.empfohlene_kompetenzen_ids || [];

  useEffect(() => {
    // /kompetenzen (nur aktive) für normale User; /alle nur für Admins mit edit_catalog.
    const url = canEdit ? '/kompetenzen/alle' : '/kompetenzen';
    apiClient.get(url)
      .then(r => setKatalog(r.data))
      .catch(() => apiClient.get('/kompetenzen').then(r => setKatalog(r.data)).catch(() => setKatalog([])));
  }, [canEdit]);

  useEffect(() => {
    if (!eventId) return;
    apiClient.get(`/kompetenzen/veranstaltung/${eventId}/check`)
      .then(r => setCheck(r.data))
      .catch(() => setCheck(null));
  }, [eventId, data]);

  useEffect(() => {
    setDraft({ erforderlich: [...erforderlichIds], empfohlen: [...empfohlenIds] });
  }, [data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries(katalog.map(k => [k.id, k])), [katalog]);

  const erforderlich = erforderlichIds.map(id => byId[id]).filter(Boolean);
  const empfohlen = empfohlenIds.map(id => byId[id]).filter(Boolean);

  const toggleDraft = (bucket, id) => {
    setDraft(d => {
      const has = d[bucket].includes(id);
      return { ...d, [bucket]: has ? d[bucket].filter(x => x !== id) : [...d[bucket], id] };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/veranstaltung/${eventId}`, {
        erforderliche_kompetenzen_ids: draft.erforderlich,
        empfohlene_kompetenzen_ids: draft.empfohlen,
      });
      toast.success('Kompetenzen gespeichert');
      setEditing(false);
      refetch();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler');
    } finally {
      setSaving(false);
    }
  };

  const total = erforderlich.length + empfohlen.length;
  const hasWarning = check && (check.fehlende?.length || check.abgelaufene?.length);

  // Gruppieren nach Kategorie für das Edit-Panel
  const katalogGrouped = useMemo(() => {
    const out = {};
    for (const k of katalog) {
      if (!out[k.kategorie_name]) out[k.kategorie_name] = [];
      out[k.kategorie_name].push(k);
    }
    return out;
  }, [katalog]);

  return (
    <CollapsibleSection
      icon={Award}
      title="Erforderliche Kompetenzen"
      count={total || undefined}
      actions={canEdit && !editing && (
        <button type="button" onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300 hover:bg-gray-700">
          <Plus className="w-4 h-4" /> Bearbeiten
        </button>
      )}
    >
      <div className="space-y-4">
        {/* Status-Check für den eingeloggten User */}
        {check && !editing && (erforderlich.length > 0 || empfohlen.length > 0) && (
          <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
            check.erfuellt
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            {check.erfuellt
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <div>
              {check.erfuellt ? (
                <span>Du erfüllst alle Anforderungen.</span>
              ) : (
                <div className="space-y-1">
                  {check.fehlende?.length > 0 && (
                    <div>Fehlend: {check.fehlende.map(k => k.name).join(', ')}</div>
                  )}
                  {check.abgelaufene?.length > 0 && (
                    <div>Abgelaufen: {check.abgelaufene.map(k => k.name).join(', ')}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* View-Mode: Liste */}
        {!editing && (
          <>
            {erforderlich.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pflicht</h3>
                <div className="flex flex-wrap gap-2">
                  {erforderlich.map(k => (
                    <span key={k.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-300 rounded-full text-sm">
                      <Award className="w-3.5 h-3.5" /> {k.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {empfohlen.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Empfohlen</h3>
                <div className="flex flex-wrap gap-2">
                  {empfohlen.map(k => (
                    <span key={k.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-full text-sm">
                      <Award className="w-3.5 h-3.5" /> {k.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {total === 0 && (
              <p className="text-gray-500 text-sm">Keine Kompetenzen gefordert.</p>
            )}
          </>
        )}

        {/* Edit-Mode: Multi-Select */}
        {editing && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Klick einmal für Empfohlen, zweimal für Pflicht, dreimal zum Entfernen.
            </p>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {Object.entries(katalogGrouped).map(([kat, items]) => (
                <div key={kat}>
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">{kat}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map(k => {
                      const istPflicht = draft.erforderlich.includes(k.id);
                      const istEmpf = draft.empfohlen.includes(k.id);
                      const cls = istPflicht
                        ? 'bg-red-500/20 border-red-500/50 text-red-300'
                        : istEmpf
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700';
                      const onClick = () => {
                        if (istPflicht) {
                          toggleDraft('erforderlich', k.id);
                        } else if (istEmpf) {
                          toggleDraft('empfohlen', k.id);
                          toggleDraft('erforderlich', k.id);
                        } else {
                          toggleDraft('empfohlen', k.id);
                        }
                      };
                      return (
                        <button type="button" key={k.id} onClick={onClick}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs transition-colors ${cls}`}>
                          {k.name}
                          {istPflicht && <span className="text-[10px] font-bold ml-1">P</span>}
                          {istEmpf && <span className="text-[10px] font-bold ml-1">E</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-800">
              <button type="button" onClick={save} disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-500 text-sm disabled:opacity-50">
                <Save className="w-4 h-4" /> Speichern
              </button>
              <button type="button"
                onClick={() => { setEditing(false); setDraft({ erforderlich: [...erforderlichIds], empfohlen: [...empfohlenIds] }); }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-400 hover:text-white text-sm">
                <X className="w-4 h-4" /> Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
