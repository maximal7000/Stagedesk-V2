/**
 * Read-only Baukasten-Layout für den öffentlichen Monitor.
 * Nutzt react-grid-layout im 'static' Modus.
 */
import { useMemo, useEffect, useState } from 'react';
import GridLayout from 'react-grid-layout';
import BaukastenWidget from './BaukastenWidget';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

export default function BaukastenRenderer({ data, config, accent, mediaBase }) {
  const widgets = Array.isArray(config?.layout_widgets) ? config.layout_widgets : [];
  const cols = config?.baukasten_spalten || 24;
  const rowHeight = config?.baukasten_zeilenhoehe || 40;

  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1920);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const layout = useMemo(() => widgets.map(w => ({
    i: w.i || String(w.id || Math.random()),
    x: Number(w.x) || 0,
    y: Number(w.y) || 0,
    w: Number(w.w) || 6,
    h: Number(w.h) || 4,
    static: true,
  })), [widgets]);

  if (widgets.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">
        Baukasten-Layout ist leer. Widgets im Admin hinzufügen.
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto">
      <GridLayout
        className="layout"
        layout={layout}
        cols={cols}
        rowHeight={rowHeight}
        width={width}
        margin={[12, 12]}
        isDraggable={false}
        isResizable={false}
      >
        {widgets.map(w => (
          <div key={w.i || String(w.id)}>
            <BaukastenWidget
              widget={w}
              data={data}
              config={config}
              accent={accent}
              mediaBase={mediaBase}
              time={time}
            />
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
