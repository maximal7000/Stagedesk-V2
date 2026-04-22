import { Calendar, MapPin, Users, CheckSquare, Hand } from 'lucide-react';

const STATUS_COLORS = {
  planung: 'bg-gray-500/20 text-gray-400',
  bestaetigt: 'bg-blue-500/20 text-blue-400',
  laufend: 'bg-green-500/20 text-green-400',
  abgeschlossen: 'bg-emerald-500/20 text-emerald-400',
  abgesagt: 'bg-red-500/20 text-red-400',
};

const STATUS_LABELS = {
  planung: 'Planung',
  bestaetigt: 'Bestätigt',
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
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

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
      {/* Status */}
      <div>
        <span className={`inline-flex px-3 py-1.5 rounded-lg text-sm font-semibold ${STATUS_COLORS[data.status] || 'bg-gray-500/20 text-gray-400'}`}>
          {STATUS_LABELS[data.status] || data.status}
        </span>
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
                {(data.zuweisungen || []).slice(0, 5).map((z) => (
                  <div key={z.id} className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center ring-2 ring-gray-900" title={z.user_username}>
                    <span className="text-white text-xs font-medium">{(z.user_username || '?')[0].toUpperCase()}</span>
                  </div>
                ))}
                {(data.zuweisungen || []).length > 5 && (
                  <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center ring-2 ring-gray-900">
                    <span className="text-gray-300 text-xs">+{data.zuweisungen.length - 5}</span>
                  </div>
                )}
              </div>
              <span className="text-gray-400 text-sm">{data.zuweisungen.length} Person{data.zuweisungen.length !== 1 ? 'en' : ''}</span>
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
            <span className="text-xs text-gray-400">{checkDone}/{checkTotal}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${checkPercent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
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
          <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
            {meldungen.length} gemeldet
          </span>
        </div>
      )}

      {/* Zammad */}
      {data.zammad_ticket_number && (
        <div className="pt-2 border-t border-gray-800">
          <span className="text-blue-400 text-sm">Zammad #{data.zammad_ticket_number}</span>
        </div>
      )}
    </div>
  );
}
