/**
 * Ausleihe-Kalender: Monatsansicht aller Ausleihen und Reservierungen
 * Farbcodiert nach Status (aktiv, ueberfaellig, reserviert)
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/api';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Erzeugt alle Tage fuer das Kalender-Grid eines Monats,
 * inklusive Auffuell-Tage aus Vor-/Folgemonat (Woche beginnt mit Montag).
 */
function getMonthGridDays(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Wochentag des 1. (0=So,...,6=Sa) -> umrechnen auf Mo=0
  let startWeekday = firstOfMonth.getDay(); // 0=So
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1; // Mo=0 ... So=6

  const days = [];

  // Tage aus dem Vormonat
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, currentMonth: false });
  }

  // Tage des aktuellen Monats
  for (let d = 1; d <= lastOfMonth.getDate(); d++) {
    days.push({ date: new Date(year, month, d), currentMonth: true });
  }

  // Tage aus dem Folgemonat bis das Grid voll ist (immer volle Wochen)
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date;
    const next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    days.push({ date: next, currentMonth: false });
  }

  return days;
}

/** Datums-String (YYYY-MM-DD) aus einem Date-Objekt (lokale Zeitzone) */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Prueft ob zwei Dates denselben Kalendertag repraesentieren */
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Parst ein Datum-String (YYYY-MM-DD oder ISO) in ein Date-Objekt (lokale Zeitzone, Mitternacht) */
function parseLocalDate(str) {
  if (!str) return null;
  // Falls ISO-String mit Zeit: nur den Datums-Teil nehmen
  const dateOnly = str.slice(0, 10);
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function AusleiheKalenderPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-basiert

  const [loading, setLoading] = useState(true);
  const [ausleihen, setAusleihen] = useState([]);
  const [reservierungen, setReservierungen] = useState([]);

  // Popup
  const [popup, setPopup] = useState(null); // { entry, type, x, y }

  // Monat-String fuer die API: "2026-02"
  const monatParam = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Daten laden
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get(`/inventar/ausleihen/kalender?monat=${monatParam}`)
      .then((res) => {
        if (cancelled) return;
        setAusleihen(res.data.ausleihen || []);
        setReservierungen(res.data.reservierungen || []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Kalender laden fehlgeschlagen:', err);
        toast.error('Kalender konnte nicht geladen werden');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [monatParam]);

  // Grid-Tage berechnen
  const gridDays = useMemo(() => getMonthGridDays(year, month), [year, month]);

  // Eintraege pro Tag vorberechnen
  const entriesByDate = useMemo(() => {
    const map = {}; // dateKey -> Array<{ entry, type }>

    const addToRange = (startDate, endDate, entry, type) => {
      if (!startDate) return;
      const cursor = new Date(startDate);
      const end = endDate || new Date(year, month + 2, 0); // falls kein Ende: bis Monatsende + Puffer
      while (cursor <= end) {
        const key = toDateKey(cursor);
        if (!map[key]) map[key] = [];
        map[key].push({ entry, type });
        cursor.setDate(cursor.getDate() + 1);
      }
    };

    for (const a of ausleihen) {
      const start = parseLocalDate(a.erstellt_am);
      const end = a.frist ? parseLocalDate(a.frist) : null;
      const isOverdue =
        a.status === 'ueberfaellig' ||
        (a.status === 'aktiv' && a.frist && parseLocalDate(a.frist) < today);
      const type = isOverdue ? 'overdue' : 'ausleihe';
      addToRange(start, end, a, type);
    }

    for (const r of reservierungen) {
      const start = parseLocalDate(r.datum_von);
      const end = parseLocalDate(r.datum_bis);
      addToRange(start, end, r, 'reservierung');
    }

    return map;
  }, [ausleihen, reservierungen, year, month]);

  // Navigation
  const goToPrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
    setPopup(null);
  };

  const goToNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
    setPopup(null);
  };

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setPopup(null);
  };

  // Entry-Klick
  const handleEntryClick = (e, entry, type) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({
      entry,
      type,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 4,
    });
  };

  // Hintergrund-Klick schliesst Popup
  const handleBackgroundClick = () => {
    setPopup(null);
  };

  // Stil-Klassen fuer die Eintrags-Typen
  const entryStyles = {
    ausleihe: 'bg-blue-500/30 text-blue-300 hover:bg-blue-500/50',
    overdue: 'bg-red-500/30 text-red-300 hover:bg-red-500/50',
    reservierung: 'bg-yellow-500/30 text-yellow-300 hover:bg-yellow-500/50',
  };

  const entryLabels = {
    ausleihe: 'Ausleihe',
    overdue: 'Ueberfaellig',
    reservierung: 'Reservierung',
  };

  return (
    <div className="space-y-4" onClick={handleBackgroundClick}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Calendar className="w-7 h-7 text-blue-400" />
            Ausleihe-Kalender
          </h1>
          <p className="text-gray-400 mt-1">
            Ausleihen und Reservierungen im Monatsueberblick
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4">
        <button
          onClick={goToPrevMonth}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white">
            {MONATSNAMEN[month]} {year}
          </h2>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded transition-colors"
          >
            Heute
          </button>
        </div>

        <button
          onClick={goToNextMonth}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-blue-500/50" />
          <span className="text-gray-400">Aktive Ausleihe</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-red-500/50" />
          <span className="text-gray-400">Ueberfaellig</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-yellow-500/50" />
          <span className="text-gray-400">Reservierung</span>
        </span>
      </div>

      {/* Kalender */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {/* Wochentage Header */}
          <div className="grid grid-cols-7 border-b border-gray-800">
            {WOCHENTAGE.map((tag) => (
              <div
                key={tag}
                className="p-3 text-center text-sm font-medium text-gray-400 bg-gray-800/50"
              >
                {tag}
              </div>
            ))}
          </div>

          {/* Tage-Grid */}
          <div className="grid grid-cols-7">
            {gridDays.map((dayInfo, idx) => {
              const { date, currentMonth } = dayInfo;
              const dateKey = toDateKey(date);
              const isToday = isSameDay(date, today);
              const dayEntries = entriesByDate[dateKey] || [];

              // Deduplizieren: gleiche entry-ID + type nur einmal zeigen
              const seen = new Set();
              const uniqueEntries = dayEntries.filter(({ entry, type }) => {
                const key = `${type}-${entry.id}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });

              return (
                <div
                  key={idx}
                  className={`min-h-[100px] p-2 border-b border-r border-gray-800 transition-colors ${
                    currentMonth ? 'bg-gray-900' : 'bg-gray-950'
                  } ${isToday ? 'ring-1 ring-inset ring-blue-500' : ''}`}
                >
                  {/* Tageszahl */}
                  <div
                    className={`text-sm font-medium mb-1 ${
                      isToday
                        ? 'w-7 h-7 flex items-center justify-center bg-blue-600 text-white rounded-full'
                        : currentMonth
                          ? 'text-white'
                          : 'text-gray-700'
                    }`}
                  >
                    {date.getDate()}
                  </div>

                  {/* Eintraege */}
                  <div className="space-y-1">
                    {uniqueEntries.slice(0, 3).map(({ entry, type }) => (
                      <button
                        key={`${type}-${entry.id}`}
                        onClick={(e) => handleEntryClick(e, entry, type)}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[11px] font-medium truncate cursor-pointer transition-colors ${entryStyles[type]}`}
                        title={
                          type === 'reservierung'
                            ? `${entry.item__name || 'Reservierung'} - ${entry.ausleiher_name}`
                            : `${entry.ausleiher_name}${entry.zweck ? ` - ${entry.zweck}` : ''}`
                        }
                      >
                        {type === 'reservierung'
                          ? entry.item__name || entry.ausleiher_name
                          : entry.ausleiher_name}
                      </button>
                    ))}
                    {uniqueEntries.length > 3 && (
                      <div className="text-[10px] text-gray-500 px-1">
                        +{uniqueEntries.length - 3} weitere
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Popup / Tooltip */}
      {popup && (
        <div
          className="fixed z-50"
          style={{
            left: Math.min(popup.x - 140, window.innerWidth - 300),
            top: popup.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-4 space-y-3">
            {/* Typ-Badge */}
            <div className="flex items-center justify-between">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  popup.type === 'ausleihe'
                    ? 'bg-blue-500/30 text-blue-300'
                    : popup.type === 'overdue'
                      ? 'bg-red-500/30 text-red-300'
                      : 'bg-yellow-500/30 text-yellow-300'
                }`}
              >
                {entryLabels[popup.type]}
              </span>
              <button
                onClick={() => setPopup(null)}
                className="text-gray-500 hover:text-white text-sm"
              >
                &times;
              </button>
            </div>

            {popup.type === 'reservierung' ? (
              <>
                <div>
                  <div className="text-xs text-gray-400">Item</div>
                  <div className="text-sm text-white font-medium">
                    {popup.entry.item__name || '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Ausleiher</div>
                  <div className="text-sm text-white">
                    {popup.entry.ausleiher_name}
                  </div>
                </div>
                <div className="flex gap-4">
                  <div>
                    <div className="text-xs text-gray-400">Von</div>
                    <div className="text-sm text-white">
                      {popup.entry.datum_von
                        ? parseLocalDate(popup.entry.datum_von)?.toLocaleDateString('de-DE')
                        : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Bis</div>
                    <div className="text-sm text-white">
                      {popup.entry.datum_bis
                        ? parseLocalDate(popup.entry.datum_bis)?.toLocaleDateString('de-DE')
                        : '-'}
                    </div>
                  </div>
                </div>
                {popup.entry.zweck && (
                  <div>
                    <div className="text-xs text-gray-400">Zweck</div>
                    <div className="text-sm text-white">{popup.entry.zweck}</div>
                  </div>
                )}
                {popup.entry.item_id && (
                  <Link
                    to={`/inventar/${popup.entry.item_id}`}
                    className="block text-center px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    onClick={() => setPopup(null)}
                  >
                    Zum Item
                  </Link>
                )}
              </>
            ) : (
              <>
                <div>
                  <div className="text-xs text-gray-400">Ausleiher</div>
                  <div className="text-sm text-white font-medium">
                    {popup.entry.ausleiher_name}
                  </div>
                </div>
                {popup.entry.zweck && (
                  <div>
                    <div className="text-xs text-gray-400">Zweck</div>
                    <div className="text-sm text-white">{popup.entry.zweck}</div>
                  </div>
                )}
                <div className="flex gap-4">
                  <div>
                    <div className="text-xs text-gray-400">Erstellt</div>
                    <div className="text-sm text-white">
                      {popup.entry.erstellt_am
                        ? parseLocalDate(popup.entry.erstellt_am)?.toLocaleDateString('de-DE')
                        : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Frist</div>
                    <div className="text-sm text-white">
                      {popup.entry.frist
                        ? parseLocalDate(popup.entry.frist)?.toLocaleDateString('de-DE')
                        : 'Keine'}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Status</div>
                  <div className="text-sm text-white">
                    {popup.entry.status || '-'}
                  </div>
                </div>
                <Link
                  to={`/ausleihen/${popup.entry.id}`}
                  className="block text-center px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  onClick={() => setPopup(null)}
                >
                  Zur Ausleihe
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
