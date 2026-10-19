import { useState } from 'react';
import { Hand, LogOut, ToggleLeft, ToggleRight, AlertTriangle, X as XIcon, Award } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

function formatDatum(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function MeldungSection({ data, refetch, eventId, currentUserId, isAdmin }) {
  const [abmeldeGrund, setAbmeldeGrund] = useState('');
  const [showAbmelden, setShowAbmelden] = useState(false);
  const [meldenFehler, setMeldenFehler] = useState(null); // { title, kompetenzen[] }

  const meldungen = data?.meldungen || [];
  const abmeldungen = data?.abmeldungen || [];
  const istGemeldet = data?.ist_gemeldet || false;
  const meldungAktiv = data?.meldung_aktiv !== false;

  const handleMelden = async () => {
    setMeldenFehler(null);
    try {
      await apiClient.post(`/veranstaltung/${eventId}/melden`, {});
      toast.success('Du hast dich gemeldet');
      refetch();
    } catch (e) {
      const detail = e?.response?.data?.detail || '';
      const status = e?.response?.status;
      if (status === 403 && detail.includes('Kompetenzen')) {
        const nach = detail.split(':')[1] || '';
        const kompetenzen = nach.split(',').map(s => s.trim()).filter(Boolean);
        setMeldenFehler({
          title: 'Melden nicht möglich: Kompetenzen fehlen',
          kompetenzen,
        });
      } else {
        toast.error(detail || 'Melden fehlgeschlagen');
      }
    }
  };

  const handleAbmelden = async () => {
    try {
      await apiClient.post(`/veranstaltung/${eventId}/abmelden`, { grund: abmeldeGrund });
      toast.success('Abgemeldet');
      setShowAbmelden(false);
      setAbmeldeGrund('');
      refetch();
    } catch {
      toast.error('Abmelden fehlgeschlagen');
    }
  };

  const toggleMeldungAktiv = async () => {
    try {
      await apiClient.put(`/veranstaltung/${eventId}/meldung-aktiv?aktiv=${!meldungAktiv}`);
      toast.success(meldungAktiv ? 'Meldefunktion deaktiviert' : 'Meldefunktion aktiviert');
      refetch();
    } catch {
      toast.error('Fehler beim Umschalten');
    }
  };

  return (
    <CollapsibleSection
      icon={Hand}
      title="Meldung"
      count={isAdmin && meldungen.length > 0 ? meldungen.length : undefined}
      actions={isAdmin && (
        <button type="button" onClick={toggleMeldungAktiv}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
            meldungAktiv
              ? 'bg-raised text-ok hover:bg-hover'
              : 'bg-raised text-fg-muted hover:bg-hover'
          }`}
          title={meldungAktiv ? 'Meldefunktion deaktivieren' : 'Meldefunktion aktivieren'}>
          {meldungAktiv ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {meldungAktiv ? 'Aktiv' : 'Deaktiviert'}
        </button>
      )}
    >
      <div className="space-y-4">
        {/* Fehler-Banner: Kompetenzen fehlen */}
        {meldenFehler && (
          <div className="bg-surface rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-bad shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-fg font-semibold text-sm">{meldenFehler.title}</h4>
                <button type="button" onClick={() => setMeldenFehler(null)} aria-label="Hinweis schließen"
                        className="text-fg-subtle hover:text-fg">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
              {meldenFehler.kompetenzen.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meldenFehler.kompetenzen.map((k, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-raised text-bad rounded-sm text-xs">
                      <Award className="w-3 h-3" /> {k}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-fg-muted mt-2">
                Frage einen Admin nach Bestätigung deiner Kompetenzen.{' '}
                <Link to="/kompetenzen" className="text-accent-fg hover:underline">Zu meinen Kompetenzen</Link>
              </p>
            </div>
          </div>
        )}

        {/* Meldung deaktiviert Info */}
        {!meldungAktiv && !isAdmin && (
          <p className="text-fg-subtle text-sm">Meldung ist für diese Veranstaltung nicht verfügbar.</p>
        )}

        {/* User: Melden/Abmelden Button (nur wenn aktiv) */}
        {meldungAktiv && !istGemeldet && (
          <button type="button" onClick={handleMelden}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-medium transition-colors">
            <Hand className="w-4 h-4" />
            Verfügbar melden
          </button>
        )}

        {istGemeldet && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-raised text-ok rounded-md text-sm font-medium">
                <Hand className="w-4 h-4" /> Du bist gemeldet
              </span>
              <button type="button" onClick={() => setShowAbmelden(!showAbmelden)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-raised text-bad rounded-md text-sm transition-colors">
                <LogOut className="w-4 h-4" /> Abmelden
              </button>
            </div>
            {showAbmelden && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-fg-muted mb-1">Grund (optional)</label>
                  <input type="text" value={abmeldeGrund} onChange={(e) => setAbmeldeGrund(e.target.value)}
                    placeholder="z.B. Termin-Konflikt..."
                    className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg placeholder:text-fg-subtle text-sm" />
                </div>
                <button type="button" onClick={handleAbmelden}
                  className="px-3 py-2 bg-bad hover:brightness-110 text-white rounded-md text-sm">
                  Bestätigen
                </button>
              </div>
            )}
          </div>
        )}

        {/* Admin: Gemeldete Personen */}
        {isAdmin && meldungen.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-fg-muted">Gemeldete Personen</h3>
            <div className="bg-surface rounded-lg divide-y divide-line-subtle">
              {meldungen.map((m) => {
                const name = [m.user_first_name, m.user_last_name].filter(Boolean).join(' ')
                  || m.user_username || m.user_keycloak_id?.slice(0, 8) || '?';
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2 px-3">
                    <div className="w-7 h-7 bg-raised rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-fg-muted text-xs font-medium">{name[0].toUpperCase()}</span>
                    </div>
                    <span className="text-fg text-sm">{name}</span>
                    {m.kommentar && <span className="text-fg-subtle text-xs">{m.kommentar}</span>}
                    <span className="text-fg-subtle text-xs ml-auto">{formatDatum(m.erstellt_am)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin: Abmeldungen-Log */}
        {isAdmin && abmeldungen.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-bad">Abmeldungen</h3>
            <div className="bg-surface rounded-lg divide-y divide-line-subtle">
              {abmeldungen.map((a) => {
                const name = [a.user_first_name, a.user_last_name].filter(Boolean).join(' ')
                  || a.user_username || a.user_keycloak_id?.slice(0, 8) || '?';
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2 px-3">
                    <div className="w-7 h-7 bg-raised rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-bad text-xs font-medium">{name[0].toUpperCase()}</span>
                    </div>
                    <span className="text-fg-muted text-sm">{name}</span>
                    {a.grund && <span className="text-fg-subtle text-xs italic">"{a.grund}"</span>}
                    <span className="text-fg-subtle text-xs ml-auto">{formatDatum(a.erstellt_am)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isAdmin && !istGemeldet && meldungAktiv && (
          <p className="text-fg-subtle text-sm">Melde dich, wenn du Zeit hast.</p>
        )}
      </div>
    </CollapsibleSection>
  );
}
