/**
 * BaukastenWidget — Rendert einen einzelnen Widget-Typ innerhalb eines
 * Grid-Kachel-Containers. Beide BaukastenRenderer (Monitor) und
 * BaukastenEditor (Admin) nutzen das.
 */
import { Clock, Calendar, Megaphone, Info, Timer, FileText, QrCode, AlignLeft, Image as ImageIcon, Video, Cloud, Radio, LayoutGrid } from 'lucide-react';

export const WIDGET_TYPES = [
  { type: 'uhr', label: 'Uhr', icon: Clock, defaultSize: { w: 4, h: 3 } },
  { type: 'logo', label: 'Logo', icon: ImageIcon, defaultSize: { w: 4, h: 3 } },
  { type: 'titel', label: 'Titel / Überschrift', icon: AlignLeft, defaultSize: { w: 8, h: 2 } },
  { type: 'freitext', label: 'Freier Text', icon: AlignLeft, defaultSize: { w: 6, h: 4 } },
  { type: 'veranstaltungen', label: 'Veranstaltungen', icon: Calendar, defaultSize: { w: 8, h: 8 } },
  { type: 'ankuendigungen', label: 'Ankündigungen', icon: Megaphone, defaultSize: { w: 8, h: 6 } },
  { type: 'countdown', label: 'Countdown nächste Ver.', icon: Timer, defaultSize: { w: 6, h: 3 } },
  { type: 'eigener_countdown', label: 'Eigener Countdown', icon: Timer, defaultSize: { w: 6, h: 3 } },
  { type: 'wetter', label: 'Wetter', icon: Cloud, defaultSize: { w: 4, h: 4 } },
  { type: 'kamera', label: 'Kamera-Stream', icon: Video, defaultSize: { w: 8, h: 6 } },
  { type: 'qr_code', label: 'QR-Code', icon: QrCode, defaultSize: { w: 4, h: 5 } },
  { type: 'pdf', label: 'PDF', icon: FileText, defaultSize: { w: 8, h: 8 } },
  { type: 'iframe', label: 'Webseite (iframe)', icon: LayoutGrid, defaultSize: { w: 10, h: 8 } },
  { type: 'bild', label: 'Bild', icon: ImageIcon, defaultSize: { w: 6, h: 6 } },
  { type: 'onair', label: 'ON AIR Status', icon: Radio, defaultSize: { w: 6, h: 3 } },
];

export function widgetLabel(type) {
  return WIDGET_TYPES.find(w => w.type === type)?.label || type;
}

export function widgetDefault(type) {
  const t = WIDGET_TYPES.find(w => w.type === type);
  return t?.defaultSize || { w: 6, h: 4 };
}

