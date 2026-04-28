/**
 * Login-Seite — theatralisches Bühnen-Motiv mit animierten Spotlights.
 * Reine CSS-Animation, kein extra Asset.
 */
import { useAuth } from 'react-oidc-context';
import { useEffect, useState } from 'react';
import { LogIn, Download } from 'lucide-react';

export default function LoginPage() {
  const auth = useAuth();
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    if (auth.isAuthenticated) {
      window.location.href = '/';
    }
  }, [auth.isAuthenticated]);

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

      {/* Spotlights — Konus-Form über conic-gradient + blur */}
      <div className="spotlight spotlight-blue" />
      <div className="spotlight spotlight-purple" />
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
          <div className="inline-block mb-3 px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm bg-white/5 text-[10px] tracking-[0.3em] uppercase text-white/60">
            Backstage
          </div>
          <h1 className="text-6xl sm:text-7xl font-extrabold text-white tracking-tight"
              style={{ textShadow: '0 0 40px rgba(99,102,241,0.4), 0 0 80px rgba(168,85,247,0.2)' }}>
            Stagedesk
          </h1>
        </div>

        {/* Glas-Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_80px_-20px_rgba(0,0,0,0.8)] p-8">
          <button
            onClick={handleLogin}
            disabled={auth.isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-gray-900 hover:bg-gray-100 font-semibold rounded-xl transition-all duration-200 shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {auth.isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900" />
                <span>Lädt…</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Anmelden</span>
              </>
            )}
          </button>

          {auth.error && (
            <div className="mt-4 p-4 bg-red-950/60 border border-red-800/60 rounded-lg backdrop-blur-sm">
              <p className="text-sm text-red-300">
                <strong>Fehler:</strong> {auth.error.message}
              </p>
            </div>
          )}

          {installPrompt && (
            <button onClick={installApp}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-xl text-sm transition-colors">
              <Download className="w-4 h-4" /> Als App installieren
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-white/30 tracking-wide">
          Sichere Authentifizierung über Keycloak
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
        .spotlight-blue {
          background: radial-gradient(ellipse 50% 100% at 50% 0%,
            rgba(59,130,246,0.45) 0%, rgba(59,130,246,0.18) 30%, transparent 70%);
          animation: spotlight-sweep-1 18s ease-in-out infinite;
        }
        .spotlight-purple {
          background: radial-gradient(ellipse 50% 100% at 50% 0%,
            rgba(168,85,247,0.40) 0%, rgba(168,85,247,0.15) 30%, transparent 70%);
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
