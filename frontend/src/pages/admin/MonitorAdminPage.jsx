/**
 * Monitor-Konfiguration: Admin-Seite (Multi-Profil)
 * Features: Profil-Management, Zeitplan-Editor, Layout-Modi, ON AIR Anpassung
 */
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Save, Loader2, Moon, AlertCircle, ChevronDown,
  Monitor, Radio, Megaphone, ExternalLink, RefreshCw, Copy, Eye, EyeOff,
  AlertTriangle, Upload, Image, FileText, Palette, Clock, CloudSun,
  Calendar, Plus, Trash2, Check, Edit, QrCode, AlignLeft, ImageIcon, Settings, Key,
  Timer, RotateCw, LayoutGrid, Activity, Zap, X, Maximize2,
  Download, UploadCloud, Layers, CalendarClock, Move, Sparkles,
} from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import apiClient from '../../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE = API_BASE.replace(/\/api\/?$/, '');

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Alle Layout-Modi (muss zu DisplayView.LAYOUT_CHOICES im Backend passen).
const LAYOUTS = [
  ['standard', 'Standard-Layout'],
  ['timetable', 'Stundenplan-Vollbild'],
  ['on_air', 'ON AIR Display'],
  ['departures', 'Abfahrtsmonitor (ÖPNV)'],
  ['pdf_fullscreen', 'PDF-Vollbild'],
  ['image_fullscreen', 'Bild-Vollbild'],
  ['split', 'Splitscreen'],
];

// Sichtbare Beschriftung gespeicherter Werte (wie vor der englischen Benennung angezeigt)
const PRIORITY_LABELS = { normal: <>normal</>, important: <>wichtig</>, urgent: <>dringend</> };
const DISPLAY_MODE_LABELS = { fullscreen: <>vollbild</>, split: <>split</>, standard: <>standard</> };
const MEDIA_KIND_LABELS = { logo: 'logo', image: 'bild', pdf: 'pdf', background: 'hintergrund' };
const DISRUPTION_SOURCE_LABELS = { nahsh: 'bahn', swl: 'bus', manual: 'manuell' };
const STATION_KIND_LABELS = {
  station: <>bahnhof</>, long_distance: <>fernverkehr</>, regional: <>nahverkehr</>,
  urban: <>stadtverkehr</>, bus: <>bus</>, other: <>sonstig</>,
};

