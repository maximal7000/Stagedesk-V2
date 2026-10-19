/**
 * PDF-Vollbild fürs Monitor-Modul.
 * Rendert PDF-Seiten per pdf.js auf Canvas — mit Seiten-Steuerung:
 *  - mode 'cycle':      Seiten automatisch weiterschalten (interval)
 *  - mode 'static':     eine feste Seite
 *  - mode 'selection':  nur bestimmte Seiten (pages="1,3,5-7")
 *  - perScreen 1 oder 2: eine oder zwei Seiten nebeneinander
 */
import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

// "1,3,5-7" -> [1,3,5,6,7], geklammert auf 1..max, dedupe, Reihenfolge erhalten
function parsePages(str, max) {
  const out = [];
  const seen = new Set();
  (str || '').split(',').forEach(part => {
    part = part.trim();
    if (!part) return;
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1]), b = parseInt(m[2]);
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) push(p);
    } else if (/^\d+$/.test(part)) {
      push(parseInt(part));
    }
  });
  function push(p) {
    if (p >= 1 && p <= max && !seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}

export default function PdfFullscreen({
  url, mode = 'cycle', interval = 10,
  perScreen = 1, pages = '', staticPage = 1,
}) {
  const [pdf, setPdf] = useState(null);
  const [views, setViews] = useState([]);   // [[1],[2],...] oder [[1,2],[3,4],...]
  const [viewIdx, setViewIdx] = useState(0);
  const [tick, setTick] = useState(0);       // Re-Render bei Resize
  const containerRef = useRef(null);
  const canvasRefs = useRef([]);

  // PDF laden
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setPdf(null); setViews([]); setViewIdx(0);
    pdfjsLib.getDocument(url).promise
      .then(doc => { if (!cancelled) setPdf(doc); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  // Seiten-Ansichten bauen
  useEffect(() => {
    if (!pdf) return;
    const n = pdf.numPages;
    const per = Math.min(Math.max(1, perScreen || 1), 3);

    if (mode === 'static') {
      const start = Math.min(Math.max(1, staticPage || 1), n);
      const grp = [];
      for (let p = start; p < start + per && p <= n; p++) grp.push(p);
      setViews([grp]); setViewIdx(0);
      return;
    }
    const parsed = parsePages(pages, n);
    const shown = (parsed.length && (mode === 'selection' || mode === 'cycle'))
      ? parsed
      : Array.from({ length: n }, (_, i) => i + 1);
    const grouped = [];
    for (let i = 0; i < shown.length; i += per) grouped.push(shown.slice(i, i + per));
    setViews(grouped); setViewIdx(0);
  }, [pdf, mode, pages, perScreen, staticPage]);

  // Automatisch weiterschalten
  useEffect(() => {
    if (mode === 'static' || views.length <= 1) return;
    const t = setInterval(
      () => setViewIdx(i => (i + 1) % views.length),
      Math.max(2, interval || 10) * 1000
    );
    return () => clearInterval(t);
  }, [views, interval, mode]);

  // Resize -> neu rendern
  useEffect(() => {
    const onR = () => setTick(t => t + 1);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  // Aktuelle Ansicht rendern
  useEffect(() => {
    const current = views[viewIdx];
    const container = containerRef.current;
    if (!pdf || !current || !container) return;
    let cancelled = false;
    const dpr = window.devicePixelRatio || 1;
    const gaps = (current.length - 1) * 16;
    const availH = container.clientHeight;
    const availW = (container.clientWidth - gaps) / current.length;

    current.forEach((pageNum, i) => {
      pdf.getPage(pageNum).then(page => {
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(availW / base.width, availH / base.height);
        const vp = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRefs.current[i];
        if (!canvas) return;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = Math.floor(vp.width / dpr) + 'px';
        canvas.style.height = Math.floor(vp.height / dpr) + 'px';
        page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [pdf, views, viewIdx, tick, perScreen]);

  if (!url) return null;
  const currentPages = views[viewIdx] || [];
  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center gap-4">
      {currentPages.map((p, i) => (
        <canvas key={`${viewIdx}-${i}`} ref={el => (canvasRefs.current[i] = el)}
                className="shadow-2xl rounded-sm bg-white" />
      ))}
      {!pdf && <div className="text-white/40 text-2xl">PDF wird geladen …</div>}
    </div>
  );
}
