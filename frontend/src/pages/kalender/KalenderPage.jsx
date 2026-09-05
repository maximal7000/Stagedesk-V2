/**
 * Kalender-Seite mit Monats/Wochen/Tag-Ansicht
 * Features: Events, Drag & Drop, Kategorien, Ressourcen
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, CalendarX2, List,
  Loader2, Filter, Download, RefreshCw, Clock, MapPin,
  LayoutGrid, CalendarDays, CalendarRange, Check
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  isSameMonth, isSameDay, isToday, parseISO,
  eachDayOfInterval, getDay, setHours, setMinutes,
  differenceInMinutes, startOfDay, endOfDay
} from 'date-fns';
import { de } from 'date-fns/locale';
import apiClient from '../../lib/api';
import EventModal from '../../components/kalender/EventModal';
import { PageHeader, Button, StatusBadge, EmptyState } from '../../components/ui';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const STUNDEN = Array.from({ length: 24 }, (_, i) => i);

// Ansichten für den Umschalter (semantisch: Zeitraum-Granularität)
const VIEWS = [
  { key: 'month', label: 'Monat', icon: LayoutGrid },
  { key: 'week', label: 'Woche', icon: CalendarRange },
  { key: 'day', label: 'Tag', icon: CalendarDays },
  { key: 'list', label: 'Liste', icon: List },
];

// Status-Töne für StatusBadge (semantische Farben bleiben erhalten)
const STATUS_TONE = {
  geplant: 'info',
  laufend: 'positive',
  abgeschlossen: 'neutral',
  abgesagt: 'danger',
};
const STATUS_LABEL = {
  geplant: 'Geplant',
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
};

export default function KalenderPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'day' | 'list'
  const [events, setEvents] = useState([]);
  const [kategorien, setKategorien] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter
  const [selectedKategorie, setSelectedKategorie] = useState(null);
  const [showFilter, setShowFilter] = useState(false);

  // Modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [newEventDate, setNewEventDate] = useState(null);

  // Drag & Drop
  const [draggingEvent, setDraggingEvent] = useState(null);
  const dragRef = useRef(null);

  // Daten laden
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Zeitraum für Filter berechnen
      let startAb, startBis;
      if (viewMode === 'month') {
        startAb = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        startBis = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
      } else if (viewMode === 'week') {
        startAb = startOfWeek(currentDate, { weekStartsOn: 1 });
        startBis = endOfWeek(currentDate, { weekStartsOn: 1 });
      } else if (viewMode === 'day') {
        startAb = startOfDay(currentDate);
        startBis = endOfDay(currentDate);
      } else {
        // List: Nächste 30 Tage
        startAb = startOfDay(new Date());
        startBis = addDays(startAb, 30);
      }

      const params = new URLSearchParams({
        start_ab: startAb.toISOString(),
        start_bis: startBis.toISOString(),
      });
      if (selectedKategorie) {
        params.append('kategorie_id', selectedKategorie);
      }

      const [eventsRes, kategorienRes] = await Promise.all([
        apiClient.get(`/kalender/events?${params}`),
        apiClient.get('/kalender/kategorien'),
      ]);

      setEvents(eventsRes.data);
      setKategorien(kategorienRes.data);
    } catch (err) {
      setError('Kalender konnte nicht geladen werden.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode, selectedKategorie]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Navigation
  const navigateNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const navigatePrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  // Event erstellen/bearbeiten
  const handleCreateEvent = (date) => {
    setSelectedEvent(null);
    setNewEventDate(date || new Date());
    setShowEventModal(true);
  };

  const handleEditEvent = (event) => {
    setSelectedEvent(event);
    setNewEventDate(null);
    setShowEventModal(true);
  };

  const handleEventSaved = () => {
    setShowEventModal(false);
    setSelectedEvent(null);
    setNewEventDate(null);
    fetchData();
  };

  // Drag & Drop
  const handleDragStart = (e, event) => {
    setDraggingEvent(event);
    e.dataTransfer.effectAllowed = 'move';
    dragRef.current = event;
  };

  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    if (!draggingEvent) return;

    const originalStart = parseISO(draggingEvent.start);
    const originalEnd = parseISO(draggingEvent.ende);
    const duration = differenceInMinutes(originalEnd, originalStart);

    // Neue Zeiten berechnen
    let newStart = targetDate;
    if (viewMode === 'month') {
      // Bei Monatsansicht: Uhrzeit beibehalten
      newStart = setHours(targetDate, originalStart.getHours());
      newStart = setMinutes(newStart, originalStart.getMinutes());
    }
    const newEnd = addDays(newStart, 0);
    newEnd.setMinutes(newEnd.getMinutes() + duration);

    try {
      await apiClient.patch(`/kalender/events/${draggingEvent.id}/move`, {
        start: newStart.toISOString(),
        ende: newEnd.toISOString(),
      });
      fetchData();
    } catch (err) {
      console.error('Fehler beim Verschieben:', err);
    }

    setDraggingEvent(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // iCal Export
  const handleExport = async () => {
    try {
      const response = await apiClient.get('/kalender/export/ical', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'stagedesk-kalender.ics');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export fehlgeschlagen:', err);
    }
  };

  // Events für einen Tag filtern
  const getEventsForDay = (day) => {
    return events.filter(event => {
      const eventStart = parseISO(event.start);
      return isSameDay(eventStart, day);
    });
  };

  // Kalender-Tage generieren
  const getCalendarDays = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  };

  // Wochen-Tage
  const getWeekDays = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  };

  // Header Titel
  const getHeaderTitle = () => {
    if (viewMode === 'month') return format(currentDate, 'MMMM yyyy', { locale: de });
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(weekStart, 'd. MMM', { locale: de })} bis ${format(weekEnd, 'd. MMM yyyy', { locale: de })}`;
    }
    return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de });
  };

  const aktiveKategorie = kategorien.find(k => k.id === selectedKategorie);

  // Event-Chip: farbcodierter Streifen + lesbarer Titel auf dunklem Grund
  const EventChip = ({ event, compact = false }) => {
    const color = event.kategorie_farbe || '#6B7280';
    const status = event.effektiv_status || event.status || 'geplant';
    const abgesagt = status === 'abgesagt';
    const gedimmt = abgesagt || status === 'abgeschlossen';
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, event)}
        onClick={(e) => {
          e.stopPropagation();
          handleEditEvent(event);
        }}
        className={`flex items-center gap-1.5 rounded-md cursor-pointer truncate transition-colors hover:ring-1 hover:ring-inset hover:ring-white/15 ${
          compact ? 'pl-2 pr-1.5 py-[3px] text-[11px]' : 'pl-2 pr-2 py-1 text-xs'
        } ${gedimmt ? 'opacity-60' : ''}`}
        style={{ backgroundColor: `${color}22`, boxShadow: `inset 2px 0 0 ${color}` }}
        title={event.titel}
      >
        {!compact && !event.ganztaegig && (
          <span className="shrink-0 font-semibold tabular-nums text-gray-400">
            {format(parseISO(event.start), 'HH:mm')}
          </span>
        )}
        <span className={`truncate text-gray-100 font-medium ${abgesagt ? 'line-through' : ''}`}>
          {event.titel}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        eyebrow="Kalender"
        title="Terminübersicht"
        meta={loading ? undefined : `${events.length} ${events.length === 1 ? 'Termin' : 'Termine'} im Zeitraum`}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExport} title="Als iCal exportieren" aria-label="Als iCal exportieren">
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchData} title="Aktualisieren" aria-label="Aktualisieren">
              <span className="hidden sm:inline">Aktualisieren</span>
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => handleCreateEvent()}>
              <span className="hidden sm:inline">Neuer Termin</span>
              <span className="sm:hidden">Neu</span>
            </Button>
          </>
        }
      />

      {/* Steuerleiste: Datums-Navigation links, Filter + Ansicht rechts */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-800 bg-gray-950/40">
            <button
              onClick={navigatePrev}
              className="rounded-l-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label="Zurück"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={navigateNext}
              className="rounded-r-lg border-l border-gray-800 p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label="Weiter"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-white sm:text-xl">
            {getHeaderTitle()}
          </h2>
          <button
            onClick={goToToday}
            className="rounded-lg px-2.5 py-1 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
          >
            Heute
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Kategorie-Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedKategorie
                  ? 'border-accent/40 bg-accent/15 text-accent'
                  : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">
                {aktiveKategorie ? aktiveKategorie.name : 'Alle Kategorien'}
              </span>
            </button>

            {showFilter && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
                <div className="p-1.5">
                  <button
                    onClick={() => { setSelectedKategorie(null); setShowFilter(false); }}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      !selectedKategorie ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    Alle Kategorien
                    {!selectedKategorie && <Check className="h-4 w-4 text-accent" />}
                  </button>
                  {kategorien.map(kat => (
                    <button
                      key={kat.id}
                      onClick={() => { setSelectedKategorie(kat.id); setShowFilter(false); }}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        selectedKategorie === kat.id ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: kat.farbe }} />
                      <span className="truncate">{kat.name}</span>
                      {selectedKategorie === kat.id && <Check className="ml-auto h-4 w-4 text-accent" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ansicht-Umschalter */}
          <div className="inline-flex rounded-lg border border-gray-700 bg-gray-800/60 p-0.5">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                aria-pressed={viewMode === key}
                title={label}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === key
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Kalender Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-gray-500" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-8 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          {/* Monatsansicht */}
          {viewMode === 'month' && (
            <div>
              {/* Wochentage Header */}
              <div className="grid grid-cols-7 border-b border-gray-800 bg-gray-950/40">
                {WOCHENTAGE.map((tag, i) => (
                  <div
                    key={tag}
                    className={`py-2.5 text-center text-xs font-semibold uppercase tracking-wider ${
                      i >= 5 ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    {tag}
                  </div>
                ))}
              </div>

              {/* Kalender Grid */}
              <div className="grid grid-cols-7">
                {getCalendarDays().map((day, idx) => {
                  const dayEvents = getEventsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isCurrentDay = isToday(day);
                  const isWeekend = getDay(day) === 0 || getDay(day) === 6;

                  return (
                    <div
                      key={idx}
                      onClick={() => handleCreateEvent(day)}
                      onDrop={(e) => handleDrop(e, day)}
                      onDragOver={handleDragOver}
                      className={`group min-h-[104px] border-b border-r border-gray-800 p-1.5 transition-colors last:border-r-0 [&:nth-child(7n)]:border-r-0 ${
                        isCurrentMonth ? (isWeekend ? 'bg-gray-900/60' : 'bg-gray-900') : 'bg-gray-950/60'
                      } cursor-pointer hover:bg-gray-800/40`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`flex h-6 w-6 items-center justify-center text-sm font-semibold ${
                          isCurrentDay
                            ? 'rounded-full bg-accent text-white'
                            : isCurrentMonth ? 'text-gray-200' : 'text-gray-600'
                        }`}>
                          {format(day, 'd')}
                        </span>
                        <Plus className="h-3.5 w-3.5 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>

                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(event => (
                          <EventChip key={event.id} event={event} compact />
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="px-1 text-[11px] font-medium text-gray-500">
                            +{dayEvents.length - 3} weitere
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Wochenansicht */}
          {viewMode === 'week' && (
            <div>
              {/* Header mit Tagen */}
              <div className="grid grid-cols-8 border-b border-gray-800 bg-gray-950/40">
                <div className="py-3" />
                {getWeekDays().map(day => (
                  <div
                    key={day.toISOString()}
                    className={`border-l border-gray-800 py-2.5 text-center ${
                      isToday(day) ? 'bg-accent/10' : ''
                    }`}
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      {format(day, 'EEE', { locale: de })}
                    </div>
                    <div className={`mt-0.5 text-lg font-semibold ${isToday(day) ? 'text-accent' : 'text-white'}`}>
                      {format(day, 'd')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Stunden Grid */}
              <div className="max-h-[600px] overflow-y-auto">
                {STUNDEN.map(stunde => (
                  <div key={stunde} className="grid grid-cols-8 border-b border-gray-800 last:border-b-0">
                    <div className="py-2 pr-3 text-right text-[11px] font-medium tabular-nums text-gray-500">
                      {stunde.toString().padStart(2, '0')}:00
                    </div>
                    {getWeekDays().map(day => {
                      const cellDate = setHours(day, stunde);
                      const cellEvents = events.filter(e => {
                        const start = parseISO(e.start);
                        return isSameDay(start, day) && start.getHours() === stunde;
                      });

                      return (
                        <div
                          key={day.toISOString()}
                          onClick={() => handleCreateEvent(cellDate)}
                          onDrop={(e) => handleDrop(e, cellDate)}
                          onDragOver={handleDragOver}
                          className={`min-h-[50px] cursor-pointer space-y-1 border-l border-gray-800 p-1 transition-colors hover:bg-gray-800/30 ${
                            isToday(day) ? 'bg-accent/[0.04]' : ''
                          }`}
                        >
                          {cellEvents.map(event => (
                            <EventChip key={event.id} event={event} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tagesansicht */}
          {viewMode === 'day' && (
            <div className="max-h-[600px] overflow-y-auto">
              {STUNDEN.map(stunde => {
                const cellDate = setHours(currentDate, stunde);
                const hourEvents = events.filter(e => {
                  const start = parseISO(e.start);
                  return isSameDay(start, currentDate) && start.getHours() === stunde;
                });

                return (
                  <div
                    key={stunde}
                    onClick={() => handleCreateEvent(cellDate)}
                    onDrop={(e) => handleDrop(e, cellDate)}
                    onDragOver={handleDragOver}
                    className="flex cursor-pointer border-b border-gray-800 transition-colors last:border-b-0 hover:bg-gray-800/30"
                  >
                    <div className="w-16 shrink-0 py-3 pr-3 text-right text-xs font-medium tabular-nums text-gray-500">
                      {stunde.toString().padStart(2, '0')}:00
                    </div>
                    <div className="min-h-[60px] flex-1 space-y-1 border-l border-gray-800 p-2">
                      {hourEvents.map(event => (
                        <EventChip key={event.id} event={event} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Listenansicht */}
          {viewMode === 'list' && (
            <div className="divide-y divide-gray-800">
              {events.length === 0 ? (
                <EmptyState
                  icon={CalendarX2}
                  title="Keine Termine im Zeitraum"
                  description="In den nächsten 30 Tagen ist nichts geplant. Leg den ersten Termin an."
                  action={<Button variant="primary" icon={Plus} onClick={() => handleCreateEvent()}>Neuer Termin</Button>}
                />
              ) : (
                events.map(event => {
                  const status = event.effektiv_status || event.status || 'geplant';
                  return (
                    <div
                      key={event.id}
                      onClick={() => handleEditEvent(event)}
                      className="flex cursor-pointer items-start gap-4 p-4 transition-colors hover:bg-gray-800/50"
                    >
                      <div
                        className="h-12 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: event.kategorie_farbe || '#6B7280' }}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-white">{event.titel}</h3>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-400">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 shrink-0" />
                            {format(parseISO(event.start), 'EEE, d. MMM HH:mm', { locale: de })}
                            {' bis '}
                            {format(parseISO(event.ende), 'HH:mm')}
                          </span>
                          {event.ort && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4 shrink-0" />
                              {event.ort}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge tone={STATUS_TONE[status] || 'neutral'} label={STATUS_LABEL[status] || status} />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <EventModal
          event={selectedEvent}
          initialDate={newEventDate}
          kategorien={kategorien}
          onClose={() => {
            setShowEventModal(false);
            setSelectedEvent(null);
            setNewEventDate(null);
          }}
          onSaved={handleEventSaved}
        />
      )}
    </div>
  );
}
