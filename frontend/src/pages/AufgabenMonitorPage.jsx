/**
 * Vollbild-Anzeige der Aufgaben für einen TV. Eine Liste in der vom Admin
 * gewählten Reihenfolge; abgeschlossene Aufgaben sind durchgestrichen.
 * Live-Update via WebSocket. Kein Login nötig.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { CheckCircle2, Circle, ListChecks, Square, CheckSquare } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function AufgabenMonitorPage() {
  const [aufgaben, setAufgaben] = useState([]);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/aufgaben/display`);
      if (r.ok) setAufgaben(await r.json());
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  // Mauszeiger auf dem TV-Monitor ausblenden (Kiosk hat keine Maus)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '*{cursor:none !important}';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Uhr alle 30 s aktualisieren
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // Live-Update via WebSocket
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let ws = null, closed = false, backoff = 1000;
    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`${proto}://${window.location.host}/ws/aufgaben/`);
      ws.onmessage = () => load();
      ws.onopen = () => { backoff = 1000; };
      ws.onclose = () => {
        if (closed) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
    };
    connect();
    return () => { closed = true; try { ws && ws.close(); } catch {} };
  }, [load]);

  const offen = aufgaben.filter(a => a.status !== 'abgeschlossen').length;

  return (
    <div className="min-h-screen bg-black text-white p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <ListChecks className="w-10 h-10 text-blue-400" />
          <div>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">Aufgaben</h1>
            <p className="text-sm text-white/50 mt-1">{offen} offen</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl lg:text-5xl font-mono tabular-nums">
            {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-sm text-white/60 mt-1">
            {now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
        </div>
      </div>

      {aufgaben.length === 0 ? (
        <div className="flex items-center justify-center min-h-[60vh] text-2xl text-white/40">
          Keine Aufgaben — heute ist frei? 😊
        </div>
      ) : (
        <ul className="space-y-3 max-w-5xl mx-auto">
          {aufgaben.map(a => {
            const done = a.status === 'abgeschlossen';
            return (
              <li key={a.id}
                  className={`flex items-start gap-4 p-5 rounded-2xl border ${
                    done
                      ? 'bg-white/[0.02] border-white/5 opacity-50'
                      : 'bg-white/[0.04] border-white/10'
                  }`}>
                {done
                  ? <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0 mt-0.5" />
                  : <Circle className="w-8 h-8 text-white/40 shrink-0 mt-0.5" />
                }
                <div className="flex-1 min-w-0">
                  <div className={`text-2xl font-semibold ${done ? 'line-through' : ''}`}>
                    {a.titel}
                  </div>
                  {a.beschreibung && (
                    <p className="text-base text-white/60 mt-1 line-clamp-3">{a.beschreibung}</p>
                  )}
                  {a.subtasks?.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {a.subtasks.map(s => (
                        <li key={s.id} className="flex items-center gap-2 text-lg">
                          {s.erledigt
                            ? <CheckSquare className="w-5 h-5 text-green-400 shrink-0" />
                            : <Square className="w-5 h-5 text-white/40 shrink-0" />}
                          <span className={s.erledigt ? 'text-white/40 line-through' : 'text-white/80'}>
                            {s.titel}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {a.zugewiesene?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {a.zugewiesene.map(z => (
                        <span key={z.id}
                          className="inline-block px-3 py-1 bg-blue-500/20 text-blue-200 rounded-md text-base">
                          {z.kurzname || z.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
