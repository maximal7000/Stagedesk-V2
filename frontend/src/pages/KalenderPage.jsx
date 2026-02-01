/**
 * Kalender-Seite mit Monats/Wochen/Tag-Ansicht
 * Features: Events, Drag & Drop, Kategorien, Ressourcen
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ChevronLeft, ChevronRight, Plus, Calendar, List, Grid3X3,
  Loader2, Filter, Download, RefreshCw, Clock, MapPin,
  LayoutGrid, CalendarDays, CalendarRange
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  isSameMonth, isSameDay, isToday, parseISO,
  eachDayOfInterval, getDay, setHours, setMinutes,
  differenceInMinutes, startOfDay, endOfDay
} from 'date-fns';
import { de } from 'date-fns/locale';
import apiClient from '../lib/api';
import EventModal from '../components/kalender/EventModal';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const STUNDEN = Array.from({ length: 24 }, (_, i) => i);

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
      return `${format(weekStart, 'd. MMM', { locale: de })} - ${format(weekEnd, 'd. MMM yyyy', { locale: de })}`;
    }
    return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de });
  };

  // Event-Chip Komponente
  const EventChip = ({ event, compact = false }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, event)}
      onClick={(e) => {
        e.stopPropagation();
        handleEditEvent(event);
      }}
      className={`px-2 py-1 rounded text-xs font-medium cursor-pointer truncate transition-transform hover:scale-105 ${
        compact ? 'text-[10px]' : ''
      }`}
      style={{ backgroundColor: event.kategorie_farbe || '#6B7280' }}
      title={event.titel}
    >
      {!compact && !event.ganztaegig && (
        <span className="mr-1 opacity-75">
          {format(parseISO(event.start), 'HH:mm')}
        </span>
      )}
      <span className="text-white">{event.titel}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Kalender</h1>
          <p className="text-gray-400 mt-1">Plane und verwalte Events</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('month')}
              className={`p-2 rounded ${viewMode === 'month' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Monat"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`p-2 rounded ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Woche"
            >
              <CalendarRange className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`p-2 rounded ${viewMode === 'day' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Tag"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Liste"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`p-2 rounded-lg transition-colors ${
                selectedKategorie ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Filter className="w-5 h-5" />
            </button>
            
            {showFilter && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                <div className="p-2">
                  <button
                    onClick={() => { setSelectedKategorie(null); setShowFilter(false); }}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      !selectedKategorie ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    Alle Kategorien
                  </button>
                  {kategorien.map(kat => (
                    <button
                      key={kat.id}
                      onClick={() => { setSelectedKategorie(kat.id); setShowFilter(false); }}
                      className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                        selectedKategorie === kat.id ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: kat.farbe }} />
                      {kat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleExport}
            className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg"
            title="iCal Export"
          >
            <Download className="w-5 h-5" />
          </button>

          <button
            onClick={fetchData}
            className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg"
            title="Aktualisieren"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          <button
            onClick={() => handleCreateEvent()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Neues Event</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4">
        <button
          onClick={navigatePrev}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white">{getHeaderTitle()}</h2>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded"
          >
            Heute
          </button>
        </div>

        <button
          onClick={navigateNext}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Kalender Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-8 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {/* Monatsansicht */}
          {viewMode === 'month' && (
            <div>
              {/* Wochentage Header */}
              <div className="grid grid-cols-7 border-b border-gray-800">
                {WOCHENTAGE.map(tag => (
                  <div key={tag} className="p-3 text-center text-sm font-medium text-gray-400 bg-gray-800/50">
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

                  return (
                    <div
                      key={idx}
                      onClick={() => handleCreateEvent(day)}
                      onDrop={(e) => handleDrop(e, day)}
                      onDragOver={handleDragOver}
                      className={`min-h-[100px] p-2 border-b border-r border-gray-800 cursor-pointer transition-colors ${
                        isCurrentMonth ? 'bg-gray-900' : 'bg-gray-950'
                      } hover:bg-gray-800/50`}
                    >
                      <div className={`text-sm font-medium mb-1 ${
                        isCurrentDay 
                          ? 'w-7 h-7 flex items-center justify-center bg-blue-600 text-white rounded-full' 
                          : isCurrentMonth ? 'text-white' : 'text-gray-600'
                      }`}>
                        {format(day, 'd')}
                      </div>

                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(event => (
                          <EventChip key={event.id} event={event} compact />
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-gray-500 px-1">
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
              <div className="grid grid-cols-8 border-b border-gray-800">
                <div className="p-3 text-center text-sm font-medium text-gray-400 bg-gray-800/50" />
                {getWeekDays().map(day => (
                  <div
                    key={day.toISOString()}
                    className={`p-3 text-center border-l border-gray-800 ${
                      isToday(day) ? 'bg-blue-900/20' : 'bg-gray-800/50'
                    }`}
                  >
                    <div className="text-xs text-gray-400">{format(day, 'EEE', { locale: de })}</div>
                    <div className={`text-lg font-semibold ${isToday(day) ? 'text-blue-400' : 'text-white'}`}>
                      {format(day, 'd')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Stunden Grid */}
              <div className="max-h-[600px] overflow-y-auto">
                {STUNDEN.map(stunde => (
                  <div key={stunde} className="grid grid-cols-8 border-b border-gray-800">
                    <div className="p-2 text-xs text-gray-500 text-right pr-3 bg-gray-800/30">
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
                          className="min-h-[50px] p-1 border-l border-gray-800 hover:bg-gray-800/30 cursor-pointer"
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
                    className="flex border-b border-gray-800 hover:bg-gray-800/30 cursor-pointer"
                  >
                    <div className="w-20 p-3 text-sm text-gray-500 text-right bg-gray-800/30 shrink-0">
                      {stunde.toString().padStart(2, '0')}:00
                    </div>
                    <div className="flex-1 p-2 min-h-[60px] space-y-1">
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
                <div className="p-8 text-center text-gray-400">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Keine Events in diesem Zeitraum</p>
                </div>
              ) : (
                events.map(event => (
                  <div
                    key={event.id}
                    onClick={() => handleEditEvent(event)}
                    className="p-4 hover:bg-gray-800/50 cursor-pointer flex items-start gap-4"
                  >
                    <div
                      className="w-1 h-12 rounded-full shrink-0"
                      style={{ backgroundColor: event.kategorie_farbe || '#6B7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white">{event.titel}</h3>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {format(parseISO(event.start), 'EEE, d. MMM HH:mm', { locale: de })}
                          {' - '}
                          {format(parseISO(event.ende), 'HH:mm')}
                        </span>
                        {event.ort && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {event.ort}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`px-2 py-1 text-xs rounded ${
                      event.status === 'bestaetigt' ? 'bg-green-900/30 text-green-400' :
                      event.status === 'abgesagt' ? 'bg-red-900/30 text-red-400' :
                      'bg-gray-700 text-gray-300'
                    }`}>
                      {event.status}
                    </div>
                  </div>
                ))
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
