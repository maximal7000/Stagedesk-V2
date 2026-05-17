/**
 * Holt /admin/public-settings (no auth) und zeigt ggf. den Wartungs-Banner
 * sowie den Login-Banner-Text. Pollt alle 60 s.
 */
import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export function MaintenanceBanner() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const load = async () => {
      try { const r = await fetch(`${API_BASE}/admin/public-settings`); if (r.ok) setS(await r.json()); }
      catch {}
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!s?.['maintenance.enabled']) return null;
  return (
    <div className="bg-amber-600 text-black text-sm text-center py-2 px-4 font-medium">
      ⚠ Wartungsmodus: {s['maintenance.message'] || 'Eingeschränkter Betrieb.'}
    </div>
  );
}

export function LoginBanner() {
  const [s, setS] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE}/admin/public-settings`).then(r => r.ok ? r.json() : null).then(setS).catch(() => {});
  }, []);
  const text = s?.['login.banner'];
  if (!text) return null;
  return (
    <div className="bg-blue-900/40 border border-blue-700/40 text-blue-200 text-sm rounded-lg px-4 py-2 mb-4">
      {text}
    </div>
  );
}
