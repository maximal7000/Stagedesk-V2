// Official SWL line colours (Stadtverkehr Lübeck, source: swhl.de mobil/linien)
export const SWL_LINE_COLORS = {
  '1': '#00b1eb', '3': '#00a070', '4': '#13a538', '5': '#004f9f', '6': '#13a538',
  '7': '#82338b', '8': '#13a538', '9': '#00b1eb', '10': '#00b1eb', '11': '#e7343f',
  '12': '#ec6608', '15': '#a00057', '16': '#13a538', '17': '#ea5297', '18': '#ae0f0a',
  '21': '#e7343f', '24': '#00a070', '25': '#a00057', '26': '#13a538', '30': '#a2bf1a',
  '31': '#e7343f', '33': '#055a1c', '34': '#0069b4', '35': '#a00057', '38': '#e84e0f',
  '40': '#a2bf1a', '41': '#e7343f', '50': '#a2bf1a',
};

export function chipTextColor(hex) {
  try {
    const h = String(hex).replace('#', '');
    const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(f.slice(0, 2), 16), g = parseInt(f.slice(2, 4), 16), b = parseInt(f.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0a0e17' : '#ffffff';
  } catch { return '#ffffff'; }
}

export function swlColorForLine(name) {
  const k = String(name || '').toLowerCase().replace(/^(bus|linie|tram)\s+/i, '').trim();
  return SWL_LINE_COLORS[k] || null;
}