// WCAG-Kontrastverhältnis zwischen zwei Hex-Farben (1..21)
function _relLum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const s = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}
function contrastRatio(a, b) {
  const la = _relLum(a), lb = _relLum(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Aktiver Admin-Bereich (Hub-Navigation). Sections rendern nur im passenden Bereich.
const AreaContext = createContext(null);

// ─── Section — collapsible; oder `plain` (immer offen, kein Aufklappen) ───
function Section({ id, area, plain, title, description, icon: Icon, open, onToggle, badge, statusDot, children }) {
  const activeArea = useContext(AreaContext);
  if (area && activeArea && area !== activeArea) return null;
  const isOpen = plain ? true : open;
  const HeaderTag = plain ? 'div' : 'button';
  return (
    <div id={`section-${id}`} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden scroll-mt-32">
      <HeaderTag {...(plain ? {} : { onClick: () => onToggle(id), 'aria-expanded': !!open })}
        className={`w-full px-5 py-4 flex items-center justify-between gap-3 ${plain ? '' : 'hover:bg-gray-800/40 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gray-800 ring-1 ring-inset ring-gray-700/70">
            <Icon className="w-4 h-4 text-gray-300" />
          </div>
          <div className="text-left min-w-0">
            <h3 className="font-display font-semibold tracking-tight text-white flex items-center gap-2 text-[1.05rem] leading-tight">
              {title}
              {badge != null && <span className="px-1.5 py-0.5 text-[11px] font-sans bg-gray-800 text-gray-400 ring-1 ring-inset ring-gray-700 rounded-md font-medium tabular-nums">{badge}</span>}
              {statusDot && <span className={`w-2 h-2 rounded-full ${statusDot}`} />}
            </h3>
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </div>
        </div>
        {!plain && <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`} />}
      </HeaderTag>
      {isOpen && <div className="px-5 pb-5 space-y-4 border-t border-gray-800/50 pt-4">{children}</div>}
    </div>
  );
}

// ─── Toggle Switch ──────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative w-10 h-5.5 rounded-full transition-colors disabled:opacity-50 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${checked ? 'bg-accent' : 'bg-gray-700'}`}>
      <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

export default function MonitorAdminPage() {
  const { isAdmin, hasPermission } = useUser();

  const [views, setViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [monitorConfig, setMonitorConfig] = useState(null);
  const [originalConfig, setOriginalConfig] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [monitorSaving, setMonitorSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [savedAt, setSavedAt] = useState(0);
  // Vorschau-Iframes laufen als echte MonitorPage und pollen intern (Uhr/Daten live).
  // Sie werden nur nach dem Speichern neu geladen (savedAt) — kein hartes Remount-Flackern.
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [tabFilter, setTabFilter] = useState('');
  const [mediaFilter, setMediaFilter] = useState('');
  const [showNewView, setShowNewView] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewLayout, setNewViewLayout] = useState('standard');
  const [cloneFromId, setCloneFromId] = useState(null);
  const fileInputRef = useRef(null);
  const [uploadKind, setUploadKind] = useState('logo');
  const [transitQuery, setTransitQuery] = useState('');
  const [transitResults, setTransitResults] = useState([]);
  const [transitSearching, setTransitSearching] = useState(false);
  const transitTimerRef = useRef(null);

  // Bildschirme
  const [screens, setScreens] = useState([]);
  const [activeScreenId, setActiveScreenId] = useState(null);
  const [showNewScreen, setShowNewScreen] = useState(false);
  const [newScreenName, setNewScreenName] = useState('');

  // Klausuren
  const [exams, setExams] = useState([]);
  const [showNewExam, setShowNewExam] = useState(false);
  const [examTemplate, setExamTemplate] = useState(null);

  // WebUntis-Link-Bibliothek
  const [webuntisLinks, setWebuntisLinks] = useState([]);

  // Events (aktivierbare Modi)
  const [events, setEvents] = useState([]);

  // Klausur-Vorlagen (selbst erstellbar) + globale Einstellungen
  const [examTemplates, setExamTemplates] = useState([]);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [configVersions, setConfigVersions] = useState([]);
  const [disruptions, setDisruptions] = useState([]);
  const [disruptionsLoading, setDisruptionsLoading] = useState(false);
  const [trash, setTrash] = useState({ views: [], media: [] });

  // Sections
  const [searchParams, setSearchParams] = useSearchParams();
  const AREAS = ['overview', 'views', 'screens', 'content', 'events', 'settings'];
  const [activeArea, setActiveAreaState] = useState(() => {
    const b = searchParams.get('area');
    return AREAS.includes(b) ? b : 'overview';
  });
  const setActiveArea = (area) => {
    // Schutz vor Datenverlust: beim Verlassen von „Ansichten" mit ungespeicherten Änderungen warnen
    if (area !== activeArea && activeArea === 'views' && hasChanges
        && !confirm('Ungespeicherte Änderungen verwerfen und Bereich wechseln?')) return;
    setActiveAreaState(area);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('area', area); return p; }, { replace: true });
  };
  // Browser-Zurück/Deep-Link: URL → State
  useEffect(() => {
    const b = searchParams.get('area');
    if (AREAS.includes(b) && b !== activeArea) setActiveAreaState(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [openSections, setOpenSections] = useState({
    view: true,
    allgemein: false,
    widgets: true,
    onair: false,
    transit: false,
    theme: false,
    media: false,
    announcements: false,
    webuntislinks: false,
    events: false,
    api: false,
    screens: false,
  });
  const toggleSection = (id) => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

  // Permissions
  const canView = isAdmin || hasPermission('monitor.view');
  const canEdit = isAdmin || hasPermission('monitor.edit');
  const canOnAir = isAdmin || hasPermission('monitor.onair');
  const canEmergency = isAdmin || hasPermission('monitor.emergency');

  // Unsaved changes
  const hasChanges = monitorConfig && originalConfig && JSON.stringify(monitorConfig) !== JSON.stringify(originalConfig);

  // ═══ Data Fetching ═══
  const fetchViews = useCallback(async () => {
    try {
      const res = await apiClient.get('/monitor/views');
      setViews(res.data);
      return res.data;
    } catch { return []; }
  }, []);

  const fetchScreens = useCallback(async () => {
    try {
      const res = await apiClient.get('/monitor/screens');
      setScreens(res.data);
    } catch {}
  }, []);

  const fetchExams = useCallback(async () => {
    try {
      const res = await apiClient.get('/monitor/exams');
      setExams(res.data);
    } catch {}
  }, []);

  const fetchWebuntisLinks = useCallback(async () => {
    try {
      const res = await apiClient.get('/monitor/webuntis-links');
      setWebuntisLinks(res.data);
    } catch {}
  }, []);

  const saveWebuntisLink = async (link) => {
    try {
      const body = { name: link.name, url: link.url, note: link.note || '' };
      if (link.id) await apiClient.put(`/monitor/webuntis-links/${link.id}`, body);
      else await apiClient.post('/monitor/webuntis-links', body);
      await fetchWebuntisLinks();
      toast.success('Link gespeichert');
    } catch { toast.error('Fehler beim Speichern'); }
  };

  const deleteWebuntisLink = async (id) => {
    try {
      await apiClient.delete(`/monitor/webuntis-links/${id}`);
      await fetchWebuntisLinks();
      toast.success('Link gelöscht');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const fetchEvents = useCallback(async () => {
    try {
      const res = await apiClient.get('/monitor/events');
      setEvents(res.data);
    } catch {}
  }, []);

  const saveEvent = async (ev) => {
    try {
      const body = {
        name: ev.name, description: ev.description || '', color: ev.color || '#7c3aed',
        active_from: ev.active_from || null, active_until: ev.active_until || null,
        assignments: (ev.assignments || []).map(z => ({ screen_id: z.screen_id, view_id: z.view_id })),
      };
      if (ev.id) await apiClient.put(`/monitor/events/${ev.id}`, body);
      else await apiClient.post('/monitor/events', body);
      await fetchEvents();
      toast.success('Event gespeichert');
    } catch { toast.error('Fehler beim Speichern'); }
  };

  const deleteEvent = async (id) => {
    try {
      await apiClient.delete(`/monitor/events/${id}`);
      await fetchEvents();
      toast.success('Event gelöscht');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const toggleEventActive = async (ev) => {
    try {
      await apiClient.post(`/monitor/events/${ev.id}/${ev.is_active ? 'deactivate' : 'activate'}`);
      await fetchEvents();
      toast.success(ev.is_active ? 'Event deaktiviert' : 'Event aktiviert');
    } catch { toast.error('Fehler'); }
  };

  // Sofort-Override eines Bildschirms setzen/zurücksetzen (Cockpit-Schnellumschaltung)
  const setScreenOverride = async (screen, viewId) => {
    try {
      await apiClient.put(`/monitor/screens/${screen.id}`, { override_view_id: viewId || null, override_until: null });
      await fetchScreens();
      toast.success(viewId ? 'Bildschirm umgeschaltet' : 'Override zurückgesetzt');
    } catch { toast.error('Fehler beim Umschalten'); }
  };

  // Ansicht auf einem Bildschirm sofort neu laden lassen
  const reloadScreen = async (screen) => {
    try {
      await apiClient.post(`/monitor/screens/${screen.id}/reload`);
      toast.success(`${screen.name}: Neuladen angefordert`);
    } catch { toast.error('Neuladen fehlgeschlagen'); }
  };
  // Bulk: alle Bildschirme auf eine Ansicht setzen bzw. alle Overrides zurücksetzen
  const setAllOverride = async (viewId) => {
    try {
      await Promise.all(screens.map(screen =>
        apiClient.put(`/monitor/screens/${screen.id}`, { override_view_id: viewId || null, override_until: null })));
      await fetchScreens();
      toast.success(viewId ? 'Alle Bildschirme umgeschaltet' : 'Alle Overrides zurückgesetzt');
    } catch { toast.error('Fehler beim Umschalten'); }
  };

  const fetchExamTemplates = useCallback(async () => {
    try { const res = await apiClient.get('/monitor/exam-templates'); setExamTemplates(res.data); } catch {}
  }, []);
  const saveExamTemplate = async (v) => {
    try {
      const body = {
        name: v.name, duration_minutes: v.duration_minutes || 90, title: v.title || 'Klausur', text: v.text || '',
        color: v.color || '#1e40af', display_mode: v.display_mode || 'fullscreen',
        webuntis_link_id: v.webuntis_link_id || null, split_side: v.split_side || 'right', split_percent: v.split_percent || 50,
      };
      if (v.id) await apiClient.put(`/monitor/exam-templates/${v.id}`, body);
      else await apiClient.post('/monitor/exam-templates', body);
      await fetchExamTemplates();
      toast.success('Vorlage gespeichert');
    } catch { toast.error('Fehler beim Speichern'); }
  };
  const deleteExamTemplate = async (id) => {
    try { await apiClient.delete(`/monitor/exam-templates/${id}`); await fetchExamTemplates(); } catch { toast.error('Fehler'); }
  };

  const fetchGlobalSettings = useCallback(async () => {
    try { const res = await apiClient.get('/monitor/settings'); setGlobalSettings(res.data); } catch {}
  }, []);
  const fetchTrash = useCallback(async () => {
    try { const res = await apiClient.get('/monitor/trash'); setTrash(res.data); } catch {}
  }, []);
  const restoreTrash = async (kind, id) => {
    try { await apiClient.post(`/monitor/trash/restore?kind=${kind}&id=${id}`); await fetchTrash();
      if (kind === 'view') fetchViews(); else fetchConfigForView(activeViewId);
      toast.success('Wiederhergestellt'); } catch { toast.error('Fehler'); }
  };
  const purgeTrash = async (kind, id) => {
    if (!confirm('Endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;
    try { await apiClient.delete(`/monitor/trash/purge?kind=${kind}&id=${id}`); await fetchTrash(); toast.success('Endgültig gelöscht'); }
    catch { toast.error('Fehler'); }
  };
  const fetchConfigVersions = useCallback(async (viewId) => {
    try { const res = await apiClient.get(`/monitor/config/versions?view_id=${viewId}`); setConfigVersions(res.data); } catch { setConfigVersions([]); }
  }, []);
  const restoreConfigVersion = async (versionId) => {
    try { await apiClient.post(`/monitor/config/restore?version_id=${versionId}`); await fetchConfigForView(activeViewId); fetchConfigVersions(activeViewId); toast.success('Version wiederhergestellt'); }
    catch { toast.error('Fehler beim Wiederherstellen'); }
  };
  const saveGlobalSettings = async () => {
    try { await apiClient.put('/monitor/settings', globalSettings); toast.success('Globale Einstellungen gespeichert'); }
    catch { toast.error('Fehler beim Speichern'); }
  };

  const fetchConfigForView = useCallback(async (viewId) => {
    try {
      const [configRes, announcementsRes, filesRes] = await Promise.all([
        apiClient.get(`/monitor/config?view_id=${viewId}`),
        apiClient.get('/monitor/announcements'),
        apiClient.get('/monitor/files'),
      ]);
      setMonitorConfig(configRes.data);
      setOriginalConfig(configRes.data);
      setAnnouncements(announcementsRes.data);
      setMediaFiles(filesRes.data);
      fetchConfigVersions(viewId);
    } catch {}
  }, [fetchConfigVersions]);

  useEffect(() => {
    (async () => {
      const viewList = await fetchViews();
      fetchScreens();
      fetchExams();
      fetchWebuntisLinks();
      fetchEvents();
      fetchExamTemplates();
      fetchGlobalSettings();
      fetchTrash();
      if (viewList.length > 0) {
        const std = viewList.find(p => p.is_default) || viewList[0];
        setActiveViewId(std.id);
        fetchConfigForView(std.id);
      }
    })();
  }, [fetchViews, fetchConfigForView, fetchScreens, fetchExams, fetchWebuntisLinks, fetchEvents, fetchExamTemplates, fetchGlobalSettings, fetchTrash]);

  // Switch profile
  const switchView = (id) => {
    if (hasChanges && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    setActiveViewId(id);
    fetchConfigForView(id);
  };

  // Tastatur-Shortcuts: Ctrl+S speichern, ←/→ Ansicht wechseln, N = neu (kontextabhängig)
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && canEdit) handleSaveMonitorConfig();
        return;
      }
      // Nicht auslösen, während in einem Eingabefeld getippt wird
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Ansicht mit Pfeiltasten wechseln (nur im Ansichten-Bereich)
      if (activeArea === 'views' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const idx = views.findIndex(p => p.id === activeViewId);
        const next = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
        if (idx >= 0 && next >= 0 && next < views.length) { e.preventDefault(); switchView(views[next].id); }
        return;
      }
      // N = neu: Ansicht (in „Ansichten") oder Klausur (in „Inhalte")
      if ((e.key === 'n' || e.key === 'N') && canEdit) {
        if (activeArea === 'views') { e.preventDefault(); setShowNewView(true); }
        else if (activeArea === 'content') { e.preventDefault(); setExamTemplate(null); setShowNewExam(true); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Schutz vor Datenverlust: Warnung beim Verlassen mit ungespeicherten Änderungen
  useEffect(() => {
    const warn = (e) => { if (hasChanges) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  if (!canView) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-6 py-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-800/60 border border-gray-700/60 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-gray-400" />
          </div>
          <h2 className="text-base font-semibold text-white">Kein Zugriff</h2>
          <p className="text-sm text-gray-400 mt-1.5">Für diesen Bereich brauchst du die Berechtigung „Monitor anzeigen“.</p>
        </div>
      </div>
    );
  }

  // ═══ Handler ═══
  // Nur diese Felder werden an PUT /monitor/config gesendet (muss DisplayViewUpdateSchema entsprechen)
  const UPDATE_FIELDS = [
    'name','slug','is_default','schedule','layout','title','subtitle',
    'background_color','accent_color','show_logo','logo_url','active_logo_id',
    'show_clock','show_events','show_announcements','show_on_air',
    'show_countdown',
    'emergency_active','emergency_text','show_weather','weather_city','weather_api_key',
    'show_slideshow','slideshow_interval','show_pdf','active_pdf_id','theme_preset',
    'fullscreen_header','pdf_mode','pdf_interval','pdf_per_screen','pdf_pages','pdf_static_page','active_image_id','image_fit','image_focus_x','image_focus_y',
    'show_webuntis','webuntis_url','webuntis_url_next_day','webuntis_link_id','webuntis_link_next_day_id','webuntis_zoom','webuntis_dark_mode',
    'split_left','split_right','split_left_percent',
    'show_background_image','active_background_image_id',
    'show_qr_code','qr_code_url','qr_code_label',
    'show_free_text','free_text_title','free_text_content',
    'show_custom_countdown','custom_countdown_name','custom_countdown_date',
    'show_page_rotation','page_rotation_interval','page_rotation_pages',
    'show_transit','transit_stops','transit_duration','transit_max_departures',
    'transit_show_bus','transit_show_rail','transit_show_long_distance','transit_source_db','transit_source_nahsh',
    'transit_show_via','transit_show_relative','transit_color_coding','transit_highlight_next',
    'transit_auto_scroll','transit_disruption_banner','transit_font_size','transit_columns',
    'transit_strike_active','transit_strike_text','transit_strike_lines','transit_strike_types',
    'transit_disruption_rail','transit_disruption_bus','transit_disruption_rail_lines','transit_disruption_bus_lines','transit_disruption_manual',
    'transit_disruption_hidden','transit_disruption_position',
    'on_air_text','on_air_size','on_air_position','on_air_blink','on_air_color','on_air_fullscreen','on_air_split','on_air_split_side',
    'refresh_interval',
  ];

  const handleSaveMonitorConfig = async () => {
    if (!monitorConfig || !canEdit) return;
    setMonitorSaving(true);
    try {
      // Nur Schema-konforme Felder senden
      const updateData = {};
      for (const key of UPDATE_FIELDS) {
        if (key in monitorConfig) updateData[key] = monitorConfig[key];
      }
      const res = await apiClient.put(`/monitor/config?view_id=${activeViewId}`, updateData);
      setMonitorConfig(res.data);
      setOriginalConfig(res.data);
      fetchViews();
      setSavedAt(Date.now());
      toast.success('Konfiguration gespeichert');
    } catch (e) {
      console.error('Monitor save error:', e.response?.data || e.message);
      toast.error('Speichern fehlgeschlagen');
    }
    finally { setMonitorSaving(false); }
  };

  const handleCreateView = async () => {
    if (!newViewName.trim()) return;
    try {
      const res = await apiClient.post('/monitor/views', {
        name: newViewName,
        layout: newViewLayout,
        clone_from_id: cloneFromId || null,
      });
      const viewList = await fetchViews();
      setActiveViewId(res.data.id);
      fetchConfigForView(res.data.id);
      setShowNewView(false);
      setNewViewName('');
      setNewViewLayout('standard');
      setCloneFromId(null);
      toast.success(`Ansicht "${res.data.name}" erstellt`);
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleDeleteView = async (id) => {
    const view = views.find(p => p.id === id);
    if (!view || view.is_default) return;
    if (!confirm(`Ansicht "${view.name}" wirklich löschen?`)) return;
    try {
      await apiClient.delete(`/monitor/views/${id}`);
      const viewList = await fetchViews();
      const std = viewList.find(p => p.is_default) || viewList[0];
      if (activeViewId === id) {
        setActiveViewId(std.id);
        fetchConfigForView(std.id);
      }
      fetchTrash();
      toast.success('Ansicht in den Papierkorb verschoben');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const handleDuplicateView = async () => {
    if (!activeView) return;
    try {
      const res = await apiClient.post('/monitor/views', {
        name: `${activeView.name} (Kopie)`,
        layout: monitorConfig?.layout || 'standard',
        clone_from_id: activeViewId,
      });
      await fetchViews();
      setActiveViewId(res.data.id);
      fetchConfigForView(res.data.id);
      toast.success(`Ansicht "${res.data.name}" dupliziert`);
    } catch { toast.error('Fehler beim Duplizieren'); }
  };

  // Aktives Profil in der Reihenfolge verschieben (Tausch der sort_order mit Nachbar)
  const moveView = async (dir) => {
    const ordered = [...views].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    const idx = ordered.findIndex(p => p.id === activeViewId);
    const swap = ordered[idx + dir];
    if (idx < 0 || !swap) return;
    const cur = ordered[idx];
    try {
      // sort_order normalisieren + tauschen
      const sCur = cur.sort_order ?? idx;
      const sSwap = swap.sort_order ?? (idx + dir);
      await Promise.all([
        apiClient.put(`/monitor/config?view_id=${cur.id}`, { sort_order: sSwap }),
        apiClient.put(`/monitor/config?view_id=${swap.id}`, { sort_order: sCur }),
      ]);
      await fetchViews();
    } catch { toast.error('Reihenfolge konnte nicht geändert werden'); }
  };

  // Drag & Drop: Reihenfolge der Ansichts-Tabs ändern und Sortierung persistieren
  const dragViewId = useRef(null);
  const reorderViews = async (toId) => {
    const fromId = dragViewId.current;
    dragViewId.current = null;
    if (!fromId || fromId === toId) return;
    const ordered = [...views];
    const fromIdx = ordered.findIndex(p => p.id === fromId);
    const toIdx = ordered.findIndex(p => p.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    try {
      await Promise.all(ordered.map((p, i) => apiClient.put(`/monitor/config?view_id=${p.id}`, { sort_order: i })));
      await fetchViews();
    } catch { toast.error('Reihenfolge konnte nicht gespeichert werden'); }
  };

  // Ansicht direkt am Tab umbenennen (Doppelklick → Inline-Feld)
  const startRename = (p) => { if (!canEdit) return; setRenamingId(p.id); setRenameValue(p.name); };
  const commitRename = async () => {
    const id = renamingId;
    const name = renameValue.trim();
    setRenamingId(null);
    if (!id || !name) return;
    const view = views.find(p => p.id === id);
    if (!view || view.name === name) return;
    try {
      await apiClient.put(`/monitor/config?view_id=${id}`, { name });
      await fetchViews();
      if (id === activeViewId) {
        setMonitorConfig(c => (c ? { ...c, name } : c));
        setOriginalConfig(c => (c ? { ...c, name } : c));
      }
      toast.success('Ansicht umbenannt');
    } catch { toast.error('Fehler beim Umbenennen'); }
  };

  // ═══ Bildschirm CRUD ═══
  const handleCreateScreen = async () => {
    if (!newScreenName.trim()) return;
    try {
      const res = await apiClient.post('/monitor/screens', { name: newScreenName });
      await fetchScreens();
      setActiveScreenId(res.data.id);
      setShowNewScreen(false);
      setNewScreenName('');
      toast.success(`Bildschirm "${res.data.name}" erstellt`);
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleDeleteScreen = async (id) => {
    const screen = screens.find(b => b.id === id);
    if (!screen) return;
    if (!confirm(`Bildschirm "${screen.name}" wirklich löschen?`)) return;
    try {
      await apiClient.delete(`/monitor/screens/${id}`);
      await fetchScreens();
      if (activeScreenId === id) setActiveScreenId(null);
      toast.success('Bildschirm gelöscht');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const handleSaveScreen = async (screen) => {
    const payload = {
      name: screen.name,
      slug: screen.slug,
      default_view_id: screen.default_view_id ?? null,
      schedule: screen.schedule || [],
      power_schedule: screen.power_schedule || [],
      holiday_mode: !!screen.holiday_mode,
      power_exceptions: screen.power_exceptions || [],
      power_mode: screen.power_mode || 'auto',
    };
    try {
      await apiClient.put(`/monitor/screens/${screen.id}`, payload);
      await fetchScreens();
      toast.success('Bildschirm gespeichert');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler beim Speichern');
    }
  };

  const updateScreenLocal = (id, key, value) => {
    setScreens(prev => prev.map(b => b.id === id ? { ...b, [key]: value } : b));
  };


  // ═══ Klausur CRUD ═══
  const handleCreateExam = async (payload) => {
    try {
      await apiClient.post('/monitor/exams', payload);
      await fetchExams();
      setShowNewExam(false);
      setExamTemplate(null);
      toast.success('Klausur erstellt');
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleUpdateExam = async (id, payload) => {
    try {
      await apiClient.put(`/monitor/exams/${id}`, payload);
      await fetchExams();
    } catch { toast.error('Fehler beim Speichern'); }
  };

  const handleDeleteExam = async (id) => {
    if (!confirm('Klausur wirklich löschen?')) return;
    try {
      await apiClient.delete(`/monitor/exams/${id}`);
      await fetchExams();
      toast.success('Klausur gelöscht');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const updateExamLocal = (id, patch) => {
    setExams(prev => prev.map(k => k.id === id ? { ...k, ...patch } : k));
  };

  const handleToggleOnAir = async () => {
    if (!canOnAir) return;
    try {
      await apiClient.post('/monitor/on-air', { on_air: !monitorConfig.is_on_air });
      setMonitorConfig(prev => ({ ...prev, is_on_air: !prev.is_on_air }));
      setOriginalConfig(prev => ({ ...prev, is_on_air: !prev.is_on_air }));
      fetchViews();
      toast.success(monitorConfig.is_on_air ? 'ON AIR deaktiviert' : 'ON AIR aktiviert');
    } catch { toast.error('Fehler beim Umschalten'); }
  };

  const handleToggleEmergency = async () => {
    if (!canEmergency) return;
    if (!monitorConfig.emergency_active && !monitorConfig.emergency_text) {
      const text = prompt('Notfall-Text:');
      if (!text) return;
      updateConfig('emergency_text', text);
    }
    try {
      await apiClient.post('/monitor/emergency', {
        active: !monitorConfig.emergency_active,
        text: monitorConfig.emergency_text || 'ACHTUNG',
      });
      setMonitorConfig(prev => ({ ...prev, emergency_active: !prev.emergency_active }));
      setOriginalConfig(prev => ({ ...prev, emergency_active: !prev.emergency_active }));
      fetchViews();
      toast.success(monitorConfig.emergency_active ? 'Notfall deaktiviert' : 'Notfall aktiviert');
    } catch { toast.error('Fehler'); }
  };

  const handleRegenerateToken = async () => {
    if (!confirm('Neues Token generieren? Das alte Token wird ungültig.')) return;
    try {
      const res = await apiClient.post(`/monitor/config/regenerate-token?view_id=${activeViewId}`);
      setMonitorConfig(prev => ({ ...prev, api_token: res.data.api_token }));
      setOriginalConfig(prev => ({ ...prev, api_token: res.data.api_token }));
      toast.success('Neues Token generiert');
    } catch { toast.error('Fehler'); }
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement?.title) return;
    try {
      await apiClient.post('/monitor/announcements', newAnnouncement);
      setNewAnnouncement(null);
      fetchConfigForView(activeViewId);
      toast.success('Ankündigung erstellt');
    } catch { toast.error('Fehler'); }
  };

  const handleUpdateAnnouncement = async () => {
    if (!editingAnnouncement?.title) return;
    try {
      await apiClient.put(`/monitor/announcements/${editingAnnouncement.id}`, {
        title: editingAnnouncement.title,
        text: editingAnnouncement.text,
        priority: editingAnnouncement.priority,
        is_active: editingAnnouncement.is_active,
        active_from: editingAnnouncement.active_from || null,
        active_until: editingAnnouncement.active_until || null,
      });
      setEditingAnnouncement(null);
      fetchConfigForView(activeViewId);
      toast.success('Ankündigung aktualisiert');
    } catch { toast.error('Fehler beim Speichern'); }
  };

  const handleDeleteAnnouncement = async (id) => {
    try {
      await apiClient.delete(`/monitor/announcements/${id}`);
      fetchConfigForView(activeViewId);
    } catch { toast.error('Fehler'); }
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);
      formData.append('kind', uploadKind);
      await apiClient.post('/monitor/files', formData);
      fetchConfigForView(activeViewId);
      toast.success('Datei hochgeladen');
    } catch { toast.error('Upload fehlgeschlagen'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleDeleteFile = async (id) => {
    try {
      await apiClient.delete(`/monitor/files/${id}`);
      fetchConfigForView(activeViewId);
      fetchTrash();
      toast.success('In den Papierkorb verschoben');
    } catch { toast.error('Fehler'); }
  };

  // Drag-&-Drop-Upload: Typ automatisch (PDF → pdf, sonst bild)
  const uploadDroppedFiles = async (files) => {
    if (!canEdit || !files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const kind = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
        const fd = new FormData();
        fd.append('file', file); fd.append('name', file.name); fd.append('kind', kind);
        await apiClient.post('/monitor/files', fd);
      }
      fetchConfigForView(activeViewId);
      toast.success(files.length > 1 ? `${files.length} Dateien hochgeladen` : 'Datei hochgeladen');
    } catch { toast.error('Upload fehlgeschlagen'); }
    finally { setUploading(false); }
  };

  const handleExportConfig = () => {
    if (!monitorConfig) return;
    const exportData = { ...monitorConfig };
    delete exportData.api_token;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monitor-${monitorConfig.slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Konfiguration exportiert');
  };

  const handleImportConfig = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        delete imported.api_token;
        delete imported.is_on_air;
        delete imported.on_air_since;
        delete imported.emergency_active;
        delete imported.id;
        setMonitorConfig(prev => ({ ...prev, ...imported }));
        toast.success('Konfiguration importiert. Zum Übernehmen speichern.');
      } catch { toast.error('Ungültige JSON-Datei'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateConfig = (key, value) => setMonitorConfig(prev => ({ ...prev, [key]: value }));

  const fetchDisruptions = useCallback(async () => {
    if (!activeViewId) return;
    setDisruptionsLoading(true);
    try {
      const res = await apiClient.get(`/monitor/disruptions?view_id=${activeViewId}`);
      setDisruptions(Array.isArray(res.data) ? res.data : []);
    } catch { setDisruptions([]); }
    finally { setDisruptionsLoading(false); }
  }, [activeViewId]);

  const toggleDisruptionHidden = (id) => {
    const cur = monitorConfig?.transit_disruption_hidden || [];
    updateConfig('transit_disruption_hidden', cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  };

  const applyTheme = (preset) => {
    const themes = {
      event: { background_color: '#0f172a', accent_color: '#da1f3d' },
      school: { background_color: '#0f172a', accent_color: '#3b82f6' },
      night: { background_color: '#000000', accent_color: '#6b7280' },
    };
    const t = themes[preset];
    if (t) {
      setMonitorConfig(prev => ({ ...prev, ...t, theme_preset: preset }));
    } else {
      updateConfig('theme_preset', 'custom');
    }
  };

  // ═══ Zeitplan Helpers ═══
  const addScheduleEntry = () => {
    const schedule = monitorConfig.schedule || [];
    updateConfig('schedule', [...schedule, { days: [0, 1, 2, 3, 4], from: '08:00', until: '16:00' }]);
  };

  const updateScheduleEntry = (idx, field, value) => {
    const schedule = [...(monitorConfig.schedule || [])];
    schedule[idx] = { ...schedule[idx], [field]: value };
    updateConfig('schedule', schedule);
  };

  const toggleScheduleDay = (idx, day) => {
    const schedule = [...(monitorConfig.schedule || [])];
    const days = schedule[idx].days || [];
    schedule[idx] = {
      ...schedule[idx],
      days: days.includes(day) ? days.filter(t => t !== day) : [...days, day].sort(),
    };
    updateConfig('schedule', schedule);
  };

  const removeScheduleEntry = (idx) => {
    const schedule = [...(monitorConfig.schedule || [])];
    schedule.splice(idx, 1);
    updateConfig('schedule', schedule);
  };

  const _mf = (d) => !mediaFilter || (d.name || '').toLowerCase().includes(mediaFilter.toLowerCase());
  const logos = mediaFiles.filter(d => d.kind === 'logo' && _mf(d));
  const images = mediaFiles.filter(d => d.kind === 'image' && _mf(d));
  const pdfs = mediaFiles.filter(d => d.kind === 'pdf' && _mf(d));
  const backgrounds = mediaFiles.filter(d => d.kind === 'background' && _mf(d));

  // Active widget count
  const widgetKeys = [
    'show_clock', 'show_events', 'show_announcements', 'show_on_air',
    'show_countdown', 'show_weather', 'show_webuntis', 'show_slideshow',
    'show_pdf', 'show_logo', 'show_background_image', 'show_qr_code', 'show_free_text',
    'show_custom_countdown', 'show_page_rotation',
  ];
  const activeWidgets = monitorConfig ? widgetKeys.filter(k => monitorConfig[k]).length : 0;

  // Ankündigung form
  const renderAnnouncementForm = (data, setData, onSave, onCancel, saveLabel) => (
    <div className="p-4 border border-gray-700 rounded-xl bg-gray-800/30 space-y-3">
      <input type="text" value={data.title} onChange={e => setData({ ...data, title: e.target.value })}
        placeholder="Titel *" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
      <textarea value={data.text} onChange={e => setData({ ...data, text: e.target.value })}
        placeholder="Text (optional)" rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none" />
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-gray-500">Emoji:</span>
        {['📢', '⚠️', '✅', '🎉', '🕒', '📍', '🚌', '❗'].map(em => (
          <button key={em} type="button" onClick={() => setData({ ...data, text: (data.text || '') + em })}
            className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-base leading-none">{em}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Anzeigen ab (optional)</label>
          <input type="datetime-local" value={data.active_from ? data.active_from.slice(0, 16) : ''}
            onChange={e => setData({ ...data, active_from: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Ablauf / bis (optional)</label>
          <input type="datetime-local" value={data.active_until ? data.active_until.slice(0, 16) : ''}
            onChange={e => setData({ ...data, active_until: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <select value={data.priority} onChange={e => setData({ ...data, priority: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent">
          <option value="normal">Normal</option>
          <option value="important">Wichtig</option>
          <option value="urgent">Dringend</option>
        </select>
        <button type="button" onClick={() => setData({ ...data, is_active: !data.is_active })}
          className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
            data.is_active ? 'bg-green-600/20 border-green-500/40 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}>
          {data.is_active ? 'Aktiv' : 'Inaktiv'}
        </button>
        <div className="flex-1" />
        <button onClick={onCancel} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
        <button onClick={onSave} disabled={!data.title}
          className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium text-sm rounded-lg">{saveLabel}</button>
      </div>
    </div>
  );

  const UploadButton = ({ kind, label }) => (
    <button onClick={() => { setUploadKind(kind); setTimeout(() => fileInputRef.current?.click(), 50); }}
      disabled={uploading || !canEdit}
      className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded-lg">
      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {label}
    </button>
  );

  // Widget definition with categories
  const widgetDefs = [
    { key: 'show_clock', label: 'Uhrzeit & Datum', icon: Clock, cat: 'display' },
    { key: 'show_logo', label: 'Logo', icon: Image, cat: 'display' },
    { key: 'show_background_image', label: 'Hintergrundbild', icon: ImageIcon, cat: 'display' },
    { key: 'show_on_air', label: 'ON AIR Indikator', icon: Radio, cat: 'display' },
    { key: 'show_events', label: 'Veranstaltungen', icon: Calendar, cat: 'content' },
    { key: 'show_announcements', label: 'Ankündigungen', icon: Megaphone, cat: 'content' },
    { key: 'show_countdown', label: 'Event-Countdown', icon: Clock, cat: 'content' },
    { key: 'show_custom_countdown', label: 'Eigener Countdown', icon: Timer, cat: 'content' },
    { key: 'show_free_text', label: 'Freier Text', icon: AlignLeft, cat: 'content' },
    { key: 'show_weather', label: 'Wetter', icon: CloudSun, cat: 'external' },
    { key: 'show_webuntis', label: 'WebUntis', icon: Calendar, cat: 'external' },
    { key: 'show_qr_code', label: 'QR-Code', icon: QrCode, cat: 'external' },
    { key: 'show_slideshow', label: 'Slideshow', icon: Image, cat: 'advanced' },
    { key: 'show_pdf', label: 'PDF-Anzeige', icon: FileText, cat: 'advanced' },
    { key: 'show_page_rotation', label: 'Seitenrotation', icon: RotateCw, cat: 'advanced' },
  ];

  const catLabels = { display: 'Anzeige', content: 'Inhalte', external: 'Externe Daten', advanced: 'Erweitert' };
  const cats = ['display', 'content', 'external', 'advanced'];

  const importRef = useRef(null);
  const activeView = views.find(p => p.id === activeViewId);

  // Detaileinstellungen je Widget — direkt unter dem Schalter (inline).
  // Widgets ohne Extra-Einstellungen (bzw. in „Medien" konfigurierte) geben null zurück.
  const settingsCard = (icon, title, body) => (
    <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
      <h4 className="text-sm font-semibold text-white flex items-center gap-2">{icon} {title}</h4>
      {body}
    </div>
  );
  const renderWidgetSettings = (key) => {
    const c = monitorConfig; if (!c) return null;
    const inp = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50';
    switch (key) {
      case 'show_weather': return settingsCard(<CloudSun className="w-4 h-4 text-gray-400" />, 'Wetter', <>
        <div><label className="block text-xs text-gray-500 mb-1">Stadt</label>
          <input type="text" value={c.weather_city} onChange={e => updateConfig('weather_city', e.target.value)} disabled={!canEdit} placeholder="z.B. Lübeck" className={inp} /></div>
        <p className="text-[11px] text-gray-500">API-Key wird einmal global unter „Einstellungen → Globale Zugänge" hinterlegt.</p>
      </>);
      case 'show_webuntis': return settingsCard(<Calendar className="w-4 h-4 text-gray-400" />, 'WebUntis iFrame', <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Gespeicherter Link (2 Tage)</label>
            <select value={c.webuntis_link_id || ''} disabled={!canEdit} onChange={e => updateConfig('webuntis_link_id', e.target.value ? parseInt(e.target.value) : null)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm disabled:opacity-50">
              <option value="">Eigener Link (unten)</option>{webuntisLinks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Gespeicherter Link (1 Tag)</label>
            <select value={c.webuntis_link_next_day_id || ''} disabled={!canEdit} onChange={e => updateConfig('webuntis_link_next_day_id', e.target.value ? parseInt(e.target.value) : null)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm disabled:opacity-50">
              <option value="">Eigener Link (unten)</option>{webuntisLinks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        </div>
        <p className="text-[11px] text-gray-500">Gespeicherte Links (Bibliothek unter „Inhalte") haben Vorrang. Sonst eigene Links:</p>
        <div><label className="block text-xs text-gray-500 mb-1">Eigener Link (2 Tage)</label>
          <input type="url" value={c.webuntis_url} onChange={e => updateConfig('webuntis_url', e.target.value)} disabled={!canEdit} placeholder="https://neilo.webuntis.com/..." className={inp} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Eigener Link (1 Tag, kompakt)</label>
          <input type="url" value={c.webuntis_url_next_day || ''} onChange={e => updateConfig('webuntis_url_next_day', e.target.value)} disabled={!canEdit} placeholder="leer = 2-Tage-Link" className={inp} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Zoom: {c.webuntis_zoom}%</label>
            <input type="range" min={50} max={150} value={c.webuntis_zoom} onChange={e => updateConfig('webuntis_zoom', parseInt(e.target.value))} disabled={!canEdit} className="w-full accent-accent" /></div>
          <div className="flex items-end">
            <button onClick={() => canEdit && updateConfig('webuntis_dark_mode', !c.webuntis_dark_mode)} disabled={!canEdit}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${c.webuntis_dark_mode ? 'bg-accent/10 border-accent/50 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}><Moon className="w-4 h-4 inline mr-1" /> Dark-Mode</button></div>
        </div>
      </>);
      case 'show_qr_code': return settingsCard(<QrCode className="w-4 h-4 text-gray-400" />, 'QR-Code', <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">URL</label>
          <input type="url" value={c.qr_code_url} onChange={e => updateConfig('qr_code_url', e.target.value)} disabled={!canEdit} placeholder="https://..." className={inp} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Beschriftung</label>
          <input type="text" value={c.qr_code_label} onChange={e => updateConfig('qr_code_label', e.target.value)} disabled={!canEdit} placeholder="z.B. Event-Anmeldung" className={inp} /></div>
      </div>);
      case 'show_free_text': return settingsCard(<AlignLeft className="w-4 h-4 text-gray-400" />, 'Freier Textblock', <>
        <input type="text" value={c.free_text_title} onChange={e => updateConfig('free_text_title', e.target.value)} disabled={!canEdit} placeholder="Titel" className={inp} />
        <textarea value={c.free_text_content} onChange={e => updateConfig('free_text_content', e.target.value)} disabled={!canEdit} placeholder="Inhalt..." rows={3} className={`${inp} resize-none`} />
      </>);
      case 'show_custom_countdown': return settingsCard(<Timer className="w-4 h-4 text-gray-400" />, 'Eigener Countdown', <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">Event-Name</label>
          <input type="text" value={c.custom_countdown_name} onChange={e => updateConfig('custom_countdown_name', e.target.value)} disabled={!canEdit} placeholder="z.B. Schulkonzert" className={inp} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Datum &amp; Uhrzeit</label>
          <input type="datetime-local" value={c.custom_countdown_date ? c.custom_countdown_date.slice(0, 16) : ''} onChange={e => updateConfig('custom_countdown_date', e.target.value ? e.target.value + ':00Z' : null)} disabled={!canEdit} className={inp} /></div>
      </div>);
      case 'show_page_rotation': return settingsCard(<RotateCw className="w-4 h-4 text-gray-400" />, 'Seitenrotation', <>
        <div><label className="block text-xs text-gray-500 mb-1">Intervall: {c.page_rotation_interval} Sekunden</label>
          <input type="range" min={5} max={120} value={c.page_rotation_interval} onChange={e => updateConfig('page_rotation_interval', parseInt(e.target.value))} disabled={!canEdit} className="w-full accent-accent" /></div>
        <div><label className="block text-xs text-gray-500 mb-2">Seiten zum Rotieren</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[{ id: 'main', label: 'Hauptansicht' }, { id: 'events', label: 'Veranstaltungen' }, { id: 'announcements', label: 'Ankündigungen' }, { id: 'weather', label: 'Wetter' }, { id: 'slideshow', label: 'Slideshow' }, { id: 'pdf', label: 'PDF' }, { id: 'free_text', label: 'Freier Text' }].map(page => {
              const selected = (c.page_rotation_pages || []).includes(page.id);
              return (<button key={page.id} onClick={() => { if (!canEdit) return; const s = c.page_rotation_pages || []; updateConfig('page_rotation_pages', selected ? s.filter(x => x !== page.id) : [...s, page.id]); }} disabled={!canEdit}
                className={`p-2 rounded-lg text-xs border transition-colors disabled:opacity-50 ${selected ? 'bg-accent/10 border-accent/50 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>{page.label}</button>);
            })}
          </div></div>
      </>);
      default: return null;
    }
  };

  const areaNav = [
    { id: 'overview', label: 'Übersicht', icon: Activity },
    { id: 'views', label: 'Ansichten', icon: LayoutGrid },
    { id: 'screens', label: 'Bildschirme', icon: Monitor },
    { id: 'content', label: 'Inhalte', icon: Megaphone },
    { id: 'events', label: 'Events', icon: Radio },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ];

  return (
    <AreaContext.Provider value={activeArea}>
    <div className="max-w-[1800px] mx-auto flex gap-5">
      {/* ═══ Seitenleiste (Desktop) ═══ */}
      <aside className="hidden md:flex flex-col gap-1 w-52 shrink-0 sticky top-4 self-start">
        <div className="px-3 pt-2 pb-3 mb-1">
          <p className="font-display text-xl font-bold tracking-tight text-white leading-tight">Monitor</p>
        </div>
        {areaNav.map(a => {
          const Ico = a.icon;
          const active = activeArea === a.id;
          return (
            <button key={a.id} onClick={() => setActiveArea(a.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-gray-800 text-white shadow-[inset_2px_0_0_0_var(--color-accent)]' : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
              }`}>
              <Ico className="w-4 h-4 shrink-0" /> {a.label}
              {a.id === 'events' && events.some(e => e.is_active) && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
            </button>
          );
        })}
      </aside>

      {/* ═══ Hauptspalte ═══ */}
      <div className="flex-1 min-w-0 space-y-4">
      {/* ═══ Sticky Header ═══ */}
      <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm text-gray-400 mb-1 md:hidden">Monitor</p>
              <h1 className="font-display text-[1.6rem] leading-none font-bold tracking-tight text-white">{areaNav.find(a => a.id === activeArea)?.label}</h1>
              {activeArea === 'views' && hasChanges ? (
                <p className="text-xs text-amber-400 flex items-center gap-1 mt-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Ungespeicherte Änderungen
                </p>
              ) : activeArea === 'views' && savedAt && Date.now() - savedAt < 4000 ? (
                <p className="text-xs text-emerald-400 flex items-center gap-1 mt-1.5">
                  <Check className="w-3 h-3" /> Gespeichert
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Speichern nur im Bereich „Ansichten" (speichert die Profil-Konfiguration) */}
            {activeArea === 'views' && canEdit && (
              <button onClick={handleSaveMonitorConfig} disabled={monitorSaving || !monitorConfig || !hasChanges}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${
                  hasChanges
                    ? 'bg-accent hover:bg-accent-hover text-white shadow-sm'
                    : 'bg-gray-800 text-gray-500'
                } disabled:opacity-60`}>
                {monitorSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Speichern
                {hasChanges && <kbd className="hidden md:inline text-[10px] font-sans bg-black/20 px-1.5 py-0.5 rounded">Strg+S</kbd>}
              </button>
            )}
          </div>
        </div>

        {/* Bereichs-Navigation (Mobile) */}
        <div className="md:hidden mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {areaNav.map(a => {
            const Ico = a.icon;
            const active = activeArea === a.id;
            return (
              <button key={a.id} onClick={() => setActiveArea(a.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-gray-800 text-white ring-1 ring-inset ring-accent/50' : 'bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-800'
                }`}>
                <Ico className="w-4 h-4" /> {a.label}
                {a.id === 'events' && events.some(e => e.is_active) && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Inhaltsbereich (mit fester Vorschau-Spalte in „Ansichten") ═══ */}
      <div className={activeArea === 'views' && showPreview ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5 lg:items-start' : ''}>
      <div className="space-y-4 min-w-0">

      {/* ═══ Bildschirme ═══ */}
      <Section id="screens" area="screens" plain title="Bildschirme" description="Physische Monitore mit eigenen Zeitplänen und Power-Steuerung"
        icon={Monitor} open={openSections.screens} onToggle={toggleSection}
        badge={screens.length || null}>

        {/* Bildschirm-Liste */}
        <div className="flex flex-wrap gap-2 mb-3">
          {screens.map(screen => (
            <button key={screen.id} onClick={() => setActiveScreenId(activeScreenId === screen.id ? null : screen.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                screen.id === activeScreenId
                  ? 'bg-accent/10 border border-accent/50 text-white'
                  : 'bg-gray-800/60 border border-gray-700/60 text-gray-400 hover:text-white hover:border-gray-600'
              }`}>
              <Monitor className="w-3.5 h-3.5" />
              {screen.name}
              {(screen.schedule || []).length > 0 && <CalendarClock className="w-3 h-3 text-green-400" />}
            </button>
          ))}
          {canEdit && (
            <button onClick={() => setShowNewScreen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 border border-dashed border-gray-700 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Neuer Bildschirm
            </button>
          )}
        </div>

        {/* Neuer Bildschirm Dialog */}
        {showNewScreen && (
          <div className="p-4 border border-gray-700 rounded-xl bg-gray-800/30 space-y-3 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input type="text" value={newScreenName} onChange={e => setNewScreenName(e.target.value)}
                placeholder="z.B. Eingang, Lehrerzimmer" autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                onKeyDown={e => e.key === 'Enter' && handleCreateScreen()} />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => { setShowNewScreen(false); setNewScreenName(''); }}
                className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
              <button onClick={handleCreateScreen} disabled={!newScreenName.trim()}
                className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded-lg">Erstellen</button>
            </div>
          </div>
        )}

        {/* Aktiver Bildschirm — Detail */}
        {activeScreenId && (() => {
          const screen = screens.find(b => b.id === activeScreenId);
          if (!screen) return null;
          const screenSchedule = screen.schedule || [];
          return (
            <div className="p-4 border border-gray-700 rounded-xl bg-gray-800/20 space-y-4">
              {/* Name & Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input type="text" value={screen.name} disabled={!canEdit}
                    onChange={e => updateScreenLocal(screen.id, 'name', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Slug</label>
                  <input type="text" value={screen.slug} disabled={!canEdit}
                    onChange={e => updateScreenLocal(screen.id, 'slug', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
                </div>
              </div>

              {/* Default-Profil */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Standard-Ansicht (Fallback)</label>
                <select value={screen.default_view_id || ''} disabled={!canEdit}
                  onChange={e => updateScreenLocal(screen.id, 'default_view_id', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50">
                  <option value="">Globaler Standard</option>
                  {views.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">Wird angezeigt wenn kein Zeitplan-Eintrag greift</p>
              </div>

              {/* Monitor-URL */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Monitor-URL</label>
                <div className="flex gap-2">
                  <input type="text" readOnly
                    value={`${window.location.origin}/monitor?screen=${screen.slug}`}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono" />
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/monitor?screen=${screen.slug}`); toast.success('URL kopiert'); }}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-lg">
                    <Copy className="w-4 h-4" />
                  </button>
                  <a href={`/monitor?screen=${screen.slug}`} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-lg flex items-center">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Zeitplan */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Zeitplan</h4>
                    <p className="text-xs text-gray-500">Welche Ansicht wird wann angezeigt?</p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      {screens.filter(o => o.id !== screen.id && (o.schedule || []).length > 0).length > 0 && (
                        <select value="" onChange={e => {
                          const src = screens.find(o => o.id === parseInt(e.target.value));
                          if (src) updateScreenLocal(screen.id, 'schedule', JSON.parse(JSON.stringify(src.schedule || [])));
                        }}
                          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs" title="Zeitplan von einem anderen Bildschirm übernehmen">
                          <option value="">Zeitplan kopieren von …</option>
                          {screens.filter(o => o.id !== screen.id && (o.schedule || []).length > 0).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      )}
                      <button onClick={() => {
                        const updated = [...screenSchedule, { view_id: views[0]?.id || null, days: [0,1,2,3,4], from: '08:00', until: '16:00' }];
                        updateScreenLocal(screen.id, 'schedule', updated);
                      }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg">
                        <Plus className="w-3.5 h-3.5" /> Zeitfenster
                      </button>
                    </div>
                  )}
                </div>

                {screenSchedule.length === 0 ? (
                  <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700/40 text-center">
                    <p className="text-gray-500 text-sm">Kein Zeitplan. Es läuft immer die Standard-Ansicht.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ScheduleTimeline schedule={screenSchedule} views={views} />
                    {screenSchedule.map((entry, idx) => (
                      <div key={idx} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/40">
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Profil-Auswahl */}
                          <select value={entry.view_id || ''} disabled={!canEdit}
                            onChange={e => {
                              const updated = [...screenSchedule];
                              updated[idx] = { ...entry, view_id: parseInt(e.target.value) };
                              updateScreenLocal(screen.id, 'schedule', updated);
                            }}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50 min-w-[140px]">
                            {views.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {/* Wochentage */}
                          <div className="flex gap-1">
                            {WEEKDAYS.map((day, dayIdx) => (
                              <button key={dayIdx} disabled={!canEdit}
                                onClick={() => {
                                  const days = entry.days || [];
                                  const updated = [...screenSchedule];
                                  updated[idx] = { ...entry, days: days.includes(dayIdx) ? days.filter(t => t !== dayIdx) : [...days, dayIdx] };
                                  updateScreenLocal(screen.id, 'schedule', updated);
                                }}
                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                                  (entry.days || []).includes(dayIdx)
                                    ? 'bg-green-600/30 border border-green-500/40 text-green-300'
                                    : 'bg-gray-800 border border-gray-700 text-gray-500'
                                }`}>
                                {day}
                              </button>
                            ))}
                          </div>
                          {/* Zeiten */}
                          <div className="flex items-center gap-2">
                            <input type="time" value={entry.from || '08:00'} disabled={!canEdit}
                              onChange={e => {
                                const updated = [...screenSchedule];
                                updated[idx] = { ...entry, from: e.target.value };
                                updateScreenLocal(screen.id, 'schedule', updated);
                              }}
                              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50" />
                            <span className="text-gray-500">–</span>
                            <input type="time" value={entry.until || '16:00'} disabled={!canEdit}
                              onChange={e => {
                                const updated = [...screenSchedule];
                                updated[idx] = { ...entry, until: e.target.value };
                                updateScreenLocal(screen.id, 'schedule', updated);
                              }}
                              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50" />
                          </div>
                          {canEdit && (
                            <button onClick={() => {
                              const updated = screenSchedule.filter((_, i) => i !== idx);
                              updateScreenLocal(screen.id, 'schedule', updated);
                            }}
                              className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-gray-800">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Power-Steuerung (HDMI-CEC) */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-1">Power-Steuerung (HDMI-CEC)</h4>
                <p className="text-xs text-gray-500 mb-3">TV/Monitor automatisch ein- und ausschalten per Raspberry Pi. Zeitzone: Europe/Berlin (Sommerzeit automatisch).</p>

                <PowerScheduleEditor screen={screen} canEdit={canEdit}
                  update={(key, value) => updateScreenLocal(screen.id, key, value)} />

                {/* CEC-Status vom Pi */}
                {screen.cec_status && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                      screen.cec_status === 'on' ? 'bg-green-900/40 text-green-400 border border-green-700/40' :
                      screen.cec_status === 'standby' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40' :
                      'bg-gray-800 text-gray-400 border border-gray-700/40'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        screen.cec_status === 'on' ? 'bg-green-400' :
                        screen.cec_status === 'standby' ? 'bg-yellow-400' : 'bg-gray-500'
                      }`} />
                      TV: {screen.cec_status === 'on' ? 'An' : screen.cec_status === 'standby' ? 'Standby' : screen.cec_status}
                    </span>
                    {screen.cec_status_at && (
                      <span className="text-[10px] text-gray-500">
                        Zuletzt: {new Date(screen.cec_status_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/40">
                  <p className="text-[10px] text-gray-400 font-medium mb-1">API-Endpoint für den Raspberry Pi:</p>
                  <div className="flex gap-2 items-center">
                    <code className="text-[10px] text-gray-300 bg-gray-800 px-2 py-1 rounded font-mono flex-1 truncate">
                      GET /api/monitor/screen/power?slug={screen.slug}
                    </code>
                    <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/monitor/screen/power?slug=${screen.slug}`); toast.success('URL kopiert'); }}
                      className="p-1 text-gray-500 hover:text-white shrink-0">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">Leer lassen = immer an. Pi pollt diesen Endpoint per Cronjob und steuert cec-client.</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                {canEdit && (
                  <button onClick={() => handleDeleteScreen(screen.id)}
                    className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg text-sm">
                    <Trash2 className="w-3.5 h-3.5" /> Bildschirm löschen
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => handleSaveScreen(screen)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg">
                    <Save className="w-3.5 h-3.5" /> Speichern
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {screens.length === 0 && !showNewScreen && (
          <div className="p-6 text-center text-gray-500">
            <Monitor className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Noch keine Bildschirme konfiguriert</p>
            <p className="text-xs mt-1">Erstelle Bildschirme um verschiedene Monitore mit eigenen Zeitplänen zu steuern</p>
          </div>
        )}
      </Section>

      {/* ═══ Klausuren — pro Bildschirm (Bereich: Inhalte) ═══ */}
      {activeArea === 'content' && (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-800 ring-1 ring-inset ring-gray-700/70">
              <AlignLeft className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Klausuren</h3>
              <p className="text-xs text-gray-500">Zeitfenster mit Hinweisbildschirm für ausgewählte Bildschirme</p>
            </div>
            {exams.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded-md">{exams.length}</span>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {exams.length > 0 && (
                <button onClick={() => {
                  const last = [...exams].sort((a, b) => new Date(b.active_from) - new Date(a.active_from))[0];
                  const now = new Date();
                  const duration = (new Date(last.active_until) - new Date(last.active_from)) || 90 * 60000;
                  setExamTemplate({
                    title: last.title, text: last.text || '', color: last.color || '#1e40af',
                    active_from: now.toISOString(), active_until: new Date(now.getTime() + duration).toISOString(),
                    screen_ids: last.screen_ids || [], display_mode: last.display_mode || 'fullscreen',
                    webuntis_link_id: last.webuntis_link_id || null,
                    split_side: last.split_side || 'right', split_percent: last.split_percent || 50,
                  });
                  setShowNewExam(true);
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/60 hover:bg-gray-700 border border-gray-600/60 text-gray-200 text-sm rounded-lg" title="Übernimmt Titel, Text, Farbe, Dauer und Bildschirme der letzten Klausur">
                  <Copy className="w-3.5 h-3.5" /> Aus letzter
                </button>
              )}
              <button onClick={() => { setExamTemplate(null); setShowNewExam(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Neue Klausur
              </button>
            </div>
          )}
        </div>

        {/* Eigene Vorlagen — anklicken füllt das Formular vor */}
        {canEdit && !showNewExam && (
          <ExamTemplatesBar
            templates={examTemplates} webuntisLinks={webuntisLinks}
            onApply={(v) => {
              const now = new Date();
              const until = new Date(now.getTime() + (v.duration_minutes || 90) * 60000);
              setExamTemplate({
                title: v.title || 'Klausur', text: v.text || '', color: v.color || '#1e40af',
                active_from: now.toISOString(), active_until: until.toISOString(),
                screen_ids: [], display_mode: v.display_mode || 'fullscreen',
                webuntis_link_id: v.webuntis_link_id || null,
                split_side: v.split_side || 'right', split_percent: v.split_percent || 50,
              });
              setShowNewExam(true);
            }}
            onSave={saveExamTemplate} onDelete={deleteExamTemplate} />
        )}

        {showNewExam && (
          <ExamForm
            initial={examTemplate}
            screens={screens}
            webuntisLinks={webuntisLinks}
            onSave={handleCreateExam}
            onCancel={() => { setShowNewExam(false); setExamTemplate(null); }}
          />
        )}

        {exams.length === 0 && !showNewExam ? (
          <div className="text-center text-gray-500 py-4">
            <p className="text-sm">Keine Klausuren geplant</p>
          </div>
        ) : (
          <div className="space-y-2">
            {exams.map(k => (
              <ExamCard
                key={k.id} exam={k} screens={screens}
                webuntisLinks={webuntisLinks}
                canEdit={canEdit}
                onLocalChange={(patch) => updateExamLocal(k.id, patch)}
                onSave={(payload) => handleUpdateExam(k.id, payload)}
                onDelete={() => handleDeleteExam(k.id)}
              />
            ))}
          </div>
        )}
      </div>
      )}


      {!monitorConfig ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
        </div>
      ) : (
        <>
          {activeArea === 'views' && (
          <>
          {/* ═══ Ansichten-Tabs ═══ */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs text-gray-400 font-semibold">Ansichten</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowPreview(!showPreview)}
                  className={`p-1.5 rounded-lg transition-colors ${showPreview ? 'bg-accent text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  title="Live-Vorschau ein/aus">
                  <Eye className="w-4 h-4" />
                </button>
                <a href={`/monitor${monitorConfig?.slug ? `?view=${monitorConfig.slug}` : ''}`} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg" title="In neuem Tab öffnen">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            {views.length > 6 && (
              <div className="mb-2">
                <input type="text" value={tabFilter} onChange={e => setTabFilter(e.target.value)}
                  placeholder="Ansichten filtern …"
                  className="w-full sm:w-64 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm" />
              </div>
            )}
            <div className="flex items-center gap-2 overflow-x-auto">
              {views.filter(p => !tabFilter || p.name.toLowerCase().includes(tabFilter.toLowerCase())).map(p => (
                renamingId === p.id ? (
                  <input key={p.id} autoFocus value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') setRenamingId(null); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 border border-accent/60 text-white w-40" />
                ) : (
                  <button key={p.id} onClick={() => switchView(p.id)} onDoubleClick={() => startRename(p)}
                    draggable={canEdit}
                    onDragStart={() => { dragViewId.current = p.id; }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => reorderViews(p.id)}
                    title={canEdit ? 'Doppelklick zum Umbenennen · ziehen zum Sortieren' : undefined}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                      p.id === activeViewId
                        ? 'bg-accent/10 border border-accent/50 text-white'
                        : 'bg-gray-800/60 border border-gray-700/60 text-gray-400 hover:text-white hover:border-gray-600'
                    }`}>
                    {p.layout === 'timetable' ? <LayoutGrid className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                    {p.name}
                    {p.is_default && <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-700/50 text-gray-300 ring-1 ring-inset ring-gray-600/40 rounded-md">Standard</span>}
                    {p.is_on_air && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                    {p.schedule?.length > 0 && <CalendarClock className="w-3 h-3 text-green-400" />}
                  </button>
                )
              ))}
              {canEdit && (
                <button onClick={() => setShowNewView(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 border border-dashed border-gray-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Neue Ansicht
                </button>
              )}
            </div>

            {/* Profil-Aktionen (nur mit Bearbeiten-Recht) */}
            {canEdit && activeView && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-800/60">
                <span className="text-[11px] text-gray-500 mr-1">Aktive Ansicht:</span>
                <button onClick={handleDuplicateView} title="Duplizieren"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-800 text-gray-300 hover:bg-gray-700">
                  <Copy className="w-3.5 h-3.5" /> Duplizieren
                </button>
                <button onClick={() => moveView(-1)} title="Nach vorne" className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700">◀</button>
                <button onClick={() => moveView(1)} title="Nach hinten" className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700">▶</button>
                {!activeView.is_default && (
                  <button onClick={() => handleDeleteView(activeViewId)} title="Löschen"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-800 text-gray-400 hover:text-red-400 hover:bg-gray-700 ml-auto">
                    <Trash2 className="w-3.5 h-3.5" /> Löschen
                  </button>
                )}
              </div>
            )}

            {/* New Profile Dialog */}
            {showNewView && (
              <div className="mt-3 p-4 border border-gray-700 rounded-xl bg-gray-800/30 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                    <input type="text" value={newViewName} onChange={e => setNewViewName(e.target.value)}
                      placeholder="z.B. Vertretungsplan" autoFocus
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Layout</label>
                    <select value={newViewLayout} onChange={e => setNewViewLayout(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent">
                      {LAYOUTS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Einstellungen kopieren von</label>
                  <select value={cloneFromId || ''} onChange={e => setCloneFromId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent">
                    <option value="">Leer starten</option>
                    {views.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => { setShowNewView(false); setNewViewName(''); }}
                    className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
                  <button onClick={handleCreateView} disabled={!newViewName.trim()}
                    className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded-lg">Erstellen</button>
                </div>
              </div>
            )}
          </div>

          {/* ═══ Mini Preview (nur mobil — Desktop hat feste Vorschau-Spalte) ═══ */}
          {showPreview && (
            <div className="lg:hidden bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-800">
                <span className="text-xs text-gray-400 flex items-center gap-2">
                  <Activity className="w-3 h-3" /> Live-Vorschau · {activeView?.name}
                </span>
                <div className="flex items-center gap-2">
                  <a href={`/monitor?view=${monitorConfig.slug}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="relative" style={{ paddingBottom: '28%' }}>
                <iframe
                  key={`${monitorConfig.slug}-${savedAt}`}
                  src={`/monitor?view=${monitorConfig.slug}`}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Monitor Preview"
                  style={{ pointerEvents: 'none' }}
                />
              </div>
            </div>
          )}
          </>
          )}

          {activeArea === 'overview' && (
          <>
          {/* Schnellaktionen */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { setExamTemplate(null); setShowNewExam(true); setActiveArea('content'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Klausur
              </button>
              <button onClick={() => setActiveArea('events')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg">
                <Radio className="w-3.5 h-3.5" /> Events
              </button>
              <button onClick={() => setActiveArea('content')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/60 hover:bg-gray-700 border border-gray-600/60 text-gray-200 text-sm rounded-lg">
                <Megaphone className="w-3.5 h-3.5" /> Ankündigung
              </button>
            </div>
          )}
          {/* ═══ Bildschirm-Cockpit — was läuft gerade wo ═══ */}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Monitor className="w-4 h-4 text-gray-400" /> Bildschirme ({screens.length})</h3>
              <div className="flex items-center gap-2">
                {canEdit && screens.length > 1 && (
                  <>
                    <select value="" onChange={e => e.target.value && setAllOverride(parseInt(e.target.value))}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs">
                      <option value="">Alle umschalten auf …</option>
                      {views.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {screens.some(b => b.override_view_id) && (
                      <button onClick={() => setAllOverride(null)} className="px-2 py-1 text-xs rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600">Alle zurück</button>
                    )}
                  </>
                )}
                <button onClick={() => setActiveArea('screens')} className="text-xs text-gray-400 hover:text-white">verwalten →</button>
              </div>
            </div>
            {screens.length === 0 ? (
              <div className="p-8 text-center text-gray-500 border border-gray-800 rounded-xl">
                <Monitor className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Noch keine Bildschirme. Unter „Bildschirme“ anlegen.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {screens.map(screen => {
                  const activeEvent = events.find(e => e.is_active && (e.assignments || []).some(z => z.screen_id === screen.id));
                  return (
                    <div key={screen.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <div className="relative bg-black" style={{ paddingBottom: '56.25%' }}>
                        <iframe key={screen.slug} src={`/monitor?screen=${screen.slug}`}
                          className="absolute inset-0 w-full h-full border-0" title={screen.name}
                          style={{ pointerEvents: 'none' }} loading="lazy" />
                        {activeEvent && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] rounded font-medium text-white" style={{ background: activeEvent.color }}>
                            {activeEvent.name}
                          </span>
                        )}
                        {screen.override_view_id && (
                          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded font-medium bg-amber-500 text-black">
                            Override
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Monitor className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          <span className="text-sm text-white truncate">{screen.name}</span>
                          {(screen.schedule || []).length > 0 && <CalendarClock className="w-3 h-3 text-green-400 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {canEdit && (
                            <button onClick={() => reloadScreen(screen)} className="text-gray-500 hover:text-white" title="Ansicht auf dem Bildschirm neu laden">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <a href={`/monitor?screen=${screen.slug}`} target="_blank" rel="noopener noreferrer"
                            className="text-gray-500 hover:text-white" title="Groß öffnen"><Maximize2 className="w-3.5 h-3.5" /></a>
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1.5 px-3 pb-2">
                          <select value={screen.override_view_id || ''} onChange={e => setScreenOverride(screen, e.target.value ? parseInt(e.target.value) : null)}
                            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs">
                            <option value="">Jetzt umschalten auf …</option>
                            {views.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {screen.override_view_id && (
                            <button onClick={() => setScreenOverride(screen, null)}
                              className="px-2 py-1 text-xs rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 shrink-0" title="Override zurücksetzen">
                              Zurück
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Events-Schnellzugriff */}
          {events.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2"><Radio className="w-4 h-4 text-gray-400" /> Events</h3>
              <div className="flex flex-wrap gap-2">
                {events.map(ev => (
                  <button key={ev.id} onClick={() => canEdit && toggleEventActive(ev)} disabled={!canEdit}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                      ev.is_active ? 'bg-accent text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: ev.is_active ? '#fff' : ev.color }} />
                    {ev.name}{ev.is_active && ' · aktiv'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Quick Actions ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`rounded-xl p-4 border ${monitorConfig.is_on_air ? 'bg-red-900/15 border-red-600/40' : 'bg-gray-900 border-gray-800'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Radio className={`w-6 h-6 ${monitorConfig.is_on_air ? 'text-red-500 animate-pulse' : 'text-gray-600'}`} />
                  <div>
                    <h3 className="font-bold text-white text-sm">{monitorConfig.on_air_text || 'ON AIR'}</h3>
                    <p className="text-[11px] text-gray-500">{monitorConfig.is_on_air ? 'Aktiv auf allen Monitoren' : 'Deaktiviert'}</p>
                  </div>
                </div>
                <button onClick={handleToggleOnAir} disabled={!canOnAir}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all disabled:opacity-50 ${
                    monitorConfig.is_on_air
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}>
                  {monitorConfig.is_on_air ? 'STOP' : 'GO LIVE'}
                </button>
              </div>
            </div>
            <div className={`rounded-xl p-4 border ${monitorConfig.emergency_active ? 'bg-red-900/20 border-red-500/40' : 'bg-gray-900 border-gray-800'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`w-6 h-6 ${monitorConfig.emergency_active ? 'text-red-400 animate-pulse' : 'text-gray-600'}`} />
                  <div>
                    <h3 className="font-bold text-white text-sm">Notfall-Meldung</h3>
                    <p className="text-[11px] text-gray-500">{monitorConfig.emergency_active ? 'Aktiv auf allen Monitoren' : 'Deaktiviert'}</p>
                  </div>
                </div>
                <button onClick={handleToggleEmergency} disabled={!canEmergency}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all disabled:opacity-50 ${
                    monitorConfig.emergency_active
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}>
                  {monitorConfig.emergency_active ? 'DEAKTIVIEREN' : 'AKTIVIEREN'}
                </button>
              </div>
              {canEmergency && (
                <input type="text" value={monitorConfig.emergency_text} onChange={e => updateConfig('emergency_text', e.target.value)}
                  placeholder="Notfall-Text..."
                  className="w-full mt-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500" />
              )}
            </div>
          </div>
          </>
          )}

          {/* ═══ Profil & Zeitplan ═══ */}
          <Section id="view" area="views" title="Ansicht & Zeitplan" description="Name, Layout-Modus und automatische Zeitsteuerung"
            icon={CalendarClock} open={openSections.view} onToggle={toggleSection}
            badge={monitorConfig.schedule?.length || null}>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Name der Ansicht</label>
                <input type="text" value={monitorConfig.name} onChange={e => updateConfig('name', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Slug (URL)</label>
                <input type="text" value={monitorConfig.slug} onChange={e => updateConfig('slug', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Layout-Modus</label>
                <select value={monitorConfig.layout} onChange={e => updateConfig('layout', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50">
                  {LAYOUTS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </div>
            </div>

            {/* Inline-Validierung: häufige Fehlkonfigurationen vor Live warnen */}
            {(() => {
              const warns = [];
              const lm = monitorConfig.layout;
              const hasUntis = monitorConfig.webuntis_link_id || monitorConfig.webuntis_url;
              if (lm === 'departures' && !(monitorConfig.transit_stops || []).length)
                warns.push('Abfahrtsmonitor ohne Stationen: unter „ÖPNV Abfahrten“ mindestens eine Station eintragen.');
              if (lm === 'timetable' && !hasUntis)
                warns.push('Stundenplan-Vollbild ohne WebUntis-Link: die Anzeige bleibt sonst leer.');
              if (lm === 'image_fullscreen' && !monitorConfig.active_image_id)
                warns.push('Bild-Vollbild ohne ausgewähltes Bild.');
              if (lm === 'pdf_fullscreen' && !monitorConfig.active_pdf_id)
                warns.push('PDF-Vollbild ohne ausgewähltes PDF.');
              if (!monitorConfig.title || !monitorConfig.title.trim())
                warns.push('Kein Titel gesetzt.');
              if (warns.length === 0) return null;
              return (
                <div className="p-3 bg-amber-900/10 border border-amber-500/30 rounded-lg space-y-1">
                  {warns.map((w, i) => (
                    <p key={i} className="text-xs text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {w}
                    </p>
                  ))}
                </div>
              );
            })()}

            {monitorConfig.layout === 'timetable' && (
              <div className="p-3 bg-gray-800/40 border border-gray-700 rounded-lg">
                <p className="text-xs text-gray-300">
                  <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                  Stundenplan-Vollbild: WebUntis-iFrame so groß wie möglich, mit Uhr und ON AIR.
                </p>
              </div>
            )}
            {monitorConfig.layout === 'on_air' && (
              <div className="p-3 bg-red-900/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-300">
                  <Radio className="w-3.5 h-3.5 inline mr-1" />
                  ON AIR Display: Zeigt nur den ON AIR Status zentriert auf schwarzem Hintergrund. Perfekt für einen dedizierten ON AIR Monitor.
                </p>
              </div>
            )}
            {monitorConfig.layout === 'departures' && (
              <div className="p-3 bg-sky-500/[0.06] border border-sky-500/20 rounded-lg">
                <p className="text-xs text-sky-200">
                  <Activity className="w-3.5 h-3.5 inline mr-1" />
                  Abfahrtsmonitor: Zeigt Bus- und Bahnabfahrten in Echtzeit. Stationen und Filter unter &quot;ÖPNV Abfahrten&quot; konfigurieren.
                </p>
              </div>
            )}

            {monitorConfig.layout === 'split' && (() => {
              const SPLIT_CONTENTS = [
                { v: 'exam', l: 'Klausur' },
                { v: 'on_air', l: 'On Air' },
                { v: 'webuntis', l: 'WebUntis' },
                { v: 'clock', l: 'Uhr' },
                { v: 'empty', l: 'Leer' },
              ];
              const links = monitorConfig.split_left || 'exam';
              const rechts = monitorConfig.split_right || 'webuntis';
              const percent = monitorConfig.split_left_percent || 50;
              const hasWebuntis = links === 'webuntis' || rechts === 'webuntis';
              return (
                <div className="p-3 bg-gray-800/40 border border-gray-700 rounded-lg space-y-4">
                  <p className="text-xs text-gray-300">
                    <LayoutGrid className="w-3.5 h-3.5 inline mr-1" />
                    Splitscreen: zwei frei wählbare Inhalte nebeneinander.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Linke Seite</label>
                      <select value={links} onChange={e => updateConfig('split_left', e.target.value)} disabled={!canEdit}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                        {SPLIT_CONTENTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Rechte Seite</label>
                      <select value={rechts} onChange={e => updateConfig('split_right', e.target.value)} disabled={!canEdit}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                        {SPLIT_CONTENTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Aufteilung: {percent}% / {100 - percent}%
                    </label>
                    <input type="range" min={20} max={80} step={5} value={percent}
                      onChange={e => updateConfig('split_left_percent', parseInt(e.target.value))}
                      disabled={!canEdit} className="w-full accent-accent" />
                  </div>

                  {hasWebuntis && (
                    <div className="space-y-2 pt-2 border-t border-gray-700">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">WebUntis-Link (1 Tag, für Split)</label>
                        <input type="url" value={monitorConfig.webuntis_url_next_day || ''}
                          onChange={e => updateConfig('webuntis_url_next_day', e.target.value)} disabled={!canEdit}
                          placeholder="https://…webuntis.com/… (kompakte 1-Tages-Ansicht)"
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" />
                        <p className="text-[11px] text-gray-500 mt-1">
                          Leer = normaler WebUntis-Link (unter &quot;Widgets → WebUntis&quot;) wird genutzt.
                        </p>
                      </div>
                    </div>
                  )}

                  {(links === 'exam' || rechts === 'exam') && (
                    <p className="text-[11px] text-amber-400">
                      Klausur wird nur angezeigt, wenn der Monitor per Bildschirm (Slug) läuft und eine Klausur aktiv ist.
                    </p>
                  )}
                </div>
              );
            })()}

            {(monitorConfig.layout === 'pdf_fullscreen' || monitorConfig.layout === 'image_fullscreen') && (
              <div className="p-3 bg-orange-900/10 border border-orange-500/20 rounded-lg space-y-4">
                <p className="text-xs text-orange-300">
                  <FileText className="w-3.5 h-3.5 inline mr-1" />
                  Vollbild-Layout: {monitorConfig.layout === 'pdf_fullscreen' ? 'PDF' : 'Bild'} füllt den ganzen Bildschirm.
                </p>

                <div className="flex items-center gap-3">
                  <Toggle checked={!!monitorConfig.fullscreen_header} onChange={v => updateConfig('fullscreen_header', v)} disabled={!canEdit} />
                  <div>
                    <p className="text-sm text-white">Header oben anzeigen</p>
                    <p className="text-[11px] text-gray-500">Titel + Logo aus dem Standard-Layout als Überschrift</p>
                  </div>
                </div>

                {monitorConfig.layout === 'pdf_fullscreen' && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-gray-400 font-medium">PDF-Datei</label>
                        {canEdit && <UploadButton kind="pdf" label="PDF hochladen" />}
                      </div>
                      {pdfs.length ? (
                        <div className="space-y-1.5">
                          {pdfs.map(pdf => (
                            <div key={pdf.id} onClick={() => canEdit && updateConfig('active_pdf_id', monitorConfig.active_pdf_id === pdf.id ? null : pdf.id)}
                              className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${monitorConfig.active_pdf_id === pdf.id ? 'border-orange-500 bg-orange-900/20 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-300'}`}>
                              <FileText className="w-4 h-4 text-orange-400" />{pdf.name}
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-gray-500 text-xs">Noch keine PDFs. Oben hochladen.</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Seiten-Modus</label>
                        <select value={monitorConfig.pdf_mode || 'cycle'} onChange={e => updateConfig('pdf_mode', e.target.value)} disabled={!canEdit}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                          <option value="cycle">Automatisch durchschalten</option>
                          <option value="static">Feste Seite</option>
                          <option value="selection">Nur bestimmte Seiten</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Seiten pro Ansicht</label>
                        <select value={monitorConfig.pdf_per_screen || 1} onChange={e => updateConfig('pdf_per_screen', parseInt(e.target.value))} disabled={!canEdit}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                          <option value={1}>1 Seite</option>
                          <option value={2}>2 Seiten nebeneinander</option>
                          <option value={3}>3 Seiten nebeneinander</option>
                        </select>
                      </div>
                    </div>

                    {monitorConfig.pdf_mode === 'cycle' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Intervall pro Seite: {monitorConfig.pdf_interval || 10}s</label>
                        <input type="range" min={3} max={120} value={monitorConfig.pdf_interval || 10}
                          onChange={e => updateConfig('pdf_interval', parseInt(e.target.value))} disabled={!canEdit} className="w-full accent-orange-500" />
                      </div>
                    )}
                    {monitorConfig.pdf_mode === 'static' && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Feste Seite</label>
                        <input type="number" min={1} value={monitorConfig.pdf_static_page || 1}
                          onChange={e => updateConfig('pdf_static_page', parseInt(e.target.value) || 1)} disabled={!canEdit}
                          className="w-32 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" />
                      </div>
                    )}
                    {(monitorConfig.pdf_mode === 'selection' || monitorConfig.pdf_mode === 'cycle') && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Seiten-Auswahl{monitorConfig.pdf_mode === 'cycle' ? ' (optional)' : ''}
                        </label>
                        <input type="text" placeholder="z.B. 1,3,5-7 (leer = alle)" value={monitorConfig.pdf_pages || ''}
                          onChange={e => updateConfig('pdf_pages', e.target.value)} disabled={!canEdit}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" />
                      </div>
                    )}
                  </>
                )}

                {monitorConfig.layout === 'image_fullscreen' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-gray-400 font-medium">Bild auswählen</label>
                      {canEdit && <UploadButton kind="image" label="Bild hochladen" />}
                    </div>
                    {images.length ? (
                      <div className="grid grid-cols-4 gap-2">
                        {images.map(b => (
                          <div key={b.id} onClick={() => canEdit && updateConfig('active_image_id', monitorConfig.active_image_id === b.id ? null : b.id)}
                            className={`relative rounded-lg overflow-hidden border cursor-pointer ${monitorConfig.active_image_id === b.id ? 'border-orange-500 ring-2 ring-orange-500/40' : 'border-gray-700'}`}>
                            <img src={`${MEDIA_BASE}${b.file_url}`} alt={b.name} className="w-full h-20 object-cover" />
                            {monitorConfig.active_image_id === b.id && <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] bg-orange-500 text-white rounded">Aktiv</span>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-xs">Noch keine Bilder. Oben hochladen.</p>}
                    <div className="mt-3">
                      <label className="block text-xs text-gray-400 mb-1.5 font-medium">Skalierung</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { v: 'contain', l: 'Einpassen', desc: 'Ganzes Bild' },
                          { v: 'cover', l: 'Füllen', desc: 'Ausfüllen, ggf. beschnitten' },
                          { v: 'fill', l: 'Strecken', desc: 'Verzerrt' },
                        ].map(o => (
                          <button key={o.v} onClick={() => canEdit && updateConfig('image_fit', o.v)} disabled={!canEdit}
                            className={`py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                              (monitorConfig.image_fit || 'contain') === o.v
                                ? 'bg-orange-600/20 border-orange-500/40 text-orange-300'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-800/80'
                            }`}>
                            <div className="font-medium">{o.l}</div>
                            <div className="text-[10px] opacity-60">{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {monitorConfig.image_fit === 'cover' && monitorConfig.active_image_id && (() => {
                      const b = images.find(x => x.id === monitorConfig.active_image_id);
                      if (!b) return null;
                      const fx = monitorConfig.image_focus_x ?? 50, fy = monitorConfig.image_focus_y ?? 50;
                      return (
                        <div className="mt-3">
                          <label className="block text-xs text-gray-400 mb-1.5 font-medium">Fokuspunkt (ins Bild klicken)</label>
                          <div className="relative inline-block max-w-full rounded-lg overflow-hidden border border-gray-700 cursor-crosshair"
                            onClick={e => {
                              if (!canEdit) return;
                              const r = e.currentTarget.getBoundingClientRect();
                              const x = Math.min(100, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * 100)));
                              const y = Math.min(100, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * 100)));
                              updateConfig('image_focus_x', x); updateConfig('image_focus_y', y);
                            }}>
                            <img src={`${MEDIA_BASE}${b.file_url}`} alt="" className="block max-h-48 w-auto" />
                            <span className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white bg-orange-500/70 pointer-events-none shadow"
                              style={{ left: `${fx}%`, top: `${fy}%` }} />
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">Dieser Punkt bleibt sichtbar, wenn das Bild beim Füllen beschnitten wird.</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Toggle checked={monitorConfig.is_default} onChange={v => updateConfig('is_default', v)} disabled={!canEdit} />
              <div>
                <span className="text-sm text-white">Standard-Ansicht</span>
                <p className="text-xs text-gray-500">Wird angezeigt wenn keine andere Ansicht per Zeitplan aktiv ist</p>
              </div>
            </div>

            {/* Monitor-URL */}
            <div className="flex items-center gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-800">
              <Monitor className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">Monitor-URL für diese Ansicht</p>
                <code className="text-gray-200 text-sm font-mono">{window.location.origin}/monitor?view={monitorConfig.slug}</code>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/monitor?view=${monitorConfig.slug}`); toast.success('URL kopiert'); }}
                className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-gray-700"><Copy className="w-3.5 h-3.5" /></button>
            </div>

            {/* Zeitplan */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-white">Zeitplan</h4>
                  <p className="text-xs text-gray-500">Wann wird diese Ansicht automatisch aktiv?</p>
                </div>
                {canEdit && (
                  <button onClick={addScheduleEntry}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Zeitfenster
                  </button>
                )}
              </div>

              {(monitorConfig.schedule || []).length === 0 ? (
                <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700/40 text-center">
                  <p className="text-gray-500 text-sm">Kein Zeitplan. Die Ansicht erscheint nur per URL oder als Standard.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <ScheduleTimeline schedule={monitorConfig.schedule} views={views} />
                  {(monitorConfig.schedule || []).map((entry, idx) => (
                    <div key={idx} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/40">
                      <div className="flex items-center gap-3">
                        {/* Wochentage */}
                        <div className="flex gap-1">
                          {WEEKDAYS.map((day, dayIdx) => (
                            <button key={dayIdx}
                              onClick={() => canEdit && toggleScheduleDay(idx, dayIdx)}
                              disabled={!canEdit}
                              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                                (entry.days || []).includes(dayIdx)
                                  ? 'bg-green-600/30 border border-green-500/40 text-green-300'
                                  : 'bg-gray-800 border border-gray-700 text-gray-500'
                              }`}>
                              {day}
                            </button>
                          ))}
                        </div>
                        {/* Zeiten */}
                        <div className="flex items-center gap-2">
                          <input type="time" value={entry.from || '08:00'}
                            onChange={e => updateScheduleEntry(idx, 'from', e.target.value)}
                            disabled={!canEdit}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50" />
                          <span className="text-gray-500">–</span>
                          <input type="time" value={entry.until || '16:00'}
                            onChange={e => updateScheduleEntry(idx, 'until', e.target.value)}
                            disabled={!canEdit}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50" />
                        </div>
                        {canEdit && (
                          <button onClick={() => removeScheduleEntry(idx)}
                            className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-gray-800">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Versionen / Rollback */}
            {canEdit && configVersions.length > 0 && (
              <div className="pt-3 border-t border-gray-800">
                <div className="flex items-center gap-2 mb-2">
                  <RotateCw className="w-3.5 h-3.5 text-gray-400" />
                  <h4 className="text-sm font-semibold text-white">Versionen</h4>
                  <span className="text-xs text-gray-500">letzte Speicherstände dieser Ansicht</span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {configVersions.map(v => (
                    <div key={v.id} className="flex items-center justify-between text-xs bg-gray-800/40 rounded px-3 py-1.5">
                      <span className="text-gray-400 tabular-nums">
                        {new Date(v.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <button onClick={() => restoreConfigVersion(v.id)}
                        className="px-2 py-0.5 rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Wiederherstellen</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Löschen erfolgt über die Toolbar oben (Aktive Ansicht → Löschen) */}
          </Section>

          {/* ═══ Allgemein ═══ */}
          <Section id="allgemein" area="views" title="Allgemein" description="Titel, Refresh und Import/Export"
            icon={Settings} open={openSections.allgemein} onToggle={toggleSection}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Titel</label>
                <input type="text" value={monitorConfig.title} onChange={e => updateConfig('title', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Untertitel</label>
                <input type="text" value={monitorConfig.subtitle} onChange={e => updateConfig('subtitle', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Refresh-Intervall (Sekunden)</label>
              <input type="number" value={monitorConfig.refresh_interval} onChange={e => updateConfig('refresh_interval', parseInt(e.target.value) || 30)}
                disabled={!canEdit}
                min={5} max={300} className="w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
            </div>
            {/* Import/Export */}
            <div className="flex items-center gap-2 pt-2">
              <button onClick={handleExportConfig}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg">
                <Download className="w-3.5 h-3.5" /> Konfig exportieren
              </button>
              {canEdit && (
                <>
                  <button onClick={() => importRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg">
                    <UploadCloud className="w-3.5 h-3.5" /> Konfig importieren
                  </button>
                  <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportConfig} />
                </>
              )}
            </div>
          </Section>

          {/* ═══ ON AIR Anpassung ═══ */}
          <Section id="onair" area="views" title="ON AIR Anpassung" description="Text, Farbe, Blinken und Splitscreen"
            icon={Radio} open={openSections.onair} onToggle={toggleSection}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">ON AIR Text</label>
                <input type="text" value={monitorConfig.on_air_text} onChange={e => updateConfig('on_air_text', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Farbe (leer = Akzentfarbe)</label>
                <div className="flex gap-2">
                  <input type="color" value={monitorConfig.on_air_color || monitorConfig.accent_color || '#da1f3d'}
                    onChange={e => updateConfig('on_air_color', e.target.value)}
                    disabled={!canEdit} className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer" />
                  <input type="text" value={monitorConfig.on_air_color} onChange={e => updateConfig('on_air_color', e.target.value)}
                    disabled={!canEdit} placeholder="Akzentfarbe"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
                </div>
              </div>
            </div>

            {/* Blinken */}
            <div className="flex items-center gap-3">
              <Toggle checked={monitorConfig.on_air_blink} onChange={v => updateConfig('on_air_blink', v)} disabled={!canEdit} />
              <span className="text-sm text-white">Blinken / Pulsieren</span>
            </div>

            {/* Splitscreen bei ON AIR */}
            <div className="flex items-center gap-3">
              <Toggle checked={monitorConfig.on_air_split} onChange={v => updateConfig('on_air_split', v)} disabled={!canEdit} />
              <div>
                <span className="text-sm text-white">Bei ON AIR Splitscreen</span>
                <p className="text-xs text-gray-500 mt-0.5">Statt reinem Vollbild: ON AIR + Stundenplan nebeneinander (Breite = Split-Verhältnis)</p>
              </div>
            </div>

            {/* Seite für ON AIR im Split */}
            {monitorConfig.on_air_split && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">ON AIR Seite</label>
                <div className="grid grid-cols-2 gap-2 max-w-xs">
                  {[{ v: 'left', l: 'Links' }, { v: 'right', l: 'Rechts' }].map(o => (
                    <button key={o.v} onClick={() => canEdit && updateConfig('on_air_split_side', o.v)} disabled={!canEdit}
                      className={`py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                        (monitorConfig.on_air_split_side || 'right') === o.v
                          ? 'bg-red-600/20 border-red-500/40 text-red-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-800/80'
                      }`}>{o.l}</button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-gray-500">
              ON AIR wird immer als Vollbild-Optik gezeigt (überschreibt das Layout, solange ON AIR aktiv ist).
            </p>

            {/* Live-Vollbild-Vorschau */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Vorschau</label>
              <div className="relative bg-black rounded-xl border border-gray-700/40 overflow-hidden flex items-center justify-center" style={{ height: '200px' }}>
                {(() => {
                  const f = monitorConfig.on_air_color || monitorConfig.accent_color || '#da1f3d';
                  const blink = monitorConfig.on_air_blink ? 'animate-pulse' : '';
                  const onair = (
                    <div className="text-center">
                      <div className={`${blink} font-black uppercase tracking-[0.3em] leading-none`}
                        style={{ color: f, fontSize: monitorConfig.on_air_split ? '2rem' : '3rem', textShadow: `0 0 40px ${f}60` }}>
                        {monitorConfig.on_air_text || 'ON AIR'}
                      </div>
                      {monitorConfig.show_clock && <div className="font-mono text-sm mt-3 tracking-widest font-bold animate-pulse" style={{ color: f, textShadow: `0 0 12px ${f}90` }}>12:34:56</div>}
                    </div>
                  );
                  if (monitorConfig.on_air_split) {
                    const p = Math.min(80, Math.max(20, monitorConfig.split_left_percent || 50));
                    const onAirRight = (monitorConfig.on_air_split_side || 'right') === 'right';
                    const onairPane = <div className="w-full h-full flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at center, ' + f + '10 0%, #000 70%)' }}>{onair}</div>;
                    const untisPane = <div className="w-full h-full flex items-center justify-center text-white/25 text-xs bg-white/[0.02]">Stundenplan</div>;
                    return (
                      <div className="absolute inset-0 flex">
                        <div style={{ width: `${p}%` }}>{onAirRight ? untisPane : onairPane}</div>
                        <div className="w-px bg-white/15" />
                        <div className="flex-1">{onAirRight ? onairPane : untisPane}</div>
                      </div>
                    );
                  }
                  return <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at center, ' + f + '10 0%, #000 70%)' }}>{onair}</div>;
                })()}
              </div>
            </div>
          </Section>

          {/* ═══ Widgets ═══ */}
          <Section id="widgets" area={['standard', 'split', 'timetable'].includes(monitorConfig.layout) ? 'views' : 'nicht-relevant'} title="Widgets & Bereiche" description={`${activeWidgets} von ${widgetKeys.length} aktiv`}
            icon={Zap} open={openSections.widgets} onToggle={toggleSection}
            statusDot={activeWidgets > 0 ? 'bg-emerald-400' : 'bg-gray-600'}>

            {/* Categorized Widget Grid */}
            {cats.map(cat => (
              <div key={cat}>
                <p className="text-xs text-gray-400 mb-2 font-semibold">{catLabels[cat]}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {widgetDefs.filter(w => w.cat === cat).map(w => {
                    const WIcon = w.icon;
                    const active = monitorConfig[w.key];
                    return (
                      <button key={w.key} onClick={() => canEdit && updateConfig(w.key, !active)}
                        disabled={!canEdit}
                        className={`p-2.5 rounded-lg text-sm text-left border transition-all flex items-center gap-2.5 disabled:opacity-50 ${
                          active
                            ? 'bg-accent/10 border-accent/40 text-white'
                            : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                        }`}>
                        <WIcon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-accent' : ''}`} />
                        <span className="flex-1">{w.label}</span>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                      </button>
                    );
                  })}
                </div>
                {/* Einstellungen der aktiven Widgets dieser Kategorie — direkt darunter */}
                <div className="space-y-3 mb-4">
                  {widgetDefs.filter(w => w.cat === cat && monitorConfig[w.key]).map(w => {
                    const s = renderWidgetSettings(w.key);
                    return s ? <div key={`set-${w.key}`}>{s}</div> : null;
                  })}
                </div>
              </div>
            ))}

          </Section>

          {/* ═══ Theme & Farben ═══ */}
          <Section id="theme" area="views" title="Theme & Farben" description="Farbschema und Design-Vorlagen"
            icon={Palette} open={openSections.theme} onToggle={toggleSection}>
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Theme-Preset</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: 'custom', l: 'Benutzerdefiniert', color: 'gray' },
                  { v: 'event', l: 'Veranstaltung', color: '#da1f3d' },
                  { v: 'school', l: 'Schulbetrieb', color: '#3b82f6' },
                  { v: 'night', l: 'Nacht', color: '#6b7280' },
                ].map(t => (
                  <button key={t.v} onClick={() => canEdit && applyTheme(t.v)}
                    disabled={!canEdit}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 flex items-center gap-2 ${
                      monitorConfig.theme_preset === t.v
                        ? 'border-accent text-white bg-accent/10'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}>
                    {t.color !== 'gray' && <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />}
                    {t.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Hintergrundfarbe</label>
                <div className="flex gap-2">
                  <input type="color" value={monitorConfig.background_color}
                    onChange={e => { updateConfig('background_color', e.target.value); updateConfig('theme_preset', 'custom'); }}
                    disabled={!canEdit} className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer" />
                  <input type="text" value={monitorConfig.background_color}
                    onChange={e => { updateConfig('background_color', e.target.value); updateConfig('theme_preset', 'custom'); }}
                    disabled={!canEdit} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Akzentfarbe</label>
                <div className="flex gap-2">
                  <input type="color" value={monitorConfig.accent_color}
                    onChange={e => { updateConfig('accent_color', e.target.value); updateConfig('theme_preset', 'custom'); }}
                    disabled={!canEdit} className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer" />
                  <input type="text" value={monitorConfig.accent_color}
                    onChange={e => { updateConfig('accent_color', e.target.value); updateConfig('theme_preset', 'custom'); }}
                    disabled={!canEdit} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
                </div>
              </div>
            </div>
            <div className="h-12 rounded-lg overflow-hidden flex items-center px-4" style={{ background: monitorConfig.background_color }}>
              <span className="text-sm font-semibold" style={{ color: monitorConfig.accent_color }}>Beispieltext in Akzentfarbe</span>
            </div>
            {(() => {
              const cr = contrastRatio(monitorConfig.accent_color, monitorConfig.background_color);
              if (cr == null) return null;
              const ok = cr >= 4.5, mid = cr >= 3;
              return (
                <p className={`text-xs flex items-center gap-1.5 ${ok ? 'text-green-400' : mid ? 'text-amber-300' : 'text-red-400'}`}>
                  {ok ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  Kontrast {cr.toFixed(1)}:1 · {ok ? 'gut lesbar' : mid ? 'nur für große Schrift ausreichend' : 'zu gering, Text schwer lesbar'}
                </p>
              );
            })()}
          </Section>

          {/* ═══ Medien ═══ */}
          <Section id="media" area="content" title="Medien & Dateien" description="Logos, Bilder, PDFs und Hintergründe"
            icon={Image} open={openSections.media} onToggle={toggleSection}
            badge={mediaFiles.length}>

            {/* Drag-&-Drop-Upload */}
            {canEdit && (
              <div onDragOver={e => { e.preventDefault(); }}
                onDrop={e => { e.preventDefault(); uploadDroppedFiles(Array.from(e.dataTransfer.files || [])); }}
                className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors">
                {uploading ? (
                  <span className="flex items-center justify-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Lädt hoch …</span>
                ) : (
                  <><UploadCloud className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Dateien hierher ziehen (Bilder → Slideshow, PDF → PDF)</p></>
                )}
              </div>
            )}

            {mediaFiles.length > 8 && (
              <input type="text" value={mediaFilter} onChange={e => setMediaFilter(e.target.value)}
                placeholder="Medien nach Name filtern …"
                className="w-full sm:w-72 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm" />
            )}

            {/* Logos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Image className="w-4 h-4 text-gray-400" /> Logos ({logos.length})</h4>
                {canEdit && <UploadButton kind="logo" label="Logo hochladen" />}
              </div>
              {logos.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {logos.map(logo => (
                    <div key={logo.id}
                      onClick={() => canEdit && updateConfig('active_logo_id', monitorConfig.active_logo_id === logo.id ? null : logo.id)}
                      className={`relative rounded-xl p-3 border-2 cursor-pointer transition-all ${
                        monitorConfig.active_logo_id === logo.id
                          ? 'border-accent bg-accent/10' : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                      }`}>
                      <img src={`${MEDIA_BASE}${logo.file_url}`} alt={logo.name} className="w-full h-16 object-contain" />
                      {monitorConfig.active_logo_id === logo.id && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                      )}
                      <p className="text-xs text-gray-400 mt-2 truncate">{logo.name}</p>
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(logo.id); }}
                          className="absolute bottom-1 right-1 p-1 text-gray-500 hover:text-red-400 rounded"><Trash2 className="w-3 h-3" /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Oder Logo-URL (Fallback)</label>
                <input type="url" value={monitorConfig.logo_url} onChange={e => updateConfig('logo_url', e.target.value)}
                  disabled={!canEdit} placeholder="https://..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
              </div>
            </div>

            <hr className="border-gray-800" />

            {monitorConfig.show_background_image && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2"><ImageIcon className="w-4 h-4 text-gray-400" /> Hintergrundbilder ({backgrounds.length})</h4>
                    {canEdit && <UploadButton kind="background" label="Bild hochladen" />}
                  </div>
                  {backgrounds.length > 0 ? (
                    <div className="grid grid-cols-4 gap-3">
                      {backgrounds.map(bg => (
                        <div key={bg.id}
                          onClick={() => canEdit && updateConfig('active_background_image_id', monitorConfig.active_background_image_id === bg.id ? null : bg.id)}
                          className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                            monitorConfig.active_background_image_id === bg.id ? 'border-accent' : 'border-gray-700 hover:border-gray-600'
                          }`}>
                          <img src={`${MEDIA_BASE}${bg.file_url}`} alt={bg.name} className="w-full h-20 object-cover" />
                          {monitorConfig.active_background_image_id === bg.id && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                          )}
                          {canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(bg.id); }}
                              className="absolute bottom-1 right-1 p-1 bg-black/60 text-gray-300 hover:text-red-400 rounded"><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-gray-500 text-sm">Noch keine Hintergrundbilder hochgeladen.</p>}
                </div>
                <hr className="border-gray-800" />
              </>
            )}

            {monitorConfig.show_pdf && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-orange-400" /> PDFs ({pdfs.length})</h4>
                    {canEdit && <UploadButton kind="pdf" label="PDF hochladen" />}
                  </div>
                  {pdfs.length > 0 ? (
                    <div className="space-y-2">
                      {pdfs.map(pdf => (
                        <div key={pdf.id}
                          onClick={() => canEdit && updateConfig('active_pdf_id', monitorConfig.active_pdf_id === pdf.id ? null : pdf.id)}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                            monitorConfig.active_pdf_id === pdf.id ? 'border-accent bg-accent/10' : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                          }`}>
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-orange-400" />
                            <span className="text-white text-sm">{pdf.name}</span>
                            {monitorConfig.active_pdf_id === pdf.id && <span className="px-2 py-0.5 text-xs bg-accent/15 text-accent ring-1 ring-inset ring-accent/25 rounded-md font-semibold">Aktiv</span>}
                          </div>
                          {canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(pdf.id); }}
                              className="p-1.5 text-gray-500 hover:text-red-400 rounded"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-gray-500 text-sm">Noch keine PDFs hochgeladen.</p>}
                </div>
                <hr className="border-gray-800" />
              </>
            )}

            {monitorConfig.show_slideshow && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Image className="w-4 h-4 text-gray-400" /> Slideshow-Bilder ({images.length})</h4>
                  {canEdit && <UploadButton kind="image" label="Bild hochladen" />}
                </div>
                {images.length > 0 ? (
                  <div className="grid grid-cols-4 gap-3">
                    {images.map(image => (
                      <div key={image.id} className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-800/50">
                        <img src={`${MEDIA_BASE}${image.file_url}`} alt={image.name} className="w-full h-24 object-cover" />
                        <p className="text-xs text-gray-400 p-2 truncate">{image.name}</p>
                        {canEdit && (
                          <button onClick={() => handleDeleteFile(image.id)}
                            className="absolute top-1 right-1 p-1 bg-black/60 text-gray-300 hover:text-red-400 rounded"><Trash2 className="w-3 h-3" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-500 text-sm">Noch keine Bilder hochgeladen.</p>}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Intervall: {monitorConfig.slideshow_interval}s</label>
                  <input type="range" min={3} max={60} value={monitorConfig.slideshow_interval}
                    onChange={e => updateConfig('slideshow_interval', parseInt(e.target.value))}
                    disabled={!canEdit} className="w-full accent-accent" />
                </div>
              </div>
            )}
          </Section>

          {/* ═══ Ankündigungen ═══ */}
          <Section id="announcements" area="content" title="Ankündigungen" description="Meldungen auf dem Display anzeigen"
            icon={Megaphone} open={openSections.announcements} onToggle={toggleSection}
            badge={announcements.length}>

            {canEdit && (
              <button onClick={() => { setEditingAnnouncement(null); setNewAnnouncement({ title: '', text: '', priority: 'normal', is_active: true }); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg">
                <Plus className="w-4 h-4" /> Neue Ankündigung
              </button>
            )}

            {newAnnouncement && renderAnnouncementForm(
              newAnnouncement, setNewAnnouncement, handleCreateAnnouncement, () => setNewAnnouncement(null), 'Erstellen'
            )}

            {editingAnnouncement && renderAnnouncementForm(
              editingAnnouncement, setEditingAnnouncement, handleUpdateAnnouncement, () => setEditingAnnouncement(null), 'Speichern'
            )}

            <div className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
              {announcements.map(a => (
                <div key={a.id} className="p-4 flex items-start justify-between bg-gray-800/20 hover:bg-gray-800/30 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{a.title}</span>
                      <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${
                        a.priority === 'urgent' ? 'bg-red-900/30 text-red-400' :
                        a.priority === 'important' ? 'bg-amber-900/30 text-amber-400' :
                        'bg-gray-700 text-gray-400'
                      }`}>{PRIORITY_LABELS[a.priority] || a.priority}</span>
                      {!a.is_active && <span className="px-2 py-0.5 text-[10px] bg-gray-700 text-gray-500 rounded">Inaktiv</span>}
                    </div>
                    {a.text && <p className="text-sm text-gray-400 mt-1">{a.text}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 ml-4">
                      <button onClick={() => { setNewAnnouncement(null); setEditingAnnouncement({ ...a }); }}
                        className="p-2 text-gray-400 hover:text-accent hover:bg-gray-800 rounded-lg"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteAnnouncement(a.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
              {announcements.length === 0 && !newAnnouncement && (
                <div className="p-8 text-center text-gray-500">
                  <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Keine Ankündigungen</p>
                </div>
              )}
            </div>
          </Section>

          {/* ═══ Events (aktivierbare Modi) ═══ */}
          <Section id="events" area="events" plain title="Events" description="Sondermodi: aktivieren → Bildschirme zeigen andere Ansichten, danach zurück"
            icon={Radio} open={openSections.events} onToggle={toggleSection}
            badge={events.length}
            statusDot={events.some(e => e.is_active) ? 'bg-accent animate-pulse' : null}>
            <EventManager events={events} screens={screens} views={views} canEdit={canEdit}
              onSave={saveEvent} onDelete={deleteEvent} onToggleActive={toggleEventActive} />
          </Section>

          {/* ═══ WebUntis-Link-Bibliothek ═══ */}
          <Section id="webuntislinks" area="settings" title="WebUntis-Links" description="Links einmal benennen und überall auswählen"
            icon={Calendar} open={openSections.webuntislinks} onToggle={toggleSection}
            badge={webuntisLinks.length}>
            <WebUntisLinkManager links={webuntisLinks} canEdit={canEdit}
              onSave={saveWebuntisLink} onDelete={deleteWebuntisLink} />
          </Section>

          {/* ═══ ÖPNV Abfahrten (nur bei Abfahrtsmonitor-Layout) ═══ */}
          {monitorConfig.layout === 'departures' && (
          <Section id="transit" area="views" title="ÖPNV Abfahrten" description="Stationen und Filter für den Abfahrtsmonitor"
            icon={Activity} open={openSections.transit} onToggle={toggleSection}
            badge={monitorConfig.transit_stops?.length || 0}>

            {/* API-Auswahl */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Datenquellen</label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Toggle checked={monitorConfig.transit_source_db !== false} onChange={v => updateConfig('transit_source_db', v)} disabled={!canEdit} />
                  <span className="text-xs text-white">DB (ganz Deutschland)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle checked={monitorConfig.transit_source_nahsh !== false} onChange={v => updateConfig('transit_source_nahsh', v)} disabled={!canEdit} />
                  <span className="text-xs text-white">NAH.SH (Schleswig-Holstein)</span>
                </div>
              </div>
            </div>

            {/* Stationssuche */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Station hinzufügen</label>
              <div className="relative">
                <input type="text" value={transitQuery}
                  onChange={e => {
                    setTransitQuery(e.target.value);
                    clearTimeout(transitTimerRef.current);
                    if (e.target.value.length >= 2) {
                      setTransitSearching(true);
                      transitTimerRef.current = setTimeout(async () => {
                        try {
                          const useDb = monitorConfig.transit_source_db !== false;
                          const useNahsh = monitorConfig.transit_source_nahsh !== false;
                          const res = await apiClient.get(`/monitor/transit/search?q=${encodeURIComponent(e.target.value)}&results=12&use_db=${useDb}&use_nahsh=${useNahsh}`);
                          setTransitResults(res.data || res || []);
                        } catch { setTransitResults([]); }
                        setTransitSearching(false);
                      }, 400);
                    } else {
                      setTransitResults([]);
                    }
                  }}
                  disabled={!canEdit}
                  placeholder="Station suchen (z.B. Hamburg Hbf, Kiel ZOB...)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                {transitSearching && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 animate-spin" />}
              </div>

              {/* Suchergebnisse */}
              {transitResults.length > 0 && (
                <div className="mt-2 border border-gray-700 rounded-lg bg-gray-800 overflow-hidden max-h-64 overflow-y-auto">
                  {transitResults.map(s => {
                    const already = (monitorConfig.transit_stops || []).some(st => st.id === s.id);
                    return (
                      <button key={s.id} disabled={already || !canEdit}
                        onClick={() => {
                          const stops = [...(monitorConfig.transit_stops || []), {
                            id: s.id, name: s.name, origin: s.source || 'db',
                            filter_lines: [], filter_direction: '', filter_via: '',
                            show_bus: true, show_rail: true, show_long_distance: true,
                          }];
                          updateConfig('transit_stops', stops);
                          setTransitQuery(''); setTransitResults([]);
                          toast.success(`${s.name} hinzugefügt`);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between hover:bg-gray-700/50 border-b border-gray-700/50 last:border-0 transition-colors ${already ? 'opacity-40' : ''}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{s.name}</span>
                            {s.source && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                s.source === 'db+nahsh' ? 'bg-green-500/20 text-green-400' :
                                s.source === 'nahsh' ? 'bg-sky-500/20 text-sky-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}>
                                {s.source === 'db+nahsh' ? 'DB + NAH.SH' : s.source === 'nahsh' ? 'NAH.SH' : 'DB'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {s.products?.join(', ') || STATION_KIND_LABELS[s.kind] || s.kind}
                          </div>
                        </div>
                        {already
                          ? <Check className="w-4 h-4 text-green-500" />
                          : <Plus className="w-4 h-4 text-gray-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Konfigurierte Stationen */}
            {(monitorConfig.transit_stops || []).length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Konfigurierte Stationen</label>
                <div className="space-y-2">
                  {(monitorConfig.transit_stops || []).map((station, idx) => (
                    <div key={station.id} className="p-3 bg-gray-800/60 border border-gray-700 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium">{station.name}</span>
                          {station.origin && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                              station.origin === 'db+nahsh' ? 'bg-green-500/20 text-green-400' :
                              station.origin === 'nahsh' ? 'bg-sky-500/20 text-sky-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {station.origin === 'db+nahsh' ? 'DB + NAH.SH' : station.origin === 'nahsh' ? 'NAH.SH' : 'DB'}
                            </span>
                          )}
                        </div>
                        <button onClick={() => {
                          const stops = monitorConfig.transit_stops.filter((_, i) => i !== idx);
                          updateConfig('transit_stops', stops);
                        }} disabled={!canEdit} className="text-gray-500 hover:text-red-400 disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Per-Station Produktfilter */}
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">Zeige:</span>
                        {[
                          { key: 'show_bus', label: 'Bus' },
                          { key: 'show_rail', label: 'RE/RB' },
                          { key: 'show_suburban', label: 'S-Bahn' },
                          { key: 'show_subway', label: 'U-Bahn' },
                          { key: 'show_tram', label: 'Tram' },
                          { key: 'show_long_distance', label: 'ICE/IC' },
                          { key: 'show_ferry', label: 'Fähre' },
                        ].map(p => (
                          <label key={p.key} className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox"
                              checked={station[p.key] !== false}
                              onChange={e => {
                                const stops = [...monitorConfig.transit_stops];
                                stops[idx] = { ...stops[idx], [p.key]: e.target.checked };
                                updateConfig('transit_stops', stops);
                              }}
                              disabled={!canEdit}
                              className="w-3 h-3 rounded bg-gray-900 border-gray-600 accent-accent focus:ring-0 disabled:opacity-50" />
                            <span className="text-[10px] text-white/70">{p.label}</span>
                          </label>
                        ))}
                      </div>

                      {/* Wegzeit */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">Wegzeit:</span>
                        <input type="number"
                          value={station.walk_minutes || 0}
                          onChange={e => {
                            const stops = [...monitorConfig.transit_stops];
                            stops[idx] = { ...stops[idx], walk_minutes: parseInt(e.target.value) || 0 };
                            updateConfig('transit_stops', stops);
                          }}
                          min={0} max={60} disabled={!canEdit}
                          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                        <span className="text-[10px] text-gray-500">Min (Abfahrten erst nach Wegzeit anzeigen)</span>
                      </div>

                      {/* API pro Station */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">API:</span>
                        <select
                          value={station.source || ''}
                          onChange={e => {
                            const stops = [...monitorConfig.transit_stops];
                            stops[idx] = { ...stops[idx], source: e.target.value };
                            updateConfig('transit_stops', stops);
                          }}
                          disabled={!canEdit}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50">
                          <option value="">Global (Standard)</option>
                          <option value="db">Nur DB REST</option>
                          <option value="nahsh">Nur NAH.SH</option>
                          <option value="both">Beide APIs</option>
                        </select>
                        <span className="text-[10px] text-gray-500">Welche API für diese Station</span>
                      </div>

                      {/* Max Abfahrten pro Typ */}
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-[10px] text-gray-500">Max:</span>
                        {[
                          { key: 'max_departures', label: 'Gesamt' },
                          { key: 'max_bus', label: 'Bus' },
                          { key: 'max_train', label: 'Zug' },
                        ].map(f => (
                          <div key={f.key} className="flex items-center gap-1">
                            <input type="number"
                              value={station[f.key] || ''}
                              placeholder="∞"
                              onChange={e => {
                                const stops = [...monitorConfig.transit_stops];
                                stops[idx] = { ...stops[idx], [f.key]: parseInt(e.target.value) || 0 };
                                updateConfig('transit_stops', stops);
                              }}
                              min={0} max={50} disabled={!canEdit}
                              className="w-12 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-xs text-center disabled:opacity-50" />
                            <span className="text-[10px] text-gray-500">{f.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Spalte zuweisen */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">Spalte:</span>
                        <select
                          value={station.column ?? 0}
                          onChange={e => {
                            const stops = [...monitorConfig.transit_stops];
                            stops[idx] = { ...stops[idx], column: parseInt(e.target.value) };
                            updateConfig('transit_stops', stops);
                          }}
                          disabled={!canEdit}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50">
                          {Array.from({ length: monitorConfig.transit_columns || 3 }, (_, i) => (
                            <option key={i} value={i}>Spalte {i + 1}</option>
                          ))}
                        </select>
                        <span className="text-[10px] text-gray-500">In welcher Spalte wird diese Station angezeigt</span>
                      </div>

                      {/* Trennung + Kompakt */}
                      <div className="flex items-center gap-4 mb-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox"
                            checked={station.split_by_type || false}
                            onChange={e => {
                              const stops = [...monitorConfig.transit_stops];
                              stops[idx] = { ...stops[idx], split_by_type: e.target.checked };
                              updateConfig('transit_stops', stops);
                            }}
                            disabled={!canEdit}
                            className="w-3 h-3 rounded bg-gray-900 border-gray-600 accent-accent focus:ring-0 disabled:opacity-50" />
                          <span className="text-[10px] text-white/70">Bus/Zug trennen</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox"
                            checked={station.compact || false}
                            onChange={e => {
                              const stops = [...monitorConfig.transit_stops];
                              stops[idx] = { ...stops[idx], compact: e.target.checked };
                              updateConfig('transit_stops', stops);
                            }}
                            disabled={!canEdit}
                            className="w-3 h-3 rounded bg-gray-900 border-gray-600 accent-accent focus:ring-0 disabled:opacity-50" />
                          <span className="text-[10px] text-white/70">Kompaktmodus</span>
                        </label>
                      </div>

                      {/* Zusatz-Station (kombinieren) */}
                      <div className="mb-2 p-2 bg-gray-800/30 rounded border border-gray-700/50">
                        <div className="text-[10px] text-gray-500 mb-1.5 font-medium">Kombinieren mit 2. Station (Abfahrten zusammenführen)</div>
                        {station.extra_id ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 flex items-center gap-2">
                              <span className="text-white text-xs font-medium">{station.extra_name || station.extra_id}</span>
                              <span className="text-[9px] text-gray-500">ID: {station.extra_id}</span>
                              <select
                                value={station.extra_source || ''}
                                onChange={e => {
                                  const stops = [...monitorConfig.transit_stops];
                                  stops[idx] = { ...stops[idx], extra_source: e.target.value };
                                  updateConfig('transit_stops', stops);
                                }}
                                disabled={!canEdit}
                                className="ml-auto bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[10px] disabled:opacity-50">
                                <option value="">Auto</option>
                                <option value="db">DB</option>
                                <option value="nahsh">NAH.SH</option>
                                <option value="both">Beide</option>
                              </select>
                            </div>
                            <button type="button" onClick={() => {
                              const stops = [...monitorConfig.transit_stops];
                              stops[idx] = { ...stops[idx], extra_id: '', extra_name: '', extra_source: '' };
                              updateConfig('transit_stops', stops);
                            }} disabled={!canEdit} className="text-red-400 hover:text-red-300 p-1 disabled:opacity-50">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input type="text"
                              placeholder="Station suchen..."
                              disabled={!canEdit}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50"
                              onChange={e => {
                                const val = e.target.value;
                                const inputEl = e.target;
                                clearTimeout(inputEl._timer);
                                if (val.length >= 2) {
                                  inputEl._timer = setTimeout(async () => {
                                    try {
                                      const res = await apiClient.get(`/monitor/transit/search?q=${encodeURIComponent(val)}&results=8&use_db=true&use_nahsh=true`);
                                      const results = res.data || res || [];
                                      // Ergebnisse als Dropdown anzeigen
                                      const dropdown = inputEl.parentElement.querySelector('.extra-dropdown');
                                      if (dropdown) {
                                        dropdown.innerHTML = '';
                                        results.forEach(r => {
                                          const btn = document.createElement('button');
                                          btn.type = 'button';
                                          btn.className = 'w-full px-2 py-1.5 text-left text-[11px] text-white hover:bg-gray-700 flex items-center justify-between border-b border-gray-700/30 last:border-0';
                                          btn.innerHTML = `<span>${r.name}</span><span class="text-[9px] text-gray-500 ml-2">${r.id} · ${r.source || 'db'}</span>`;
                                          btn.onclick = () => {
                                            const stops = [...monitorConfig.transit_stops];
                                            stops[idx] = { ...stops[idx], extra_id: r.id, extra_name: r.name, extra_source: r.source === 'nahsh' ? 'nahsh' : r.source === 'db+nahsh' ? '' : 'db' };
                                            updateConfig('transit_stops', stops);
                                            dropdown.innerHTML = '';
                                            inputEl.value = '';
                                          };
                                          dropdown.appendChild(btn);
                                        });
                                      }
                                    } catch {}
                                  }, 400);
                                }
                              }}
                              onBlur={e => { setTimeout(() => { const d = e.target.parentElement?.querySelector('.extra-dropdown'); if (d) d.innerHTML = ''; }, 200); }}
                            />
                            <div className="extra-dropdown absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto z-20" />
                          </div>
                        )}
                        {station.extra_id && (
                          <>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[10px] text-gray-500">Zusatz zeigt:</span>
                              {[
                                { key: 'extra_show_bus', label: 'Bus' },
                                { key: 'extra_show_rail', label: 'RE/RB' },
                                { key: 'extra_show_suburban', label: 'S-Bahn' },
                                { key: 'extra_show_subway', label: 'U-Bahn' },
                                { key: 'extra_show_tram', label: 'Tram' },
                                { key: 'extra_show_long_distance', label: 'ICE/IC' },
                                { key: 'extra_show_ferry', label: 'Fähre' },
                              ].map(p => (
                                <label key={p.key} className="flex items-center gap-1 cursor-pointer">
                                  <input type="checkbox"
                                    checked={station[p.key] !== false}
                                    onChange={e => {
                                      const stops = [...monitorConfig.transit_stops];
                                      stops[idx] = { ...stops[idx], [p.key]: e.target.checked };
                                      updateConfig('transit_stops', stops);
                                    }}
                                    disabled={!canEdit}
                                    className="w-3 h-3 rounded bg-gray-900 border-gray-600 accent-accent focus:ring-0 disabled:opacity-50" />
                                  <span className="text-[10px] text-white/70">{p.label}</span>
                                </label>
                              ))}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">Tipp: Hauptstation auf DB (Züge), Zusatz auf NAH.SH (Busse) → mit Bus/Zug-Trennung kombiniert.</div>
                          </>
                        )}
                      </div>

                      {/* Filter — Linien (Badge-Eingabe) + Richtung + Via */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Linienfilter (Komma/Enter = trennen, leer = alle)</label>
                          <div className="flex flex-wrap gap-1 items-center bg-gray-900 border border-gray-700 rounded px-2 py-1 min-h-[30px]">
                            {(station.filter_lines || []).map((line, li) => (
                              <span key={li} className="inline-flex items-center gap-1 bg-sky-500/20 text-sky-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                {line}
                                <button type="button" onClick={() => {
                                  const stops = [...monitorConfig.transit_stops];
                                  const lines = [...(stops[idx].filter_lines || [])];
                                  lines.splice(li, 1);
                                  stops[idx] = { ...stops[idx], filter_lines: lines };
                                  updateConfig('transit_stops', stops);
                                }} disabled={!canEdit} className="hover:text-red-400 disabled:opacity-50">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                            <input type="text"
                              placeholder={station.filter_lines?.length ? '' : 'z.B. RE7, Bus 11'}
                              disabled={!canEdit}
                              className="flex-1 min-w-[60px] bg-transparent text-white text-xs outline-none py-0.5 disabled:opacity-50"
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ',') {
                                  e.preventDefault();
                                  const val = e.target.value.trim().replace(/,+$/, '').trim();
                                  if (val) {
                                    const stops = [...monitorConfig.transit_stops];
                                    const lines = [...(stops[idx].filter_lines || [])];
                                    // Komma-getrennte Eingabe aufsplitten
                                    val.split(',').map(s => s.trim()).filter(Boolean).forEach(v => {
                                      if (!lines.includes(v)) lines.push(v);
                                    });
                                    stops[idx] = { ...stops[idx], filter_lines: lines };
                                    updateConfig('transit_stops', stops);
                                    e.target.value = '';
                                  }
                                }
                                if (e.key === 'Backspace' && !e.target.value) {
                                  const stops = [...monitorConfig.transit_stops];
                                  const lines = [...(stops[idx].filter_lines || [])];
                                  if (lines.length > 0) {
                                    lines.pop();
                                    stops[idx] = { ...stops[idx], filter_lines: lines };
                                    updateConfig('transit_stops', stops);
                                  }
                                }
                              }}
                              onBlur={e => {
                                const val = e.target.value.trim().replace(/,+$/, '').trim();
                                if (val) {
                                  const stops = [...monitorConfig.transit_stops];
                                  const lines = [...(stops[idx].filter_lines || [])];
                                  val.split(',').map(s => s.trim()).filter(Boolean).forEach(v => {
                                    if (!lines.includes(v)) lines.push(v);
                                  });
                                  stops[idx] = { ...stops[idx], filter_lines: lines };
                                  updateConfig('transit_stops', stops);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Richtungsfilter (leer = alle)</label>
                          <input type="text"
                            defaultValue={station.filter_direction || ''}
                            onBlur={e => {
                              const stops = [...monitorConfig.transit_stops];
                              stops[idx] = { ...stops[idx], filter_direction: e.target.value };
                              updateConfig('transit_stops', stops);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                            disabled={!canEdit}
                            placeholder="z.B. Hamburg"
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-xs disabled:opacity-50" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Via-Station (nur Abfahrten die dort halten)</label>
                        <input type="text"
                          defaultValue={station.filter_via || ''}
                          onBlur={e => {
                            const stops = [...monitorConfig.transit_stops];
                            stops[idx] = { ...stops[idx], filter_via: e.target.value };
                            updateConfig('transit_stops', stops);
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                          disabled={!canEdit}
                          placeholder="z.B. Hamburg Hbf"
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-xs disabled:opacity-50" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Einstellungen */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Vorausschau (Min.)</label>
                <input type="number" value={monitorConfig.transit_duration} onChange={e => updateConfig('transit_duration', parseInt(e.target.value) || 60)}
                  min={10} max={180} disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Max. Abfahrten pro Station</label>
                <input type="number" value={monitorConfig.transit_max_departures} onChange={e => updateConfig('transit_max_departures', parseInt(e.target.value) || 20)}
                  min={5} max={50} disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
            </div>

            {/* Anzeige-Optionen */}
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Anzeige-Optionen</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'transit_show_via', label: 'Zwischenhalte (Via) anzeigen', desc: 'Zeigt Halte unter dem Ziel' },
                  { key: 'transit_show_relative', label: 'Relative Zeit ("in X min")', desc: 'Countdown neben Abfahrtszeit' },
                  { key: 'transit_color_coding', label: 'Farbcodierte Zeiten', desc: 'Grün = gleich, gedimmt = >30 Min' },
                  { key: 'transit_highlight_next', label: 'Nächste Abfahrt hervorheben', desc: 'Erste Abfahrt visuell betont' },
                  { key: 'transit_auto_scroll', label: 'Auto-Scroll', desc: 'Scrollt bei vielen Abfahrten' },
                  { key: 'transit_disruption_banner', label: 'Störungsbanner', desc: 'Warnung bei gehäuften Ausfällen' },
                ].map(opt => (
                  <div key={opt.key} className="flex items-start gap-2">
                    <Toggle checked={monitorConfig[opt.key] !== false} onChange={v => updateConfig(opt.key, v)} disabled={!canEdit} />
                    <div>
                      <span className="text-xs text-white block">{opt.label}</span>
                      <span className="text-[10px] text-gray-500">{opt.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Schriftgröße */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Schriftgröße</label>
              <select value={monitorConfig.transit_font_size || 'large'}
                onChange={e => updateConfig('transit_font_size', e.target.value)}
                disabled={!canEdit}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50">
                <option value="normal">Normal</option>
                <option value="large">Groß (HD)</option>
                <option value="4k">Sehr groß (4K)</option>
              </select>
            </div>

            {/* Layout-Spalten */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Layout-Spalten</label>
              <div className="flex items-center gap-3">
                <select value={monitorConfig.transit_columns || 3}
                  onChange={e => updateConfig('transit_columns', parseInt(e.target.value))}
                  disabled={!canEdit}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50">
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'Spalte' : 'Spalten'}</option>
                  ))}
                </select>
                <span className="text-[10px] text-gray-500">Stationen werden in diese Spalten aufgeteilt. Zuordnung pro Station oben konfigurierbar.</span>
              </div>
            </div>

            {(monitorConfig.transit_stops || []).length === 0 && (
              <div className="p-6 text-center text-gray-500">
                <Activity className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Noch keine Stationen konfiguriert</p>
                <p className="text-xs mt-1">Oben nach einer Haltestelle oder einem Bahnhof suchen</p>
              </div>
            )}

            {/* ─── Störungsmeldungen ─── */}
            <div className="border-t border-gray-700/40 pt-4 mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Störungen & Baumaßnahmen</span>
                <span className="text-[10px] text-gray-500">Quelle je Verkehrsmittel wählbar</span>
              </div>

              <p className="text-[11px] text-gray-500">Einzelne Meldungen ein-/ausblenden und die Anzeige-Position gibt's im eigenen Menü <span className="text-gray-300 font-medium">„Störungen verwalten"</span> weiter unten.</p>

              {/* Zug-Störungen (NAH.SH) */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                  <input type="checkbox" checked={monitorConfig.transit_disruption_rail !== false} disabled={!canEdit}
                    onChange={e => updateConfig('transit_disruption_rail', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-600 accent-accent" />
                  <span className="text-sm text-white">Zug-Störungen (NAH.SH / DB Regio)</span>
                </label>
                {monitorConfig.transit_disruption_rail !== false && (
                  <div className="ml-6">
                    <label className="block text-[11px] text-gray-500 mb-1">Linienfilter (leer = alle erkannten Linien)</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(monitorConfig.transit_disruption_rail_lines || []).map((l, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/25 rounded-md text-xs font-medium">
                          {l}{canEdit && <button onClick={() => updateConfig('transit_disruption_rail_lines', (monitorConfig.transit_disruption_rail_lines || []).filter((_, j) => j !== i))} className="ml-0.5 hover:text-white">&times;</button>}
                        </span>
                      ))}
                    </div>
                    <input type="text" placeholder="z.B. RE8, mit Enter hinzufügen" disabled={!canEdit}
                      className="w-full sm:w-72 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 disabled:opacity-50"
                      onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value.trim(); const cur = monitorConfig.transit_disruption_rail_lines || []; if (!cur.includes(v)) updateConfig('transit_disruption_rail_lines', [...cur, v]); e.target.value = ''; } }} />
                  </div>
                )}
              </div>

              {/* Bus-Störungen (SWL Lübeck) */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                  <input type="checkbox" checked={monitorConfig.transit_disruption_bus !== false} disabled={!canEdit}
                    onChange={e => updateConfig('transit_disruption_bus', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-600 accent-accent" />
                  <span className="text-sm text-white">Bus-Störungen (Stadtverkehr Lübeck)</span>
                </label>
                {monitorConfig.transit_disruption_bus !== false && (
                  <div className="ml-6">
                    <label className="block text-[11px] text-gray-500 mb-1">Linienfilter (leer = alle; „alle Linien"-Meldungen immer)</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(monitorConfig.transit_disruption_bus_lines || []).map((l, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/50 text-gray-200 ring-1 ring-inset ring-gray-600/40 rounded-md text-xs font-medium">
                          {l}{canEdit && <button onClick={() => updateConfig('transit_disruption_bus_lines', (monitorConfig.transit_disruption_bus_lines || []).filter((_, j) => j !== i))} className="ml-0.5 hover:text-white">&times;</button>}
                        </span>
                      ))}
                    </div>
                    <input type="text" placeholder="z.B. 1, 3, 16, mit Enter hinzufügen" disabled={!canEdit}
                      className="w-full sm:w-72 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 disabled:opacity-50"
                      onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value.trim(); const cur = monitorConfig.transit_disruption_bus_lines || []; if (!cur.includes(v)) updateConfig('transit_disruption_bus_lines', [...cur, v]); e.target.value = ''; } }} />
                  </div>
                )}
              </div>

              {/* Manuelle Meldungen */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Manuelle Meldungen</label>
                <div className="space-y-2">
                  {(monitorConfig.transit_disruption_manual || []).map((m, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <input type="text" value={m.title || ''} disabled={!canEdit} placeholder="Titel"
                          onChange={e => { const u = [...(monitorConfig.transit_disruption_manual || [])]; u[i] = { ...u[i], title: e.target.value }; updateConfig('transit_disruption_manual', u); }}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm disabled:opacity-50" />
                        <textarea value={m.text || ''} disabled={!canEdit} placeholder="Text" rows={2}
                          onChange={e => { const u = [...(monitorConfig.transit_disruption_manual || [])]; u[i] = { ...u[i], text: e.target.value }; updateConfig('transit_disruption_manual', u); }}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm resize-none disabled:opacity-50" />
                      </div>
                      {canEdit && <button onClick={() => updateConfig('transit_disruption_manual', (monitorConfig.transit_disruption_manual || []).filter((_, j) => j !== i))} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <button onClick={() => updateConfig('transit_disruption_manual', [...(monitorConfig.transit_disruption_manual || []), { title: '', text: '' }])}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Meldung
                  </button>
                )}
              </div>
            </div>

            {/* ─── Streik-Modus ─── */}
            <div className="border-t border-gray-700/40 pt-4 mt-4">
              <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!monitorConfig.transit_strike_active} disabled={!canEdit}
                    onChange={e => updateConfig('transit_strike_active', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-red-500 focus:ring-red-500/30" />
                  <span className="text-sm font-medium text-red-400">Streik-Modus</span>
                </label>
                {monitorConfig.transit_strike_active && (
                  <span className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded-md font-medium">AKTIV</span>
                )}
              </div>

              {monitorConfig.transit_strike_active && (
                <div className="space-y-3 ml-6">
                  {/* Banner-Text */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Banner-Text (optional)</label>
                    <input type="text" value={monitorConfig.transit_strike_text || ''} disabled={!canEdit}
                      onChange={e => updateConfig('transit_strike_text', e.target.value)}
                      placeholder="z.B. Streik bei DB Regio, einige Verbindungen entfallen"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 disabled:opacity-50" />
                  </div>

                  {/* Linien ausblenden */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Linien ausblenden</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(monitorConfig.transit_strike_lines || []).map((line, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-300 rounded-md text-xs font-medium">
                          {line}
                          {canEdit && (
                            <button onClick={() => {
                              const updated = (monitorConfig.transit_strike_lines || []).filter((_, j) => j !== i);
                              updateConfig('transit_strike_lines', updated);
                            }} className="hover:text-red-100 ml-0.5">&times;</button>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Linie eingeben, z.B. Bus 1, RE80"
                        disabled={!canEdit}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 disabled:opacity-50"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            const val = e.target.value.trim();
                            const current = monitorConfig.transit_strike_lines || [];
                            if (!current.includes(val)) {
                              updateConfig('transit_strike_lines', [...current, val]);
                            }
                            e.target.value = '';
                          }
                        }} />
                      <span className="text-[10px] text-gray-500 self-center whitespace-nowrap">Enter zum Hinzufügen</span>
                    </div>
                  </div>

                  {/* Typen ausblenden */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Verkehrsmittel-Typen ausblenden</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'bus', label: 'Bus', color: 'purple' },
                        { key: 're', label: 'RE/RB', color: 'gray' },
                        { key: 'sbahn', label: 'S-Bahn', color: 'green' },
                        { key: 'ubahn', label: 'U-Bahn', color: 'blue' },
                        { key: 'tram', label: 'Tram', color: 'red' },
                        { key: 'ice', label: 'ICE/IC', color: 'red' },
                        { key: 'faehre', label: 'Fähre', color: 'cyan' },
                      ].map(kind => {
                        const active = (monitorConfig.transit_strike_types || []).includes(kind.key);
                        return (
                          <button key={kind.key} disabled={!canEdit}
                            onClick={() => {
                              const current = monitorConfig.transit_strike_types || [];
                              const updated = active ? current.filter(t => t !== kind.key) : [...current, kind.key];
                              updateConfig('transit_strike_types', updated);
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all disabled:opacity-50 ${
                              active
                                ? 'bg-red-500/30 border-red-500/50 text-red-300'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                            }`}>
                            {active && <X className="w-3 h-3 -ml-0.5" />}{kind.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Section>
          )}

          {/* ═══ Störungen verwalten (eigenes Menü) ═══ */}
          {monitorConfig.layout === 'departures' && (
          <Section id="disruptions" area="views" title="Störungen verwalten" description="Aktuelle Meldungen ansehen, einzeln ausblenden und die Anzeige-Position wählen"
            icon={AlertTriangle} open={openSections.disruptions} onToggle={toggleSection}
            badge={(monitorConfig.transit_disruption_hidden || []).length || null}>
            <div className="space-y-4">
              {/* Anzeige-Position */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Anzeige-Position auf dem Monitor</label>
                <div className="flex gap-2">
                  {[{ v: 'bottom', l: 'Unten (Streifen)' }, { v: 'column', l: 'Eigene Spalte' }].map(o => (
                    <button key={o.v} disabled={!canEdit}
                      onClick={() => updateConfig('transit_disruption_position', o.v)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                        (monitorConfig.transit_disruption_position || 'bottom') === o.v
                          ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                      }`}>{o.l}</button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">„Eigene Spalte" gibt Bild + Text deutlich mehr Platz; „Unten" ist der schmale Durchlauf-Streifen.</p>
              </div>

              {/* Live-Liste aller Meldungen mit Volltext */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-gray-400">
                    Aktuelle Meldungen
                    {disruptions.length > 0 && (
                      <span className="text-gray-500"> · {disruptions.length} gesamt · {(monitorConfig.transit_disruption_hidden || []).length} ausgeblendet</span>
                    )}
                  </div>
                  <button onClick={fetchDisruptions} disabled={disruptionsLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 hover:text-white disabled:opacity-50">
                    <RefreshCw className={`w-3 h-3 ${disruptionsLoading ? 'animate-spin' : ''}`} /> {disruptionsLoading ? 'Lädt…' : 'Laden / Aktualisieren'}
                  </button>
                </div>
                {disruptions.length === 0 ? (
                  <div className="p-6 text-center border border-gray-800 rounded-xl text-gray-500">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">Auf „Laden" klicken, um alle aktuellen Störungen zu sehen.<br />Ausgeblendete verschwinden vom Monitor und werden automatisch entfernt, sobald der Anbieter die Meldung löscht.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                    {disruptions.map(s => {
                      const hidden = (monitorConfig.transit_disruption_hidden || []).includes(s.id);
                      return (
                        <div key={s.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${hidden ? 'bg-gray-900/40 border-gray-800 opacity-60' : 'bg-gray-800/40 border-gray-700'}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${s.kind === 'construction' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>{s.kind === 'construction' ? 'Baumaßnahme' : 'Störung'}</span>
                              <span className="text-[11px] text-gray-500">{DISRUPTION_SOURCE_LABELS[s.source] || s.source}</span>
                              {(s.lines || []).slice(0, 8).map((l, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 bg-white/10 text-white/70 rounded font-medium">{l}</span>)}
                              {s.has_image && <span className="inline-flex items-center gap-1 text-[10px] text-gray-500" title="mit Bild"><ImageIcon className="w-3 h-3" /> Bild</span>}
                            </div>
                            <div className={`text-sm font-medium ${hidden ? 'text-gray-500 line-through' : 'text-white'}`}>{s.title}</div>
                            {s.text && <div className="text-xs text-gray-400 mt-0.5 leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.text}</div>}
                            {(s.from || s.until) && <div className="text-[10px] text-gray-500 mt-1 tabular-nums">{s.from}{s.until ? ` – ${s.until}` : ''}</div>}
                          </div>
                          <button onClick={() => toggleDisruptionHidden(s.id)} disabled={!canEdit}
                            className={`shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-50 ${hidden ? 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white' : 'bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25'}`}>
                            {hidden ? <><Eye className="w-3.5 h-3.5" /> Einblenden</> : <><EyeOff className="w-3.5 h-3.5" /> Ausblenden</>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(monitorConfig.transit_disruption_hidden || []).length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-2">Änderungen werden mit „Speichern" (oben) übernommen.</p>
                )}
              </div>
            </div>
          </Section>
          )}

          {/* ═══ API & Token ═══ */}
          <Section id="globalsettings" area="settings" plain title="Globale Zugänge" description="Einmal eintragen, gilt für alle Ansichten (Wetter-Key, Raumplan-Login)"
            icon={Key} open badge={null}>
            {globalSettings ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">OpenWeatherMap API-Key (Wetter)</label>
                  <input type="password" value={globalSettings.weather_api_key || ''} disabled={!canEdit}
                    onChange={e => setGlobalSettings({ ...globalSettings, weather_api_key: e.target.value })}
                    placeholder="API-Key" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Raumplan-Server</label>
                    <input type="text" value={globalSettings.webuntis_server || ''} disabled={!canEdit}
                      onChange={e => setGlobalSettings({ ...globalSettings, webuntis_server: e.target.value })}
                      placeholder="katharineum.webuntis.com" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Raumplan-Schule</label>
                    <input type="text" value={globalSettings.webuntis_school || ''} disabled={!canEdit}
                      onChange={e => setGlobalSettings({ ...globalSettings, webuntis_school: e.target.value })}
                      placeholder="katharineum" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Raumplan-Benutzer (optional)</label>
                    <input type="text" value={globalSettings.webuntis_username || ''} disabled={!canEdit}
                      onChange={e => setGlobalSettings({ ...globalSettings, webuntis_username: e.target.value })}
                      placeholder="Leer = Anonym" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Raumplan-Passwort (optional)</label>
                    <input type="password" value={globalSettings.webuntis_password || ''} disabled={!canEdit}
                      onChange={e => setGlobalSettings({ ...globalSettings, webuntis_password: e.target.value })}
                      placeholder="Passwort" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                  </div>
                </div>
                {canEdit && (
                  <button onClick={saveGlobalSettings} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium text-sm rounded-lg">
                    <Save className="w-4 h-4" /> Speichern
                  </button>
                )}
              </>
            ) : <p className="text-sm text-gray-500">Lädt …</p>}
          </Section>

          <Section id="trash" area="settings" plain title="Papierkorb" description="Gelöschte Ansichten & Medien wiederherstellen oder endgültig entfernen"
            icon={Trash2} open badge={(trash.views.length + trash.media.length) || null}>
            {trash.views.length === 0 && trash.media.length === 0 ? (
              <p className="text-sm text-gray-500">Papierkorb ist leer.</p>
            ) : (
              <div className="space-y-3">
                {trash.views.map(a => (
                  <div key={`a${a.id}`} className="flex items-center gap-3 bg-gray-800/40 rounded-lg px-3 py-2 text-sm">
                    <LayoutGrid className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-white truncate flex-1">{a.name}</span>
                    <span className="text-gray-500 text-xs shrink-0">Ansicht</span>
                    {canEdit && <>
                      <button onClick={() => restoreTrash('view', a.id)} className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Wiederherstellen</button>
                      <button onClick={() => purgeTrash('view', a.id)} className="p-1.5 text-gray-500 hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>}
                  </div>
                ))}
                {trash.media.map(m => (
                  <div key={`m${m.id}`} className="flex items-center gap-3 bg-gray-800/40 rounded-lg px-3 py-2 text-sm">
                    <Image className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-white truncate flex-1">{m.name}</span>
                    <span className="text-gray-500 text-xs shrink-0">{MEDIA_KIND_LABELS[m.kind] || m.kind}</span>
                    {canEdit && <>
                      <button onClick={() => restoreTrash('media', m.id)} className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600">Wiederherstellen</button>
                      <button onClick={() => purgeTrash('media', m.id)} className="p-1.5 text-gray-500 hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section id="api" area="settings" plain title="API & Token" description="Externe Steuerung per ATEM, HTTP etc."
            icon={Key} open={openSections.api} onToggle={toggleSection}>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">API-Token (für diese Ansicht)</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input type={showToken ? 'text' : 'password'} value={monitorConfig.api_token} readOnly
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono pr-10" />
                  <button onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(monitorConfig.api_token); toast.success('Token kopiert'); }}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-lg" title="Kopieren"><Copy className="w-4 h-4" /></button>
                {canEdit && (
                  <button onClick={handleRegenerateToken}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-lg" title="Neues Token"><RefreshCw className="w-4 h-4" /></button>
                )}
              </div>
            </div>
            <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700/40 text-xs space-y-2">
              <p className="text-gray-400 font-medium mb-2">Beispiel-Requests (ON AIR betrifft alle Ansichten):</p>
              <div className="font-mono text-gray-500 space-y-1.5">
                <p><span className="text-green-400">POST</span> /api/monitor/on-air <span className="text-gray-600">{'{"on_air": true}'}</span></p>
                <p><span className="text-amber-400">POST</span> /api/monitor/emergency <span className="text-gray-600">{'{"active": true, "text": "..."}'}</span></p>
                <p className="border-t border-gray-700/40 pt-1.5"><span className="text-sky-400">Header:</span> X-Monitor-Token: {'<token>'}</p>
              </div>
            </div>
          </Section>
        </>
      )}

      </div>{/* Ende linke Spalte */}

      {/* Feste Live-Vorschau (Ansichten, ab lg) */}
      {activeArea === 'views' && showPreview && monitorConfig && (
        <aside className="hidden lg:block sticky top-24 self-start">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-800">
              <span className="text-xs text-gray-400 flex items-center gap-2 truncate">
                <Activity className="w-3 h-3 shrink-0" /> Vorschau · {activeView?.name}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a href={`/monitor?view=${monitorConfig.slug}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white" title="Groß öffnen">
                  <Maximize2 className="w-3.5 h-3.5" />
                </a>
                <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-white" title="Vorschau ausblenden">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="relative bg-black" style={{ paddingBottom: '56.25%' }}>
              <iframe key={`${monitorConfig.slug}-${savedAt}`} src={`/monitor?view=${monitorConfig.slug}`}
                className="absolute inset-0 w-full h-full border-0" title="Monitor Preview"
                style={{ pointerEvents: 'none' }} />
            </div>
          </div>
        </aside>
      )}

      </div>{/* Ende Inhaltsbereich-Grid */}

      {/* Hidden Inputs */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadFile}
        accept={uploadKind === 'pdf' ? '.pdf' : 'image/*'} />
      </div>
    </div>
    </AreaContext.Provider>
  );
}

// ─── Zeitplan-Wochen-Timeline (kompakte visuelle Übersicht) ───
function ScheduleTimeline({ schedule, views }) {
  const entries = (schedule || []).filter(e => e && e.view_id);
  if (entries.length === 0) return null;
  const START = 6, END = 22, SPAN = (END - START) * 60;
  const toMin = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
  const palette = ['#7c3aed', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#db2777', '#4f46e5'];
  const colorFor = (id) => palette[(id || 0) % palette.length];
  const nameFor = (id) => views.find(p => p.id === id)?.name || '–';
  return (
    <div className="mb-3 p-2 bg-gray-800/30 rounded-lg border border-gray-700/40">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, di) => (
          <div key={di} className="text-center">
            <div className="text-[10px] text-gray-500 mb-1">{d}</div>
            <div className="relative bg-gray-900/60 rounded overflow-hidden" style={{ height: 110 }}>
              {entries.filter(e => (e.days || []).includes(di)).map((e, i) => {
                const top = Math.max(0, (toMin(e.from) - START * 60) / SPAN * 100);
                const h = Math.min(100 - top, (toMin(e.until) - toMin(e.from)) / SPAN * 100);
                return (
                  <div key={i} className="absolute left-0.5 right-0.5 rounded text-[8px] leading-tight text-white overflow-hidden px-0.5 py-px"
                    style={{ top: `${top}%`, height: `${Math.max(7, h)}%`, background: colorFor(e.view_id) }}
                    title={`${nameFor(e.view_id)}: ${e.from}–${e.until}`}>
                    {nameFor(e.view_id)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1"><span>{START}:00</span><span>{END}:00 Uhr</span></div>
    </div>
  );
}

// ─── Power-Zeitplan Editor (Wochentage + Ferienmodus + Ausnahmen) ───
function PowerScheduleEditor({ screen, canEdit, update }) {
  const plan = screen.power_schedule || [];
  const exceptions = screen.power_exceptions || [];

  const setPlanEntry = (idx, patch) => {
    const next = plan.map((e, i) => i === idx ? { ...e, ...patch } : e);
    update('power_schedule', next);
  };
  const addPlanEntry = (preset) => {
    const entry = preset === 'weekend'
      ? { days: [5, 6], from: '10:00', until: '16:00' }
      : preset === 'all'
        ? { days: [0, 1, 2, 3, 4, 5, 6], from: '07:00', until: '17:00' }
        : { days: [0, 1, 2, 3, 4], from: '07:00', until: '17:00' };
    update('power_schedule', [...plan, entry]);
  };
  const removePlanEntry = (idx) => update('power_schedule', plan.filter((_, i) => i !== idx));
  const toggleDay = (idx, dayIdx) => {
    const days = plan[idx]?.days || [];
    setPlanEntry(idx, { days: days.includes(dayIdx) ? days.filter(t => t !== dayIdx) : [...days, dayIdx] });
  };

  const addException = () => {
    const today = new Date().toISOString().slice(0, 10);
    update('power_exceptions', [...exceptions, { from_date: today, until_date: today, from: '09:00', until: '17:00', note: '' }]);
  };
  const setException = (idx, patch) => {
    update('power_exceptions', exceptions.map((a, i) => i === idx ? { ...a, ...patch } : a));
  };
  const removeException = (idx) => update('power_exceptions', exceptions.filter((_, i) => i !== idx));

  const mode = screen.power_mode || 'auto';
  const setMode = (m) => update('power_mode', m);

  return (
    <div className="space-y-4">
      {/* Modus-Schalter: Automatisch (Zeitplan) vs Manuell An/Aus */}
      <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/40 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium text-white">Steuerung</div>
            <p className="text-[11px] text-gray-500">Im manuellen Modus ignoriert der Bildschirm den Zeitplan.</p>
          </div>
          <div className="inline-flex rounded-lg overflow-hidden border border-gray-700">
            {[
              { v: 'auto', l: 'Automatisch' },
              { v: 'manual_on', l: 'An' },
              { v: 'manual_off', l: 'Aus' },
            ].map(({ v, l }) => (
              <button key={v} type="button" disabled={!canEdit} onClick={() => setMode(v)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  mode === v
                    ? (v === 'manual_on' ? 'bg-green-600 text-white'
                       : v === 'manual_off' ? 'bg-red-600 text-white'
                       : 'bg-accent text-white')
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                } disabled:opacity-50`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {mode !== 'auto' && (
          <p className="text-[11px] text-amber-400">
            Manueller Modus aktiv. Zeitplan und Ferienmodus greifen nicht.
          </p>
        )}
      </div>

      {/* Ferienmodus */}
      <div className={`flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-700/40 ${mode !== 'auto' ? 'opacity-50' : ''}`}>
        <div>
          <div className="text-sm font-medium text-white">Ferienmodus</div>
          <p className="text-[11px] text-gray-500">Bildschirm bleibt aus, außer zu den Sonderzeiten unten.</p>
        </div>
        <Toggle checked={!!screen.holiday_mode} disabled={!canEdit || mode !== 'auto'}
          onChange={(v) => update('holiday_mode', v)} />
      </div>

      {/* Wochentage-Zeitplan */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h5 className="text-sm font-semibold text-white">Wochen-Zeitplan</h5>
            <p className="text-[11px] text-gray-500">
              {screen.holiday_mode ? 'Inaktiv während Ferienmodus.' : 'Bildschirm ist nur während dieser Fenster an. Leer = immer an.'}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-1.5">
              <button onClick={() => addPlanEntry('week')}
                className="px-2.5 py-1 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded">
                + Mo–Fr
              </button>
              <button onClick={() => addPlanEntry('weekend')}
                className="px-2.5 py-1 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded">
                + Sa–So
              </button>
              <button onClick={() => addPlanEntry('all')}
                className="px-2.5 py-1 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded">
                + Alle Tage
              </button>
            </div>
          )}
        </div>

        {plan.length === 0 ? (
          <div className="p-3 bg-gray-800/20 rounded-lg border border-gray-700/30 text-center text-xs text-gray-500">
            Kein Zeitplan. Bildschirm ist {screen.holiday_mode ? 'aus (Ferienmodus)' : 'immer an'}.
          </div>
        ) : (
          <div className="space-y-2">
            {plan.map((entry, idx) => (
              <div key={idx} className={`p-2.5 rounded-lg border ${screen.holiday_mode ? 'bg-gray-800/10 border-gray-700/20 opacity-60' : 'bg-gray-800/30 border-gray-700/40'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1">
                    {WEEKDAYS.map((day, dayIdx) => (
                      <button key={dayIdx} disabled={!canEdit}
                        onClick={() => toggleDay(idx, dayIdx)}
                        className={`w-7 h-7 rounded text-[11px] font-bold transition-colors disabled:opacity-50 ${
                          (entry.days || []).includes(dayIdx)
                            ? (dayIdx >= 5 ? 'bg-gray-600/40 border border-gray-500/50 text-gray-100' : 'bg-accent/20 border border-accent/40 text-white')
                            : 'bg-gray-800 border border-gray-700 text-gray-500'
                        }`}>
                        {day}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="time" value={entry.from || ''} disabled={!canEdit}
                      onChange={e => setPlanEntry(idx, { from: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                    <span className="text-gray-500 text-xs">–</span>
                    <input type="time" value={entry.until || ''} disabled={!canEdit}
                      onChange={e => setPlanEntry(idx, { until: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                  </div>
                  {canEdit && (
                    <button onClick={() => removePlanEntry(idx)}
                      className="ml-auto p-1 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ausnahmen / Sonderzeiten */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h5 className="text-sm font-semibold text-white">Sonderzeiten / Ausnahmen</h5>
            <p className="text-[11px] text-gray-500">Überschreibt Wochenplan und Ferienmodus für bestimmte Tage.</p>
          </div>
          {canEdit && (
            <button onClick={addException}
              className="flex items-center gap-1 px-2.5 py-1 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded">
              <Plus className="w-3 h-3" /> Sonderzeit
            </button>
          )}
        </div>

        {exceptions.length === 0 ? (
          <div className="p-3 bg-gray-800/20 rounded-lg border border-gray-700/30 text-center text-xs text-gray-500">
            Keine Ausnahmen.
          </div>
        ) : (
          <div className="space-y-2">
            {exceptions.map((a, idx) => (
              <div key={idx} className="p-2.5 bg-amber-900/10 rounded-lg border border-amber-700/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" value={a.from_date || ''} disabled={!canEdit}
                    onChange={e => setException(idx, { from_date: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                  <span className="text-gray-500 text-xs">bis</span>
                  <input type="date" value={a.until_date || ''} disabled={!canEdit}
                    onChange={e => setException(idx, { until_date: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                  <div className="flex items-center gap-1.5 ml-2">
                    <input type="time" value={a.from || ''} disabled={!canEdit}
                      onChange={e => setException(idx, { from: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                    <span className="text-gray-500 text-xs">–</span>
                    <input type="time" value={a.until || ''} disabled={!canEdit}
                      onChange={e => setException(idx, { until: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                  </div>
                  {canEdit && (
                    <button onClick={() => removeException(idx)}
                      className="ml-auto p-1 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <input type="text" value={a.note || ''} disabled={!canEdit}
                  onChange={e => setException(idx, { note: e.target.value })}
                  placeholder="Notiz (z.B. Tag der offenen Tür)"
                  className="w-full mt-2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50 placeholder-gray-500" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



// ─── Events (aktivierbare Modi) ──────────────────────────────
function EventManager({ events, screens, views, canEdit, onSave, onDelete, onToggleActive }) {
  const [draft, setDraft] = useState(null); // {id?, name, color, description, active_from, active_until, assignments:[...]}
  const [previewId, setPreviewId] = useState(null); // Event-Karte mit aufgeklappter Vorschau
  const viewSlug = (id) => views.find(p => p.id === id)?.slug;
  const viewName = (id) => views.find(p => p.id === id)?.name || '–';
  const toLocal = (iso) => iso ? iso.slice(0, 16) : '';
  const toIso = (local) => local ? new Date(local).toISOString() : null;
  const fmt = (iso) => { try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  // Tickende Zeit für „endet in / startet in"-Badges
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const humanDur = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), mm = m % 60;
    return mm ? `${h} h ${mm} min` : `${h} h`;
  };
  const timeBadge = (ev) => {
    if (!ev.active_from || !ev.active_until) return null;
    const startMs = new Date(ev.active_from).getTime(), endMs = new Date(ev.active_until).getTime();
    if (now < startMs) return { text: `startet in ${humanDur(startMs - now)}`, cls: 'bg-sky-500/20 text-sky-300' };
    if (now < endMs) return { text: `endet in ${humanDur(endMs - now)}`, cls: 'bg-amber-500/20 text-amber-300' };
    return { text: 'abgelaufen', cls: 'bg-gray-700 text-gray-400' };
  };
  // Kollisionen: Events mit überlappendem Zeitfenster, die sich einen Bildschirm teilen
  const collisionIds = (() => {
    const ids = new Set();
    const win = ev => ev.active_from && ev.active_until;
    const overlap = (a, b) => new Date(a.active_from) < new Date(b.active_until) && new Date(b.active_from) < new Date(a.active_until);
    const shares = (a, b) => { const sa = new Set((a.assignments || []).map(z => z.screen_id)); return (b.assignments || []).some(z => sa.has(z.screen_id)); };
    for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      if (win(a) && win(b) && overlap(a, b) && shares(a, b)) { ids.add(a.id); ids.add(b.id); }
    }
    return ids;
  })();
  const start = (ev) => setDraft(ev
    ? { ...ev, assignments: (ev.assignments || []).map(z => ({ screen_id: z.screen_id, view_id: z.view_id })) }
    : { name: '', color: '#7c3aed', description: '', active_from: null, active_until: null, assignments: [] });
  const viewFor = (screenId) => draft.assignments.find(z => z.screen_id === screenId)?.view_id || '';
  const setViewFor = (screenId, viewId) => setDraft(d => {
    const rest = d.assignments.filter(z => z.screen_id !== screenId);
    return { ...d, assignments: viewId ? [...rest, { screen_id: screenId, view_id: viewId }] : rest };
  });
  const save = async () => {
    if (!draft.name.trim()) { toast.error('Name nötig'); return; }
    await onSave(draft);
    setDraft(null);
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Ein Event weist Bildschirmen andere Ansichten zu. Beim Aktivieren schalten die Monitore um,
        beim Deaktivieren automatisch zurück zu Zeitplan/Standard.
      </p>
      {canEdit && !draft && (
        <button onClick={() => start(null)}
          className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg">
          <Plus className="w-4 h-4" /> Neues Event
        </button>
      )}

      {draft && (
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="z.B. Tag der offenen Tür" autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Farbe</label>
              <input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })}
                className="w-full h-10 bg-gray-800 border border-gray-700 rounded-lg" />
            </div>
          </div>

          {/* Zeitplanung (optional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Automatisch aktiv ab (optional)</label>
              <input type="datetime-local" value={toLocal(draft.active_from)} onChange={e => setDraft({ ...draft, active_from: toIso(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">bis (optional)</label>
              <input type="datetime-local" value={toLocal(draft.active_until)} onChange={e => setDraft({ ...draft, active_until: toIso(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-500">Schnell:</span>
              <button type="button" onClick={() => setDraft({ ...draft, active_from: new Date().toISOString() })} className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">Ab = jetzt</button>
              {[2, 4, 8].map(h => (
                <button key={h} type="button" onClick={() => setDraft({ ...draft, active_until: new Date((draft.active_from ? new Date(draft.active_from) : new Date()).getTime() + h * 3600000).toISOString() })}
                  className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">bis +{h} h</button>
              ))}
              <button type="button" onClick={() => setDraft({ ...draft, active_from: null, active_until: null })} className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs hover:bg-gray-700">leeren</button>
            </div>
            <p className="col-span-2 text-[11px] text-gray-500">Leer = nur manuell per „Aktivieren". Mit Zeitfenster schaltet das Event automatisch ein und wieder aus.</p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Ansicht pro Bildschirm (während des Events)</label>
            {screens.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Keine Bildschirme angelegt.</p>
            ) : (
              <div className="space-y-2">
                {screens.map(screen => {
                  const selectedViewId = viewFor(screen.id);
                  const slug = selectedViewId ? viewSlug(selectedViewId) : null;
                  return (
                    <div key={screen.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-300 w-40 shrink-0 truncate">{screen.name}</span>
                      <select value={selectedViewId} onChange={e => setViewFor(screen.id, e.target.value ? parseInt(e.target.value) : null)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm">
                        <option value="">Unverändert</option>
                        {views.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {slug && (
                        <div className="hidden sm:block w-28 shrink-0 rounded overflow-hidden border border-gray-700 bg-black" style={{ aspectRatio: '16/9' }} title="Vorschau">
                          <iframe src={`/monitor?view=${slug}`} className="w-full h-full border-0" style={{ pointerEvents: 'none' }} loading="lazy" title={`Vorschau ${screen.name}`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white font-medium text-sm rounded-lg">
              <Save className="w-4 h-4" /> Speichern
            </button>
            <button onClick={() => setDraft(null)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">Abbrechen</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {events.map(ev => (
          <div key={ev.id} className={`p-3 rounded-xl border ${
            ev.is_active ? 'bg-accent/[0.06] border-accent/40' : 'bg-gray-800/20 border-gray-700/40'}`}>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ev.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white text-sm">{ev.name}</span>
                  {ev.is_active && <span className="px-2 py-0.5 text-[10px] bg-accent/15 text-accent ring-1 ring-inset ring-accent/30 rounded-md font-semibold">aktiv</span>}
                  {(() => { const b = timeBadge(ev); return b ? <span className={`px-2 py-0.5 text-[10px] rounded-md ${b.cls}`}>{b.text}</span> : null; })()}
                  {collisionIds.has(ev.id) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-red-500/20 text-red-300 rounded-md" title="Überlappt zeitlich mit einem anderen Event auf demselben Bildschirm">
                      <AlertTriangle className="w-3 h-3" /> Überschneidung
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {(ev.assignments || []).length} Bildschirm(e)
                  {ev.active_from && ev.active_until && <> · läuft automatisch {fmt(ev.active_from)}–{fmt(ev.active_until)}</>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setPreviewId(previewId === ev.id ? null : ev.id)}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700">
                  {previewId === ev.id ? 'Vorschau ▲' : 'Vorschau ▼'}
                </button>
                {canEdit && (
                  <>
                    <button onClick={() => onToggleActive(ev)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
                        ev.is_active ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                      {ev.is_active ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button onClick={() => start(ev)} className="p-2 text-gray-400 hover:text-accent hover:bg-gray-800 rounded-lg"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(ev.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>
            {previewId === ev.id && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {(ev.assignments || []).length === 0 && <p className="text-xs text-gray-500">Keine Zuweisungen.</p>}
                {(ev.assignments || []).map(z => {
                  const slug = viewSlug(z.view_id);
                  const screen = screens.find(b => b.id === z.screen_id);
                  return (
                    <div key={z.screen_id} className="rounded-lg overflow-hidden border border-gray-700">
                      <div className="px-2 py-1 text-[11px] text-gray-400 bg-gray-800/60 truncate">{screen?.name || 'Bildschirm'} → {viewName(z.view_id)}</div>
                      <div className="bg-black" style={{ aspectRatio: '16/9' }}>
                        {slug && <iframe src={`/monitor?view=${slug}`} className="w-full h-full border-0" style={{ pointerEvents: 'none' }} loading="lazy" title={`Vorschau ${screen?.name}`} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {events.length === 0 && !draft && (
          <div className="p-8 text-center text-gray-500 border border-gray-800 rounded-xl">
            <Radio className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Noch keine Events. Lege z.B. „Tag der offenen Tür“ an und aktiviere es bei Bedarf.</p>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Klausur-Vorlagen (selbst erstellbar) ────────────────────
function ExamTemplatesBar({ templates, webuntisLinks, onApply, onSave, onDelete }) {
  const [manage, setManage] = useState(false);
  const [draft, setDraft] = useState(null); // {id?, name, duration_minutes, display_mode, color, split_side, split_percent, webuntis_link_id}
  const newDraft = () => ({ name: '', duration_minutes: 90, display_mode: 'fullscreen', color: '#1e40af', split_side: 'right', split_percent: 50, webuntis_link_id: null });
  const save = async () => { if (!draft.name.trim()) { toast.error('Name nötig'); return; } await onSave(draft); setDraft(null); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-500">Vorlage:</span>
        {templates.length === 0 && <span className="text-[11px] text-gray-500">noch keine</span>}
        {templates.map(v => (
          <button key={v.id} onClick={() => onApply(v)}
            className="px-2.5 py-1 rounded-lg text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700">
            {v.name}
          </button>
        ))}
        <button onClick={() => setManage(m => !m)} className="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white">
          {manage ? 'fertig' : 'Vorlagen verwalten'}
        </button>
      </div>

      {manage && (
        <div className="p-3 bg-gray-800/40 rounded-xl border border-gray-700 space-y-3">
          {!draft && (
            <button onClick={() => setDraft(newDraft())} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg">
              <Plus className="w-3.5 h-3.5" /> Neue Vorlage
            </button>
          )}
          {draft && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Name (z.B. Deutsch-Abi 300 Min)" autoFocus
                  className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm" />
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Dauer (Min)</label>
                  <input type="number" min={5} value={draft.duration_minutes} onChange={e => setDraft({ ...draft, duration_minutes: parseInt(e.target.value) || 90 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Anzeige</label>
                  <select value={draft.display_mode} onChange={e => setDraft({ ...draft, display_mode: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm">
                    <option value="fullscreen">Vollbild</option>
                    <option value="split">Splitscreen</option>
                    <option value="standard">Kein Zwang</option>
                  </select>
                </div>
              </div>
              {draft.display_mode === 'split' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-gray-500 mb-0.5">Stundenplan-Link</label>
                    <select value={draft.webuntis_link_id || ''} onChange={e => setDraft({ ...draft, webuntis_link_id: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm">
                      <option value="">Link der Ansicht</option>
                      {webuntisLinks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <select value={draft.split_side} onChange={e => setDraft({ ...draft, split_side: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm">
                    <option value="left">Klausur links</option><option value="right">Klausur rechts</option>
                  </select>
                  <input type="number" min={20} max={80} value={draft.split_percent} onChange={e => setDraft({ ...draft, split_percent: parseInt(e.target.value) || 50 })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm" placeholder="% Klausur" />
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} className="h-8 w-12 bg-gray-800 border border-gray-700 rounded" />
                <div className="flex items-center gap-1.5">
                  {['#1e40af', '#b91c1c', '#15803d', '#a16207', '#7c3aed', '#0f766e'].map(c => (
                    <button key={c} type="button" onClick={() => setDraft({ ...draft, color: c })} title={c}
                      className={`w-5 h-5 rounded-full border-2 ${(draft.color || '').toLowerCase() === c ? 'border-white' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                </div>
                <button onClick={save} className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white font-medium text-xs rounded-lg flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Speichern</button>
                <button onClick={() => setDraft(null)} className="px-3 py-1.5 bg-gray-700 text-white text-xs rounded-lg">Abbrechen</button>
              </div>
            </div>
          )}
          {templates.map(v => (
            <div key={v.id} className="flex items-center gap-2 text-xs text-gray-300">
              <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
              <span className="flex-1">{v.name} · {v.duration_minutes} Min · {DISPLAY_MODE_LABELS[v.display_mode] || v.display_mode}</span>
              <button onClick={() => setDraft({ ...v })} className="p-1 text-gray-400 hover:text-accent"><Edit className="w-3.5 h-3.5" /></button>
              <button onClick={() => onDelete(v.id)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── WebUntis-Link-Bibliothek ────────────────────────────────
function WebUntisLinkManager({ links, canEdit, onSave, onDelete }) {
  const [draft, setDraft] = useState(null); // {id?, name, url, note}
  const start = (link) => setDraft(link ? { ...link } : { name: '', url: '', note: '' });
  const save = async () => {
    if (!draft.name.trim() || !draft.url.trim()) { toast.error('Name und URL nötig'); return; }
    await onSave(draft);
    setDraft(null);
  };
  return (
    <div className="space-y-3">
      {canEdit && !draft && (
        <button onClick={() => start(null)}
          className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg">
          <Plus className="w-4 h-4" /> Neuer Link
        </button>
      )}
      {draft && (
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700 space-y-3">
          <input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name (z.B. Klasse 10a, 1 Tag)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
          <input type="url" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://neilo.webuntis.com/..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
          <input type="text" value={draft.note || ''} onChange={e => setDraft({ ...draft, note: e.target.value })}
            placeholder="Notiz (optional)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
          <div className="flex items-center gap-2">
            <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white font-medium text-sm rounded-lg">
              <Save className="w-4 h-4" /> Speichern
            </button>
            <button onClick={() => setDraft(null)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">Abbrechen</button>
          </div>
        </div>
      )}
      <div className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
        {links.map(l => (
          <div key={l.id} className="p-3 flex items-start justify-between bg-gray-800/20 hover:bg-gray-800/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white text-sm">{l.name}</div>
              <div className="text-xs text-gray-500 truncate">{l.url}</div>
              {l.note && <div className="text-xs text-gray-500 mt-0.5">{l.note}</div>}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 ml-3 shrink-0">
                <button onClick={() => start(l)} className="p-2 text-gray-400 hover:text-accent hover:bg-gray-800 rounded-lg"><Edit className="w-4 h-4" /></button>
                <button onClick={() => onDelete(l.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
        {links.length === 0 && !draft && (
          <div className="p-8 text-center text-gray-500">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Noch keine Links. Hier einmal anlegen, dann in Ansicht oder Klausur auswählen.</p>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Klausur-Form ────────────────────────────────────────────
function ExamForm({ initial, screens, webuntisLinks = [], onSave, onCancel }) {
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  };
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const [title, setTitle] = useState(initial?.title || 'Klausur');
  const [text, setText] = useState(initial?.text || '');
  const [from, setFrom] = useState(initial ? toLocalInput(initial.active_from) : toLocalInput(now));
  const [until, setUntil] = useState(initial ? toLocalInput(initial.active_until) : toLocalInput(in1h));
  const [color, setColor] = useState(initial?.color || '#1e40af');
  const [screenIds, setScreenIds] = useState(initial?.screen_ids || []);
  const [displayMode, setDisplayMode] = useState(initial?.display_mode || 'fullscreen');
  const [webuntisLinkId, setWebuntisLinkId] = useState(initial?.webuntis_link_id || null);
  const [splitSide, setSplitSide] = useState(initial?.split_side || 'right');
  const [splitPercent, setSplitPercent] = useState(initial?.split_percent || 50);

  const toggleScreen = (id) => setScreenIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const submit = () => {
    if (!title.trim() || !from || !until) return;
    onSave({
      title, text,
      active_from: new Date(from).toISOString(),
      active_until: new Date(until).toISOString(),
      color, screen_ids: screenIds,
      display_mode: displayMode,
      webuntis_link_id: webuntisLinkId,
      split_side: splitSide,
      split_percent: splitPercent,
    });
  };

  return (
    <div className="p-4 border border-sky-500/30 rounded-xl bg-sky-900/10 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Titel</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Farbe</label>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="h-10 w-14 bg-gray-800 border border-gray-700 rounded-lg shrink-0" />
            <div className="flex items-center gap-1.5 flex-wrap">
              {['#1e40af', '#b91c1c', '#15803d', '#a16207', '#7c3aed', '#0f766e'].map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} title={c}
                  className={`w-6 h-6 rounded-full border-2 ${color.toLowerCase() === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Hinweistext (optional)</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder="z.B. Bitte Ruhe, Klausur bis 10:30"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Von</label>
          <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Bis</label>
          <input type="datetime-local" value={until} onChange={e => setUntil(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
        </div>
      </div>
      {/* Zeit-Schnellbuttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-500">Schnell:</span>
        <button type="button" onClick={() => setFrom(toLocalInput(new Date()))} className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">Von = jetzt</button>
        {[45, 60, 90, 120].map(m => (
          <button key={m} type="button" onClick={() => setUntil(toLocalInput(new Date((from ? new Date(from) : new Date()).getTime() + m * 60000)))}
            className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">Bis +{m} min</button>
        ))}
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-2">Auf welchen Bildschirmen?</label>
        {screens.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Keine Bildschirme angelegt. Zuerst Bildschirme erstellen.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {screens.map(screen => (
              <button key={screen.id} type="button" onClick={() => toggleScreen(screen.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  screenIds.includes(screen.id)
                    ? 'bg-accent/20 border-accent/40 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}>
                {screen.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pt-2 border-t border-sky-500/20 space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Anzeige während der Klausur</label>
          <select value={displayMode} onChange={e => setDisplayMode(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent">
            <option value="fullscreen">Vollbild (Klausur-Hinweis)</option>
            <option value="split">Splitscreen (Klausur + Stundenplan)</option>
            <option value="standard">Kein Zwang (Ansicht-Layout)</option>
          </select>
        </div>
        {displayMode === 'split' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-800/40 rounded-lg">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Stundenplan-Link (WebUntis)</label>
              <select value={webuntisLinkId || ''} onChange={e => setWebuntisLinkId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                <option value="">Link der Ansicht nutzen</option>
                {webuntisLinks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Klausur-Seite</label>
              <select value={splitSide} onChange={e => setSplitSide(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                <option value="left">Links</option>
                <option value="right">Rechts</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Breite Klausur: {splitPercent}%</label>
              <input type="range" min={20} max={80} step={5} value={splitPercent}
                onChange={e => setSplitPercent(parseInt(e.target.value))} className="w-full accent-accent" />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-sky-500/20">
        <button onClick={onCancel} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
        <button onClick={submit} disabled={!title.trim() || screenIds.length === 0}
          className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2">
          <Save className="w-3.5 h-3.5" /> Speichern
        </button>
      </div>
    </div>
  );
}

// ─── Klausur-Card (editierbar inline) ───────────────────────
function ExamCard({ exam, screens, webuntisLinks = [], canEdit, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const start = new Date(exam.active_from);
  const end = new Date(exam.active_until);
  const now = new Date();
  const isLive = start <= now && now <= end;
  const isPast = end < now;

  if (editing) {
    return (
      <ExamForm
        initial={exam}
        screens={screens}
        webuntisLinks={webuntisLinks}
        onSave={(payload) => { onSave(payload); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      isLive ? 'bg-sky-900/20 border-sky-500/40' : isPast ? 'bg-gray-800/20 border-gray-700/40 opacity-60' : 'bg-gray-800/30 border-gray-700/40'
    }`}>
      <div className="w-2 h-10 rounded-full shrink-0" style={{ background: exam.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white truncate">{exam.title}</span>
          {isLive && <span className="px-1.5 py-0.5 text-[9px] bg-red-600/30 text-red-300 border border-red-500/30 rounded-md animate-pulse">LIVE</span>}
          {isPast && <span className="px-1.5 py-0.5 text-[9px] bg-gray-700 text-gray-400 rounded-md">Vergangen</span>}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {start.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          {' – '}
          {end.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {(exam.screen_ids || []).map(id => {
            const screen = screens.find(b => b.id === id);
            return screen ? <span key={id} className="px-1.5 py-0.5 text-[9px] bg-gray-700/60 text-gray-300 rounded">{screen.name}</span> : null;
          })}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800">
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
