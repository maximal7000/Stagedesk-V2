/**
 * Öffentliches Monitor-Display — Vollbild, kein Login erforderlich
 * Features: ON AIR, Notfall, Veranstaltungen, Countdown, Ankündigungen,
 *           Wetter, WebUntis, Slideshow, PDF, Themes, Uhr,
 *           Multi-Profil (?view=slug, alt ?profil=slug), Stundenplan-Vollbild Layout
 */
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import {
  Calendar, Clock, MapPin, AlertTriangle, Info, Megaphone,
  Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  Thermometer, Droplets, Timer, FileText, QrCode, AlignLeft,
  LayoutGrid, Train, Bus, TramFront, Ship, Footprints, Construction, Megaphone as MegaphoneAlt,
} from 'lucide-react';
const PdfFullscreen = lazy(() => import('../components/monitor/PdfFullscreen'));

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

// ═══ Offizielle SWL-Linienfarben (Stadtverkehr Lübeck, Quelle: swhl.de mobil/linien) ═══
const SWL_LINE_COLORS = {
  '1': '#00b1eb', '3': '#00a070', '4': '#13a538', '5': '#004f9f', '6': '#13a538',
  '7': '#82338b', '8': '#13a538', '9': '#00b1eb', '10': '#00b1eb', '11': '#e7343f',
  '12': '#ec6608', '15': '#a00057', '16': '#13a538', '17': '#ea5297', '18': '#ae0f0a',
  '21': '#e7343f', '24': '#00a070', '25': '#a00057', '26': '#13a538', '30': '#a2bf1a',
  '31': '#e7343f', '33': '#055a1c', '34': '#0069b4', '35': '#a00057', '38': '#e84e0f',
  '40': '#a2bf1a', '41': '#e7343f', '50': '#a2bf1a',
};