function fmtTime(d) {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(d) {
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export default function BaukastenWidget({ widget, data, config, accent, mediaBase, time }) {
  const cfg = widget.config || {};
  const type = widget.type;
  const now = time || new Date();

  const Wrap = ({ children, padding = 'p-4', title = null }) => (
    <div className="w-full h-full rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
      {title && (
        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/60 border-b border-white/10 shrink-0">
          {title}
        </div>
      )}
      <div className={`flex-1 overflow-hidden ${padding}`}>{children}</div>
    </div>
  );

  if (type === 'uhr') {
    return (
      <div className="w-full h-full rounded-xl border border-white/10 bg-white/[0.03] flex flex-col items-center justify-center">
        <div className="text-5xl lg:text-6xl font-light text-white tabular-nums tracking-tight">{fmtTime(now)}</div>
        <div className="text-white/50 text-sm mt-2">{fmtDate(now)}</div>
      </div>
    );
  }

  if (type === 'logo') {
    const logoUrl = config?.logo_url_resolved
      ? (config.logo_url_resolved.startsWith('http') ? config.logo_url_resolved : `${mediaBase}${config.logo_url_resolved}`)
      : '';
    return (
      <div className="w-full h-full flex items-center justify-center p-4">
        {logoUrl ? <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                 : <span className="text-white/30">Kein Logo</span>}
      </div>
    );
  }

  if (type === 'titel') {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <h1 className="text-4xl lg:text-5xl font-black text-white text-center" style={{ color: cfg.farbe || undefined }}>
          {cfg.text || config?.titel || 'Stagedesk Monitor'}
        </h1>
      </div>
    );
  }

  if (type === 'freitext') {
    return (
      <Wrap title={cfg.titel || config?.freitext_titel}>
        <p className="text-white/90 whitespace-pre-line leading-relaxed">
          {cfg.inhalt || config?.freitext_inhalt || ''}
        </p>
      </Wrap>
    );
  }

  if (type === 'veranstaltungen') {
    const events = data?.veranstaltungen || [];
    return (
      <Wrap title="Veranstaltungen">
        {events.length === 0 ? (
          <div className="text-white/40 text-sm">Keine anstehenden Veranstaltungen</div>
        ) : (
          <ul className="space-y-2 text-white/90">
            {events.map(v => (
              <li key={v.id} className="flex justify-between items-baseline gap-2 text-sm">
                <span className="truncate">{v.name}</span>
                <span className="text-white/50 tabular-nums shrink-0">
                  {v.datum_von && new Date(v.datum_von).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Wrap>
    );
  }

  if (type === 'ankuendigungen') {
    const list = data?.ankuendigungen || [];
    return (
      <Wrap title="Ankündigungen">
        {list.length === 0 ? (
          <div className="text-white/40 text-sm">Keine Ankündigungen</div>
        ) : (
          <ul className="space-y-3">
            {list.map(a => (
              <li key={a.id}>
                <div className="font-semibold text-white">{a.titel}</div>
                {a.text && <div className="text-white/70 text-sm mt-1 whitespace-pre-line">{a.text}</div>}
              </li>
            ))}
          </ul>
        )}
      </Wrap>
    );
  }

  if (type === 'countdown' || type === 'eigener_countdown') {
    let target = null;
    let name = cfg.name || 'Countdown';
    if (type === 'eigener_countdown') {
      target = config?.eigener_countdown_datum ? new Date(config.eigener_countdown_datum) : null;
      name = config?.eigener_countdown_name || name;
    } else {
      const first = (data?.veranstaltungen || []).find(v => v.datum_von && !v.ist_laufend);
      if (first) { target = new Date(first.datum_von); name = first.name; }
    }
    if (!target) return <Wrap><span className="text-white/40 text-sm">Kein Countdown-Ziel</span></Wrap>;
    const diff = Math.max(0, target - now);
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return (
      <Wrap title={name}>
        <div className="flex items-center justify-around h-full text-white">
          {[['Tage', d], ['Std', h], ['Min', m]].map(([l, v]) => (
            <div key={l} className="text-center">
              <div className="text-4xl font-bold tabular-nums" style={{ color: accent }}>{String(v).padStart(2, '0')}</div>
              <div className="text-white/50 text-xs uppercase">{l}</div>
            </div>
          ))}
        </div>
      </Wrap>
    );
  }

  if (type === 'wetter') {
    const w = data?.wetter;
    if (!w) return <Wrap title="Wetter"><span className="text-white/40 text-sm">Kein Wetter verfügbar</span></Wrap>;
    return (
      <Wrap title={w.stadt || 'Wetter'}>
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-5xl font-light text-white tabular-nums">{Math.round(w.temperatur)}°</div>
          <div className="text-white/60 text-sm mt-2">{w.beschreibung}</div>
        </div>
      </Wrap>
    );
  }

  if (type === 'kamera') {
    const url = cfg.url || config?.kamera_url;
    const typ = cfg.typ || config?.kamera_typ || 'img';
    const titel = cfg.titel || config?.kamera_titel;
    if (!url) return <Wrap title={titel || 'Kamera'}><span className="text-white/40 text-sm">Keine Kamera-URL</span></Wrap>;
    return (
      <div className="w-full h-full rounded-xl overflow-hidden border border-white/10 bg-black flex flex-col">
        {titel && <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/70 border-b border-white/10 shrink-0">{titel}</div>}
        <div className="flex-1 min-h-0">
          {typ === 'video' ? (
            <video src={url} autoPlay muted playsInline loop className="w-full h-full object-contain" />
          ) : typ === 'iframe' ? (
            <iframe src={url} className="w-full h-full border-0" title={titel || 'Kamera'} />
          ) : (
            <img src={url} alt={titel || 'Kamera'} className="w-full h-full object-contain" />
          )}
        </div>
      </div>
    );
  }

  if (type === 'qr_code') {
    const url = cfg.url || config?.qr_code_url;
    const label = cfg.label || config?.qr_code_label;
    if (!url) return <Wrap title={label || 'QR-Code'}><span className="text-white/40 text-sm">Keine URL</span></Wrap>;
    return (
      <Wrap title={label || 'QR-Code'}>
        <div className="flex flex-col items-center justify-center h-full">
          <div className="bg-white rounded-xl p-3">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`}
              alt="QR"
              className="w-full h-full max-w-[180px] max-h-[180px]"
            />
          </div>
          {label && <div className="text-white/50 text-xs mt-3">{label}</div>}
        </div>
      </Wrap>
    );
  }

  if (type === 'pdf') {
    const url = cfg.url || config?.pdf_url_resolved;
    const full = url?.startsWith('http') ? url : `${mediaBase}${url || ''}`;
    if (!url) return <Wrap title="PDF"><span className="text-white/40 text-sm">Kein PDF</span></Wrap>;
    return (
      <div className="w-full h-full rounded-xl overflow-hidden border border-white/10 bg-white">
        <iframe src={full} className="w-full h-full border-0" title="PDF" />
      </div>
    );
  }

  if (type === 'iframe') {
    const url = cfg.url || config?.webuntis_url;
    if (!url) return <Wrap><span className="text-white/40 text-sm">Keine URL</span></Wrap>;
    return (
      <div className="w-full h-full rounded-xl overflow-hidden border border-white/10 bg-white">
        <iframe src={url} className="w-full h-full border-0" title={cfg.titel || 'Frame'}
          style={{ zoom: (cfg.zoom || 100) / 100 }} />
      </div>
    );
  }

  if (type === 'bild') {
    const url = cfg.url;
    if (!url) return <Wrap><span className="text-white/40 text-sm">Keine Bild-URL</span></Wrap>;
    return (
      <div className="w-full h-full rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center">
        <img src={url} alt={cfg.alt || ''} className="w-full h-full object-contain" />
      </div>
    );
  }

  if (type === 'onair') {
    const active = config?.ist_on_air;
    const farbe = config?.on_air_farbe || accent || '#da1f3d';
    return (
      <div className="w-full h-full rounded-xl border border-white/10 flex items-center justify-center"
           style={{ background: active ? farbe : 'rgba(255,255,255,0.03)' }}>
        <div className="text-center">
          <Radio className={`w-8 h-8 mx-auto mb-2 ${active ? 'text-white animate-pulse' : 'text-white/30'}`} />
          <div className={`text-2xl font-bold tracking-[0.3em] ${active ? 'text-white' : 'text-white/30'}`}>
            {config?.on_air_text || 'ON AIR'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded-xl border border-yellow-500/40 bg-yellow-500/5 flex items-center justify-center">
      <span className="text-yellow-300/70 text-sm">Unbekanntes Widget: {type}</span>
    </div>
  );
}
