/**
 * Öffentliches Monitor-Display — Vollbild, kein Login erforderlich
 * Features: ON AIR, Notfall, Veranstaltungen, Countdown, Ankündigungen,
 *           Wetter, WebUntis, Slideshow, PDF, Ticker, Themes, Uhr,
 *           Multi-Profil (?profil=slug), Stundenplan-Vollbild Layout
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Radio, Calendar, Clock, MapPin, AlertTriangle, Info, Megaphone,
  Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  Thermometer, Droplets, Timer, FileText, QrCode, AlignLeft,
  LayoutGrid,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE = API_BASE.replace(/\/api\/?$/, '');

// Wetter-Icons basierend auf OpenWeatherMap icon-codes
const weatherIcons = {
  '01d': Sun, '01n': Moon,
  '02d': Sun, '02n': Moon,
  '03d': Cloud, '03n': Cloud,
  '04d': Cloud, '04n': Cloud,
  '09d': CloudRain, '09n': CloudRain,
  '10d': CloudRain, '10n': CloudRain,
  '11d': CloudLightning, '11n': CloudLightning,
  '13d': CloudSnow, '13n': CloudSnow,
  '50d': CloudFog, '50n': CloudFog,
};


// ═══ ON AIR Komponente — Größe, Position, Farbe konfigurierbar ═══
function OnAirIndicator({ config, accent }) {
  if (!config?.zeige_onair || !config?.ist_on_air) return null;

  const farbe = config.on_air_farbe || accent;
  const blinken = config.on_air_blinken !== false;
  const groesse = config.on_air_groesse || 'gross';
  const position = config.on_air_position || 'banner-oben';
  const text = config.on_air_text || 'ON AIR';

  // Größen-Config für verschiedene Darstellungen
  const sizes = {
    klein:  { py: 'py-1.5', px: 'px-4',  text: 'text-lg',   icon: 'w-4 h-4',  gap: 'gap-2', tracking: 'tracking-[0.15em]' },
    mittel: { py: 'py-3',   px: 'px-6',  text: 'text-3xl',  icon: 'w-6 h-6',  gap: 'gap-3', tracking: 'tracking-[0.2em]'  },
    gross:  { py: 'py-4',   px: 'px-10', text: 'text-5xl',  icon: 'w-9 h-9',  gap: 'gap-4', tracking: 'tracking-[0.3em]'  },
    riesig: { py: 'py-6',   px: 'px-14', text: 'text-7xl',  icon: 'w-12 h-12', gap: 'gap-5', tracking: 'tracking-[0.4em]'  },
  };
  const s = sizes[groesse] || sizes.gross;

  // ─── Banner oben (volle Breite) ───
  if (position === 'banner-oben') {
    return (
      <div className="absolute top-0 left-0 right-0 z-50">
        <div className={`${blinken ? 'animate-pulse' : ''} shadow-lg`}
          style={{ background: farbe, boxShadow: `0 10px 40px ${farbe}50` }}>
          <div className={`flex items-center justify-center ${s.gap} ${s.py}`}>
            <Radio className={`${s.icon} text-white ${blinken ? 'animate-bounce' : ''}`} />
            <span className={`text-white font-black ${s.text} ${s.tracking} uppercase`}>{text}</span>
            <Radio className={`${s.icon} text-white ${blinken ? 'animate-bounce' : ''}`} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Banner unten (volle Breite) ───
  if (position === 'banner-unten') {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-50">
        <div className={`${blinken ? 'animate-pulse' : ''} shadow-lg`}
          style={{ background: farbe, boxShadow: `0 -10px 40px ${farbe}50` }}>
          <div className={`flex items-center justify-center ${s.gap} ${s.py}`}>
            <Radio className={`${s.icon} text-white ${blinken ? 'animate-bounce' : ''}`} />
            <span className={`text-white font-black ${s.text} ${s.tracking} uppercase`}>{text}</span>
            <Radio className={`${s.icon} text-white ${blinken ? 'animate-bounce' : ''}`} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Mitte-Overlay ───
  if (position === 'mitte') {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className={`${blinken ? 'animate-pulse' : ''} rounded-2xl shadow-2xl flex items-center ${s.gap} ${s.py} ${s.px} pointer-events-auto`}
          style={{ background: farbe, boxShadow: `0 0 80px ${farbe}70` }}
        >
          <Radio className={`${s.icon} text-white ${blinken ? 'animate-bounce' : ''}`} />
          <span className={`text-white font-black ${s.text} ${s.tracking} uppercase`}>{text}</span>
          <Radio className={`${s.icon} text-white ${blinken ? 'animate-bounce' : ''}`} />
        </div>
      </div>
    );
  }

  // ─── Badge-Modus (Ecke / Kante) ───
  const positionClasses = {
    'oben-rechts':  'top-4 right-4',
    'oben-links':   'top-4 left-4',
    'oben-mitte':   'top-4 left-1/2 -translate-x-1/2',
    'unten-rechts': 'bottom-12 right-4',
    'unten-links':  'bottom-12 left-4',
    'unten-mitte':  'bottom-12 left-1/2 -translate-x-1/2',
  };

  return (
    <div className={`absolute z-50 ${positionClasses[position] || 'top-4 right-4'}`}>
      <div
        className={`${blinken ? 'animate-pulse' : ''} rounded-2xl shadow-2xl flex items-center ${s.gap} ${s.py} ${s.px}`}
        style={{ background: farbe, boxShadow: `0 8px 40px ${farbe}60` }}
      >
        <Radio className={`${s.icon} text-white ${blinken ? 'animate-bounce' : ''}`} />
        <span className={`text-white font-black ${s.text} ${s.tracking} uppercase`}>{text}</span>
        <Radio className={`${s.icon} text-white ${blinken ? 'animate-bounce' : ''}`} />
      </div>
    </div>
  );
}


export default function MonitorPage() {
  const [data, setData] = useState(null);
  const [time, setTime] = useState(new Date());
  const [error, setError] = useState(false);
  const [slideshowIdx, setSlideshowIdx] = useState(0);
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [rotationIdx, setRotationIdx] = useState(0);
  const lastActivityRef = useRef(Date.now());

  // Profil-Slug aus URL (?profil=xxx)
  const profilSlug = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('profil') || '';
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const url = profilSlug
        ? `${API_BASE}/monitor/display?profil=${encodeURIComponent(profilSlug)}`
        : `${API_BASE}/monitor/display`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    }
  }, [profilSlug]);

  // Polling
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

  // Slideshow Timer
  const bilder = useMemo(() => (data?.dateien || []).filter(d => d.typ === 'bild'), [data?.dateien]);
  useEffect(() => {
    if (!data?.config?.zeige_slideshow || bilder.length <= 1) return;
    const interval = setInterval(() => {
      setSlideshowIdx(prev => (prev + 1) % bilder.length);
    }, (data.config.slideshow_intervall || 10) * 1000);
    return () => clearInterval(interval);
  }, [data?.config?.zeige_slideshow, data?.config?.slideshow_intervall, bilder.length]);

  // Bildschirmschoner — Inaktivität erkennen
  useEffect(() => {
    if (!data?.config?.zeige_bildschirmschoner) return;
    const timeout = (data.config.bildschirmschoner_timeout || 5) * 60 * 1000;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      setScreensaverActive(false);
    };

    const checkInactivity = setInterval(() => {
      if (Date.now() - lastActivityRef.current > timeout) {
        setScreensaverActive(true);
      }
    }, 5000);

    window.addEventListener('mousemove', resetActivity);
    window.addEventListener('keydown', resetActivity);
    window.addEventListener('touchstart', resetActivity);
    window.addEventListener('click', resetActivity);

    return () => {
      clearInterval(checkInactivity);
      window.removeEventListener('mousemove', resetActivity);
      window.removeEventListener('keydown', resetActivity);
      window.removeEventListener('touchstart', resetActivity);
      window.removeEventListener('click', resetActivity);
    };
  }, [data?.config?.zeige_bildschirmschoner, data?.config?.bildschirmschoner_timeout]);

  // Seitenrotation
  const rotationSeiten = data?.config?.seitenrotation_seiten || [];
  const isRotating = data?.config?.zeige_seitenrotation && rotationSeiten.length > 1;
  const currentPage = isRotating ? rotationSeiten[rotationIdx % rotationSeiten.length] : 'main';

  useEffect(() => {
    if (!isRotating) return;
    const interval = setInterval(() => {
      setRotationIdx(prev => (prev + 1) % rotationSeiten.length);
    }, (data?.config?.seitenrotation_intervall || 30) * 1000);
    return () => clearInterval(interval);
  }, [isRotating, rotationSeiten.length, data?.config?.seitenrotation_intervall]);

  const config = data?.config;
  const raumplan = data?.raumplan;
  const wetter = data?.wetter;
  const ankuendigungen = data?.ankuendigungen || [];
  const veranstaltungen = data?.veranstaltungen || [];
  const laufende = veranstaltungen.filter(v => v.ist_laufend);
  const kommende = veranstaltungen.filter(v => !v.ist_laufend);
  const naechste = kommende[0];

  // Theme / Farben
  const bgColor = config?.hintergrund_farbe || '#0f172a';
  const accent = config?.akzent_farbe || '#da1f3d';

  // Countdown
  const countdown = useMemo(() => {
    if (!config?.zeige_countdown || !naechste?.datum_von) return null;
    const diff = new Date(naechste.datum_von) - time;
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { h, m, s, name: naechste.name };
  }, [config?.zeige_countdown, naechste, time]);

  // Eigener Countdown
  const eigenerCountdown = useMemo(() => {
    if (!config?.zeige_eigener_countdown || !config?.eigener_countdown_datum) return null;
    const diff = new Date(config.eigener_countdown_datum) - time;
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, name: config.eigener_countdown_name || 'Countdown' };
  }, [config?.zeige_eigener_countdown, config?.eigener_countdown_datum, config?.eigener_countdown_name, time]);

  // Logo URL
  const logoUrl = config?.logo_url_resolved
    ? (config.logo_url_resolved.startsWith('http') ? config.logo_url_resolved : `${MEDIA_BASE}${config.logo_url_resolved}`)
    : '';

  // PDF URL
  const pdfUrl = config?.pdf_url_resolved
    ? (config.pdf_url_resolved.startsWith('http') ? config.pdf_url_resolved : `${MEDIA_BASE}${config.pdf_url_resolved}`)
    : '';

  // Hintergrundbild URL
  const hintergrundbildUrl = config?.hintergrundbild_url_resolved
    ? (config.hintergrundbild_url_resolved.startsWith('http') ? config.hintergrundbild_url_resolved : `${MEDIA_BASE}${config.hintergrundbild_url_resolved}`)
    : '';

  // ON AIR Status
  const hasOnAir = config?.zeige_onair && config?.ist_on_air;
  const onAirIsBanner = hasOnAir && (config?.on_air_position || 'banner-oben') === 'banner-oben';

  // ─── Loading ───
  if (!data && !error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: bgColor }}>
        <div className="animate-pulse text-white/30 text-2xl font-light">Stagedesk Monitor</div>
      </div>
    );
  }

  // ─── Error ───
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

  // ─── Gemeinsame Overlays (für alle Layouts) ───
  const overlays = (
    <>
      {/* NOTFALL */}
      {config?.notfall_aktiv && config?.notfall_text && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(127,29,29,0.97)' }}>
          <div className="text-center px-12">
            <AlertTriangle className="w-28 h-28 text-white mx-auto mb-8 animate-pulse" />
            <h1 className="text-6xl font-black text-white mb-6 leading-tight">{config.notfall_text}</h1>
            <div className="w-24 h-1 mx-auto rounded-full animate-pulse" style={{ background: accent }} />
          </div>
        </div>
      )}

      {/* Bildschirmschoner */}
      {screensaverActive && config?.zeige_bildschirmschoner && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center cursor-none"
          style={{ background: '#000' }}
          onClick={() => setScreensaverActive(false)}>
          <div className="animate-screensaver-bounce">
            <div className="text-center">
              {config?.zeige_logo && logoUrl && (
                <img src={logoUrl} alt="" className="h-20 mx-auto mb-6 opacity-30" />
              )}
              <div className="text-white/10 text-5xl font-bold">{config?.titel || 'Stagedesk'}</div>
              <div className="text-white/5 text-lg mt-2">
                {time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <style>{`
            @keyframes screensaver-bounce {
              0% { transform: translate(0, 0); }
              25% { transform: translate(20vw, -15vh); }
              50% { transform: translate(-15vw, 20vh); }
              75% { transform: translate(10vw, 10vh); }
              100% { transform: translate(0, 0); }
            }
            .animate-screensaver-bounce {
              animation: screensaver-bounce 30s ease-in-out infinite;
            }
          `}</style>
        </div>
      )}
    </>
  );

  // ═══════════════════════════════════════════════════════════════════
  // ═══ STUNDENPLAN-VOLLBILD LAYOUT ═══════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  if (config?.layout_modus === 'stundenplan') {
    const hasRaumplan = config?.zeige_raumplan && raumplan && raumplan.eintraege?.length > 0;

    return (
      <div className="fixed inset-0 overflow-hidden select-none flex flex-col" style={{ background: bgColor }}>
        {overlays}

        {/* ON AIR */}
        <OnAirIndicator config={config} accent={accent} />

        {/* Mini-Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0"
          style={{ background: `${bgColor}ee` }}>
          <div className="flex items-center gap-3">
            {config?.zeige_logo && logoUrl && (
              <img src={logoUrl} alt="" className="h-8 object-contain" />
            )}
            <span className="text-white/60 text-sm font-medium">{config?.titel || 'Stagedesk'}</span>
          </div>

          <div className="flex items-center gap-6">
            {/* Wetter (kompakt) */}
            {config?.zeige_wetter && wetter && (
              <div className="flex items-center gap-2 text-white/50 text-sm">
                {(() => { const WI = wetter?.icon ? (weatherIcons[wetter.icon] || Cloud) : Cloud; return <WI className="w-5 h-5" />; })()}
                <span className="font-medium text-white/70">{wetter.temperatur}°C</span>
              </div>
            )}

            {/* Uhr */}
            {config?.zeige_uhr && (
              <div className="text-white font-mono text-2xl font-bold tracking-wider">
                {time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            )}

            {/* Datum */}
            <div className="text-white/30 text-xs">
              {time.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Hauptbereich: WebUntis + optionaler Raumplan */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* WebUntis Iframe — so groß wie möglich */}
          {config?.zeige_webuntis && config?.webuntis_url ? (
            <div className="flex-1 min-w-0">
              <iframe
                src={config.webuntis_url}
                className="w-full h-full border-0"
                title="WebUntis Stundenplan"
                sandbox="allow-scripts allow-same-origin"
                style={{
                  transform: `scale(${(config.webuntis_zoom || 100) / 100})`,
                  transformOrigin: 'top left',
                  width: `${10000 / (config.webuntis_zoom || 100)}%`,
                  height: `${10000 / (config.webuntis_zoom || 100)}%`,
                  ...(config.webuntis_dark_mode ? { filter: 'invert(0.88) hue-rotate(180deg)' } : {}),
                }}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-white/20">
                <LayoutGrid className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <div className="text-lg">Kein Stundenplan konfiguriert</div>
                <div className="text-sm mt-1">WebUntis URL in den Einstellungen hinterlegen</div>
              </div>
            </div>
          )}

          {/* Raumplan Sidebar (vertikal/hochkant) */}
          {hasRaumplan && (
            <div className="w-80 border-l border-white/10 bg-white/[0.02] flex flex-col shrink-0 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <LayoutGrid className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">
                  {raumplan.raum || 'Raum'}
                </h2>
                <span className="text-white/30 text-xs ml-auto">{raumplan.datum}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: 'none' }}>
                <div className="space-y-1">
                  {raumplan.eintraege.map((e, i) => {
                    const now = new Date();
                    const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    const isActive = nowStr >= e.von && nowStr <= e.bis;
                    return (
                      <div key={i} className={`rounded-lg px-3 py-2 ${isActive ? 'bg-indigo-500/15 border border-indigo-500/30' : 'border border-transparent'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-mono text-xs ${isActive ? 'text-indigo-300 font-bold' : 'text-white/50'}`}>
                            {e.von}–{e.bis}
                          </span>
                          {isActive && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
                        </div>
                        <div className={`text-sm mt-0.5 ${isActive ? 'text-white font-semibold' : 'text-white/80'}`}>
                          {e.fach}
                        </div>
                        {e.lehrer && (
                          <div className="text-xs text-white/40 mt-0.5">{e.lehrer}</div>
                        )}
                        {e.klassen && (
                          <div className="text-xs text-white/30">{e.klassen}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-1 flex items-center justify-between text-white/15 text-[10px] border-t border-white/5 shrink-0">
          <span>Stagedesk Monitor — {config?.name || 'Stundenplan'}</span>
          {error && <span className="text-red-400/60">Verbindungsfehler</span>}
          <span>Auto-Refresh {config?.refresh_intervall || 30}s</span>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ═══ STANDARD LAYOUT ══════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════

  const priorityColors = {
    dringend: { bg: `rgba(239,68,68,0.15)`, border: `rgba(239,68,68,0.4)` },
    wichtig: { bg: `rgba(245,158,11,0.12)`, border: `rgba(245,158,11,0.3)` },
    normal: { bg: `rgba(59,130,246,0.08)`, border: `rgba(59,130,246,0.2)` },
  };

  const priorityIcons = {
    dringend: <AlertTriangle className="w-5 h-5 text-red-400" />,
    wichtig: <Megaphone className="w-5 h-5 text-amber-400" />,
    normal: <Info className="w-5 h-5 text-blue-400" />,
  };

  // Neue Feature-Flags
  const hasFreitext = config?.zeige_freitext && (config?.freitext_titel || config?.freitext_inhalt);
  const hasQrCode = config?.zeige_qr_code && config?.qr_code_url;
  const hasHintergrundbild = config?.zeige_hintergrundbild && hintergrundbildUrl;
  const hasRaumplan = config?.zeige_raumplan && raumplan && raumplan.eintraege?.length > 0;

  // Welche Spalten aktiv?
  const hasLeft = (config?.zeige_veranstaltungen && veranstaltungen.length > 0) || eigenerCountdown;
  const hasMiddle = (config?.zeige_ankuendigungen && ankuendigungen.length > 0) || hasFreitext || hasRaumplan;
  const hasRight = (config?.zeige_webuntis && config?.webuntis_url) || (config?.zeige_pdf && pdfUrl) || (config?.zeige_slideshow && bilder.length > 0) || hasQrCode;

  const WetterIcon = wetter?.icon ? (weatherIcons[wetter.icon] || Cloud) : Cloud;
  const hasTicker = config?.zeige_ticker && config?.ticker_text;

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ background: bgColor }}>

      {/* ═══ Hintergrundbild ═══ */}
      {hasHintergrundbild && (
        <div className="absolute inset-0 z-0">
          <img
            src={hintergrundbildUrl}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: `${bgColor}cc` }} />
        </div>
      )}

      {overlays}

      {/* ═══ ON AIR ═══ */}
      <OnAirIndicator config={config} accent={accent} />

      {/* ═══ Header ═══ */}
      <div className={`relative z-10 flex items-center justify-between px-8 ${onAirIsBanner ? 'pt-20' : 'pt-6'} pb-4`}>
        <div className="flex items-center gap-5">
          {config?.zeige_logo && logoUrl && (
            <img src={logoUrl} alt="" className="h-14 object-contain" />
          )}
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{config?.titel || 'Stagedesk'}</h1>
            {config?.untertitel && (
              <p className="text-white/40 text-sm mt-0.5">{config.untertitel}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-8">
          {/* Wetter */}
          {config?.zeige_wetter && wetter && (
            <div className="flex items-center gap-3 text-white/70">
              <WetterIcon className="w-8 h-8" />
              <div>
                <div className="text-2xl font-bold text-white">{wetter.temperatur}°C</div>
                <div className="text-xs text-white/40">{wetter.beschreibung}</div>
              </div>
            </div>
          )}

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
      </div>

      {/* Trennlinie mit Akzentfarbe */}
      <div className="relative z-10 mx-8 h-px" style={{ background: `linear-gradient(to right, transparent, ${accent}40, transparent)` }} />

      {/* ═══ Hauptbereich ═══ */}
      <div
        className="relative z-10 flex gap-6 px-8 pt-5 overflow-hidden"
        style={{
          height: hasTicker ? 'calc(100vh - 170px - 48px)' : 'calc(100vh - 170px)',
          paddingTop: onAirIsBanner ? '0.75rem' : undefined,
        }}
      >

        {/* ─── Linke Spalte: Veranstaltungen ─── */}
        {hasLeft && (!isRotating || currentPage === 'main' || currentPage === 'veranstaltungen') && (
          <div className={`${hasRight ? 'w-1/3' : hasMiddle ? 'w-1/2' : 'flex-1'} flex flex-col gap-4 overflow-hidden`}>

            {/* Laufende */}
            {laufende.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
                  <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: accent }}>Aktuell laufend</h2>
                </div>
                <div className="space-y-2">
                  {laufende.map(v => (
                    <div key={v.id} className="rounded-xl p-4 border" style={{ background: `${accent}15`, borderColor: `${accent}30` }}>
                      <div className="font-semibold text-white text-lg">{v.name}</div>
                      {v.ort && (
                        <div className="flex items-center gap-1.5 text-sm mt-1" style={{ color: `${accent}aa` }}>
                          <MapPin className="w-3.5 h-3.5" /> {v.ort}
                        </div>
                      )}
                      {v.datum_bis && (
                        <div className="text-xs mt-1" style={{ color: `${accent}70` }}>
                          bis {new Date(v.datum_bis).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Countdown */}
            {countdown && (
              <div className="rounded-xl p-4 border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="w-4 h-4" style={{ color: accent }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>Countdown</span>
                </div>
                <div className="text-3xl font-mono font-bold text-white">
                  {countdown.h > 0 && <>{countdown.h}<span className="text-white/30 text-xl">h </span></>}
                  {countdown.m}<span className="text-white/30 text-xl">m </span>
                  {countdown.s}<span className="text-white/30 text-xl">s</span>
                </div>
                <div className="text-white/40 text-sm mt-1">bis {countdown.name}</div>
              </div>
            )}

            {/* Eigener Countdown */}
            {eigenerCountdown && (
              <div className="rounded-xl p-4 border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">{eigenerCountdown.name}</span>
                </div>
                <div className="text-3xl font-mono font-bold text-white">
                  {eigenerCountdown.d > 0 && <>{eigenerCountdown.d}<span className="text-white/30 text-xl">d </span></>}
                  {eigenerCountdown.h > 0 && <>{eigenerCountdown.h}<span className="text-white/30 text-xl">h </span></>}
                  {eigenerCountdown.m}<span className="text-white/30 text-xl">m </span>
                  {eigenerCountdown.s}<span className="text-white/30 text-xl">s</span>
                </div>
              </div>
            )}

            {/* Kommende */}
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
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase" style={{ background: `${accent}25`, color: accent }}>Heute</span>
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

        {/* ─── Mittlere Spalte: Ankündigungen + Freitext + Raumplan ─── */}
        {hasMiddle && (!isRotating || currentPage === 'main' || currentPage === 'ankuendigungen' || currentPage === 'raumplan' || currentPage === 'freitext') && (
          <div className={`${hasLeft && hasRight ? 'w-1/3' : hasLeft || hasRight ? 'w-1/2' : 'flex-1'} flex flex-col gap-3 overflow-hidden`}>
            {config?.zeige_ankuendigungen && ankuendigungen.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Megaphone className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Ankündigungen</h2>
                </div>
                <div className="space-y-3 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
                  {ankuendigungen.map(a => {
                    const pc = priorityColors[a.prioritaet] || priorityColors.normal;
                    return (
                      <div key={a.id} className="rounded-xl p-5 border" style={{ background: pc.bg, borderColor: pc.border }}>
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
                    );
                  })}
                </div>
              </>
            )}

            {/* Freier Textblock */}
            {hasFreitext && (
              <div className="rounded-xl p-5 border border-white/10 bg-white/[0.04]">
                <div className="flex items-center gap-2 mb-3">
                  <AlignLeft className="w-4 h-4 text-teal-400" />
                  <h2 className="text-sm font-semibold text-teal-400 uppercase tracking-wider">
                    {config.freitext_titel || 'Information'}
                  </h2>
                </div>
                {config.freitext_inhalt && (
                  <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line">
                    {config.freitext_inhalt}
                  </p>
                )}
              </div>
            )}

            {/* Raumplan */}
            {hasRaumplan && (
              <div className="rounded-xl p-5 border border-white/10 bg-white/[0.04] flex-1 overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <LayoutGrid className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">
                    {raumplan.raum || 'Raumplan'} — {raumplan.datum}
                  </h2>
                </div>
                <div className="overflow-y-auto" style={{ scrollbarWidth: 'none', maxHeight: '100%' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-white/40 text-xs uppercase">
                        <th className="text-left pb-2 pr-3">Zeit</th>
                        <th className="text-left pb-2 pr-3">Fach</th>
                        <th className="text-left pb-2 pr-3">Lehrer</th>
                        <th className="text-left pb-2">Klassen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {raumplan.eintraege.map((e, i) => {
                        const now = new Date();
                        const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                        const isActive = nowStr >= e.von && nowStr <= e.bis;
                        return (
                          <tr key={i} className={isActive ? 'bg-indigo-500/10' : ''}>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <span className={`font-mono ${isActive ? 'text-indigo-300 font-semibold' : 'text-white/70'}`}>
                                {e.von}–{e.bis}
                              </span>
                              {isActive && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />}
                            </td>
                            <td className={`py-2 pr-3 ${isActive ? 'text-white font-medium' : 'text-white/80'}`}>{e.fach}</td>
                            <td className="py-2 pr-3 text-white/50">{e.lehrer}</td>
                            <td className="py-2 text-white/50">{e.klassen}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leer-Zustand */}
        {!hasLeft && !hasMiddle && !hasRight && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {config?.zeige_logo && logoUrl && (
                <img src={logoUrl} alt="" className="h-32 mx-auto mb-8 opacity-20" />
              )}
              <div className="text-white/10 text-6xl font-bold">Stagedesk</div>
            </div>
          </div>
        )}

        {/* ─── Rechte Spalte: WebUntis / PDF / Slideshow ─── */}
        {hasRight && (!isRotating || currentPage === 'main' || currentPage === 'slideshow' || currentPage === 'pdf' || currentPage === 'wetter') && (
          <div className={`${hasLeft || hasMiddle ? (hasLeft && hasMiddle ? 'w-1/3' : 'w-1/2') : 'flex-1'} flex flex-col overflow-hidden`}>

            {/* WebUntis */}
            {config?.zeige_webuntis && config?.webuntis_url && (
              <div className="flex-1 flex flex-col overflow-hidden mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Stundenplan</h2>
                </div>
                <div className="flex-1 rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                  <iframe
                    src={config.webuntis_url}
                    className="w-full h-full border-0"
                    title="WebUntis Stundenplan"
                    sandbox="allow-scripts allow-same-origin"
                    style={{
                      transform: `scale(${(config.webuntis_zoom || 100) / 100})`,
                      transformOrigin: 'top left',
                      width: `${10000 / (config.webuntis_zoom || 100)}%`,
                      height: `${10000 / (config.webuntis_zoom || 100)}%`,
                      ...(config.webuntis_dark_mode ? { filter: 'invert(0.88) hue-rotate(180deg)' } : {}),
                    }}
                  />
                </div>
              </div>
            )}

            {/* PDF */}
            {config?.zeige_pdf && pdfUrl && (
              <div className={`${config?.zeige_webuntis ? '' : 'flex-1'} flex flex-col overflow-hidden mb-4`}>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-orange-400" />
                  <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider">Dokument</h2>
                </div>
                <div className="flex-1 rounded-xl overflow-hidden border border-white/10 min-h-[300px]">
                  <iframe
                    src={pdfUrl}
                    className="w-full h-full border-0 bg-white"
                    title="PDF Dokument"
                  />
                </div>
              </div>
            )}

            {/* Slideshow */}
            {config?.zeige_slideshow && bilder.length > 0 && (
              <div className={`${config?.zeige_webuntis || config?.zeige_pdf ? '' : 'flex-1'} flex flex-col overflow-hidden`}>
                <div className="flex-1 rounded-xl overflow-hidden border border-white/10 relative min-h-[200px]">
                  {bilder.map((bild, idx) => (
                    <img
                      key={bild.id}
                      src={`${MEDIA_BASE}${bild.datei_url}`}
                      alt={bild.name}
                      className="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000"
                      style={{ opacity: idx === slideshowIdx ? 1 : 0 }}
                    />
                  ))}
                  {bilder.length > 1 && (
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                      {bilder.map((_, idx) => (
                        <div key={idx} className="w-2 h-2 rounded-full transition-all" style={{
                          background: idx === slideshowIdx ? accent : 'rgba(255,255,255,0.2)',
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* QR-Code */}
            {hasQrCode && (
              <div className="flex flex-col items-center mt-4 rounded-xl p-5 border border-white/10 bg-white/[0.04]">
                <div className="flex items-center gap-2 mb-3 self-start">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                    {config.qr_code_label || 'QR-Code'}
                  </h2>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(config.qr_code_url)}`}
                    alt="QR Code"
                    className="w-40 h-40"
                  />
                </div>
                {config.qr_code_label && (
                  <span className="text-white/50 text-xs mt-2">{config.qr_code_label}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Ticker ═══ */}
      {hasTicker && (
        <div className="absolute left-0 right-0 z-10 overflow-hidden py-3 border-t border-white/5"
          style={{ bottom: '32px', background: `${bgColor}ee` }}>
          <div className="animate-marquee whitespace-nowrap text-lg font-medium text-white/80" style={{
            animationDuration: `${Math.max(10, (config.ticker_text?.length || 50) * 1000 / (config.ticker_geschwindigkeit || 50))}s`,
          }}>
            <span className="mx-8">{config.ticker_text}</span>
            <span className="mx-8" style={{ color: accent }}>●</span>
            <span className="mx-8">{config.ticker_text}</span>
            <span className="mx-8" style={{ color: accent }}>●</span>
            <span className="mx-8">{config.ticker_text}</span>
          </div>
          <style>{`
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-40%); }
            }
            .animate-marquee {
              animation: marquee linear infinite;
            }
          `}</style>
        </div>
      )}

      {/* ═══ Seitenrotation Indikator ═══ */}
      {isRotating && (
        <div className="absolute bottom-10 left-0 right-0 z-20 flex justify-center gap-2">
          {rotationSeiten.map((seite, idx) => (
            <div key={seite} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
                idx === rotationIdx % rotationSeiten.length ? 'bg-white/60 scale-125' : 'bg-white/15'
              }`} />
            </div>
          ))}
        </div>
      )}

      {/* ═══ Footer ═══ */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-8 py-2">
        <div className="flex items-center justify-between text-white/20 text-xs">
          <span>Stagedesk Monitor{config?.name ? ` — ${config.name}` : ''}</span>
          {error && <span className="text-red-400/60">Verbindungsfehler — Versuche erneut...</span>}
          <span>Auto-Refresh alle {config?.refresh_intervall || 30}s</span>
        </div>
      </div>
    </div>
  );
}
