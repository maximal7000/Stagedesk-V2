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
          title: 'Du kannst dich nicht melden — Kompetenzen fehlen',
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
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            meldungAktiv
              ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
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
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-red-300 font-semibold text-sm">{meldenFehler.title}</h4>
                <button type="button" onClick={() => setMeldenFehler(null)}
                        className="text-red-400/70 hover:text-red-300">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
              {meldenFehler.kompetenzen.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meldenFehler.kompetenzen.map((k, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-200 rounded-full text-xs">
                      <Award className="w-3 h-3" /> {k}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">
                Frage einen Admin nach Bestätigung deiner Kompetenzen.{' '}
                <Link to="/kompetenzen" className="text-blue-400 hover:underline">Zu meinen Kompetenzen</Link>
              </p>
            </div>
          </div>
        )}

        {/* Meldung deaktiviert Info */}
        {!meldungAktiv && !isAdmin && (
          <p className="text-gray-500 text-sm">Meldung ist für diese Veranstaltung nicht verfügbar.</p>
        )}

        {/* User: Melden/Abmelden Button (nur wenn aktiv) */}
        {meldungAktiv && !istGemeldet && (
          <button type="button" onClick={handleMelden}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Hand className="w-4 h-4" />
            Ich hab Zeit - Melden
          </button>
        )}

        {istGemeldet && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium">
                <Hand className="w-4 h-4" /> Du bist gemeldet
              </span>
              <button type="button" onClick={() => setShowAbmelden(!showAbmelden)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors">
                <LogOut className="w-4 h-4" /> Abmelden
              </button>
            </div>
            {showAbmelden && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Grund (optional)</label>
                  <input type="text" value={abmeldeGrund} onChange={(e) => setAbmeldeGrund(e.target.value)}
                    placeholder="z.B. Termin-Konflikt..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm" />
                </div>
                <button type="button" onClick={handleAbmelden}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
                  Bestätigen
                </button>
              </div>
            )}
          </div>
        )}

        {/* Admin: Gemeldete Personen */}
        {isAdmin && meldungen.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-300">Gemeldete Personen</h3>
            <div className="space-y-1">
              {meldungen.map((m) => {
                const name = [m.user_first_name, m.user_last_name].filter(Boolean).join(' ')
                  || m.user_username || m.user_keycloak_id?.slice(0, 8) || '?';
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2 px-3 bg-gray-800 rounded-lg">
                    <div className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-medium">{name[0].toUpperCase()}</span>
                    </div>
                    <span className="text-white text-sm">{name}</span>
                    {m.kommentar && <span className="text-gray-500 text-xs">{m.kommentar}</span>}
                    <span className="text-gray-600 text-xs ml-auto">{formatDatum(m.erstellt_am)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin: Abmeldungen-Log */}
        {isAdmin && abmeldungen.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-red-400/80">Abmeldungen</h3>
            <div className="space-y-1">
              {abmeldungen.map((a) => {
                const name = [a.user_first_name, a.user_last_name].filter(Boolean).join(' ')
                  || a.user_username || a.user_keycloak_id?.slice(0, 8) || '?';
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2 px-3 bg-red-900/10 border border-red-800/20 rounded-lg">
                    <div className="w-7 h-7 bg-red-600/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-red-400 text-xs font-medium">{name[0].toUpperCase()}</span>
                    </div>
                    <span className="text-gray-300 text-sm">{name}</span>
                    {a.grund && <span className="text-gray-500 text-xs italic">"{a.grund}"</span>}
                    <span className="text-gray-600 text-xs ml-auto">{formatDatum(a.erstellt_am)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isAdmin && !istGemeldet && meldungAktiv && (
          <p className="text-gray-500 text-sm">Melde dich, wenn du Zeit hast.</p>
        )}
      </div>
    </CollapsibleSection>
  );
}
