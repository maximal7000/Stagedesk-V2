/**
 * Inactivity-Detector mit Warn-Modal.
 * - Nach IDLE_MS Inaktivität (Maus, Tastatur, Touch, Scroll) erscheint ein
 *   Modal mit Countdown.
 * - Reagiert der User nicht innerhalb GRACE_MS, wird automatisch ausgeloggt.
 * - "Aktiv bleiben" startet die Inaktivitäts-Uhr neu und macht einen
 *   silent-refresh des Tokens.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Clock, LogOut } from 'lucide-react';

const IDLE_MS = 25 * 60 * 1000;   // 25 min ohne Aktion → Warnung
const GRACE_MS = 60 * 1000;       // 60 s Reaktionsfenster
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

export default function SessionTimeoutGuard() {
  const auth = useAuth();
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(GRACE_MS / 1000);
  const idleTimer = useRef(null);
  const graceTimer = useRef(null);
  const tickTimer = useRef(null);

  // Inaktivitätsuhr starten/zurücksetzen
  const armIdleTimer = () => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setWarning(true), IDLE_MS);
  };

  const handleActivity = () => {
    if (warning) return;  // im Warn-Modal kein Auto-Reset durch Maus
    armIdleTimer();
  };

  // Initial-Setup
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    armIdleTimer();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    return () => {
      clearTimeout(idleTimer.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handleActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated]);

  // Countdown wenn Warnung aktiv
  useEffect(() => {
    if (!warning) return;
    setSecondsLeft(GRACE_MS / 1000);
    tickTimer.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    graceTimer.current = setTimeout(() => {
      try { auth.signoutRedirect(); } catch {}
    }, GRACE_MS);
    return () => {
      clearInterval(tickTimer.current);
      clearTimeout(graceTimer.current);
    };
  }, [warning, auth]);

  const stayActive = async () => {
    setWarning(false);
    armIdleTimer();
    // Token im Hintergrund verlängern damit der Folge-Request nicht fehlschlägt
    try { await auth.signinSilent(); } catch {}
  };

  const logoutNow = () => {
    try { auth.signoutRedirect(); } catch {}
  };

  if (!auth.isAuthenticated || !warning) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-3">
          <Clock className="w-6 h-6 text-amber-400" />
          <h2 className="text-lg font-bold text-white">Bist du noch da?</h2>
        </div>
        <p className="text-sm text-gray-400 mb-1">
          Du wirst aus Sicherheitsgründen wegen Inaktivität abgemeldet.
        </p>
        <p className="text-3xl font-bold text-amber-400 mb-5 text-center tabular-nums">
          {secondsLeft}s
        </p>
        <div className="flex gap-2">
          <button onClick={logoutNow}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg">
            <LogOut className="w-4 h-4" /> Abmelden
          </button>
          <button onClick={stayActive}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
            Angemeldet bleiben
          </button>
        </div>
      </div>
    </div>
  );
}
