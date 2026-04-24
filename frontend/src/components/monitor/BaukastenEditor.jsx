/**
 * Editor für den Widget-Baukasten. Drag/Resize via react-grid-layout.
 * Änderungen werden via onChange an den Parent gemeldet.
 */
import { useMemo, useState, useEffect } from 'react';
import GridLayout from 'react-grid-layout';
import BaukastenWidget, { WIDGET_TYPES, widgetDefault, widgetLabel } from './BaukastenWidget';
import { Plus, Trash2, Settings, X } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function BaukastenEditor({
  widgets = [],
  cols = 24,
  rowHeight = 40,
  onChange,
  onColsChange,
  onRowHeightChange,
}) {
  const [selected, setSelected] = useState(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    const el = document.getElementById('baukasten-editor-wrap');
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setWidth(Math.max(400, entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => widgets.map(w => ({
    i: w.i, x: Number(w.x) || 0, y: Number(w.y) || 0,
    w: Number(w.w) || 6, h: Number(w.h) || 4,
  })), [widgets]);

  const addWidget = (type) => {
    const size = widgetDefault(type);
    const newW = {
      i: uid(),
      type,
      x: 0, y: Infinity, // packt am Ende
      w: size.w, h: size.h,
      config: {},
    };
    onChange([...widgets, newW]);
  };

  const removeWidget = (id) => {
    onChange(widgets.filter(w => w.i !== id));
    if (selected === id) setSelected(null);
  };

  const updateConfig = (id, patch) => {
    onChange(widgets.map(w => w.i === id ? { ...w, config: { ...(w.config || {}), ...patch } } : w));
  };

  const handleLayoutChange = (newLayout) => {
    onChange(widgets.map(w => {
      const l = newLayout.find(x => x.i === w.i);
      if (!l) return w;
      return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
    }));
  };

  const selectedWidget = widgets.find(w => w.i === selected);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="relative">
          <details className="group">
            <summary className="list-none cursor-pointer px-3 py-2 rounded-md bg-accent/20 text-accent text-sm font-medium hover:bg-accent/30 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Widget hinzufügen
            </summary>
            <div className="absolute left-0 top-full mt-1 z-20 w-64 max-h-80 overflow-auto rounded-lg bg-slate-800 border border-white/10 shadow-xl p-1">
              {WIDGET_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => addWidget(t.type)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-white/10 text-white/90 text-sm flex items-center gap-2"
                  >
                    <Icon className="w-4 h-4" /> {t.label}
                  </button>
                );
              })}
            </div>
          </details>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <label>Spalten
            <input
              type="number" min={6} max={48} value={cols}
              onChange={e => onColsChange?.(parseInt(e.target.value, 10) || 24)}
              className="ml-2 w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-white"
            />
          </label>
          <label>Zeilenhöhe
            <input
              type="number" min={20} max={120} value={rowHeight}
              onChange={e => onRowHeightChange?.(parseInt(e.target.value, 10) || 40)}
              className="ml-2 w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-white"
            />
          </label>
        </div>
        <div className="ml-auto text-xs text-white/40">
          {widgets.length} Widget{widgets.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Grid-Editor */}
        <div id="baukasten-editor-wrap"
             className="rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden min-h-[400px] relative">
          {widgets.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-white/40 text-sm">
              Noch keine Widgets. Oben „Widget hinzufügen" klicken.
            </div>
          ) : (
            <GridLayout
              className="layout"
              layout={layout}
              cols={cols}
              rowHeight={rowHeight}
              width={width}
              margin={[8, 8]}
              onLayoutChange={handleLayoutChange}
              draggableCancel=".widget-action"
            >
              {widgets.map(w => (
                <div
                  key={w.i}
                  onClick={() => setSelected(w.i)}
                  className={`relative cursor-move ring-2 ${selected === w.i ? 'ring-accent' : 'ring-transparent hover:ring-white/20'} rounded-xl transition`}
                >
                  <div className="absolute top-1 right-1 z-10 flex gap-1">
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); removeWidget(w.i); }}
                      className="widget-action p-1 rounded bg-red-500/80 hover:bg-red-600 text-white"
                      title="Entfernen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="absolute top-1 left-1 z-10 text-[10px] px-2 py-0.5 rounded bg-black/50 text-white/80 font-mono">
                    {widgetLabel(w.type)}
                  </div>
                  <BaukastenWidget widget={w} data={null} config={{}} accent="#da1f3d" mediaBase="" time={new Date()} />
                </div>
              ))}
            </GridLayout>
          )}
        </div>

        {/* Inspector */}
        <div className="rounded-lg border border-white/10 bg-slate-800/50 p-4 space-y-3">
          {!selectedWidget ? (
            <div className="text-white/40 text-sm">Widget anklicken zum Bearbeiten.</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Settings className="w-4 h-4" />
                  <span className="font-medium">{widgetLabel(selectedWidget.type)}</span>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="text-white/40 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <WidgetInspector widget={selectedWidget} onUpdate={(patch) => updateConfig(selectedWidget.i, patch)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WidgetInspector({ widget, onUpdate }) {
  const cfg = widget.config || {};
  const input = (label, key, type = 'text') => (
    <label className="block text-xs text-white/60">
      {label}
      <input
        type={type}
        value={cfg[key] ?? ''}
        onChange={e => onUpdate({ [key]: e.target.value })}
        className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
      />
    </label>
  );
  const area = (label, key) => (
    <label className="block text-xs text-white/60">
      {label}
      <textarea
        value={cfg[key] ?? ''} rows={4}
        onChange={e => onUpdate({ [key]: e.target.value })}
        className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
      />
    </label>
  );

  switch (widget.type) {
    case 'titel':
      return <div className="space-y-3">{input('Text', 'text')}{input('Farbe (Hex)', 'farbe')}</div>;
    case 'freitext':
      return <div className="space-y-3">{input('Titel', 'titel')}{area('Inhalt', 'inhalt')}</div>;
    case 'kamera':
      return (
        <div className="space-y-3">
          {input('Titel', 'titel')}
          {input('URL', 'url')}
          <label className="block text-xs text-white/60">Typ
            <select value={cfg.typ || 'img'} onChange={e => onUpdate({ typ: e.target.value })}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm">
              <option value="img">MJPEG / Bild-Stream</option>
              <option value="video">HLS / MP4</option>
              <option value="iframe">iframe</option>
            </select>
          </label>
        </div>
      );
    case 'qr_code':
      return <div className="space-y-3">{input('URL', 'url')}{input('Label', 'label')}</div>;
    case 'pdf':
      return <div className="space-y-3">{input('PDF-URL (leer = Profil-PDF)', 'url')}</div>;
    case 'iframe':
      return (
        <div className="space-y-3">
          {input('URL', 'url')}
          {input('Titel', 'titel')}
          {input('Zoom (%)', 'zoom', 'number')}
        </div>
      );
    case 'bild':
      return <div className="space-y-3">{input('URL', 'url')}{input('Alt-Text', 'alt')}</div>;
    case 'eigener_countdown':
      return <div className="space-y-3">{input('Name (leer = Profil)', 'name')}</div>;
    default:
      return <div className="text-white/40 text-xs">Dieses Widget hat keine Konfiguration. Position und Größe per Drag.</div>;
  }
}
