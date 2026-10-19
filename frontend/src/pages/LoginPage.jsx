/**
 * Login-Seite: theatralisches Bühnen-Motiv mit animierten Spotlights.
 * Reine CSS-Animation, kein extra Asset.
 */
import { useAuth } from 'react-oidc-context';
import { useEffect, useState } from 'react';
import { LogIn, Download, Loader2, AlertTriangle } from 'lucide-react';
import { LoginBanner } from '../components/MaintenanceBanner';

export default function LoginPage() {
  const auth = useAuth();
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    // Bevorzugte Landing-Page aus dem Profil holen (falls gesetzt),
    // sonst Dashboard. Wir fragen das Profil-Endpoint direkt mit dem
    // gerade gewonnenen Access-Token an.
    const token = auth.user?.access_token;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    fetch(`${base}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const target = (data?.default_landing || '/').trim() || '/';
        window.location.href = target;
      })
      .catch(() => { window.location.href = '/'; });
  }, [auth.isAuthenticated, auth.user]);

  // PWA-Install-Hinweis: Browser-Event abfangen, Default-Banner unterdrücken,
  // eigenen Button anzeigen.
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const handleLogin = () => auth.signinRedirect();

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black flex items-center justify-center p-4">
      {/* ── Bühnen-Hintergrund ─────────────────────────────────── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,41,59,0.6),transparent_70%)] pointer-events-none" />

      {/* "Bühnenboden": dezenter Verlauf nach unten */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

      {/* Spotlights: Konus-Form über radial-gradient + blur */}
      <div className="spotlight spotlight-white" />
      <div className="spotlight spotlight-accent" />
      <div className="spotlight spotlight-amber" />

      {/* Staub-/Funken-Punkte */}
      <div className="dust" aria-hidden="true">
        {Array.from({ length: 30 }).map((_, i) => (
          <span key={i} style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 12}s`,
            animationDuration: `${10 + Math.random() * 12}s`,
            opacity: 0.2 + Math.random() * 0.5,
          }} />
        ))}
      </div>

      {/* ── Inhalt ─────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-md w-full">
        {/* Logo & Schriftzug */}
        <div className="text-center mb-10">
          <h1 className="font-display text-6xl sm:text-7xl font-bold text-white tracking-tight leading-none">
            Stagedesk
          </h1>
          <p className="mt-3 text-sm text-white/60">Technik-AG am Katharineum zu Lübeck</p>
        </div>

        <LoginBanner />

        {/* Anmelde-Karte */}
        <div className="bg-gray-950 border border-white/10 rounded-xl shadow-[0_20px_80px_-20px_rgba(0,0,0,0.8)] p-6 sm:p-7">
          <button
            onClick={handleLogin}
            disabled={auth.isLoading}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors duration-150 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {auth.isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verbinde…</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Mit Technik-AG-Konto anmelden</span>
              </>
            )}
          </button>

          {auth.error && (
            <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-red-950/60 border border-red-800/60 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">
                <span className="font-semibold">Anmeldung fehlgeschlagen.</span> {auth.error.message}
              </p>
            </div>
          )}

          {installPrompt && (
            <button onClick={installApp}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black">
              <Download className="w-4 h-4" /> Als App installieren
            </button>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-white/50">
          Anmeldung über den Keycloak-Login der Technik-AG
        </p>
      </div>

      {/* ── Inline-Styles für Animation (component-scoped) ────────── */}
      <style>{`
        @keyframes spotlight-sweep-1 {
          0%, 100% { transform: translate(-30%, -10%) rotate(-15deg); opacity: 0.55; }
          50%      { transform: translate(20%, 0%) rotate(10deg);    opacity: 0.85; }
        }
        @keyframes spotlight-sweep-2 {
          0%, 100% { transform: translate(40%, -15%) rotate(20deg);  opacity: 0.45; }
          50%      { transform: translate(-10%, 5%) rotate(-12deg);  opacity: 0.75; }
        }
        @keyframes spotlight-sweep-3 {
          0%, 100% { transform: translate(0%, -20%) rotate(0deg);    opacity: 0.30; }
          50%      { transform: translate(0%, 10%) rotate(5deg);     opacity: 0.60; }
        }
        .spotlight {
          position: absolute;
          top: -10%;
          left: 50%;
          width: 80vw; max-width: 1000px;
          height: 130vh;
          margin-left: -40vw;
          filter: blur(60px);
          pointer-events: none;
          mix-blend-mode: screen;
          transform-origin: top center;
        }
        .spotlight-white {
          background: radial-gradient(ellipse 50% 100% at 50% 0%,
            rgba(226,232,240,0.30) 0%, rgba(226,232,240,0.10) 30%, transparent 70%);
          animation: spotlight-sweep-1 18s ease-in-out infinite;
        }
        .spotlight-accent {
          background: radial-gradient(ellipse 50% 100% at 50% 0%,
            rgba(218,31,61,0.32) 0%, rgba(218,31,61,0.12) 30%, transparent 70%);
          animation: spotlight-sweep-2 22s ease-in-out infinite;
        }
        .spotlight-amber {
          background: radial-gradient(ellipse 40% 90% at 50% 0%,
            rgba(251,191,36,0.20) 0%, rgba(251,191,36,0.08) 30%, transparent 70%);
          animation: spotlight-sweep-3 28s ease-in-out infinite;
        }

        /* Aufsteigende Staub-Partikel */
        @keyframes dust-rise {
          0%   { transform: translateY(100vh) scale(0.6); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-10vh) scale(1.2); opacity: 0; }
        }
        .dust {
          position: absolute; inset: 0; pointer-events: none; overflow: hidden;
        }
        .dust span {
          position: absolute; bottom: 0;
          width: 2px; height: 2px; border-radius: 50%;
          background: white;
          animation: dust-rise linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .spotlight, .dust span { animation: none; }
        }
      `}</style>
    </div>
  );
}
