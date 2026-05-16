/**
 * Vollbild-Anzeige der AG-Aufgaben für einen TV / großen Monitor.
 * Live-Update via WebSocket (kein Polling). Kein Login nötig — Read-only.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { CheckCircle2, PlayCircle, Circle, ListChecks } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const STATUS_META = {
  offen:  { Icon: Circle,       cls: 'text-gray-400',  label: 'Offen' },
  laeuft: { Icon: PlayCircle,   cls: 'text-blue-400',  label: 'Läuft' },
  fertig: { Icon: CheckCircle2, cls: 'text-green-400', label: 'Fertig' },
};

export default function AgMonitorPage() {
  const [aufgaben, setAufgaben] = useState([]);
  const [now, setNow] = useState(new Date());
  const wsRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/ag/display`);
      if (r.ok) setAufgaben(await r.json());
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  // Uhr alle 30s aktualisieren
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
      ws = new WebSocket(`${proto}://${window.location.host}/ws/ag/aufgaben/`);
      ws.onmessage = () => load();
      ws.onopen = () => { backoff = 1000; };
      ws.onclose = () => {
        if (closed) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
    };
    connect();
    wsRef.current = ws;
    return () => { closed = true; try { ws && ws.close(); } catch {} };
  }, [load]);

  const offen  = aufgaben.filter(a => a.status === 'offen');
  const laeuft = aufgaben.filter(a => a.status === 'laeuft');
  const fertig = aufgaben.filter(a => a.status === 'fertig');

  return (
    <div className="min-h-screen bg-black text-white p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <ListChecks className="w-10 h-10 text-blue-400" />
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">AG-Aufgaben</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Column title="Offen"  items={offen}  meta={STATUS_META.offen} />
          <Column title="Läuft"  items={laeuft} meta={STATUS_META.laeuft} highlight />
          <Column title="Fertig" items={fertig} meta={STATUS_META.fertig} />
        </div>
      )}
    </div>
  );
}

function Column({ title, items, meta, highlight }) {
  const { Icon, cls } = meta;
  return (
    <div className={`rounded-2xl border ${highlight ? 'border-blue-500/40 bg-blue-500/5' : 'border-white/10 bg-white/[0.02]'} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`flex items-center gap-2 ${cls}`}>
          <Icon className="w-6 h-6" />
          <h2 className="text-2xl font-bold">{title}</h2>
        </div>
        <span className="text-3xl font-bold text-white/40 tabular-nums">{items.length}</span>
      </div>
      <ul className="space-y-3">
        {items.map(a => (
          <li key={a.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-xl font-semibold leading-tight">{a.titel}</div>
            {a.beschreibung && (
              <p className="text-sm text-white/60 mt-1 line-clamp-3">{a.beschreibung}</p>
            )}
            {a.zugewiesene?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {a.zugewiesene.map(z => (
                  <span key={z.id}
                    className="inline-block px-2.5 py-1 bg-blue-500/20 text-blue-200 rounded-md text-sm">
                    {z.name}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-center py-4 text-white/30 text-sm">—</li>
        )}
      </ul>
    </div>
  );
}
