import { Calendar, MapPin, Users, CheckSquare, Hand } from 'lucide-react';
import { StatusBadge } from '../../../components/ui';

// Anzeige-Labels für effektiv_status, deckungsgleich mit der Detailseite.
const EFFEKTIV_LABELS = {
  geplant: 'Geplant',
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
};

const EFFEKTIV_TONE = {
  geplant: 'info',
  laufend: 'positive',
  abgeschlossen: 'neutral',
  abgesagt: 'danger',
};

function formatDate(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function QuickInfoCard({ data, isAdmin }) {
  if (!data) return null;

  const checkDone = (data.checkliste || []).filter(i => i.erledigt).length;
  const checkTotal = (data.checkliste || []).length;
  const checkPercent = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0;

  const meldungen = data.meldungen || [];
  const eff = data.effektiv_status || data.status;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
      {/* Status */}
      <div>
        <StatusBadge tone={EFFEKTIV_TONE[eff] || 'neutral'} label={EFFEKTIV_LABELS[eff] || eff} />
      </div>

      {/* Datum */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
          <Calendar className="w-3.5 h-3.5" />
          Zeitraum
        </div>
        <div className="text-white text-sm">
          {formatDate(data.datum_von)} {formatTime(data.datum_von)}
        </div>
        <div className="text-gray-400 text-sm">
          bis {formatDate(data.datum_bis)} {formatTime(data.datum_bis)}
        </div>
      </div>

      {/* Ort */}
      {data.ort && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <MapPin className="w-3.5 h-3.5" />
            Ort
          </div>
          <div className="text-white text-sm">{data.ort}</div>
          {data.adresse && (
            <div className="text-gray-500 text-xs">{data.adresse}</div>
          )}
        </div>
      )}

      {/* Zuweisungen */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
          <Users className="w-3.5 h-3.5" />
          Team
        </div>
        <div className="flex items-center gap-2">
          {(data.zuweisungen || []).length > 0 ? (
            <>
              <div className="flex -space-x-2">
                {(data.zuweisungen || []).slice(0, 5).map((z) => {
                  const name = [z.user_first_name, z.user_last_name].filter(Boolean).join(' ')
                    || z.user_username || z.user_keycloak_id?.slice(0, 8) || '?';
                  return (
                    <div key={z.id} className="w-7 h-7 bg-accent rounded-full flex items-center justify-center ring-2 ring-gray-900" title={name}>
                      <span className="text-white text-xs font-medium">{name[0].toUpperCase()}</span>
                    </div>
                  );
                })}
                {(data.zuweisungen || []).length > 5 && (
                  <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center ring-2 ring-gray-900">
                    <span className="text-gray-300 text-xs">+{data.zuweisungen.length - 5}</span>
                  </div>
                )}
              </div>
              <span className="text-gray-400 text-sm tabular-nums">{data.zuweisungen.length} Person{data.zuweisungen.length !== 1 ? 'en' : ''}</span>
            </>
          ) : (
            <span className="text-gray-500 text-sm">Noch niemand</span>
          )}
        </div>
      </div>

      {/* Checkliste */}
      {checkTotal > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <CheckSquare className="w-3.5 h-3.5" />
              Checkliste
            </div>
            <span className="text-xs text-gray-400 tabular-nums">{checkDone}/{checkTotal}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${checkPercent === 100 ? 'bg-green-500' : 'bg-accent'}`}
              style={{ width: `${checkPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Meldungen - nur fuer Admins sichtbar */}
      {isAdmin && meldungen.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Hand className="w-3.5 h-3.5" />
            Meldungen
          </div>
          <StatusBadge tone="positive" label={`${meldungen.length} gemeldet`} />
        </div>
      )}

      {/* Zammad */}
      {data.zammad_ticket_number && (
        <div className="pt-2 border-t border-gray-800">
          <span className="text-accent text-sm">Zammad #{data.zammad_ticket_number}</span>
        </div>
      )}
    </div>
  );
}
