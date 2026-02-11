/**
 * Öffentliches Monitor-Display — Vollbild, kein Login erforderlich
 * Auto-Refresh, ON AIR, Veranstaltungen, Ankündigungen, WebUntis, Uhr
 */
import { useState, useEffect, useCallback } from 'react';
import { Radio, Calendar, Clock, MapPin, AlertTriangle, Info, Megaphone } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function MonitorPage() {
  const [data, setData] = useState(null);
  const [time, setTime] = useState(new Date());
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/monitor/display`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  // Initiales Laden + Polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, (data?.config?.refresh_intervall || 30) * 1000);
    return () => clearInterval(interval);
  }, [fetchData, data?.config?.refresh_intervall]);

  // Uhr jede Sekunde
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const config = data?.config;
  const bgColor = config?.hintergrund_farbe || '#0f172a';

  // Laden
  if (!data && !error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: bgColor }}>
        <div className="animate-pulse text-white/30 text-2xl font-light">Stagedesk Monitor</div>
      </div>
    );
  }

  // Fehler
  if (error && !data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0f172a' }}>
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Verbindung fehlgeschlagen</div>
          <div className="text-white/40 text-sm">Versuche erneut...</div>
        </div>
      </div>
    );
  }

  const ankuendigungen = data?.ankuendigungen || [];
  const veranstaltungen = data?.veranstaltungen || [];
  const laufende = veranstaltungen.filter(v => v.ist_laufend);
  const kommende = veranstaltungen.filter(v => !v.ist_laufend);

  const priorityColors = {
    dringend: 'from-red-500/20 to-red-900/10 border-red-500/40',
    wichtig: 'from-amber-500/15 to-amber-900/10 border-amber-500/30',
    normal: 'from-blue-500/10 to-blue-900/10 border-blue-500/20',
  };

  const priorityIcons = {
    dringend: <AlertTriangle className="w-5 h-5 text-red-400" />,
    wichtig: <Megaphone className="w-5 h-5 text-amber-400" />,
    normal: <Info className="w-5 h-5 text-blue-400" />,
  };

  // Welche Spalten aktiv?
  const hasLeft = config?.zeige_veranstaltungen && veranstaltungen.length > 0;
  const hasRight = config?.zeige_webuntis && config?.webuntis_url;
  const hasMiddle = config?.zeige_ankuendigungen && ankuendigungen.length > 0;

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ background: bgColor }}>
      {/* ═══ ON AIR Banner ═══ */}
      {config?.zeige_onair && config?.ist_on_air && (
        <div className="absolute top-0 left-0 right-0 z-50">
          <div className="bg-red-600 animate-pulse shadow-lg shadow-red-600/30">
            <div className="flex items-center justify-center gap-4 py-3">
              <Radio className="w-7 h-7 text-white animate-bounce" />
              <span className="text-white font-black text-3xl tracking-[0.3em] uppercase">
                {config.on_air_text || 'ON AIR'}
              </span>
              <Radio className="w-7 h-7 text-white animate-bounce" />
            </div>
          </div>
        </div>
      )}

      {/* ═══ Header ═══ */}
      <div className={`flex items-center justify-between px-8 ${config?.ist_on_air ? 'pt-20' : 'pt-6'} pb-4`}>
        <div className="flex items-center gap-5">
          {config?.zeige_logo && config?.logo_url && (
            <img src={config.logo_url} alt="" className="h-14 object-contain" />
          )}
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{config?.titel || 'Stagedesk'}</h1>
            {config?.untertitel && (
              <p className="text-white/40 text-sm mt-0.5">{config.untertitel}</p>
            )}
          </div>
        </div>

        {/* Uhr */}
        {config?.zeige_uhr && (
          <div className="text-right">
            <div className="text-5xl font-mono font-bold text-white tracking-wider">
              {time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-white/40 text-sm mt-1">
              {time.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
        )}
      </div>

      {/* Trennlinie */}
      <div className="mx-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* ═══ Hauptbereich ═══ */}
      <div className="flex gap-6 px-8 pt-6 h-[calc(100vh-140px)] overflow-hidden"
        style={{ paddingTop: config?.ist_on_air ? '1rem' : undefined }}>

        {/* Linke Spalte: Veranstaltungen */}
        {hasLeft && (
          <div className={`${hasRight ? 'w-1/3' : hasMiddle ? 'w-1/2' : 'flex-1'} flex flex-col gap-4 overflow-hidden`}>
            {/* Laufende Veranstaltungen */}
            {laufende.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wider">Aktuell laufend</h2>
                </div>
                <div className="space-y-2">
                  {laufende.map(v => (
                    <div key={v.id} className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                      <div className="font-semibold text-white text-lg">{v.name}</div>
                      {v.ort && (
                        <div className="flex items-center gap-1.5 text-green-300/70 text-sm mt-1">
                          <MapPin className="w-3.5 h-3.5" /> {v.ort}
                        </div>
                      )}
                      {v.datum_bis && (
                        <div className="text-green-400/50 text-xs mt-1">
                          bis {new Date(v.datum_bis).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Kommende Veranstaltungen */}
            {kommende.length > 0 && (
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Nächste Veranstaltungen</h2>
                </div>
                <div className="space-y-2 overflow-y-auto max-h-full pr-2" style={{ scrollbarWidth: 'none' }}>
                  {kommende.map(v => {
                    const isToday = new Date(v.datum_von).toDateString() === new Date().toDateString();
                    return (
                      <div key={v.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.05] transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="font-medium text-white">{v.name}</div>
                          {isToday && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-400 rounded-full uppercase">Heute</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-white/40 text-sm">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(v.datum_von).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                            {' '}
                            {new Date(v.datum_von).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {v.ort && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {v.ort}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mittlere Spalte: Ankündigungen */}
        {hasMiddle && (
          <div className={`${hasLeft && hasRight ? 'w-1/3' : hasLeft || hasRight ? 'w-1/2' : 'flex-1'} flex flex-col gap-3 overflow-hidden`}>
            <div className="flex items-center gap-2 mb-1">
              <Megaphone className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Ankündigungen</h2>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
              {ankuendigungen.map(a => (
                <div key={a.id}
                  className={`bg-gradient-to-br ${priorityColors[a.prioritaet] || priorityColors.normal} border rounded-xl p-5`}>
                  <div className="flex items-start gap-3">
                    {priorityIcons[a.prioritaet] || priorityIcons.normal}
                    <div className="flex-1">
                      <div className="font-semibold text-white text-lg">{a.titel}</div>
                      {a.text && (
                        <p className="text-white/60 mt-1.5 text-sm leading-relaxed">{a.text}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Wenn nichts links/mitte aktiv ist aber auch kein WebUntis */}
        {!hasLeft && !hasMiddle && !hasRight && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {config?.zeige_logo && config?.logo_url && (
                <img src={config.logo_url} alt="" className="h-32 mx-auto mb-8 opacity-20" />
              )}
              <div className="text-white/10 text-6xl font-bold">Stagedesk</div>
            </div>
          </div>
        )}

        {/* Rechte Spalte: WebUntis iFrame */}
        {hasRight && (
          <div className={`${hasLeft || hasMiddle ? (hasLeft && hasMiddle ? 'w-1/3' : 'w-1/2') : 'flex-1'} flex flex-col overflow-hidden`}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Stundenplan</h2>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-white/10">
              <iframe
                src={config.webuntis_url}
                className="w-full h-full border-0"
                title="WebUntis Stundenplan"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        )}
      </div>

      {/* ═══ Footer ═══ */}
      <div className="absolute bottom-0 left-0 right-0 px-8 py-3">
        <div className="flex items-center justify-between text-white/20 text-xs">
          <span>Stagedesk Monitor</span>
          {error && <span className="text-red-400/60">Verbindungsfehler — Versuche erneut...</span>}
          <span>Auto-Refresh alle {config?.refresh_intervall || 30}s</span>
        </div>
      </div>
    </div>
  );
}
