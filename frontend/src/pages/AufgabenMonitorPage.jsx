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

  // Optionaler Seiten-Zoom für große/4K-Displays via ?zoom=1.5
  useEffect(() => {
    const z = new URLSearchParams(window.location.search).get('zoom');
    if (!z) return;
    document.documentElement.style.zoom = z;
    return () => { document.documentElement.style.zoom = ''; };
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
      <div className="flex items-end justify-between mb-8 pb-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent/15 ring-1 ring-inset ring-accent/30 flex items-center justify-center">
            <ListChecks className="w-8 h-8 text-accent" />
          </div>
          <div>
            <h1 className="font-display text-5xl lg:text-6xl font-bold tracking-tight leading-none">Aufgaben</h1>
          </div>
          <div className="ml-4 pl-5 border-l border-white/10 self-stretch flex flex-col justify-center">
            <div className="text-4xl font-bold tabular-nums leading-none">{offen}</div>
            <div className="text-sm text-white/50 mt-1">offen</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-5xl lg:text-6xl font-semibold tabular-nums leading-none">
            {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-sm text-white/60 mt-1">
            {now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
        </div>
      </div>

      {aufgaben.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <CheckCircle2 className="w-16 h-16 text-white/20 mb-5" />
          <div className="font-display text-4xl font-semibold text-white/70">Keine offenen Aufgaben</div>
          <div className="text-xl text-white/40 mt-2">Neue Aufgaben erscheinen hier automatisch.</div>
        </div>
      ) : (
        <ul className="space-y-3 max-w-5xl mx-auto">
          {aufgaben.map(a => {
            const done = a.status === 'abgeschlossen';
            return (
              <li key={a.id}
                  className={`flex items-start gap-4 p-5 rounded-xl border ${
                    done
                      ? 'bg-white/[0.02] border-white/5 opacity-50'
                      : 'bg-white/[0.05] border-white/10'
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
                          className="inline-block px-3 py-1 bg-white/10 text-white/80 ring-1 ring-inset ring-white/10 rounded-md text-base">
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