// Lesbare Textfarbe auf farbigem Chip (relative Luminanz)
function chipTextColor(hex) {
  try {
    const h = String(hex).replace('#', '');
    const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(f.slice(0, 2), 16), g = parseInt(f.slice(2, 4), 16), b = parseInt(f.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0a0e17' : '#ffffff';
  } catch { return '#ffffff'; }
}

// SWL-Farbe für eine Linien-Bezeichnung (z.B. "11", "Bus 12") — sonst null
function swlColorForLine(name) {
  const k = String(name || '').toLowerCase().replace(/^(bus|linie|tram)\s+/i, '').trim();
  return SWL_LINE_COLORS[k] || null;
}

// Generische Dauer-Hinweise (E-Tretroller-Mitnahme etc.) — nicht überall prominent zeigen
const DISRUPTION_GENERIC_RE = /(tretroller|e-?scooter|e-?roller|fahrr[aä]d|gep[aä]ck|mitnahme|hund|ferienfahrplan|schulfrei|kurzstrecke|heiligabend|silvester|rollstuhl|autokraft|barrierefrei|informationen zum)/i;
function isGenericNotice(st) {
  const generic = DISRUPTION_GENERIC_RE.test(`${st.title || ''} ${st.text || ''}`);
  return generic && (st.all_lines || !(st.lines || []).filter(l => l && l !== 'all').length);
}

// ═══ Störungs-Karte: schaltet Störungen/Bau/Streik durch, mit Bild wenn vorhanden ═══
function DisruptionCarousel({ items, accent, height, layout = 'strip' }) {
  const [idx, setIdx] = useState(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => { setIdx(0); }, [items.length]);
  useEffect(() => {
    if (items.length <= 1) return;
    const ms = 9000;
    const t = setInterval(() => setIdx(p => (p + 1) % items.length), ms);
    return () => clearInterval(t);
  }, [items.length]);
  if (!items.length) return null;
  const st = items[Math.min(idx, items.length - 1)];
  const isStrike = st.kind === 'strike';
  const isConstruction = st.kind === 'construction';
  const TagIcon = isStrike ? MegaphoneAlt : isConstruction ? Construction : AlertTriangle;
  const tagLabel = isStrike ? 'Streik' : isConstruction ? 'Baumaßnahme' : 'Störung';
  const tagTone = isConstruction ? { c: '#f0a020', bg: 'rgba(240,160,32,0.12)' } : { c: '#ff5964', bg: 'rgba(255,89,100,0.12)' };
  const lines = (st.lines || []).filter(l => l && l !== 'all').slice(0, 8);
  const scope = st.all_lines ? 'alle Linien' : '';

  const grad = 'linear-gradient(180deg, rgba(18,22,32,0.96) 0%, rgba(10,14,23,0.98) 100%)';
  const header = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[13px] font-bold tracking-wide"
        style={{ color: tagTone.c, background: tagTone.bg }}>
        <TagIcon className="w-4 h-4" /> {tagLabel}
      </span>
      {scope && <span className="text-white/45 text-xs font-medium">{scope}</span>}
      {lines.map((l, j) => {
        const col = swlColorForLine(l);
        return (
          <span key={j} className="text-xs font-bold rounded px-1.5 py-0.5 leading-none tabular-nums"
            style={col ? { background: col, color: chipTextColor(col) } : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
            {l}
          </span>
        );
      })}
    </div>
  );
  const image = st.image && (
    <div className="rounded-lg overflow-hidden bg-white/[0.03] border border-white/10 w-full" style={{ aspectRatio: '16 / 9' }}>
      <img src={st.image} alt="" className="w-full h-full object-contain" loading="lazy"
        onError={(e) => { const p = e.currentTarget.parentElement; if (p) p.style.display = 'none'; }} />
    </div>
  );
  const footer = (st.from || st.until || st.suggestion) && (
    <div className="flex items-center gap-4">
      {(st.from || st.until) && <span className="text-white/40 text-[clamp(0.65rem,1vw,0.85rem)] tabular-nums">{st.from}{st.until ? ` – ${st.until}` : ''}</span>}
      {st.suggestion && <span className="text-white/45 text-[clamp(0.65rem,1vw,0.85rem)] truncate">→ {st.suggestion}</span>}
    </div>
  );

  // ─── Eigene Spalte: vertikal — Text oben, Bild darunter groß (Letterbox-Balken l/r) ───
  if (layout === 'column') {
    return (
      <div className="flex flex-col min-w-0 flex-1 rounded-lg overflow-hidden border border-white/10" style={{ background: grad }}>
        <div key={idx} className="flex-1 min-h-0 flex flex-col gap-2.5 p-4 overflow-hidden" style={reduce ? undefined : { animation: 'dm-fade 500ms ease' }}>
          {header}
          <div className="text-white font-display font-bold leading-tight text-[clamp(1.1rem,1.6vw,1.9rem)] shrink-0">{st.title}</div>
          {st.text && (
            <div className="text-white/60 leading-snug text-[clamp(0.8rem,1vw,1.05rem)] shrink-0"
              style={{ display: '-webkit-box', WebkitLineClamp: st.image ? 5 : 14, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {st.text}
            </div>
          )}
          {st.image && (
            <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
              <img src={st.image} alt="" className="max-w-full max-h-full object-contain rounded-lg" loading="lazy"
                onError={(e) => { const p = e.currentTarget.parentElement; if (p) p.style.display = 'none'; }} />
            </div>
          )}
          <div className="shrink-0 mt-auto">{footer}</div>
        </div>
        {items.length > 1 && (
          <div className="shrink-0 flex flex-wrap justify-center items-center gap-1.5 py-2 px-3 border-t border-white/[0.06]">
            {items.map((_, j) => (
              <span key={j} className="h-1.5 rounded-full transition-all"
                style={{ width: j === idx ? 16 : 6, background: j === idx ? accent : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Unten: horizontaler Streifen (Text links, Bild rechts) ───
  return (
    <div className="shrink-0 border-t border-white/10 overflow-hidden" style={{ height, background: grad }}>
      <div key={idx} className="h-full flex items-stretch gap-4 px-6 py-3" style={reduce ? undefined : { animation: 'dm-fade 500ms ease' }}>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          {header}
          <div className="text-white font-display font-bold leading-tight text-[clamp(1rem,2.1vw,1.7rem)] truncate">{st.title}</div>
          {st.text && (
            <div className="text-white/55 leading-snug text-[clamp(0.72rem,1.25vw,1rem)]"
              style={{ display: '-webkit-box', WebkitLineClamp: st.image ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {st.text}
            </div>
          )}
          <div className="mt-0.5">{footer}</div>
        </div>
        {st.image && (
          <div className="shrink-0 h-full rounded-lg overflow-hidden bg-white/[0.03] border border-white/10" style={{ aspectRatio: '16 / 9', maxWidth: '38%' }}>
            <img src={st.image} alt="" className="w-full h-full object-contain" loading="lazy"
              onError={(e) => { const p = e.currentTarget.parentElement; if (p) p.style.display = 'none'; }} />
          </div>
        )}
        {items.length > 1 && (
          items.length <= 10 ? (
            <div className="shrink-0 flex flex-col justify-center gap-1.5 pl-1">
              {items.map((_, j) => (
                <span key={j} className="w-1.5 rounded-full transition-all"
                  style={{ height: j === idx ? 18 : 6, background: j === idx ? accent : 'rgba(255,255,255,0.2)' }} />
              ))}
            </div>
          ) : (
            <div className="shrink-0 flex flex-col items-center justify-center pl-1 tabular-nums">
              <span className="text-sm font-bold" style={{ color: accent }}>{idx + 1}</span>
              <span className="w-4 h-px my-0.5 bg-white/20" />
              <span className="text-xs text-white/40">{items.length}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}


// ═══ WebUntis-Iframe — Zoom + Dark-Mode, wiederverwendbar ═══
function WebUntisFrame({ url, zoom = 100, dark = false }) {
  const z = zoom || 100;
  return (
    <iframe
      src={url}
      className="w-full h-full border-0"
      title="WebUntis Stundenplan"
      sandbox="allow-scripts allow-same-origin"
      style={{
        transform: `scale(${z / 100})`,
        transformOrigin: 'top left',
        width: `${10000 / z}%`,
        height: `${10000 / z}%`,
        ...(dark ? { filter: 'invert(0.88) hue-rotate(180deg)' } : {}),
      }}
    />
  );
}


// ═══ Uhr-Overlay für die Stundenplan-/WebUntis-Seite (auch im Splitscreen) ═══
// Berücksichtigt den WebUntis-Dark-Mode, damit die Uhr auf hellem wie dunklem
// Stundenplan gut lesbar bleibt.
function TimetableClock({ time, dark }) {
  // Wie der WebUntis-Titel „Vertretungen: …" (rot), ohne eigenes Kästchen.
  // Im Dark-Mode denselben Invert-Filter wie das Iframe anwenden, damit die
  // Farbe exakt zur (invertierten) Titelzeile passt.
  return (
    <div className="absolute top-4 right-3 z-30 font-mono text-2xl font-bold tabular-nums tracking-wider"
      style={{
        color: '#da1f3d',
        // Im Dark-Mode dieselbe Transformation wie das Iframe → Uhr kippt einfach mit
        filter: dark ? 'invert(0.88) hue-rotate(180deg)' : undefined,
      }}>
      {time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
}

// ═══ WebUntis-Seite mit Uhr-Overlay (für Splitscreen-Layouts) ═══
function WebUntisPane({ url, zoom, dark, time }) {
  return (
    <div className="relative w-full h-full">
      <WebUntisFrame url={url} zoom={zoom} dark={dark} />
      <TimetableClock time={time} dark={dark} />
    </div>
  );
}

// ═══ ON AIR Vollbild-Optik — wiederverwendbar (Layout, Override, Split) ═══
function OnAirFullscreen({
  color = '#da1f3d', text = 'ON AIR', showClock = false, clockText = '',
  logoUrl = '', fontSize = 'clamp(4rem, 16vw, 12rem)',
}) {
  return (
    <div className="w-full h-full overflow-hidden select-none flex items-center justify-center"
      style={{ background: `radial-gradient(ellipse at center, ${color}08 0%, #000 70%)` }}>
      <div className="text-center relative">
        <h1 className="font-black uppercase tracking-[0.4em] leading-none select-none animate-on-air-pulse"
          style={{
            color: color, fontSize,
            textShadow: `0 0 60px ${color}50, 0 0 120px ${color}25, 0 4px 0 ${color}30`,
            textIndent: '0.4em', '--on-air-color': color,
          }}>
          {text}
        </h1>
        {showClock && clockText && (
          <div className="font-mono mt-8 tabular-nums tracking-[0.3em] font-bold animate-pulse"
            style={{
              color: color, fontSize: 'clamp(1.75rem, 4vw, 3.5rem)', textIndent: '0.3em',
              textShadow: `0 0 25px ${color}90`,
            }}>
            {clockText}
          </div>
        )}
        {logoUrl && <img src={logoUrl} alt="" className="h-10 mx-auto mt-8 opacity-10" />}
      </div>
    </div>
  );
}


// ON AIR wird seit dem Vollbild-Umbau immer als Vollbild-Optik gezeigt
// (siehe OnAirFullscreen + Override). Die alten Positions-/Banner-Overlays
// (OnAirIndicator) sind entfernt; on_air_size/on_air_position/on_air_fullscreen
// sind deprecated und werden nicht mehr ausgewertet.


export default function MonitorPage() {
  const [data, setData] = useState(null);
  const [time, setTime] = useState(new Date());
  const [error, setError] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [slideshowIdx, setSlideshowIdx] = useState(0);
  const [rotationIdx, setRotationIdx] = useState(0);
  const reloadRef = useRef(undefined);  // merkt reload_requested_at; steigt der Wert → Seite neu laden

  // Mauszeiger auf dem TV-Monitor ausblenden (Kiosk hat keine Maus)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '*{cursor:none !important}';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Nächtliches Auto-Reload (~4:00, zufällige Minute) — Kiosk-Robustheit gegen Memory-Leaks
  useEffect(() => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(4, Math.floor(Math.random() * 15), 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const t = setTimeout(() => window.location.reload(), next - now);
    return () => clearTimeout(t);
  }, []);

  // Optionaler Seiten-Zoom für große/4K-Displays via ?zoom=1.5
  useEffect(() => {
    const z = new URLSearchParams(window.location.search).get('zoom');
    if (!z) return;
    document.documentElement.style.zoom = z;
    return () => { document.documentElement.style.zoom = ''; };
  }, []);

  // Ansichts-Slug oder Bildschirm-Slug aus URL (alte Kiosk-Parameter ?profil= / ?bildschirm= gelten weiter)
  const viewSlug = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') || params.get('profil') || '';
  }, []);
  const screenSlug = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('screen') || params.get('bildschirm') || '';
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (screenSlug) params.set('screen', screenSlug);
      else if (viewSlug) params.set('view', viewSlug);
      const qs = params.toString();
      const url = `${API_BASE}/monitor/display${qs ? '?' + qs : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const json = await res.json();
      // Reload-Anforderung vom Admin: reload_requested_at ist gestiegen → Ansicht neu laden
      if (json.reload_requested_at) {
        if (reloadRef.current === undefined) reloadRef.current = json.reload_requested_at;
        else if (reloadRef.current !== json.reload_requested_at) { window.location.reload(); return; }
      }
      setData(json);
      setLastFetchTime(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  }, [viewSlug, screenSlug]);

  // Polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, (data?.config?.refresh_interval || 30) * 1000);
    return () => clearInterval(interval);
  }, [fetchData, data?.config?.refresh_interval]);

  // Uhr jede Sekunde
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Slideshow Timer
  const images = useMemo(() => (data?.files || []).filter(d => d.kind === 'image'), [data?.files]);
  useEffect(() => {
    if (!data?.config?.show_slideshow || images.length <= 1) return;
    const interval = setInterval(() => {
      setSlideshowIdx(prev => (prev + 1) % images.length);
    }, (data.config.slideshow_interval || 10) * 1000);
    return () => clearInterval(interval);
  }, [data?.config?.show_slideshow, data?.config?.slideshow_interval, images.length]);

  // Seitenrotation
  const rotationPages = data?.config?.page_rotation_pages || [];
  const isRotating = data?.config?.show_page_rotation && rotationPages.length > 1;
  const currentPage = isRotating ? rotationPages[rotationIdx % rotationPages.length] : 'main';

  useEffect(() => {
    if (!isRotating) return;
    const interval = setInterval(() => {
      setRotationIdx(prev => (prev + 1) % rotationPages.length);
    }, (data?.config?.page_rotation_interval || 30) * 1000);
    return () => clearInterval(interval);
  }, [isRotating, rotationPages.length, data?.config?.page_rotation_interval]);

  const config = data?.config;
  const weather = data?.weather;
  const announcements = data?.announcements || [];
  const events = data?.events || [];
  const running = events.filter(v => v.is_running);
  const upcoming = events.filter(v => !v.is_running);
  const nextEvent = upcoming[0];

  // Theme / Farben
  const bgColor = config?.background_color || '#0f172a';
  const accent = config?.accent_color || '#da1f3d';

  // Countdown
  const countdown = useMemo(() => {
    if (!config?.show_countdown || !nextEvent?.date_from) return null;
    const diff = new Date(nextEvent.date_from) - time;
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { h, m, s, name: nextEvent.name };
  }, [config?.show_countdown, nextEvent, time]);

  // Eigener Countdown
  const customCountdown = useMemo(() => {
    if (!config?.show_custom_countdown || !config?.custom_countdown_date) return null;
    const diff = new Date(config.custom_countdown_date) - time;
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, name: config.custom_countdown_name || 'Countdown' };
  }, [config?.show_custom_countdown, config?.custom_countdown_date, config?.custom_countdown_name, time]);

  // Logo URL
  const logoUrl = config?.logo_url_resolved
    ? (config.logo_url_resolved.startsWith('http') ? config.logo_url_resolved : `${MEDIA_BASE}${config.logo_url_resolved}`)
    : '';

  // PDF URL
  const pdfUrl = config?.pdf_url_resolved
    ? (config.pdf_url_resolved.startsWith('http') ? config.pdf_url_resolved : `${MEDIA_BASE}${config.pdf_url_resolved}`)
    : '';

  // Hintergrundbild URL
  const backgroundImageUrl = config?.background_image_url_resolved
    ? (config.background_image_url_resolved.startsWith('http') ? config.background_image_url_resolved : `${MEDIA_BASE}${config.background_image_url_resolved}`)
    : '';

  // ON AIR Status
  const hasOnAir = config?.show_on_air && config?.is_on_air;
  const onAirIsBanner = hasOnAir && (config?.on_air_position || 'banner-top') === 'banner-top';

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
  const exam = data?.exam;
  const overlays = (
    <>
      {/* NOTFALL */}
      {config?.emergency_active && config?.emergency_text && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(127,29,29,0.97)' }}>
          <div className="text-center px-12">
            <AlertTriangle className="w-28 h-28 text-white mx-auto mb-8 animate-pulse" />
            <h1 className="text-6xl font-black text-white mb-6 leading-tight">{config.emergency_text}</h1>
            <div className="w-24 h-1 mx-auto rounded-full animate-pulse" style={{ background: accent }} />
          </div>
        </div>
      )}

      {/* KLAUSUR — Vollbild-Overlay; nur bei display_mode 'fullscreen'
          (split-Modus rendert eigenen geteilten Bildschirm, 'standard' zeigt nichts extra) */}
      {exam && !config?.emergency_active && (exam.display_mode || 'fullscreen') === 'fullscreen'
        && config?.layout !== 'split' && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center"
          style={{ background: exam.color || '#1e40af' }}
        >
          <div className="text-center px-12 max-w-5xl">
            <div className="inline-flex items-center gap-4 px-8 py-3 rounded-full bg-white/10 text-white/90 text-xl tracking-[0.3em] uppercase mb-10">
              <AlignLeft className="w-6 h-6" /> Klausur
            </div>
            <h1 className="text-7xl font-black text-white mb-8 leading-tight">{exam.title}</h1>
            {exam.text && (
              <p className="text-2xl text-white/85 leading-relaxed whitespace-pre-line">{exam.text}</p>
            )}
          </div>
        </div>
      )}

    </>
  );

  // ═══════════════════════════════════════════════════════════════════
  // ═══ ON AIR VOLLBILD OVERRIDE ═══════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // ON AIR ist immer Vollbild-Optik (keine Banner/Ecken mehr). Greift für ALLE
  // Layouts außer 'on_air' (hat es schon) und 'split' (regelt es selbst).
  // on_air_split → ON AIR zusätzlich als Splitscreen (ON AIR + Stundenplan).
  if (config?.show_on_air && config?.is_on_air
      && config?.layout !== 'on_air' && config?.layout !== 'split') {
    const oaCfg = data?.on_air_view || {};
    const onAirColor = oaCfg.on_air_color || config.on_air_color || '#da1f3d';
    const onAirText = oaCfg.on_air_text || config.on_air_text || 'ON AIR';
    const showClock = oaCfg.show_clock ?? config.show_clock;
    const clockText = time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (config?.on_air_split) {
      const untisUrl = config?.webuntis_url_next_day_resolved || config?.webuntis_url_resolved || config?.webuntis_url;
      const onAirPercent = Math.min(80, Math.max(20, config?.split_left_percent || 50));
      const untisPane = untisUrl ? (
        <WebUntisPane url={untisUrl} zoom={config?.webuntis_zoom} dark={config?.webuntis_dark_mode} time={time} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/25 text-2xl" style={{ background: bgColor }}>
          Kein Stundenplan-Link
        </div>
      );
      const onAirPane = (
        <OnAirFullscreen color={onAirColor} text={onAirText} showClock={showClock} clockText={clockText}
          fontSize="clamp(2.5rem, 8vw, 8rem)" />
      );
      const onAirRight = (config?.on_air_split_side || 'right') === 'right';
      return (
        <div className="fixed inset-0 flex" style={{ background: '#000' }}>
          <div className="min-w-0 overflow-hidden" style={{ width: `${onAirPercent}%` }}>
            {onAirRight ? untisPane : onAirPane}
          </div>
          <div className="w-px bg-white/15 shrink-0" />
          <div className="min-w-0 overflow-hidden flex-1">
            {onAirRight ? onAirPane : untisPane}
          </div>
          {overlays}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 overflow-hidden select-none">
        {overlays}
        <OnAirFullscreen color={onAirColor} text={onAirText} showClock={showClock} clockText={clockText} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ═══ KLAUSUR-AUTO-SPLIT ═══════════════════════════════════════════
  // Aktive Klausur mit display_mode='split' erzwingt den geteilten Bildschirm
  // (Klausur-Hinweis + Stundenplan), unabhängig vom Profil-Layout.
  // ═══════════════════════════════════════════════════════════════════
  if (exam && !config?.emergency_active && exam.display_mode === 'split') {
    const examPercent = Math.min(80, Math.max(20, exam.split_percent || 50));
    const examUntisUrl = exam.webuntis_url || config?.webuntis_url_next_day_resolved || config?.webuntis_url_resolved;
    const examPane = (
      <div className="w-full h-full flex items-center justify-center p-10"
           style={{ background: exam.color || '#1e40af' }}>
        <div className="text-center max-w-3xl">
          <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-white/10 text-white/90 text-base tracking-[0.3em] uppercase mb-8">
            <AlignLeft className="w-5 h-5" /> Klausur
          </div>
          <h1 className="text-5xl font-black text-white mb-6 leading-tight">{exam.title}</h1>
          {exam.text && (
            <p className="text-xl text-white/85 leading-relaxed whitespace-pre-line">{exam.text}</p>
          )}
        </div>
      </div>
    );
    const untisPane = examUntisUrl ? (
      <WebUntisPane url={examUntisUrl} zoom={config?.webuntis_zoom} dark={config?.webuntis_dark_mode} time={time} />
    ) : (
      <div className="w-full h-full flex items-center justify-center text-white/30 text-2xl" style={{ background: bgColor }}>
        Kein Stundenplan-Link
      </div>
    );
    const examLeft = (exam.split_side || 'right') === 'left';
    return (
      <div className="fixed inset-0 flex" style={{ background: bgColor }}>
        <div className="min-w-0 overflow-hidden" style={{ width: `${examLeft ? examPercent : 100 - examPercent}%` }}>
          {examLeft ? examPane : untisPane}
        </div>
        <div className="w-px bg-white/15 shrink-0" />
        <div className="min-w-0 overflow-hidden flex-1">
          {examLeft ? untisPane : examPane}
        </div>
        {overlays}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ═══ STUNDENPLAN-VOLLBILD LAYOUT ═══════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  if (config?.layout === 'timetable') {
    return (
      <div className="fixed inset-0 overflow-hidden select-none flex flex-col" style={{ background: bgColor }}>
        {overlays}

        {/* Uhr — floating oben rechts (im Dark-Mode wie das Iframe invertiert) */}
        {config?.show_clock && <TimetableClock time={time} dark={config?.webuntis_dark_mode} />}

        {/* Hauptbereich: WebUntis */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* WebUntis Iframe — Vollbild (nutzt gespeicherten Link oder Freitext-URL) */}
          {(config?.webuntis_url_resolved || config?.webuntis_url) ? (
            <div className="flex-1 min-w-0">
              <WebUntisFrame url={config.webuntis_url_resolved || config.webuntis_url} zoom={config.webuntis_zoom}
                             dark={config.webuntis_dark_mode} />
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

        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ═══ ON AIR DISPLAY LAYOUT ════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  if (config?.layout === 'on_air') {
    const onAirColor = config.on_air_color || '#da1f3d';
    const isLive = config.is_on_air;
    const onAirText = config.on_air_text || 'ON AIR';

    if (isLive) {
      return (
        <div className="fixed inset-0 overflow-hidden select-none">
          {overlays}
          <OnAirFullscreen color={onAirColor} text={onAirText}
            showClock={config?.show_clock}
            clockText={time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            logoUrl={config?.show_logo ? logoUrl : ''} />
        </div>
      );
    }
    return (
      <div className="fixed inset-0 overflow-hidden select-none flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at center, #0a0a0a 0%, #000 70%)' }}>
        {overlays}
        <div className="text-center">
          {config?.show_logo && logoUrl && (
            <img src={logoUrl} alt="" className="h-20 mx-auto mb-10 opacity-10" />
          )}
          <div className="text-white/[0.06] text-5xl font-black tracking-[0.5em] uppercase">
            {onAirText}
          </div>
          <div className="w-20 h-px mx-auto mt-6 bg-white/[0.04]" />
          <div className="text-white/[0.04] text-xs mt-4 uppercase tracking-[0.3em]">Standby</div>
          {config?.show_clock && (
            <div className="text-white/[0.08] font-mono text-xl mt-10 tabular-nums tracking-[0.2em]">
              {time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ═══ VOLLBILD-LAYOUTS (PDF / Bild) ════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  const fullscreenHeader = config?.fullscreen_header && (
    <div className="flex items-center gap-5 px-10 py-5 shrink-0"
         style={{ borderBottom: `3px solid ${accent}` }}>
      {config?.show_logo && logoUrl && (
        <img src={logoUrl} alt="" className="h-16 object-contain" />
      )}
      <div>
        <h1 className="text-4xl font-bold text-white tracking-tight">{config?.title || 'Stagedesk'}</h1>
        {config?.subtitle && (
          <p className="text-white/50 text-lg mt-1">{config.subtitle}</p>
        )}
      </div>
    </div>
  );

  if (config?.layout === 'pdf_fullscreen') {
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: bgColor }}>
        {fullscreenHeader}
        <div className="flex-1 min-h-0 p-4">
          {pdfUrl ? (
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/40 text-2xl">PDF wird geladen …</div>}>
              <PdfFullscreen
                url={pdfUrl}
                mode={config?.pdf_mode || 'cycle'}
                interval={config?.pdf_interval || 10}
                perScreen={config?.pdf_per_screen || 1}
                pages={config?.pdf_pages || ''}
                staticPage={config?.pdf_static_page || 1}
              />
            </Suspense>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40 text-3xl">
              Keine PDF ausgewählt
            </div>
          )}
        </div>
      </div>
    );
  }

  if (config?.layout === 'image_fullscreen') {
    const imageUrl = config?.image_url_resolved
      ? (config.image_url_resolved.startsWith('http') ? config.image_url_resolved : `${MEDIA_BASE}${config.image_url_resolved}`)
      : '';
    const fit = config?.image_fit || 'contain';
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: bgColor }}>
        {fullscreenHeader}
        <div className={`flex-1 min-h-0 flex items-center justify-center ${fit === 'contain' ? 'p-4' : ''}`}>
          {imageUrl ? (
            <img src={imageUrl} alt=""
              className={fit === 'contain' ? 'max-w-full max-h-full object-contain' : 'w-full h-full'}
              style={fit === 'cover'
                ? { objectFit: 'cover', objectPosition: `${config?.image_focus_x ?? 50}% ${config?.image_focus_y ?? 50}%` }
                : fit === 'fill' ? { objectFit: 'fill' } : undefined} />
          ) : (
            <div className="text-white/40 text-3xl">Kein Bild ausgewählt</div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ═══ SPLITSCREEN LAYOUT ═══════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  if (config?.layout === 'split') {
    const renderSplitSide = (kind) => {
      switch (kind) {
        case 'webuntis': {
          const untisUrl = config?.webuntis_url_next_day_resolved || config?.webuntis_url_resolved;
          return untisUrl ? (
            <WebUntisPane url={untisUrl} zoom={config.webuntis_zoom} dark={config.webuntis_dark_mode} time={time} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/30 text-2xl">
              Kein WebUntis-Link
            </div>
          );
        }
        case 'exam':
          return exam ? (
            <div className="w-full h-full flex items-center justify-center p-10"
                 style={{ background: exam.color || '#1e40af' }}>
              <div className="text-center max-w-3xl">
                <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-white/10 text-white/90 text-base tracking-[0.3em] uppercase mb-8">
                  <AlignLeft className="w-5 h-5" /> Klausur
                </div>
                <h1 className="text-5xl font-black text-white mb-6 leading-tight">{exam.title}</h1>
                {exam.text && (
                  <p className="text-xl text-white/85 leading-relaxed whitespace-pre-line">{exam.text}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/25 text-2xl"
                 style={{ background: bgColor }}>
              Keine Klausur aktiv
            </div>
          );
        case 'on_air': {
          const oaLive = config?.is_on_air;
          const oaColor = config?.on_air_color || accent;
          return oaLive ? (
            <OnAirFullscreen color={oaColor} text={config?.on_air_text || 'ON AIR'}
              fontSize="clamp(2.5rem, 8vw, 8rem)" showClock={config?.show_clock}
              clockText={time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: '#0a0a0a' }}>
              <div className="text-white/20 text-4xl font-light tracking-widest uppercase">Standby</div>
            </div>
          );
        }
        case 'clock':
          return (
            <div className="w-full h-full flex flex-col items-center justify-center" style={{ background: bgColor }}>
              <div className="text-white font-black tabular-nums tracking-tight" style={{ fontSize: 'clamp(4rem, 12vw, 12rem)' }}>
                {time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-white/50 text-2xl mt-2">
                {time.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            </div>
          );
        default:
          return <div className="w-full h-full" style={{ background: bgColor }} />;
      }
    };
    const leftPercent = Math.min(80, Math.max(20, config?.split_left_percent || 50));
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: bgColor }}>
        {fullscreenHeader}
        <div className="flex-1 min-h-0 flex">
          <div className="min-w-0 overflow-hidden" style={{ width: `${leftPercent}%` }}>
            {renderSplitSide(config?.split_left || 'exam')}
          </div>
          <div className="w-px bg-white/15 shrink-0" />
          <div className="min-w-0 overflow-hidden flex-1">
            {renderSplitSide(config?.split_right || 'webuntis')}
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ═══ ABFAHRTSMONITOR LAYOUT ═══════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  if (config?.layout === 'departures') {
    const stations = data?.departures || [];

    // Feature-Flags aus Config
    const showVia = config?.transit_show_via ?? false;
    const showRelative = config?.transit_show_relative ?? true;
    const colorCoding = config?.transit_color_coding ?? true;
    const highlightNext = config?.transit_highlight_next ?? true;
    const autoScroll = config?.transit_auto_scroll ?? false;
    const disruptionBanner = config?.transit_disruption_banner ?? true;
    const transitFontSize = config?.transit_font_size || 'large';
    const columnCount = config?.transit_columns || 3;

    // Schriftgrößen — kompakt: alles einzeilig, via inline
    const sizes = {
      normal: { time: 'text-[14px]', delay: 'text-[10px]', line: 'text-[12px]', dir: 'text-[13px]', via: 'text-[10px]', platform: 'text-[11px]', station: 'text-[11px]', relative: 'text-[10px]', badge: 'text-[9px]', icon: 'w-4 h-4', iconInner: 'w-2.5 h-2.5', row: 'px-2 py-[4px]', lineW: 'w-[56px]', timeW: 'w-[72px]', relativeW: 'w-[42px]', header: 'text-lg', clock: 'text-4xl', walk: 'text-[9px]' },
      large:  { time: 'text-[17px]', delay: 'text-[12px]', line: 'text-[14px]', dir: 'text-[16px]', via: 'text-[11px]', platform: 'text-[13px]', station: 'text-[12px]', relative: 'text-[12px]', badge: 'text-[10px]', icon: 'w-5 h-5', iconInner: 'w-3 h-3', row: 'px-3 py-[5px]', lineW: 'w-[66px]', timeW: 'w-[82px]', relativeW: 'w-[50px]', header: 'text-xl', clock: 'text-5xl', walk: 'text-[10px]' },
      '4k':   { time: 'text-[22px]', delay: 'text-[14px]', line: 'text-[18px]', dir: 'text-[20px]', via: 'text-[13px]', platform: 'text-[16px]', station: 'text-[14px]', relative: 'text-[14px]', badge: 'text-[12px]', icon: 'w-6 h-6', iconInner: 'w-3.5 h-3.5', row: 'px-4 py-[6px]', lineW: 'w-[86px]', timeW: 'w-[100px]', relativeW: 'w-[58px]', header: 'text-2xl', clock: 'text-6xl', walk: 'text-[12px]' },
    };
    const s = sizes[transitFontSize] || sizes.large;

    const kindIcons = {
      ice: Train, ic: Train, re: Train, rb: Train,
      sbahn: TramFront, ubahn: TramFront, tram: TramFront,
      bus: Bus, faehre: Ship, taxi: Bus, zug: Train,
    };
    // DB Navigator Farbschema: S-Bahn grün, U-Bahn blau, Bus purpur, Züge grau, ICE rot
    const kindColors = {
      ice: '#ec0016', ic: '#78858b', re: '#78858b', rb: '#78858b',
      sbahn: '#408335', ubahn: '#1455a3', tram: '#b4001e',
      bus: '#a0137e', faehre: '#00838f', taxi: '#ffc107', zug: '#78858b',
    };
    const busKinds2 = ['bus', 'faehre', 'taxi'];
    // Kurzes Linien-Label fürs Chip: "Bus 12" → "12", "RE8" bleibt
    const getLineLabel = (dep) => {
      const raw = String(dep.line || '').trim();
      const m = raw.match(/^(?:Bus|Linie|Tram|Fähre|Faehre)\s+(.+)$/i);
      return (m ? m[1] : raw) || '?';
    };
    // Linienfarbe ermitteln: API-Farbe > SWL-Linienfarbe (Bus) > Typ-Farbe
    const getLineColor = (dep) => {
      if (dep.line_color) return dep.line_color;
      if (busKinds2.includes(dep.kind_icon)) {
        const swl = swlColorForLine(getLineLabel(dep));
        if (swl) return swl;
      }
      return kindColors[dep.kind_icon] || '#78858b';
    };

    // Minuten bis tatsächlicher Abfahrt berechnen (geplant + Verspätung)
    const getMinUntil = (depTime, verspaetung = 0) => {
      if (!depTime) return null;
      try {
        const [h, m] = depTime.split(':').map(Number);
        const depMin = h * 60 + m + (verspaetung || 0);
        const nowMin = time.getHours() * 60 + time.getMinutes();
        let diff = depMin - nowMin;
        if (diff < -60) diff += 1440;
        return diff;
      } catch { return null; }
    };

    // Farbcodierung — KEIN Blinken
    const getTimeColor = (min) => {
      if (!colorCoding || min === null) return 'text-white';
      if (min <= 0) return 'text-green-400';
      if (min <= 5) return 'text-green-400';
      if (min <= 15) return 'text-white';
      if (min <= 30) return 'text-white/80';
      return 'text-white/50';
    };

    // ─── Layout-Designer: Stationen in Spalten gruppieren ───
    // Jede Station hat ein optionales `column` Feld (0-indexed).
    // Stationen ohne Spalte werden automatisch verteilt.
    const columnMap = {};
    const stopsWithColumn = [];
    const stopsWithoutColumn = [];
    stations.forEach((st, idx) => {
      // Station-Config aus transit_stops holen (gleiche ID matchen)
      const stConfig = (config?.transit_stops || []).find(s => s.id === st.station_id);
      const column = stConfig?.column;
      const maxPerStop = stConfig?.max_departures;
      // Max Abfahrten pro Station begrenzen wenn konfiguriert
      const limitedSt = (maxPerStop && maxPerStop > 0 && st.departures?.length > maxPerStop)
        ? { ...st, departures: st.departures.slice(0, maxPerStop) }
        : st;
      if (column !== undefined && column !== null && column >= 0) {
        stopsWithColumn.push({ ...limitedSt, _column: column, _idx: idx });
      } else {
        stopsWithoutColumn.push({ ...limitedSt, _idx: idx });
      }
    });

    // Auto-Verteilen der Stationen ohne Spalte
    let nextAutoCol = 0;
    const usedCols = new Set(stopsWithColumn.map(s => s._column));
    stopsWithoutColumn.forEach(st => {
      while (usedCols.has(nextAutoCol) && nextAutoCol < columnCount) nextAutoCol++;
      if (nextAutoCol >= columnCount) nextAutoCol = 0;
      stopsWithColumn.push({ ...st, _column: nextAutoCol });
      nextAutoCol++;
    });

    // Spalten aufbauen
    for (let i = 0; i < columnCount; i++) columnMap[i] = [];
    stopsWithColumn.sort((a, b) => a._column - b._column || a._idx - b._idx).forEach(st => {
      const col = Math.min(st._column, columnCount - 1);
      if (!columnMap[col]) columnMap[col] = [];
      columnMap[col].push(st);
    });
    const columns = Object.values(columnMap).filter(col => col.length > 0);

    // Einzelne Abfahrtszeile rendern
    const DepRow = ({ dep, i, isHighlight, useCompact }) => {
      const cs = useCompact ? (sizes.normal || s) : s;
      const lineColor = getLineColor(dep);
      const lineLabel = getLineLabel(dep);
      const isTrain = ['ice', 'ic', 're', 'rb', 'sbahn', 'zug'].includes(dep.kind_icon);
      const hasDelay = dep.delay > 0;
      const minUntil = getMinUntil(dep.departure, dep.delay);
      const via = showVia ? (dep.stopovers?.slice(0, 3).join(', ') || '') : '';
      // Zeilen-Zusatz: bei Ausfall der GRUND (statt „ohne Halt", das bei Komplettausfall widersprüchlich ist),
      // sonst echte Routenänderungen; falls keine, der Grund als dezenter Hinweis.
      // Echter Grund (z.B. „Unbefugte Personen auf der Strecke") — generische Dauer-Hinweise
      // (E-Tretroller, Fahrradmitnahme, Gepäck …) werden herausgefiltert, sollen nicht auf jede Zeile.
      const reason = (dep.remarks || []).find(b =>
        typeof b === 'string' && b.trim().length > 4 && !DISRUPTION_GENERIC_RE.test(b));
      const extraInfo = [];
      if (dep.cancelled) {
        // Bei Ausfall den Grund (statt „ohne Halt", das bei Komplettausfall widersprüchlich ist)
        if (reason) extraInfo.push({ txt: reason, tone: 'text-red-400/85' });
      } else {
        // Normale Zeilen: echte Routenänderungen — KEINE generischen Bemerkungen (Rauschen)
        if (dep.dropped_stops?.length) extraInfo.push({ txt: `ohne Halt: ${dep.dropped_stops.join(', ')}`, tone: 'text-red-400/85' });
        if (dep.added_stops?.length) extraInfo.push({ txt: `zusätzl. Halt: ${dep.added_stops.join(', ')}`, tone: 'text-white/45' });
        // Verspätungsgrund bei tatsächlicher Verspätung
        if (hasDelay && reason && !extraInfo.some(z => z.txt === reason)) {
          extraInfo.push({ txt: reason, tone: 'text-red-400/70' });
        }
      }
      // Ersatzverkehr-Verknüpfung (IRIS): Original ↔ Ersatzbus
      if (dep.replaced_by) extraInfo.push({ txt: `Ersetzt durch ${dep.replaced_by}`, tone: 'text-red-400/90' });
      if (dep.replacement_for) extraInfo.push({ txt: `Ersatz für ${dep.replacement_for}`, tone: 'text-white/50' });

      return (
        <div className={`flex items-center gap-2 ${useCompact ? cs.row : s.row} ${i > 0 ? 'border-t border-white/[0.06]' : ''} ${isHighlight && !dep.cancelled ? 'bg-white/[0.035]' : ''}`}
          style={isHighlight && !dep.cancelled ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}>
          {/* Zeit + Verspätung */}
          <div className={`${useCompact ? cs.timeW : s.timeW} shrink-0 flex items-baseline gap-1`}>
            <span className={`font-mono ${useCompact ? cs.time : s.time} font-bold tabular-nums leading-none ${dep.cancelled ? 'line-through text-white/30' : getTimeColor(minUntil)}`}>
              {dep.departure || '—'}
            </span>
            {hasDelay && <span className={`text-red-400 ${useCompact ? cs.delay : s.delay} font-bold tabular-nums`}>+{dep.delay}</span>}
          </div>
          {/* Relativ (in X min / jetzt) */}
          {showRelative && (
            <div className={`${useCompact ? cs.relativeW : s.relativeW} shrink-0 text-right pr-2`}>
              {minUntil !== null && !dep.cancelled && (
                <span className={`${useCompact ? cs.relative : s.relative} tabular-nums ${minUntil <= 0 ? 'text-green-400 font-semibold' : minUntil <= 5 ? 'text-green-400/80' : 'text-white/30'}`}>
                  {minUntil <= 0 ? 'jetzt' : `${minUntil}′`}
                </span>
              )}
            </div>
          )}
          {/* Linien-Chip + Ziel — bei Zügen feste Chip-Breite, damit die Ziele auf gleicher x-Achse beginnen */}
          <div className="flex-1 min-w-0 flex items-center gap-2 pr-1.5">
            <span className={`${useCompact ? cs.line : s.line} font-bold tabular-nums rounded px-1.5 py-[3px] leading-none text-center inline-block shrink-0 ${dep.cancelled ? 'opacity-40' : ''}`}
              style={{ background: lineColor, color: chipTextColor(lineColor), minWidth: (isTrain || dep.replacement_for) ? '3.6em' : '2.1em' }}>
              {lineLabel}
            </span>
            <div className="min-w-0 flex-1">
              {/* Ziel + Via in einem Flex — Via kürzt zuerst und behält seine eigene (gedämpfte) Farbe für „…" */}
              <div className="flex items-baseline min-w-0">
                <span className={`${useCompact ? cs.dir : s.dir} font-medium truncate min-w-0 ${dep.cancelled ? 'line-through text-white/40' : dep.ends_early ? 'text-red-400 font-semibold' : 'text-white'}`}>
                  {dep.direction}
                </span>
                {via && (
                  <span className={`${useCompact ? cs.via : s.via} text-white/35 ml-1.5 truncate min-w-0`} style={{ flexShrink: 4 }}>
                    {via}
                  </span>
                )}
              </div>
              {!useCompact && extraInfo.length > 0 && (
                <div className="text-[9px] leading-tight truncate">
                  {extraInfo.map((z, k) => <span key={k} className={z.tone}>{k > 0 ? ' · ' : ''}{z.txt}</span>)}
                </div>
              )}
            </div>
          </div>
          {/* Status rechts — ein Rot für Probleme, Rest neutral; SEV steht rechts in der Gleis-Position */}
          <div className="shrink-0 flex items-center gap-1.5">
            {dep.cancelled && <span className={`text-red-400 ${useCompact ? cs.dir : s.dir} font-bold`}>Fällt aus</span>}
            {dep.diversion && !dep.cancelled && <span className={`text-amber-300 ${useCompact ? cs.badge : s.badge} font-bold bg-amber-400/10 px-1.5 py-0.5 rounded`}>Umleitung</span>}
            {dep.wing_train && !dep.cancelled && <span className={`text-white/60 ${useCompact ? cs.badge : s.badge} font-medium bg-white/[0.06] px-1.5 py-0.5 rounded`}>Flügelzug</span>}
            {dep.replacement_train && !dep.cancelled && <span className={`text-white/60 ${useCompact ? cs.badge : s.badge} font-medium bg-white/[0.06] px-1.5 py-0.5 rounded`}>Ersatzzug</span>}
            {dep.load_factor && !dep.cancelled && (() => {
              const load = { 'low-to-medium': { bars: 1, color: 'text-green-400' }, 'high': { bars: 2, color: 'text-amber-400' }, 'very-high': { bars: 3, color: 'text-amber-400' }, 'exceptionally-high': { bars: 3, color: 'text-red-400' } };
              const l = load[dep.load_factor] || load['low-to-medium'];
              return (
                <span className={`${l.color} flex items-end gap-px shrink-0`} title="Auslastung">
                  {[1,2,3].map(n => <span key={n} className={`inline-block w-[3px] rounded-sm ${n <= l.bars ? 'bg-current' : 'bg-white/10'}`} style={{ height: `${6 + n * 2}px` }} />)}
                </span>
              );
            })()}
            {/* Rechts: bei Ersatzverkehr das offizielle SEV-Logo in der Gleis-Position, sonst das Gleis */}
            {(dep.rail_replacement || dep.replaced_by) ? (
              <img src="/sev-logo.png" alt="SEV" title="Schienenersatzverkehr"
                className="shrink-0 object-contain" style={{ height: useCompact ? '1.5em' : '1.8em' }} />
            ) : dep.platform ? (
              <span className={`font-mono ${useCompact ? cs.platform : s.platform} px-1.5 py-0.5 rounded min-w-[28px] text-center font-semibold ${
                dep.cancelled ? 'bg-white/[0.03] text-white/25 border border-white/5 line-through'
                : dep.platform_planned ? 'bg-red-500/25 text-red-300 border border-red-500/40'
                : 'bg-white/[0.08] text-white/70 border border-white/10'
              }`}>
                {!dep.cancelled && dep.platform_planned && <span className="line-through text-white/25 mr-0.5 text-[0.8em] font-normal">{dep.platform_planned}</span>}
                {dep.platform}
              </span>
            ) : null}
          </div>
        </div>
      );
    };

    const StationBlock = ({ station, compact }) => {
      const scrollRef = useRef(null);
      // Per-Station config für Trennung und Kompaktmodus
      const stConfig = (config?.transit_stops || []).find(sc => sc.id === station.station_id);
      const splitByType = stConfig?.split_by_type || false;  // "bus_zug" Trennung
      // Kompakt-Modus NUR über den manuellen Haken pro Station — nicht mehr automatisch,
      // wenn mehrere Stationen in einer Spalte stehen (sonst verschwindet z.B. der Verspätungsgrund).
      const useCompact = stConfig?.compact || false;

      useEffect(() => {
        if (!autoScroll || !scrollRef.current) return;
        const el = scrollRef.current;
        if (el.scrollHeight <= el.clientHeight) return;
        let dir = 1;
        const interval = setInterval(() => {
          el.scrollTop += dir * 1;
          if (el.scrollTop >= el.scrollHeight - el.clientHeight) dir = -1;
          if (el.scrollTop <= 0) dir = 1;
        }, 50);
        return () => clearInterval(interval);
      }, [station.departures?.length]);

      // Abfahrten in Gruppen teilen wenn Trennung aktiv
      const busKinds = ['bus', 'faehre', 'taxi'];
      const deps = station.departures || [];

      // Max pro Verkehrsmittel aus Config
      const maxBus = stConfig?.max_bus || 0;
      const maxTrain = stConfig?.max_train || 0;

      if (splitByType && deps.length > 0) {
        let buses = deps.filter(d => busKinds.includes(d.kind_icon));
        let trains = deps.filter(d => !busKinds.includes(d.kind_icon));
        // Max pro Typ anwenden
        if (maxBus > 0) buses = buses.slice(0, maxBus);
        if (maxTrain > 0) trains = trains.slice(0, maxTrain);
        // Platzverteilung: proportional zur Anzahl, Züge haben Vorrang
        // Wenn Züge wachsen, schrumpfen Busse (nicht überlagern)
        const bCount = buses.length;
        const tCount = trains.length;
        const total = bCount + tCount;
        // Züge bekommen ihren Anteil, Busse den Rest
        const trainShare = total > 0 ? Math.max(tCount / total, 0.15) : 0.5;
        const busShare = total > 0 ? Math.max(bCount / total, 0.15) : 0.5;

        return (
          <div className="flex flex-col min-w-0 flex-1 gap-1">
            <div className="flex items-center gap-1.5 px-1">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
              <h2 className={`text-white/60 font-display ${useCompact ? sizes.normal.station : s.station} font-bold uppercase tracking-[0.12em] truncate`}>{station.station_name}</h2>
              {station.walk_minutes > 0 && <span className={`${s.walk} text-white/40 shrink-0 inline-flex items-center gap-0.5`}><Footprints className="w-3 h-3" />{station.walk_minutes} min</span>}
              {station.error && <span className="text-red-400/40 text-[8px] shrink-0">!</span>}
            </div>
            {/* Busse oben */}
            {buses.length > 0 && (
              <div className="flex flex-col min-h-0 overflow-hidden" style={{ flex: `${busShare} 1 0%` }}>
                <div className="rounded overflow-hidden border border-white/[0.05] bg-white/[0.015] flex-1 min-h-0" style={{ scrollbarWidth: 'none' }}>
                  {buses.map((dep, i) => <DepRow key={i} dep={dep} i={i} isHighlight={highlightNext && i === 0 && !dep.cancelled} useCompact={useCompact} />)}
                </div>
              </div>
            )}
            {/* Trenner */}
            {buses.length > 0 && trains.length > 0 && (
              <div className="border-t border-white/[0.08] mx-1" />
            )}
            {/* Züge unten */}
            {trains.length > 0 && (
              <div className="flex flex-col min-h-0 overflow-hidden" style={{ flex: `${trainShare} 1 0%` }}>
                <div ref={scrollRef} className="rounded overflow-hidden overflow-y-auto border border-white/[0.05] bg-white/[0.015] flex-1 min-h-0" style={{ scrollbarWidth: 'none' }}>
                  {trains.map((dep, i) => <DepRow key={i} dep={dep} i={i} isHighlight={highlightNext && i === 0 && !dep.cancelled} useCompact={useCompact} />)}
                </div>
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
            <h2 className={`text-white/60 font-display ${useCompact ? sizes.normal.station : s.station} font-bold uppercase tracking-[0.12em] truncate`}>{station.station_name}</h2>
            {station.walk_minutes > 0 && (
              <span className={`${s.walk} text-white/40 shrink-0 inline-flex items-center gap-0.5`}><Footprints className="w-3 h-3" />{station.walk_minutes} min</span>
            )}
            {station.error && <span className="text-red-400/40 text-[8px] shrink-0">!</span>}
          </div>

          {deps.length > 0 ? (
            <div ref={scrollRef} className="rounded overflow-hidden overflow-y-auto border border-white/[0.05] bg-white/[0.015] flex-1" style={{ scrollbarWidth: 'none' }}>
              {deps.map((dep, i) => <DepRow key={i} dep={dep} i={i} isHighlight={highlightNext && i === 0 && !dep.cancelled} useCompact={useCompact} />)}
            </div>
          ) : (
            <div className="text-white/25 text-xs px-2 py-3 text-center border border-white/[0.05] rounded flex-1 flex flex-col items-center justify-center gap-1">
              <Clock className="w-4 h-4 text-white/15" />
              Aktuell keine Abfahrten
            </div>
          )}
        </div>
      );
    };

    // Störungs-Karte speisen: Streik zuerst, dann API-Störungen; generische Dauer-Hinweise raus
    const disruptionItems = [];
    if (config?.transit_strike_active && config?.transit_strike_text) {
      disruptionItems.push({ kind: 'strike', title: 'Streik im Nahverkehr', text: config.transit_strike_text, lines: [], all_lines: true });
    }
    (data?.disruptions || []).forEach(st => { if (!isGenericNotice(st)) disruptionItems.push(st); });
    // Priorität: Streik, hervorgehobene, dann Bild-Karten zuerst; danach durchschalten
    disruptionItems.sort((a, b) => (b.kind === 'strike') - (a.kind === 'strike')
      || (b.highlighted ? 1 : 0) - (a.highlighted ? 1 : 0)
      || (b.image ? 1 : 0) - (a.image ? 1 : 0));
    disruptionItems.splice(30);  // großzügiges Limit gegen Endlos-Rotation
    const disruptionPosition = config?.transit_disruption_position || 'bottom';
    const disruptionAsColumn = disruptionPosition === 'column' && disruptionItems.length > 0;

    return (
      <div className="fixed inset-0 overflow-hidden select-none cursor-none flex flex-col" style={{ background: '#0a0e17' }}>
        {overlays}

        {/* Header — mit schmaler Akzentlinie als Marken-Signatur (wie Slideshow) */}
        <div className="flex items-center justify-between px-6 py-2 shrink-0" style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(10,14,23,0.9) 100%)', borderBottom: `2px solid ${accent}` }}>
          <div className="flex items-center gap-4">
            {config?.show_logo && logoUrl && (
              <img src={logoUrl} alt="" className="h-8 object-contain" />
            )}
            <h1 className={`text-white font-display ${s.header} font-bold tracking-wide`}>{config?.name || config?.title || 'Abfahrten'}</h1>
          </div>
          <div className="flex items-center gap-5">
            {config?.show_weather && weather && (
              <div className="flex items-center gap-2 text-white/40 text-sm">
                {(() => { const WI = weather?.icon ? (weatherIcons[weather.icon] || Cloud) : Cloud; return <WI className="w-5 h-5" />; })()}
                <span className="text-white/60 font-medium">{weather.temperature}°C</span>
              </div>
            )}
            <div className={`text-white font-mono ${s.clock} font-bold tabular-nums tracking-tight`}>
              {time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Stationen — Spalten-Layout */}
        <div className="flex-1 overflow-hidden px-4 py-2">
          {columns.length > 0 ? (
            <div className="flex gap-3 h-full">
              {columns.map((colStations, colIdx) => (
                <div key={colIdx} className="flex-1 flex flex-col gap-2 min-w-0">
                  {colStations.map(station => (
                    <StationBlock key={station.station_id} station={station} compact={colStations.length > 1} />
                  ))}
                </div>
              ))}
              {disruptionAsColumn && (
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
                    <h2 className={`text-white/60 font-display ${s.station} font-bold uppercase tracking-[0.12em] truncate`}>Störungen &amp; Baumaßnahmen</h2>
                  </div>
                  <DisruptionCarousel items={disruptionItems} accent={accent} layout="column" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center text-white/15">
                <Train className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <div>Keine Stationen konfiguriert</div>
              </div>
            </div>
          )}
        </div>

        {/* Störungen / Baumaßnahmen / Streik — unten als Streifen (wenn nicht als Spalte konfiguriert) */}
        {!disruptionAsColumn && disruptionPosition !== 'column' && (
          <DisruptionCarousel items={disruptionItems} accent={accent} height="clamp(118px, 20vh, 240px)" />
        )}

        {/* Footer */}
        <div className="px-6 py-0.5 flex items-center justify-between text-white/[0.06] text-[8px] shrink-0">
          <span>{stations.reduce((sum, st) => sum + (st.departures?.length || 0), 0)} Verbindungen</span>
          <div className="flex items-center gap-3">
            {error && <span className="text-red-400/40">Verbindungsfehler</span>}
            {lastFetchTime && (
              <span>Aktualisiert {(() => {
                const sec = Math.round((time - lastFetchTime) / 1000);
                return sec < 5 ? 'gerade eben' : `vor ${sec}s`;
              })()}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ═══ STANDARD LAYOUT ══════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════

  const priorityColors = {
    urgent: { bg: `rgba(239,68,68,0.15)`, border: `rgba(239,68,68,0.4)` },
    important: { bg: `rgba(245,158,11,0.12)`, border: `rgba(245,158,11,0.3)` },
    normal: { bg: `rgba(59,130,246,0.08)`, border: `rgba(59,130,246,0.2)` },
  };

  const priorityIcons = {
    urgent: <AlertTriangle className="w-5 h-5 text-red-400" />,
    important: <Megaphone className="w-5 h-5 text-amber-400" />,
    normal: <Info className="w-5 h-5 text-blue-400" />,
  };

  // Neue Feature-Flags
  const hasFreeText = config?.show_free_text && (config?.free_text_title || config?.free_text_content);
  const hasQrCode = config?.show_qr_code && config?.qr_code_url;
  const hasBackgroundImage = config?.show_background_image && backgroundImageUrl;

  // Welche Spalten aktiv?
  const hasLeft = (config?.show_events && events.length > 0) || customCountdown;
  const hasMiddle = (config?.show_announcements && announcements.length > 0) || hasFreeText;
  const hasRight = (config?.show_webuntis && (config?.webuntis_url_resolved || config?.webuntis_url)) || (config?.show_pdf && pdfUrl) || (config?.show_slideshow && images.length > 0) || hasQrCode;

  const WeatherIcon = weather?.icon ? (weatherIcons[weather.icon] || Cloud) : Cloud;

  return (
    <div className="fixed inset-0 overflow-hidden select-none cursor-none" style={{ background: bgColor }}>

      {/* ═══ Hintergrundbild ═══ */}
      {hasBackgroundImage && (
        <div className="absolute inset-0 z-0">
          <img
            src={backgroundImageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: `${bgColor}cc` }} />
        </div>
      )}

      {overlays}

      {/* ═══ ON AIR ═══ */}

      {/* ═══ Header ═══ */}
      <div className={`relative z-10 flex items-center justify-between px-8 ${onAirIsBanner ? 'pt-20' : 'pt-6'} pb-4`}>
        <div className="flex items-center gap-5">
          {config?.show_logo && logoUrl && (
            <img src={logoUrl} alt="" className="h-14 object-contain" />
          )}
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{config?.title || 'Stagedesk'}</h1>
            {config?.subtitle && (
              <p className="text-white/40 text-sm mt-0.5">{config.subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-8">
          {/* Wetter */}
          {config?.show_weather && weather && (
            <div className="flex items-center gap-3 text-white/70">
              <WeatherIcon className="w-8 h-8" />
              <div>
                <div className="text-2xl font-bold text-white">{weather.temperature}°C</div>
                <div className="text-xs text-white/40">{weather.description}</div>
              </div>
            </div>
          )}

          {/* Uhr */}
          {config?.show_clock && (
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
          height: 'calc(100vh - 170px)',
          paddingTop: onAirIsBanner ? '0.75rem' : undefined,
        }}
      >

        {/* ─── Linke Spalte: Veranstaltungen ─── */}
        {hasLeft && (!isRotating || currentPage === 'main' || currentPage === 'events') && (
          <div className={`${hasRight ? 'w-1/3' : hasMiddle ? 'w-1/2' : 'flex-1'} flex flex-col gap-4 overflow-hidden`}>

            {/* Laufende */}
            {running.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
                  <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: accent }}>Aktuell laufend</h2>
                </div>
                <div className="space-y-2">
                  {running.map(v => (
                    <div key={v.id} className="rounded-xl p-4 border" style={{ background: `${accent}15`, borderColor: `${accent}30` }}>
                      <div className="font-semibold text-white text-lg">{v.name}</div>
                      {v.location && (
                        <div className="flex items-center gap-1.5 text-sm mt-1" style={{ color: `${accent}aa` }}>
                          <MapPin className="w-3.5 h-3.5" /> {v.location}
                        </div>
                      )}
                      {v.date_until && (
                        <div className="text-xs mt-1" style={{ color: `${accent}70` }}>
                          bis {new Date(v.date_until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
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
            {customCountdown && (
              <div className="rounded-xl p-4 border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">{customCountdown.name}</span>
                </div>
                <div className="text-3xl font-mono font-bold text-white">
                  {customCountdown.d > 0 && <>{customCountdown.d}<span className="text-white/30 text-xl">d </span></>}
                  {customCountdown.h > 0 && <>{customCountdown.h}<span className="text-white/30 text-xl">h </span></>}
                  {customCountdown.m}<span className="text-white/30 text-xl">m </span>
                  {customCountdown.s}<span className="text-white/30 text-xl">s</span>
                </div>
              </div>
            )}

            {/* Kommende */}
            {upcoming.length > 0 && (
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Nächste Veranstaltungen</h2>
                </div>
                <div className="space-y-2 overflow-y-auto max-h-full pr-2" style={{ scrollbarWidth: 'none' }}>
                  {upcoming.map(v => {
                    const isToday = new Date(v.date_from).toDateString() === new Date().toDateString();
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
                            {new Date(v.date_from).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                            {' '}
                            {new Date(v.date_from).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {v.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {v.location}
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

        {/* ─── Mittlere Spalte: Ankündigungen + Freitext ─── */}
        {hasMiddle && (!isRotating || currentPage === 'main' || currentPage === 'announcements' || currentPage === 'free_text') && (
          <div className={`${hasLeft && hasRight ? 'w-1/3' : hasLeft || hasRight ? 'w-1/2' : 'flex-1'} flex flex-col gap-3 overflow-hidden`}>
            {config?.show_announcements && announcements.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Megaphone className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Ankündigungen</h2>
                </div>
                <div className="space-y-3 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
                  {announcements.map(a => {
                    const pc = priorityColors[a.priority] || priorityColors.normal;
                    return (
                      <div key={a.id} className="rounded-xl p-5 border" style={{ background: pc.bg, borderColor: pc.border }}>
                        <div className="flex items-start gap-3">
                          {priorityIcons[a.priority] || priorityIcons.normal}
                          <div className="flex-1">
                            <div className="font-semibold text-white text-lg">{a.title}</div>
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
            {hasFreeText && (
              <div className="rounded-xl p-5 border border-white/10 bg-white/[0.04]">
                <div className="flex items-center gap-2 mb-3">
                  <AlignLeft className="w-4 h-4 text-teal-400" />
                  <h2 className="text-sm font-semibold text-teal-400 uppercase tracking-wider">
                    {config.free_text_title || 'Information'}
                  </h2>
                </div>
                {config.free_text_content && (
                  <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line">
                    {config.free_text_content}
                  </p>
                )}
              </div>
            )}

          </div>
        )}

        {/* Leer-Zustand */}
        {!hasLeft && !hasMiddle && !hasRight && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {config?.show_logo && logoUrl && (
                <img src={logoUrl} alt="" className="h-32 mx-auto mb-8 opacity-20" />
              )}
              <div className="text-white/10 text-6xl font-bold">Stagedesk</div>
            </div>
          </div>
        )}

        {/* ─── Rechte Spalte: WebUntis / PDF / Slideshow ─── */}
        {hasRight && (!isRotating || currentPage === 'main' || currentPage === 'slideshow' || currentPage === 'pdf' || currentPage === 'weather') && (
          <div className={`${hasLeft || hasMiddle ? (hasLeft && hasMiddle ? 'w-1/3' : 'w-1/2') : 'flex-1'} flex flex-col overflow-hidden`}>

            {/* WebUntis */}
            {config?.show_webuntis && (config?.webuntis_url_resolved || config?.webuntis_url) && (
              <div className="flex-1 flex flex-col overflow-hidden mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Stundenplan</h2>
                </div>
                <div className="flex-1 rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                  <WebUntisFrame url={config.webuntis_url_resolved || config.webuntis_url} zoom={config.webuntis_zoom}
                                 dark={config.webuntis_dark_mode} />
                </div>
              </div>
            )}

            {/* PDF */}
            {config?.show_pdf && pdfUrl && (
              <div className={`${config?.show_webuntis ? '' : 'flex-1'} flex flex-col overflow-hidden mb-4`}>
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
            {config?.show_slideshow && images.length > 0 && (
              <div className={`${config?.show_webuntis || config?.show_pdf ? '' : 'flex-1'} flex flex-col overflow-hidden`}>
                <div className="flex-1 rounded-xl overflow-hidden border border-white/10 relative min-h-[200px]">
                  {images.map((image, idx) => (
                    <img
                      key={image.id}
                      src={`${MEDIA_BASE}${image.file_url}`}
                      alt={image.name}
                      className="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000"
                      style={{ opacity: idx === slideshowIdx ? 1 : 0 }}
                    />
                  ))}
                  {images.length > 1 && (
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                      {images.map((_, idx) => (
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

      {/* ═══ Seitenrotation Indikator ═══ */}
      {isRotating && (
        <div className="absolute bottom-10 left-0 right-0 z-20 flex justify-center gap-2">
          {rotationPages.map((page, idx) => (
            <div key={page} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
                idx === rotationIdx % rotationPages.length ? 'bg-white/60 scale-125' : 'bg-white/15'
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
          <span>Auto-Refresh alle {config?.refresh_interval || 30}s</span>
        </div>
      </div>
    </div>
  );
}
