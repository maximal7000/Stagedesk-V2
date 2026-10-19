import { useEffect, useState, useMemo } from 'react';
import { Award, AlertTriangle, CheckCircle2, Pen, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import { Button } from '../../../components/ui';

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
        <Button variant="secondary" size="sm" icon={Pen} onClick={() => setEditing(true)}>Bearbeiten</Button>
      )}
    >
      <div className="space-y-4">
        {/* Status-Check für den eingeloggten User */}
        {check && !editing && (erforderlich.length > 0 || empfohlen.length > 0) && (
          <div className={`flex items-start gap-2 p-3 rounded-lg bg-surface text-sm ${
            check.erfuellt
              ? 'text-ok'
              : 'text-bad'
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
                <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">Pflicht</h3>
                <div className="flex flex-wrap gap-2">
                  {erforderlich.map(k => (
                    <span key={k.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-raised text-bad rounded-sm text-sm">
                      <Award className="w-3.5 h-3.5" /> {k.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {empfohlen.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">Empfohlen</h3>
                <div className="flex flex-wrap gap-2">
                  {empfohlen.map(k => (
                    <span key={k.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-raised text-fg-muted rounded-sm text-sm">
                      <Award className="w-3.5 h-3.5" /> {k.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {total === 0 && (
              <p className="text-fg-subtle text-sm">Keine Kompetenzen gefordert.</p>
            )}
          </>
        )}

        {/* Edit-Mode: Multi-Select */}
        {editing && (
          <div className="space-y-4">
            <p className="text-xs text-fg-subtle">
              Klick einmal für Empfohlen, zweimal für Pflicht, dreimal zum Entfernen.
            </p>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {Object.entries(katalogGrouped).map(([kat, items]) => (
                <div key={kat}>
                  <div className="text-xs font-semibold text-fg-muted uppercase mb-1">{kat}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map(k => {
                      const istPflicht = draft.erforderlich.includes(k.id);
                      const istEmpf = draft.empfohlen.includes(k.id);
                      const cls = istPflicht
                        ? 'bg-raised border-bad text-bad'
                        : istEmpf
                          ? 'bg-raised border-accent text-accent-fg'
                          : 'bg-raised border-line text-fg-muted hover:bg-hover';
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
                          className={`inline-flex items-center gap-1 px-2.5 py-1 border rounded-sm text-xs transition-colors ${cls}`}>
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
            <div className="flex gap-2 pt-2 border-t border-line-subtle">
              <Button variant="primary" size="sm" icon={Save} onClick={save} disabled={saving}>Speichern</Button>
              <Button variant="ghost" size="sm" icon={X}
                onClick={() => { setEditing(false); setDraft({ erforderlich: [...erforderlichIds], empfohlen: [...empfohlenIds] }); }}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
