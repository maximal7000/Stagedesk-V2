/**
 * Monitor-Konfiguration — Admin-Seite (Multi-Profil)
 * Features: Profil-Management, Zeitplan-Editor, Layout-Modi, ON AIR Anpassung
 */
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Save, Loader2, Moon, AlertCircle, ChevronDown,
  Monitor, Radio, Megaphone, ExternalLink, RefreshCw, Copy, Eye, EyeOff,
  AlertTriangle, Upload, Image, FileText, Palette, Clock, CloudSun, Type,
  Calendar, Plus, Trash2, Check, Edit, QrCode, AlignLeft, ImageIcon, Settings, Key,
  Timer, RotateCw, LayoutGrid, MonitorOff, Activity, Zap, X, Maximize2,
  Download, UploadCloud, Layers, CalendarClock, Move, Sparkles,
} from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import apiClient from '../../lib/api';
import BaukastenEditor from '../../components/monitor/BaukastenEditor';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE = API_BASE.replace(/\/api\/?$/, '');

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Alle Layout-Modi (muss zu MonitorConfig.LAYOUT_CHOICES im Backend passen).
const LAYOUT_MODI = [
  ['standard', 'Standard-Layout'],
  ['stundenplan', 'Stundenplan-Vollbild'],
  ['onair', 'ON AIR Display'],
  ['abfahrten', 'Abfahrtsmonitor (ÖPNV)'],
  ['baukasten', 'Widget-Baukasten (frei)'],
  ['pdf_vollbild', 'PDF-Vollbild'],
  ['bild_vollbild', 'Bild-Vollbild'],
  ['split', 'Splitscreen'],
];

// Aktiver Admin-Bereich (Hub-Navigation). Sections rendern nur im passenden Bereich.
const AreaContext = createContext(null);

// ─── Section — collapsible; oder `plain` (immer offen, kein Aufklappen) ───
function Section({ id, area, plain, title, description, icon: Icon, iconColor, open, onToggle, badge, statusDot, children }) {
  const activeArea = useContext(AreaContext);
  if (area && activeArea && area !== activeArea) return null;
  const isOpen = plain ? true : open;
  const HeaderTag = plain ? 'div' : 'button';
  return (
    <div id={`section-${id}`} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden scroll-mt-32">
      <HeaderTag {...(plain ? {} : { onClick: () => onToggle(id) })}
        className={`w-full px-5 py-4 flex items-center justify-between ${plain ? '' : 'hover:bg-gray-800/40 transition-colors group'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconColor || 'bg-gray-800'}`}>
            <Icon className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
              {title}
              {badge != null && <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded-full font-normal">{badge}</span>}
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
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative w-10 h-5.5 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-gray-700'}`}>
      <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

export default function MonitorAdminPage() {
  const { isAdmin, hasPermission } = useUser();

  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [monitorConfig, setMonitorConfig] = useState(null);
  const [originalConfig, setOriginalConfig] = useState(null);
  const [monitorAnkuendigungen, setMonitorAnkuendigungen] = useState([]);
  const [monitorDateien, setMonitorDateien] = useState([]);
  const [monitorSaving, setMonitorSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [newAnkuendigung, setNewAnkuendigung] = useState(null);
  const [editingAnkuendigung, setEditingAnkuendigung] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [savedAt, setSavedAt] = useState(0);
  // Vorschau-Iframes laufen als echte MonitorPage und pollen intern (Uhr/Daten live).
  // Sie werden nur nach dem Speichern neu geladen (savedAt) — kein hartes Remount-Flackern.
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileLayout, setNewProfileLayout] = useState('standard');
  const [cloneFromId, setCloneFromId] = useState(null);
  const fileInputRef = useRef(null);
  const [uploadTyp, setUploadTyp] = useState('logo');
  const [oepnvSuche, setOepnvSuche] = useState('');
  const [oepnvErgebnisse, setOepnvErgebnisse] = useState([]);
  const [oepnvSuching, setOepnvSuching] = useState(false);
  const oepnvTimerRef = useRef(null);

  // Bildschirme
  const [bildschirme, setBildschirme] = useState([]);
  const [activeBildschirmId, setActiveBildschirmId] = useState(null);
  const [showNewBildschirm, setShowNewBildschirm] = useState(false);
  const [newBildschirmName, setNewBildschirmName] = useState('');

  // Klausuren
  const [klausuren, setKlausuren] = useState([]);
  const [showNewKlausur, setShowNewKlausur] = useState(false);
  const [klausurTemplate, setKlausurTemplate] = useState(null);

  // WebUntis-Link-Bibliothek
  const [webuntisLinks, setWebuntisLinks] = useState([]);

  // Events (aktivierbare Modi)
  const [events, setEvents] = useState([]);

  // Klausur-Vorlagen (selbst erstellbar) + globale Einstellungen
  const [klausurVorlagen, setKlausurVorlagen] = useState([]);
  const [globalSettings, setGlobalSettings] = useState(null);

  // Sections
  const [searchParams, setSearchParams] = useSearchParams();
  const AREAS = ['uebersicht', 'ansichten', 'bildschirme', 'inhalte', 'events', 'einstellungen'];
  const [activeArea, setActiveAreaState] = useState(() => {
    const b = searchParams.get('bereich');
    return AREAS.includes(b) ? b : 'uebersicht';
  });
  const setActiveArea = (area) => {
    // Schutz vor Datenverlust: beim Verlassen von „Ansichten" mit ungespeicherten Änderungen warnen
    if (area !== activeArea && activeArea === 'ansichten' && hasChanges
        && !confirm('Ungespeicherte Änderungen verwerfen und Bereich wechseln?')) return;
    setActiveAreaState(area);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('bereich', area); return p; }, { replace: true });
  };
  // Browser-Zurück/Deep-Link: URL → State
  useEffect(() => {
    const b = searchParams.get('bereich');
    if (AREAS.includes(b) && b !== activeArea) setActiveAreaState(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [openSections, setOpenSections] = useState({
    profil: true,
    allgemein: false,
    widgets: true,
    onair: false,
    oepnv: false,
    theme: false,
    medien: false,
    ankuendigungen: false,
    webuntislinks: false,
    events: false,
    api: false,
    bildschirme: false,
  });
  const toggleSection = (id) => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

  // Permissions
  const canView = isAdmin || hasPermission('monitor.view');
  const canEdit = isAdmin || hasPermission('monitor.edit');
  const canOnAir = isAdmin || hasPermission('monitor.onair');
  const canNotfall = isAdmin || hasPermission('monitor.notfall');

  // Unsaved changes
  const hasChanges = monitorConfig && originalConfig && JSON.stringify(monitorConfig) !== JSON.stringify(originalConfig);

  // ═══ Data Fetching ═══
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await apiClient.get('/monitor/profile');
      setProfiles(res.data);
      return res.data;
    } catch { return []; }
  }, []);

  const fetchBildschirme = useCallback(async () => {
    try {
      const res = await apiClient.get('/monitor/bildschirme');
      setBildschirme(res.data);
    } catch {}
  }, []);

  const fetchKlausuren = useCallback(async () => {
    try {
      const res = await apiClient.get('/monitor/klausuren');
      setKlausuren(res.data);
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
      const body = { name: link.name, url: link.url, notiz: link.notiz || '' };
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
        name: ev.name, beschreibung: ev.beschreibung || '', farbe: ev.farbe || '#7c3aed',
        aktiv_von: ev.aktiv_von || null, aktiv_bis: ev.aktiv_bis || null,
        zuweisungen: (ev.zuweisungen || []).map(z => ({ bildschirm_id: z.bildschirm_id, profil_id: z.profil_id })),
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
      await apiClient.post(`/monitor/events/${ev.id}/${ev.aktiv ? 'deaktivieren' : 'aktivieren'}`);
      await fetchEvents();
      toast.success(ev.aktiv ? 'Event deaktiviert' : 'Event aktiviert');
    } catch { toast.error('Fehler'); }
  };

  // Sofort-Override eines Bildschirms setzen/zurücksetzen (Cockpit-Schnellumschaltung)
  const setBildschirmOverride = async (bs, profilId) => {
    try {
      await apiClient.put(`/monitor/bildschirme/${bs.id}`, { override_profil_id: profilId || null, override_bis: null });
      await fetchBildschirme();
      toast.success(profilId ? 'Bildschirm umgeschaltet' : 'Override zurückgesetzt');
    } catch { toast.error('Fehler beim Umschalten'); }
  };

  const fetchKlausurVorlagen = useCallback(async () => {
    try { const res = await apiClient.get('/monitor/klausur-vorlagen'); setKlausurVorlagen(res.data); } catch {}
  }, []);
  const saveKlausurVorlage = async (v) => {
    try {
      const body = {
        name: v.name, dauer_minuten: v.dauer_minuten || 90, titel: v.titel || 'Klausur', text: v.text || '',
        farbe: v.farbe || '#1e40af', anzeige_modus: v.anzeige_modus || 'vollbild',
        webuntis_link_id: v.webuntis_link_id || null, split_seite: v.split_seite || 'rechts', split_prozent: v.split_prozent || 50,
      };
      if (v.id) await apiClient.put(`/monitor/klausur-vorlagen/${v.id}`, body);
      else await apiClient.post('/monitor/klausur-vorlagen', body);
      await fetchKlausurVorlagen();
      toast.success('Vorlage gespeichert');
    } catch { toast.error('Fehler beim Speichern'); }
  };
  const deleteKlausurVorlage = async (id) => {
    try { await apiClient.delete(`/monitor/klausur-vorlagen/${id}`); await fetchKlausurVorlagen(); } catch { toast.error('Fehler'); }
  };

  const fetchGlobalSettings = useCallback(async () => {
    try { const res = await apiClient.get('/monitor/global-settings'); setGlobalSettings(res.data); } catch {}
  }, []);
  const saveGlobalSettings = async () => {
    try { await apiClient.put('/monitor/global-settings', globalSettings); toast.success('Globale Einstellungen gespeichert'); }
    catch { toast.error('Fehler beim Speichern'); }
  };

  const fetchConfigForProfile = useCallback(async (profileId) => {
    try {
      const [configRes, ankRes, dateiRes] = await Promise.all([
        apiClient.get(`/monitor/config?profil_id=${profileId}`),
        apiClient.get('/monitor/ankuendigungen'),
        apiClient.get('/monitor/dateien'),
      ]);
      setMonitorConfig(configRes.data);
      setOriginalConfig(configRes.data);
      setMonitorAnkuendigungen(ankRes.data);
      setMonitorDateien(dateiRes.data);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const profs = await fetchProfiles();
      fetchBildschirme();
      fetchKlausuren();
      fetchWebuntisLinks();
      fetchEvents();
      fetchKlausurVorlagen();
      fetchGlobalSettings();
      if (profs.length > 0) {
        const std = profs.find(p => p.ist_standard) || profs[0];
        setActiveProfileId(std.id);
        fetchConfigForProfile(std.id);
      }
    })();
  }, [fetchProfiles, fetchConfigForProfile, fetchBildschirme, fetchKlausuren, fetchWebuntisLinks, fetchEvents, fetchKlausurVorlagen, fetchGlobalSettings]);

  // Switch profile
  const switchProfile = (id) => {
    if (hasChanges && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    setActiveProfileId(id);
    fetchConfigForProfile(id);
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
      if (activeArea === 'ansichten' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const idx = profiles.findIndex(p => p.id === activeProfileId);
        const next = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
        if (idx >= 0 && next >= 0 && next < profiles.length) { e.preventDefault(); switchProfile(profiles[next].id); }
        return;
      }
      // N = neu: Ansicht (in „Ansichten") oder Klausur (in „Inhalte")
      if ((e.key === 'n' || e.key === 'N') && canEdit) {
        if (activeArea === 'ansichten') { e.preventDefault(); setShowNewProfile(true); }
        else if (activeArea === 'inhalte') { e.preventDefault(); setKlausurTemplate(null); setShowNewKlausur(true); }
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
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Zugriff verweigert</h2>
          <p className="text-gray-400">Du benötigst die Berechtigung &quot;Monitor anzeigen&quot; für diesen Bereich.</p>
        </div>
      </div>
    );
  }

  // ═══ Handler ═══
  // Nur diese Felder werden an PUT /monitor/config gesendet (muss MonitorConfigUpdateSchema entsprechen)
  const UPDATE_FIELDS = [
    'name','slug','ist_standard','zeitplan','layout_modus','titel','untertitel',
    'hintergrund_farbe','akzent_farbe','zeige_logo','logo_url','aktives_logo_id',
    'zeige_uhr','zeige_veranstaltungen','zeige_ankuendigungen','zeige_onair',
    'zeige_countdown','zeige_ticker','ticker_text','ticker_geschwindigkeit',
    'notfall_aktiv','notfall_text','zeige_wetter','wetter_stadt','wetter_api_key',
    'zeige_slideshow','slideshow_intervall','zeige_pdf','aktive_pdf_id','theme_preset',
    'vollbild_header','pdf_modus','pdf_intervall','pdf_pro_ansicht','pdf_seiten','pdf_statische_seite','aktives_bild_id','bild_fit',
    'zeige_webuntis','webuntis_url','webuntis_url_1tag','webuntis_link_id','webuntis_link_1tag_id','webuntis_zoom','webuntis_dark_mode',
    'split_links','split_rechts','split_links_prozent',
    'zeige_hintergrundbild','aktives_hintergrundbild_id',
    'zeige_qr_code','qr_code_url','qr_code_label',
    'zeige_freitext','freitext_titel','freitext_inhalt',
    'zeige_raumplan','raumplan_server','raumplan_schule','raumplan_raum','raumplan_benutzername','raumplan_passwort',
    'zeige_eigener_countdown','eigener_countdown_name','eigener_countdown_datum',
    'zeige_bildschirmschoner','bildschirmschoner_timeout',
    'zeige_seitenrotation','seitenrotation_intervall','seitenrotation_seiten',
    'zeige_oepnv','oepnv_stationen','oepnv_dauer','oepnv_max_abfahrten',
    'oepnv_zeige_bus','oepnv_zeige_bahn','oepnv_zeige_fernverkehr','oepnv_api_db','oepnv_api_nahsh',
    'oepnv_zeige_via','oepnv_zeige_relativ','oepnv_farbcodierung','oepnv_highlight_naechste',
    'oepnv_auto_scroll','oepnv_stoerungsbanner','oepnv_schriftgroesse','oepnv_layout_spalten',
    'oepnv_streik_aktiv','oepnv_streik_text','oepnv_streik_linien','oepnv_streik_typen',
    'on_air_text','on_air_groesse','on_air_position','on_air_blinken','on_air_farbe','on_air_vollbild','on_air_split','on_air_split_seite',
    'refresh_intervall',
    'zeige_kamera','kamera_url','kamera_titel','kamera_typ',
    'layout_widgets','baukasten_spalten','baukasten_zeilenhoehe',
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
      const res = await apiClient.put(`/monitor/config?profil_id=${activeProfileId}`, updateData);
      setMonitorConfig(res.data);
      setOriginalConfig(res.data);
      fetchProfiles();
      setSavedAt(Date.now());
      toast.success('Konfiguration gespeichert');
    } catch (e) {
      console.error('Monitor save error:', e.response?.data || e.message);
      toast.error('Speichern fehlgeschlagen');
    }
    finally { setMonitorSaving(false); }
  };

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return;
    try {
      const res = await apiClient.post('/monitor/profile', {
        name: newProfileName,
        layout_modus: newProfileLayout,
        clone_from_id: cloneFromId || null,
      });
      const profs = await fetchProfiles();
      setActiveProfileId(res.data.id);
      fetchConfigForProfile(res.data.id);
      setShowNewProfile(false);
      setNewProfileName('');
      setNewProfileLayout('standard');
      setCloneFromId(null);
      toast.success(`Ansicht "${res.data.name}" erstellt`);
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleDeleteProfile = async (id) => {
    const prof = profiles.find(p => p.id === id);
    if (!prof || prof.ist_standard) return;
    if (!confirm(`Ansicht "${prof.name}" wirklich löschen?`)) return;
    try {
      await apiClient.delete(`/monitor/profile/${id}`);
      const profs = await fetchProfiles();
      const std = profs.find(p => p.ist_standard) || profs[0];
      if (activeProfileId === id) {
        setActiveProfileId(std.id);
        fetchConfigForProfile(std.id);
      }
      toast.success('Ansicht gelöscht');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const handleDuplicateProfile = async () => {
    if (!activeProfile) return;
    try {
      const res = await apiClient.post('/monitor/profile', {
        name: `${activeProfile.name} (Kopie)`,
        layout_modus: monitorConfig?.layout_modus || 'standard',
        clone_from_id: activeProfileId,
      });
      await fetchProfiles();
      setActiveProfileId(res.data.id);
      fetchConfigForProfile(res.data.id);
      toast.success(`Ansicht "${res.data.name}" dupliziert`);
    } catch { toast.error('Fehler beim Duplizieren'); }
  };

  // Aktives Profil in der Reihenfolge verschieben (Tausch der sortierung mit Nachbar)
  const moveProfile = async (dir) => {
    const ordered = [...profiles].sort((a, b) => (a.sortierung - b.sortierung) || a.name.localeCompare(b.name));
    const idx = ordered.findIndex(p => p.id === activeProfileId);
    const swap = ordered[idx + dir];
    if (idx < 0 || !swap) return;
    const cur = ordered[idx];
    try {
      // sortierung normalisieren + tauschen
      const sCur = cur.sortierung ?? idx;
      const sSwap = swap.sortierung ?? (idx + dir);
      await Promise.all([
        apiClient.put(`/monitor/config?profil_id=${cur.id}`, { sortierung: sSwap }),
        apiClient.put(`/monitor/config?profil_id=${swap.id}`, { sortierung: sCur }),
      ]);
      await fetchProfiles();
    } catch { toast.error('Reihenfolge konnte nicht geändert werden'); }
  };

  // Ansicht direkt am Tab umbenennen (Doppelklick → Inline-Feld)
  const startRename = (p) => { if (!canEdit) return; setRenamingId(p.id); setRenameValue(p.name); };
  const commitRename = async () => {
    const id = renamingId;
    const name = renameValue.trim();
    setRenamingId(null);
    if (!id || !name) return;
    const prof = profiles.find(p => p.id === id);
    if (!prof || prof.name === name) return;
    try {
      await apiClient.put(`/monitor/config?profil_id=${id}`, { name });
      await fetchProfiles();
      if (id === activeProfileId) {
        setMonitorConfig(c => (c ? { ...c, name } : c));
        setOriginalConfig(c => (c ? { ...c, name } : c));
      }
      toast.success('Ansicht umbenannt');
    } catch { toast.error('Fehler beim Umbenennen'); }
  };

  // ═══ Bildschirm CRUD ═══
  const handleCreateBildschirm = async () => {
    if (!newBildschirmName.trim()) return;
    try {
      const res = await apiClient.post('/monitor/bildschirme', { name: newBildschirmName });
      await fetchBildschirme();
      setActiveBildschirmId(res.data.id);
      setShowNewBildschirm(false);
      setNewBildschirmName('');
      toast.success(`Bildschirm "${res.data.name}" erstellt`);
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleDeleteBildschirm = async (id) => {
    const bs = bildschirme.find(b => b.id === id);
    if (!bs) return;
    if (!confirm(`Bildschirm "${bs.name}" wirklich löschen?`)) return;
    try {
      await apiClient.delete(`/monitor/bildschirme/${id}`);
      await fetchBildschirme();
      if (activeBildschirmId === id) setActiveBildschirmId(null);
      toast.success('Bildschirm gelöscht');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const handleSaveBildschirm = async (bs) => {
    const payload = {
      name: bs.name,
      slug: bs.slug,
      default_profil_id: bs.default_profil_id ?? null,
      zeitplan: bs.zeitplan || [],
      power_zeitplan: bs.power_zeitplan || [],
      ferien_modus: !!bs.ferien_modus,
      power_ausnahmen: bs.power_ausnahmen || [],
      power_modus: bs.power_modus || 'auto',
    };
    try {
      await apiClient.put(`/monitor/bildschirme/${bs.id}`, payload);
      await fetchBildschirme();
      toast.success('Bildschirm gespeichert');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler beim Speichern');
    }
  };

  const updateBildschirmLocal = (id, key, value) => {
    setBildschirme(prev => prev.map(b => b.id === id ? { ...b, [key]: value } : b));
  };


  // ═══ Klausur CRUD ═══
  const handleCreateKlausur = async (payload) => {
    try {
      await apiClient.post('/monitor/klausuren', payload);
      await fetchKlausuren();
      setShowNewKlausur(false);
      setKlausurTemplate(null);
      toast.success('Klausur erstellt');
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleUpdateKlausur = async (id, payload) => {
    try {
      await apiClient.put(`/monitor/klausuren/${id}`, payload);
      await fetchKlausuren();
    } catch { toast.error('Fehler beim Speichern'); }
  };

  const handleDeleteKlausur = async (id) => {
    if (!confirm('Klausur wirklich löschen?')) return;
    try {
      await apiClient.delete(`/monitor/klausuren/${id}`);
      await fetchKlausuren();
      toast.success('Klausur gelöscht');
    } catch { toast.error('Fehler beim Löschen'); }
  };

  const updateKlausurLocal = (id, patch) => {
    setKlausuren(prev => prev.map(k => k.id === id ? { ...k, ...patch } : k));
  };

  const handleToggleOnAir = async () => {
    if (!canOnAir) return;
    try {
      await apiClient.post('/monitor/onair', { on_air: !monitorConfig.ist_on_air });
      setMonitorConfig(prev => ({ ...prev, ist_on_air: !prev.ist_on_air }));
      setOriginalConfig(prev => ({ ...prev, ist_on_air: !prev.ist_on_air }));
      fetchProfiles();
      toast.success(monitorConfig.ist_on_air ? 'ON AIR deaktiviert' : 'ON AIR aktiviert');
    } catch { toast.error('Fehler beim Umschalten'); }
  };

  const handleToggleNotfall = async () => {
    if (!canNotfall) return;
    if (!monitorConfig.notfall_aktiv && !monitorConfig.notfall_text) {
      const text = prompt('Notfall-Text:');
      if (!text) return;
      updateConfig('notfall_text', text);
    }
    try {
      await apiClient.post('/monitor/notfall', {
        aktiv: !monitorConfig.notfall_aktiv,
        text: monitorConfig.notfall_text || 'ACHTUNG',
      });
      setMonitorConfig(prev => ({ ...prev, notfall_aktiv: !prev.notfall_aktiv }));
      setOriginalConfig(prev => ({ ...prev, notfall_aktiv: !prev.notfall_aktiv }));
      fetchProfiles();
      toast.success(monitorConfig.notfall_aktiv ? 'Notfall deaktiviert' : 'Notfall aktiviert');
    } catch { toast.error('Fehler'); }
  };

  const handleRegenerateToken = async () => {
    if (!confirm('Neues Token generieren? Das alte Token wird ungültig.')) return;
    try {
      const res = await apiClient.post(`/monitor/config/regenerate-token?profil_id=${activeProfileId}`);
      setMonitorConfig(prev => ({ ...prev, api_token: res.data.api_token }));
      setOriginalConfig(prev => ({ ...prev, api_token: res.data.api_token }));
      toast.success('Neues Token generiert');
    } catch { toast.error('Fehler'); }
  };

  const handleCreateAnkuendigung = async () => {
    if (!newAnkuendigung?.titel) return;
    try {
      await apiClient.post('/monitor/ankuendigungen', newAnkuendigung);
      setNewAnkuendigung(null);
      fetchConfigForProfile(activeProfileId);
      toast.success('Ankündigung erstellt');
    } catch { toast.error('Fehler'); }
  };

  const handleUpdateAnkuendigung = async () => {
    if (!editingAnkuendigung?.titel) return;
    try {
      await apiClient.put(`/monitor/ankuendigungen/${editingAnkuendigung.id}`, {
        titel: editingAnkuendigung.titel,
        text: editingAnkuendigung.text,
        prioritaet: editingAnkuendigung.prioritaet,
        ist_aktiv: editingAnkuendigung.ist_aktiv,
        aktiv_von: editingAnkuendigung.aktiv_von || null,
        aktiv_bis: editingAnkuendigung.aktiv_bis || null,
      });
      setEditingAnkuendigung(null);
      fetchConfigForProfile(activeProfileId);
      toast.success('Ankündigung aktualisiert');
    } catch { toast.error('Fehler beim Speichern'); }
  };

  const handleDeleteAnkuendigung = async (id) => {
    try {
      await apiClient.delete(`/monitor/ankuendigungen/${id}`);
      fetchConfigForProfile(activeProfileId);
    } catch { toast.error('Fehler'); }
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('datei', file);
      formData.append('name', file.name);
      formData.append('typ', uploadTyp);
      await apiClient.post('/monitor/dateien', formData);
      fetchConfigForProfile(activeProfileId);
      toast.success('Datei hochgeladen');
    } catch { toast.error('Upload fehlgeschlagen'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleDeleteDatei = async (id) => {
    try {
      await apiClient.delete(`/monitor/dateien/${id}`);
      fetchConfigForProfile(activeProfileId);
    } catch { toast.error('Fehler'); }
  };

  // Drag-&-Drop-Upload: Typ automatisch (PDF → pdf, sonst bild)
  const uploadDroppedFiles = async (files) => {
    if (!canEdit || !files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const typ = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'bild';
        const fd = new FormData();
        fd.append('datei', file); fd.append('name', file.name); fd.append('typ', typ);
        await apiClient.post('/monitor/dateien', fd);
      }
      fetchConfigForProfile(activeProfileId);
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
        delete imported.ist_on_air;
        delete imported.on_air_seit;
        delete imported.notfall_aktiv;
        delete imported.id;
        setMonitorConfig(prev => ({ ...prev, ...imported }));
        toast.success('Konfiguration importiert — Speichern nicht vergessen!');
      } catch { toast.error('Ungültige JSON-Datei'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateConfig = (key, value) => setMonitorConfig(prev => ({ ...prev, [key]: value }));

  const applyTheme = (preset) => {
    const themes = {
      veranstaltung: { hintergrund_farbe: '#0f172a', akzent_farbe: '#da1f3d' },
      schulbetrieb: { hintergrund_farbe: '#0f172a', akzent_farbe: '#3b82f6' },
      nacht: { hintergrund_farbe: '#000000', akzent_farbe: '#6b7280' },
    };
    const t = themes[preset];
    if (t) {
      setMonitorConfig(prev => ({ ...prev, ...t, theme_preset: preset }));
    } else {
      updateConfig('theme_preset', 'custom');
    }
  };

  // ═══ Zeitplan Helpers ═══
  const addZeitplanEntry = () => {
    const zeitplan = monitorConfig.zeitplan || [];
    updateConfig('zeitplan', [...zeitplan, { tage: [0, 1, 2, 3, 4], von: '08:00', bis: '16:00' }]);
  };

  const updateZeitplanEntry = (idx, field, value) => {
    const zeitplan = [...(monitorConfig.zeitplan || [])];
    zeitplan[idx] = { ...zeitplan[idx], [field]: value };
    updateConfig('zeitplan', zeitplan);
  };

  const toggleZeitplanTag = (idx, tag) => {
    const zeitplan = [...(monitorConfig.zeitplan || [])];
    const tage = zeitplan[idx].tage || [];
    zeitplan[idx] = {
      ...zeitplan[idx],
      tage: tage.includes(tag) ? tage.filter(t => t !== tag) : [...tage, tag].sort(),
    };
    updateConfig('zeitplan', zeitplan);
  };

  const removeZeitplanEntry = (idx) => {
    const zeitplan = [...(monitorConfig.zeitplan || [])];
    zeitplan.splice(idx, 1);
    updateConfig('zeitplan', zeitplan);
  };

  const logos = monitorDateien.filter(d => d.typ === 'logo');
  const bilder = monitorDateien.filter(d => d.typ === 'bild');
  const pdfs = monitorDateien.filter(d => d.typ === 'pdf');
  const hintergruende = monitorDateien.filter(d => d.typ === 'hintergrund');

  // Active widget count
  const widgetKeys = [
    'zeige_uhr', 'zeige_veranstaltungen', 'zeige_ankuendigungen', 'zeige_onair',
    'zeige_countdown', 'zeige_ticker', 'zeige_wetter', 'zeige_webuntis', 'zeige_slideshow',
    'zeige_pdf', 'zeige_logo', 'zeige_hintergrundbild', 'zeige_qr_code', 'zeige_freitext',
    'zeige_raumplan', 'zeige_eigener_countdown', 'zeige_bildschirmschoner', 'zeige_seitenrotation',
  ];
  const activeWidgets = monitorConfig ? widgetKeys.filter(k => monitorConfig[k]).length : 0;

  // Ankündigung form
  const renderAnkuendigungForm = (data, setData, onSave, onCancel, saveLabel) => (
    <div className="p-4 border border-gray-700 rounded-xl bg-gray-800/30 space-y-3">
      <input type="text" value={data.titel} onChange={e => setData({ ...data, titel: e.target.value })}
        placeholder="Titel *" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
      <textarea value={data.text} onChange={e => setData({ ...data, text: e.target.value })}
        placeholder="Text (optional)" rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none" />
      <div className="flex items-center gap-3 flex-wrap">
        <select value={data.prioritaet} onChange={e => setData({ ...data, prioritaet: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
          <option value="normal">Normal</option>
          <option value="wichtig">Wichtig</option>
          <option value="dringend">Dringend</option>
        </select>
        <button type="button" onClick={() => setData({ ...data, ist_aktiv: !data.ist_aktiv })}
          className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
            data.ist_aktiv ? 'bg-green-600/20 border-green-500/40 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}>
          {data.ist_aktiv ? 'Aktiv' : 'Inaktiv'}
        </button>
        <div className="flex-1" />
        <button onClick={onCancel} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
        <button onClick={onSave} disabled={!data.titel}
          className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg">{saveLabel}</button>
      </div>
    </div>
  );

  const UploadButton = ({ typ, label }) => (
    <button onClick={() => { setUploadTyp(typ); setTimeout(() => fileInputRef.current?.click(), 50); }}
      disabled={uploading || !canEdit}
      className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-lg">
      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {label}
    </button>
  );

  // Widget definition with categories
  const widgetDefs = [
    { key: 'zeige_uhr', label: 'Uhrzeit & Datum', icon: Clock, cat: 'display' },
    { key: 'zeige_logo', label: 'Logo', icon: Image, cat: 'display' },
    { key: 'zeige_hintergrundbild', label: 'Hintergrundbild', icon: ImageIcon, cat: 'display' },
    { key: 'zeige_onair', label: 'ON AIR Indikator', icon: Radio, cat: 'display' },
    { key: 'zeige_veranstaltungen', label: 'Veranstaltungen', icon: Calendar, cat: 'inhalt' },
    { key: 'zeige_ankuendigungen', label: 'Ankündigungen', icon: Megaphone, cat: 'inhalt' },
    { key: 'zeige_countdown', label: 'Event-Countdown', icon: Clock, cat: 'inhalt' },
    { key: 'zeige_eigener_countdown', label: 'Eigener Countdown', icon: Timer, cat: 'inhalt' },
    { key: 'zeige_freitext', label: 'Freier Text', icon: AlignLeft, cat: 'inhalt' },
    { key: 'zeige_raumplan', label: 'Raumplan', icon: LayoutGrid, cat: 'inhalt' },
    { key: 'zeige_wetter', label: 'Wetter', icon: CloudSun, cat: 'extern' },
    { key: 'zeige_webuntis', label: 'WebUntis', icon: Calendar, cat: 'extern' },
    { key: 'zeige_qr_code', label: 'QR-Code', icon: QrCode, cat: 'extern' },
    { key: 'zeige_kamera', label: 'Kamera-Stream', icon: Activity, cat: 'extern' },
    { key: 'zeige_ticker', label: 'Lauftext / Ticker', icon: Type, cat: 'erweitert' },
    { key: 'zeige_slideshow', label: 'Slideshow', icon: Image, cat: 'erweitert' },
    { key: 'zeige_pdf', label: 'PDF-Anzeige', icon: FileText, cat: 'erweitert' },
    { key: 'zeige_bildschirmschoner', label: 'Bildschirmschoner', icon: MonitorOff, cat: 'erweitert' },
    { key: 'zeige_seitenrotation', label: 'Seitenrotation', icon: RotateCw, cat: 'erweitert' },
  ];

  const catLabels = { display: 'Anzeige', inhalt: 'Inhalte', extern: 'Externe Daten', erweitert: 'Erweitert' };
  const cats = ['display', 'inhalt', 'extern', 'erweitert'];

  const importRef = useRef(null);
  const activeProfile = profiles.find(p => p.id === activeProfileId);

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
    const inp = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50';
    switch (key) {
      case 'zeige_ticker': return settingsCard(<Type className="w-4 h-4 text-blue-400" />, 'Ticker', <>
        <input type="text" value={c.ticker_text} onChange={e => updateConfig('ticker_text', e.target.value)} disabled={!canEdit} placeholder="Text der durchläuft..." className={inp} />
        <div><label className="block text-xs text-gray-500 mb-1">Geschwindigkeit: {c.ticker_geschwindigkeit} px/s</label>
          <input type="range" min={10} max={200} value={c.ticker_geschwindigkeit} onChange={e => updateConfig('ticker_geschwindigkeit', parseInt(e.target.value))} disabled={!canEdit} className="w-full accent-blue-500" /></div>
      </>);
      case 'zeige_wetter': return settingsCard(<CloudSun className="w-4 h-4 text-yellow-400" />, 'Wetter', <>
        <div><label className="block text-xs text-gray-500 mb-1">Stadt</label>
          <input type="text" value={c.wetter_stadt} onChange={e => updateConfig('wetter_stadt', e.target.value)} disabled={!canEdit} placeholder="z.B. Lübeck" className={inp} /></div>
        <p className="text-[11px] text-gray-500">API-Key wird einmal global unter „Einstellungen → Globale Zugänge" hinterlegt.</p>
      </>);
      case 'zeige_webuntis': return settingsCard(<Calendar className="w-4 h-4 text-purple-400" />, 'WebUntis iFrame', <>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Gespeicherter Link (2 Tage)</label>
            <select value={c.webuntis_link_id || ''} disabled={!canEdit} onChange={e => updateConfig('webuntis_link_id', e.target.value ? parseInt(e.target.value) : null)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm disabled:opacity-50">
              <option value="">— eigener Link unten —</option>{webuntisLinks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Gespeicherter Link (1 Tag)</label>
            <select value={c.webuntis_link_1tag_id || ''} disabled={!canEdit} onChange={e => updateConfig('webuntis_link_1tag_id', e.target.value ? parseInt(e.target.value) : null)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm disabled:opacity-50">
              <option value="">— eigener Link unten —</option>{webuntisLinks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        </div>
        <p className="text-[11px] text-gray-500">Gespeicherte Links (Bibliothek unter „Inhalte") haben Vorrang. Sonst eigene Links:</p>
        <div><label className="block text-xs text-gray-500 mb-1">Eigener Link (2 Tage)</label>
          <input type="url" value={c.webuntis_url} onChange={e => updateConfig('webuntis_url', e.target.value)} disabled={!canEdit} placeholder="https://neilo.webuntis.com/..." className={inp} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Eigener Link (1 Tag, kompakt)</label>
          <input type="url" value={c.webuntis_url_1tag || ''} onChange={e => updateConfig('webuntis_url_1tag', e.target.value)} disabled={!canEdit} placeholder="leer = 2-Tage-Link" className={inp} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Zoom: {c.webuntis_zoom}%</label>
            <input type="range" min={50} max={150} value={c.webuntis_zoom} onChange={e => updateConfig('webuntis_zoom', parseInt(e.target.value))} disabled={!canEdit} className="w-full accent-purple-500" /></div>
          <div className="flex items-end">
            <button onClick={() => canEdit && updateConfig('webuntis_dark_mode', !c.webuntis_dark_mode)} disabled={!canEdit}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${c.webuntis_dark_mode ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}><Moon className="w-4 h-4 inline mr-1" /> Dark-Mode</button></div>
        </div>
      </>);
      case 'zeige_qr_code': return settingsCard(<QrCode className="w-4 h-4 text-emerald-400" />, 'QR-Code', <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">URL</label>
          <input type="url" value={c.qr_code_url} onChange={e => updateConfig('qr_code_url', e.target.value)} disabled={!canEdit} placeholder="https://..." className={inp} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Beschriftung</label>
          <input type="text" value={c.qr_code_label} onChange={e => updateConfig('qr_code_label', e.target.value)} disabled={!canEdit} placeholder="z.B. Event-Anmeldung" className={inp} /></div>
      </div>);
      case 'zeige_kamera': return settingsCard(<Activity className="w-4 h-4 text-cyan-400" />, 'Kamera-Stream', <>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Titel</label>
            <input type="text" value={c.kamera_titel || ''} onChange={e => updateConfig('kamera_titel', e.target.value)} disabled={!canEdit} placeholder="z.B. Saal" className={inp} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Typ</label>
            <select value={c.kamera_typ || 'img'} onChange={e => updateConfig('kamera_typ', e.target.value)} disabled={!canEdit} className={inp}>
              <option value="img">MJPEG / Bild-Stream</option><option value="video">HLS / MP4</option><option value="iframe">iframe / Embed</option></select></div>
        </div>
        <div><label className="block text-xs text-gray-500 mb-1">Stream-URL</label>
          <input type="url" value={c.kamera_url || ''} onChange={e => updateConfig('kamera_url', e.target.value)} disabled={!canEdit} placeholder="http://kamera.lan/stream.mjpg" className={inp} /></div>
      </>);
      case 'zeige_freitext': return settingsCard(<AlignLeft className="w-4 h-4 text-teal-400" />, 'Freier Textblock', <>
        <input type="text" value={c.freitext_titel} onChange={e => updateConfig('freitext_titel', e.target.value)} disabled={!canEdit} placeholder="Titel" className={inp} />
        <textarea value={c.freitext_inhalt} onChange={e => updateConfig('freitext_inhalt', e.target.value)} disabled={!canEdit} placeholder="Inhalt..." rows={3} className={`${inp} resize-none`} />
      </>);
      case 'zeige_raumplan': return settingsCard(<LayoutGrid className="w-4 h-4 text-indigo-400" />, 'Raumplan (WebUntis API)', <>
        <div><label className="block text-xs text-gray-500 mb-1">Raum-Kürzel (pro Ansicht)</label>
          <input type="text" value={c.raumplan_raum} onChange={e => updateConfig('raumplan_raum', e.target.value)} disabled={!canEdit} placeholder="z.B. Aul" className={inp} /></div>
        <p className="text-[11px] text-gray-500">Server, Schule und Login werden einmal global unter „Einstellungen → Globale Zugänge" hinterlegt.</p>
      </>);
      case 'zeige_eigener_countdown': return settingsCard(<Timer className="w-4 h-4 text-amber-400" />, 'Eigener Countdown', <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">Event-Name</label>
          <input type="text" value={c.eigener_countdown_name} onChange={e => updateConfig('eigener_countdown_name', e.target.value)} disabled={!canEdit} placeholder="z.B. Schulkonzert" className={inp} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Datum &amp; Uhrzeit</label>
          <input type="datetime-local" value={c.eigener_countdown_datum ? c.eigener_countdown_datum.slice(0, 16) : ''} onChange={e => updateConfig('eigener_countdown_datum', e.target.value ? e.target.value + ':00Z' : null)} disabled={!canEdit} className={inp} /></div>
      </div>);
      case 'zeige_bildschirmschoner': return settingsCard(<MonitorOff className="w-4 h-4 text-cyan-400" />, 'Bildschirmschoner',
        <div><label className="block text-xs text-gray-500 mb-1">Timeout: {c.bildschirmschoner_timeout} Minuten</label>
          <input type="range" min={1} max={60} value={c.bildschirmschoner_timeout} onChange={e => updateConfig('bildschirmschoner_timeout', parseInt(e.target.value))} disabled={!canEdit} className="w-full accent-cyan-500" /></div>);
      case 'zeige_seitenrotation': return settingsCard(<RotateCw className="w-4 h-4 text-pink-400" />, 'Seitenrotation', <>
        <div><label className="block text-xs text-gray-500 mb-1">Intervall: {c.seitenrotation_intervall} Sekunden</label>
          <input type="range" min={5} max={120} value={c.seitenrotation_intervall} onChange={e => updateConfig('seitenrotation_intervall', parseInt(e.target.value))} disabled={!canEdit} className="w-full accent-pink-500" /></div>
        <div><label className="block text-xs text-gray-500 mb-2">Seiten zum Rotieren</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[{ id: 'main', label: 'Hauptansicht' }, { id: 'veranstaltungen', label: 'Veranstaltungen' }, { id: 'ankuendigungen', label: 'Ankündigungen' }, { id: 'raumplan', label: 'Raumplan' }, { id: 'wetter', label: 'Wetter' }, { id: 'slideshow', label: 'Slideshow' }, { id: 'pdf', label: 'PDF' }, { id: 'freitext', label: 'Freier Text' }].map(page => {
              const selected = (c.seitenrotation_seiten || []).includes(page.id);
              return (<button key={page.id} onClick={() => { if (!canEdit) return; const s = c.seitenrotation_seiten || []; updateConfig('seitenrotation_seiten', selected ? s.filter(x => x !== page.id) : [...s, page.id]); }} disabled={!canEdit}
                className={`p-2 rounded-lg text-xs border transition-colors disabled:opacity-50 ${selected ? 'bg-pink-600/20 border-pink-500/40 text-pink-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>{page.label}</button>);
            })}
          </div></div>
      </>);
      default: return null;
    }
  };

  const areaNav = [
    { id: 'uebersicht', label: 'Übersicht', icon: Activity },
    { id: 'ansichten', label: 'Ansichten', icon: LayoutGrid },
    { id: 'bildschirme', label: 'Bildschirme', icon: Monitor },
    { id: 'inhalte', label: 'Inhalte', icon: Megaphone },
    { id: 'events', label: 'Events', icon: Radio },
    { id: 'einstellungen', label: 'Einstellungen', icon: Settings },
  ];

  return (
    <AreaContext.Provider value={activeArea}>
    <div className="max-w-[1800px] mx-auto flex gap-5">
      {/* ═══ Seitenleiste (Desktop) ═══ */}
      <aside className="hidden md:flex flex-col gap-1 w-52 shrink-0 sticky top-4 self-start">
        <div className="flex items-center gap-2 px-2 py-3 mb-1">
          <div className="w-9 h-9 bg-purple-600/20 rounded-xl flex items-center justify-center">
            <Monitor className="w-5 h-5 text-purple-400" />
          </div>
          <span className="text-sm font-bold text-white">Monitor</span>
        </div>
        {areaNav.map(a => {
          const Ico = a.icon;
          const active = activeArea === a.id;
          return (
            <button key={a.id} onClick={() => setActiveArea(a.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
              }`}>
              <Ico className="w-4 h-4 shrink-0" /> {a.label}
              {a.id === 'events' && events.some(e => e.aktiv) && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse" />}
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
            <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
              <Monitor className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 md:hidden">Monitor</p>
              <h1 className="text-lg font-bold text-white capitalize">{areaNav.find(a => a.id === activeArea)?.label}</h1>
              {activeArea === 'ansichten' && hasChanges ? (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Ungespeicherte Änderungen
                </p>
              ) : activeArea === 'ansichten' && savedAt && Date.now() - savedAt < 4000 ? (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Gespeichert
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Speichern nur im Bereich „Ansichten" (speichert die Profil-Konfiguration) */}
            {activeArea === 'ansichten' && canEdit && (
              <button onClick={handleSaveMonitorConfig} disabled={monitorSaving || !monitorConfig || !hasChanges}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                  hasChanges
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20'
                    : 'bg-gray-800 text-gray-500'
                } disabled:opacity-50`}>
                {monitorSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Speichern
                {hasChanges && <kbd className="hidden md:inline text-[10px] bg-green-700/50 px-1.5 py-0.5 rounded">Ctrl+S</kbd>}
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
                  active ? 'bg-purple-600 text-white' : 'bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-800'
                }`}>
                <Ico className="w-4 h-4" /> {a.label}
                {a.id === 'events' && events.some(e => e.aktiv) && <span className="w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Inhaltsbereich (mit fester Vorschau-Spalte in „Ansichten") ═══ */}
      <div className={activeArea === 'ansichten' && showPreview ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5 lg:items-start' : ''}>
      <div className="space-y-4 min-w-0">

      {/* ═══ Bildschirme ═══ */}
      <Section id="bildschirme" area="bildschirme" plain title="Bildschirme" description="Physische Monitore mit eigenen Zeitplänen und Power-Steuerung"
        icon={Monitor} iconColor="bg-indigo-600/30" open={openSections.bildschirme} onToggle={toggleSection}
        badge={bildschirme.length || null}>

        {/* Bildschirm-Liste */}
        <div className="flex flex-wrap gap-2 mb-3">
          {bildschirme.map(bs => (
            <button key={bs.id} onClick={() => setActiveBildschirmId(activeBildschirmId === bs.id ? null : bs.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                bs.id === activeBildschirmId
                  ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
                  : 'bg-gray-800/60 border border-gray-700/60 text-gray-400 hover:text-white hover:border-gray-600'
              }`}>
              <Monitor className="w-3.5 h-3.5" />
              {bs.name}
              {(bs.zeitplan || []).length > 0 && <CalendarClock className="w-3 h-3 text-green-400" />}
            </button>
          ))}
          {canEdit && (
            <button onClick={() => setShowNewBildschirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 border border-dashed border-gray-700 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Neuer Bildschirm
            </button>
          )}
        </div>

        {/* Neuer Bildschirm Dialog */}
        {showNewBildschirm && (
          <div className="p-4 border border-gray-700 rounded-xl bg-gray-800/30 space-y-3 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input type="text" value={newBildschirmName} onChange={e => setNewBildschirmName(e.target.value)}
                placeholder="z.B. Eingang, Lehrerzimmer" autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                onKeyDown={e => e.key === 'Enter' && handleCreateBildschirm()} />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => { setShowNewBildschirm(false); setNewBildschirmName(''); }}
                className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
              <button onClick={handleCreateBildschirm} disabled={!newBildschirmName.trim()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-lg">Erstellen</button>
            </div>
          </div>
        )}

        {/* Aktiver Bildschirm — Detail */}
        {activeBildschirmId && (() => {
          const bs = bildschirme.find(b => b.id === activeBildschirmId);
          if (!bs) return null;
          const bsZeitplan = bs.zeitplan || [];
          return (
            <div className="p-4 border border-indigo-500/20 rounded-xl bg-gray-800/20 space-y-4">
              {/* Name & Slug */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input type="text" value={bs.name} disabled={!canEdit}
                    onChange={e => updateBildschirmLocal(bs.id, 'name', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Slug</label>
                  <input type="text" value={bs.slug} disabled={!canEdit}
                    onChange={e => updateBildschirmLocal(bs.id, 'slug', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
                </div>
              </div>

              {/* Default-Profil */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Standard-Ansicht (Fallback)</label>
                <select value={bs.default_profil_id || ''} disabled={!canEdit}
                  onChange={e => updateBildschirmLocal(bs.id, 'default_profil_id', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50">
                  <option value="">Globaler Standard</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">Wird angezeigt wenn kein Zeitplan-Eintrag greift</p>
              </div>

              {/* Monitor-URL */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Monitor-URL</label>
                <div className="flex gap-2">
                  <input type="text" readOnly
                    value={`${window.location.origin}/monitor?bildschirm=${bs.slug}`}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono" />
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/monitor?bildschirm=${bs.slug}`); toast.success('URL kopiert'); }}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-lg">
                    <Copy className="w-4 h-4" />
                  </button>
                  <a href={`/monitor?bildschirm=${bs.slug}`} target="_blank" rel="noopener noreferrer"
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
                    <button onClick={() => {
                      const updated = [...bsZeitplan, { profil_id: profiles[0]?.id || null, tage: [0,1,2,3,4], von: '08:00', bis: '16:00' }];
                      updateBildschirmLocal(bs.id, 'zeitplan', updated);
                    }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 text-sm rounded-lg">
                      <Plus className="w-3.5 h-3.5" /> Zeitfenster
                    </button>
                  )}
                </div>

                {bsZeitplan.length === 0 ? (
                  <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700/40 text-center">
                    <p className="text-gray-500 text-sm">Kein Zeitplan — es wird immer die Standard-Ansicht angezeigt.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bsZeitplan.map((entry, idx) => (
                      <div key={idx} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/40">
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Profil-Auswahl */}
                          <select value={entry.profil_id || ''} disabled={!canEdit}
                            onChange={e => {
                              const updated = [...bsZeitplan];
                              updated[idx] = { ...entry, profil_id: parseInt(e.target.value) };
                              updateBildschirmLocal(bs.id, 'zeitplan', updated);
                            }}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50 min-w-[140px]">
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {/* Wochentage */}
                          <div className="flex gap-1">
                            {WOCHENTAGE.map((tag, tagIdx) => (
                              <button key={tagIdx} disabled={!canEdit}
                                onClick={() => {
                                  const tage = entry.tage || [];
                                  const updated = [...bsZeitplan];
                                  updated[idx] = { ...entry, tage: tage.includes(tagIdx) ? tage.filter(t => t !== tagIdx) : [...tage, tagIdx] };
                                  updateBildschirmLocal(bs.id, 'zeitplan', updated);
                                }}
                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                                  (entry.tage || []).includes(tagIdx)
                                    ? 'bg-green-600/30 border border-green-500/40 text-green-300'
                                    : 'bg-gray-800 border border-gray-700 text-gray-500'
                                }`}>
                                {tag}
                              </button>
                            ))}
                          </div>
                          {/* Zeiten */}
                          <div className="flex items-center gap-2">
                            <input type="time" value={entry.von || '08:00'} disabled={!canEdit}
                              onChange={e => {
                                const updated = [...bsZeitplan];
                                updated[idx] = { ...entry, von: e.target.value };
                                updateBildschirmLocal(bs.id, 'zeitplan', updated);
                              }}
                              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50" />
                            <span className="text-gray-500">—</span>
                            <input type="time" value={entry.bis || '16:00'} disabled={!canEdit}
                              onChange={e => {
                                const updated = [...bsZeitplan];
                                updated[idx] = { ...entry, bis: e.target.value };
                                updateBildschirmLocal(bs.id, 'zeitplan', updated);
                              }}
                              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50" />
                          </div>
                          {canEdit && (
                            <button onClick={() => {
                              const updated = bsZeitplan.filter((_, i) => i !== idx);
                              updateBildschirmLocal(bs.id, 'zeitplan', updated);
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

                <PowerZeitplanEditor bs={bs} canEdit={canEdit}
                  update={(key, value) => updateBildschirmLocal(bs.id, key, value)} />

                {/* CEC-Status vom Pi */}
                {bs.cec_status && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      bs.cec_status === 'on' ? 'bg-green-900/40 text-green-400 border border-green-700/40' :
                      bs.cec_status === 'standby' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40' :
                      'bg-gray-800 text-gray-400 border border-gray-700/40'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        bs.cec_status === 'on' ? 'bg-green-400' :
                        bs.cec_status === 'standby' ? 'bg-yellow-400' : 'bg-gray-500'
                      }`} />
                      TV: {bs.cec_status === 'on' ? 'An' : bs.cec_status === 'standby' ? 'Standby' : bs.cec_status}
                    </span>
                    {bs.cec_status_zeit && (
                      <span className="text-[10px] text-gray-500">
                        Zuletzt: {new Date(bs.cec_status_zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/40">
                  <p className="text-[10px] text-gray-400 font-medium mb-1">API-Endpoint für den Raspberry Pi:</p>
                  <div className="flex gap-2 items-center">
                    <code className="text-[10px] text-indigo-300 bg-gray-800 px-2 py-1 rounded font-mono flex-1 truncate">
                      GET /api/monitor/bildschirm/power?slug={bs.slug}
                    </code>
                    <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/monitor/bildschirm/power?slug=${bs.slug}`); toast.success('URL kopiert'); }}
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
                  <button onClick={() => handleDeleteBildschirm(bs.id)}
                    className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg text-sm">
                    <Trash2 className="w-3.5 h-3.5" /> Bildschirm löschen
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => handleSaveBildschirm(bs)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg">
                    <Save className="w-3.5 h-3.5" /> Speichern
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {bildschirme.length === 0 && !showNewBildschirm && (
          <div className="p-6 text-center text-gray-500">
            <Monitor className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Noch keine Bildschirme konfiguriert</p>
            <p className="text-xs mt-1">Erstelle Bildschirme um verschiedene Monitore mit eigenen Zeitplänen zu steuern</p>
          </div>
        )}
      </Section>

      {/* ═══ Klausuren — pro Bildschirm (Bereich: Inhalte) ═══ */}
      {activeArea === 'inhalte' && (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-600/30">
              <AlignLeft className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Klausuren</h3>
              <p className="text-xs text-gray-500">Zeitfenster mit Hinweisbildschirm für ausgewählte Bildschirme</p>
            </div>
            {klausuren.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded-full">{klausuren.length}</span>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {klausuren.length > 0 && (
                <button onClick={() => {
                  const last = [...klausuren].sort((a, b) => new Date(b.aktiv_von) - new Date(a.aktiv_von))[0];
                  const now = new Date();
                  const dauer = (new Date(last.aktiv_bis) - new Date(last.aktiv_von)) || 90 * 60000;
                  setKlausurTemplate({
                    titel: last.titel, text: last.text || '', farbe: last.farbe || '#1e40af',
                    aktiv_von: now.toISOString(), aktiv_bis: new Date(now.getTime() + dauer).toISOString(),
                    bildschirm_ids: last.bildschirm_ids || [], anzeige_modus: last.anzeige_modus || 'vollbild',
                    webuntis_link_id: last.webuntis_link_id || null,
                    split_seite: last.split_seite || 'rechts', split_prozent: last.split_prozent || 50,
                  });
                  setShowNewKlausur(true);
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/60 hover:bg-gray-700 border border-gray-600/60 text-gray-200 text-sm rounded-lg" title="Übernimmt Titel, Text, Farbe, Dauer und Bildschirme der letzten Klausur">
                  <Copy className="w-3.5 h-3.5" /> Aus letzter
                </button>
              )}
              <button onClick={() => { setKlausurTemplate(null); setShowNewKlausur(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-sm rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Neue Klausur
              </button>
            </div>
          )}
        </div>

        {/* Eigene Vorlagen — anklicken füllt das Formular vor */}
        {canEdit && !showNewKlausur && (
          <KlausurVorlagenBar
            vorlagen={klausurVorlagen} webuntisLinks={webuntisLinks}
            onApply={(v) => {
              const now = new Date();
              const bis = new Date(now.getTime() + (v.dauer_minuten || 90) * 60000);
              setKlausurTemplate({
                titel: v.titel || 'Klausur', text: v.text || '', farbe: v.farbe || '#1e40af',
                aktiv_von: now.toISOString(), aktiv_bis: bis.toISOString(),
                bildschirm_ids: [], anzeige_modus: v.anzeige_modus || 'vollbild',
                webuntis_link_id: v.webuntis_link_id || null,
                split_seite: v.split_seite || 'rechts', split_prozent: v.split_prozent || 50,
              });
              setShowNewKlausur(true);
            }}
            onSave={saveKlausurVorlage} onDelete={deleteKlausurVorlage} />
        )}

        {showNewKlausur && (
          <KlausurForm
            initial={klausurTemplate}
            bildschirme={bildschirme}
            webuntisLinks={webuntisLinks}
            onSave={handleCreateKlausur}
            onCancel={() => { setShowNewKlausur(false); setKlausurTemplate(null); }}
          />
        )}

        {klausuren.length === 0 && !showNewKlausur ? (
          <div className="text-center text-gray-500 py-4">
            <p className="text-sm">Keine Klausuren geplant</p>
          </div>
        ) : (
          <div className="space-y-2">
            {klausuren.map(k => (
              <KlausurCard
                key={k.id} klausur={k} bildschirme={bildschirme}
                webuntisLinks={webuntisLinks}
                canEdit={canEdit}
                onLocalChange={(patch) => updateKlausurLocal(k.id, patch)}
                onSave={(payload) => handleUpdateKlausur(k.id, payload)}
                onDelete={() => handleDeleteKlausur(k.id)}
              />
            ))}
          </div>
        )}
      </div>
      )}


      {!monitorConfig ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        </div>
      ) : (
        <>
          {activeArea === 'ansichten' && (
          <>
          {/* ═══ Ansichten-Tabs ═══ */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Ansichten</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowPreview(!showPreview)}
                  className={`p-1.5 rounded-lg transition-colors ${showPreview ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  title="Live-Vorschau ein/aus">
                  <Eye className="w-4 h-4" />
                </button>
                <a href={`/monitor${monitorConfig?.slug ? `?profil=${monitorConfig.slug}` : ''}`} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg" title="In neuem Tab öffnen">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {profiles.map(p => (
                renamingId === p.id ? (
                  <input key={p.id} autoFocus value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') setRenamingId(null); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 border border-purple-500/60 text-white w-40" />
                ) : (
                  <button key={p.id} onClick={() => switchProfile(p.id)} onDoubleClick={() => startRename(p)}
                    title={canEdit ? 'Doppelklick zum Umbenennen' : undefined}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                      p.id === activeProfileId
                        ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300'
                        : 'bg-gray-800/60 border border-gray-700/60 text-gray-400 hover:text-white hover:border-gray-600'
                    }`}>
                    {p.layout_modus === 'stundenplan' ? <LayoutGrid className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                    {p.name}
                    {p.ist_standard && <span className="px-1.5 py-0.5 text-[9px] bg-blue-600/20 text-blue-400 rounded-full">Standard</span>}
                    {p.ist_on_air && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                    {p.zeitplan?.length > 0 && <CalendarClock className="w-3 h-3 text-green-400" />}
                  </button>
                )
              ))}
              {canEdit && (
                <button onClick={() => setShowNewProfile(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 border border-dashed border-gray-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Neue Ansicht
                </button>
              )}
            </div>

            {/* Profil-Aktionen (nur mit Bearbeiten-Recht) */}
            {canEdit && activeProfile && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-800/60">
                <span className="text-[11px] text-gray-500 mr-1">Aktive Ansicht:</span>
                <button onClick={handleDuplicateProfile} title="Duplizieren"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-800 text-gray-300 hover:bg-gray-700">
                  <Copy className="w-3.5 h-3.5" /> Duplizieren
                </button>
                <button onClick={() => moveProfile(-1)} title="Nach vorne" className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700">◀</button>
                <button onClick={() => moveProfile(1)} title="Nach hinten" className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700">▶</button>
                {!activeProfile.ist_standard && (
                  <button onClick={() => handleDeleteProfile(activeProfileId)} title="Löschen"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-800 text-gray-400 hover:text-red-400 hover:bg-gray-700 ml-auto">
                    <Trash2 className="w-3.5 h-3.5" /> Löschen
                  </button>
                )}
              </div>
            )}

            {/* New Profile Dialog */}
            {showNewProfile && (
              <div className="mt-3 p-4 border border-gray-700 rounded-xl bg-gray-800/30 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                    <input type="text" value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                      placeholder="z.B. Vertretungsplan" autoFocus
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Layout</label>
                    <select value={newProfileLayout} onChange={e => setNewProfileLayout(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
                      {LAYOUT_MODI.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Einstellungen kopieren von</label>
                  <select value={cloneFromId || ''} onChange={e => setCloneFromId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
                    <option value="">Leer starten</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => { setShowNewProfile(false); setNewProfileName(''); }}
                    className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
                  <button onClick={handleCreateProfile} disabled={!newProfileName.trim()}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-lg">Erstellen</button>
                </div>
              </div>
            )}
          </div>

          {/* ═══ Mini Preview (nur mobil — Desktop hat feste Vorschau-Spalte) ═══ */}
          {showPreview && (
            <div className="lg:hidden bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-800">
                <span className="text-xs text-gray-400 flex items-center gap-2">
                  <Activity className="w-3 h-3" /> Live-Vorschau — {activeProfile?.name}
                </span>
                <div className="flex items-center gap-2">
                  <a href={`/monitor?profil=${monitorConfig.slug}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white">
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
                  src={`/monitor?profil=${monitorConfig.slug}`}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Monitor Preview"
                  style={{ pointerEvents: 'none' }}
                />
              </div>
            </div>
          )}
          </>
          )}

          {activeArea === 'uebersicht' && (
          <>
          {/* Schnellaktionen */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { setKlausurTemplate(null); setShowNewKlausur(true); setActiveArea('inhalte'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-sm rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Klausur
              </button>
              <button onClick={() => setActiveArea('events')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-sm rounded-lg">
                <Radio className="w-3.5 h-3.5" /> Events
              </button>
              <button onClick={() => setActiveArea('inhalte')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/60 hover:bg-gray-700 border border-gray-600/60 text-gray-200 text-sm rounded-lg">
                <Megaphone className="w-3.5 h-3.5" /> Ankündigung
              </button>
            </div>
          )}
          {/* ═══ Bildschirm-Cockpit — was läuft gerade wo ═══ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Monitor className="w-4 h-4 text-indigo-400" /> Bildschirme ({bildschirme.length})</h3>
              <button onClick={() => setActiveArea('bildschirme')} className="text-xs text-gray-400 hover:text-white">verwalten →</button>
            </div>
            {bildschirme.length === 0 ? (
              <div className="p-8 text-center text-gray-500 border border-gray-800 rounded-xl">
                <Monitor className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Noch keine Bildschirme — unter „Bildschirme" anlegen.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {bildschirme.map(bs => {
                  const aktivesEvent = events.find(e => e.aktiv && (e.zuweisungen || []).some(z => z.bildschirm_id === bs.id));
                  return (
                    <div key={bs.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <div className="relative bg-black" style={{ paddingBottom: '56.25%' }}>
                        <iframe key={bs.slug} src={`/monitor?bildschirm=${bs.slug}`}
                          className="absolute inset-0 w-full h-full border-0" title={bs.name}
                          style={{ pointerEvents: 'none' }} loading="lazy" />
                        {aktivesEvent && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] rounded font-medium text-white" style={{ background: aktivesEvent.farbe }}>
                            {aktivesEvent.name}
                          </span>
                        )}
                        {bs.override_profil_id && (
                          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded font-medium bg-amber-500 text-black">
                            Override
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Monitor className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          <span className="text-sm text-white truncate">{bs.name}</span>
                          {(bs.zeitplan || []).length > 0 && <CalendarClock className="w-3 h-3 text-green-400 shrink-0" />}
                        </div>
                        <a href={`/monitor?bildschirm=${bs.slug}`} target="_blank" rel="noopener noreferrer"
                          className="text-gray-500 hover:text-white shrink-0" title="Groß öffnen"><Maximize2 className="w-3.5 h-3.5" /></a>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1.5 px-3 pb-2">
                          <select value={bs.override_profil_id || ''} onChange={e => setBildschirmOverride(bs, e.target.value ? parseInt(e.target.value) : null)}
                            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs">
                            <option value="">Jetzt umschalten auf …</option>
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {bs.override_profil_id && (
                            <button onClick={() => setBildschirmOverride(bs, null)}
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
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2"><Radio className="w-4 h-4 text-violet-400" /> Events</h3>
              <div className="flex flex-wrap gap-2">
                {events.map(ev => (
                  <button key={ev.id} onClick={() => canEdit && toggleEventActive(ev)} disabled={!canEdit}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                      ev.aktiv ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: ev.aktiv ? '#fff' : ev.farbe }} />
                    {ev.name}{ev.aktiv && ' · aktiv'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Quick Actions ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`rounded-xl p-4 border ${monitorConfig.ist_on_air ? 'bg-red-900/15 border-red-600/40' : 'bg-gray-900 border-gray-800'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Radio className={`w-6 h-6 ${monitorConfig.ist_on_air ? 'text-red-500 animate-pulse' : 'text-gray-600'}`} />
                  <div>
                    <h3 className="font-bold text-white text-sm">{monitorConfig.on_air_text || 'ON AIR'}</h3>
                    <p className="text-[11px] text-gray-500">{monitorConfig.ist_on_air ? 'Aktiv auf allen Monitoren' : 'Deaktiviert'}</p>
                  </div>
                </div>
                <button onClick={handleToggleOnAir} disabled={!canOnAir}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all disabled:opacity-50 ${
                    monitorConfig.ist_on_air
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}>
                  {monitorConfig.ist_on_air ? 'STOP' : 'GO LIVE'}
                </button>
              </div>
            </div>
            <div className={`rounded-xl p-4 border ${monitorConfig.notfall_aktiv ? 'bg-red-900/20 border-red-500/40' : 'bg-gray-900 border-gray-800'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`w-6 h-6 ${monitorConfig.notfall_aktiv ? 'text-red-400 animate-pulse' : 'text-gray-600'}`} />
                  <div>
                    <h3 className="font-bold text-white text-sm">Notfall-Meldung</h3>
                    <p className="text-[11px] text-gray-500">{monitorConfig.notfall_aktiv ? 'AKTIV — Alle Monitore' : 'Deaktiviert'}</p>
                  </div>
                </div>
                <button onClick={handleToggleNotfall} disabled={!canNotfall}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all disabled:opacity-50 ${
                    monitorConfig.notfall_aktiv
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}>
                  {monitorConfig.notfall_aktiv ? 'DEAKTIVIEREN' : 'AKTIVIEREN'}
                </button>
              </div>
              {canNotfall && (
                <input type="text" value={monitorConfig.notfall_text} onChange={e => updateConfig('notfall_text', e.target.value)}
                  placeholder="Notfall-Text..."
                  className="w-full mt-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500" />
              )}
            </div>
          </div>
          </>
          )}

          {/* ═══ Profil & Zeitplan ═══ */}
          <Section id="profil" area="ansichten" title="Ansicht & Zeitplan" description="Name, Layout-Modus und automatische Zeitsteuerung"
            icon={CalendarClock} iconColor="bg-green-600/30" open={openSections.profil} onToggle={toggleSection}
            badge={monitorConfig.zeitplan?.length || null}>

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
                <select value={monitorConfig.layout_modus} onChange={e => updateConfig('layout_modus', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50">
                  {LAYOUT_MODI.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </div>
            </div>

            {monitorConfig.layout_modus === 'baukasten' && (
              <div className="p-3 bg-cyan-900/10 border border-cyan-500/20 rounded-lg">
                <p className="text-xs text-cyan-300">
                  <LayoutGrid className="w-3.5 h-3.5 inline mr-1" />
                  Widget-Baukasten: Widgets per Drag &amp; Drop frei platzieren und skalieren. Der Editor erscheint unten als eigene Section.
                </p>
              </div>
            )}

            {monitorConfig.layout_modus === 'stundenplan' && (
              <div className="p-3 bg-purple-900/10 border border-purple-500/20 rounded-lg">
                <p className="text-xs text-purple-300">
                  <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                  Stundenplan-Vollbild: WebUntis-iFrame so groß wie möglich, mit optionalem Raumplan als Sidebar, Uhr und ON AIR.
                </p>
              </div>
            )}
            {monitorConfig.layout_modus === 'onair' && (
              <div className="p-3 bg-red-900/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-300">
                  <Radio className="w-3.5 h-3.5 inline mr-1" />
                  ON AIR Display: Zeigt nur den ON AIR Status zentriert auf schwarzem Hintergrund. Perfekt für einen dedizierten ON AIR Monitor.
                </p>
              </div>
            )}
            {monitorConfig.layout_modus === 'abfahrten' && (
              <div className="p-3 bg-blue-900/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-300">
                  <Activity className="w-3.5 h-3.5 inline mr-1" />
                  Abfahrtsmonitor: Zeigt Bus- und Bahnabfahrten in Echtzeit. Stationen und Filter unter &quot;ÖPNV Abfahrten&quot; konfigurieren.
                </p>
              </div>
            )}

            {monitorConfig.layout_modus === 'split' && (() => {
              const INHALTE = [
                { v: 'klausur', l: 'Klausur' },
                { v: 'onair', l: 'On Air' },
                { v: 'webuntis', l: 'WebUntis' },
                { v: 'uhr', l: 'Uhr' },
                { v: 'leer', l: 'Leer' },
              ];
              const links = monitorConfig.split_links || 'klausur';
              const rechts = monitorConfig.split_rechts || 'webuntis';
              const prozent = monitorConfig.split_links_prozent || 50;
              const hatWebuntis = links === 'webuntis' || rechts === 'webuntis';
              return (
                <div className="p-3 bg-teal-900/10 border border-teal-500/20 rounded-lg space-y-4">
                  <p className="text-xs text-teal-300">
                    <LayoutGrid className="w-3.5 h-3.5 inline mr-1" />
                    Splitscreen: zwei frei wählbare Inhalte nebeneinander.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Linke Seite</label>
                      <select value={links} onChange={e => updateConfig('split_links', e.target.value)} disabled={!canEdit}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                        {INHALTE.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Rechte Seite</label>
                      <select value={rechts} onChange={e => updateConfig('split_rechts', e.target.value)} disabled={!canEdit}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                        {INHALTE.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Aufteilung: {prozent}% / {100 - prozent}%
                    </label>
                    <input type="range" min={20} max={80} step={5} value={prozent}
                      onChange={e => updateConfig('split_links_prozent', parseInt(e.target.value))}
                      disabled={!canEdit} className="w-full accent-teal-500" />
                  </div>

                  {hatWebuntis && (
                    <div className="space-y-2 pt-2 border-t border-teal-500/10">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">WebUntis-Link (1 Tag, für Split)</label>
                        <input type="url" value={monitorConfig.webuntis_url_1tag || ''}
                          onChange={e => updateConfig('webuntis_url_1tag', e.target.value)} disabled={!canEdit}
                          placeholder="https://…webuntis.com/… (kompakte 1-Tages-Ansicht)"
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" />
                        <p className="text-[11px] text-gray-500 mt-1">
                          Leer = normaler WebUntis-Link (unter &quot;Widgets → WebUntis&quot;) wird genutzt.
                        </p>
                      </div>
                    </div>
                  )}

                  {(links === 'klausur' || rechts === 'klausur') && (
                    <p className="text-[11px] text-amber-400">
                      Klausur wird nur angezeigt, wenn der Monitor per Bildschirm (Slug) läuft und eine Klausur aktiv ist.
                    </p>
                  )}
                </div>
              );
            })()}

            {(monitorConfig.layout_modus === 'pdf_vollbild' || monitorConfig.layout_modus === 'bild_vollbild') && (
              <div className="p-3 bg-orange-900/10 border border-orange-500/20 rounded-lg space-y-4">
                <p className="text-xs text-orange-300">
                  <FileText className="w-3.5 h-3.5 inline mr-1" />
                  Vollbild-Layout: {monitorConfig.layout_modus === 'pdf_vollbild' ? 'PDF' : 'Bild'} füllt den ganzen Bildschirm.
                </p>

                <div className="flex items-center gap-3">
                  <Toggle checked={!!monitorConfig.vollbild_header} onChange={v => updateConfig('vollbild_header', v)} disabled={!canEdit} />
                  <div>
                    <p className="text-sm text-white">Header oben anzeigen</p>
                    <p className="text-[11px] text-gray-500">Titel + Logo aus dem Standard-Layout als Überschrift</p>
                  </div>
                </div>

                {monitorConfig.layout_modus === 'pdf_vollbild' && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-gray-400 font-medium">PDF-Datei</label>
                        {canEdit && <UploadButton typ="pdf" label="PDF hochladen" />}
                      </div>
                      {pdfs.length ? (
                        <div className="space-y-1.5">
                          {pdfs.map(pdf => (
                            <div key={pdf.id} onClick={() => canEdit && updateConfig('aktive_pdf_id', monitorConfig.aktive_pdf_id === pdf.id ? null : pdf.id)}
                              className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${monitorConfig.aktive_pdf_id === pdf.id ? 'border-orange-500 bg-orange-900/20 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-300'}`}>
                              <FileText className="w-4 h-4 text-orange-400" />{pdf.name}
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-gray-500 text-xs">Noch keine PDFs — oben hochladen.</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Seiten-Modus</label>
                        <select value={monitorConfig.pdf_modus || 'durchschalten'} onChange={e => updateConfig('pdf_modus', e.target.value)} disabled={!canEdit}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                          <option value="durchschalten">Automatisch durchschalten</option>
                          <option value="statisch">Feste Seite</option>
                          <option value="seiten">Nur bestimmte Seiten</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Seiten pro Ansicht</label>
                        <select value={monitorConfig.pdf_pro_ansicht || 1} onChange={e => updateConfig('pdf_pro_ansicht', parseInt(e.target.value))} disabled={!canEdit}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                          <option value={1}>1 Seite</option>
                          <option value={2}>2 Seiten nebeneinander</option>
                          <option value={3}>3 Seiten nebeneinander</option>
                        </select>
                      </div>
                    </div>

                    {monitorConfig.pdf_modus === 'durchschalten' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Intervall pro Seite: {monitorConfig.pdf_intervall || 10}s</label>
                        <input type="range" min={3} max={120} value={monitorConfig.pdf_intervall || 10}
                          onChange={e => updateConfig('pdf_intervall', parseInt(e.target.value))} disabled={!canEdit} className="w-full accent-orange-500" />
                      </div>
                    )}
                    {monitorConfig.pdf_modus === 'statisch' && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Feste Seite</label>
                        <input type="number" min={1} value={monitorConfig.pdf_statische_seite || 1}
                          onChange={e => updateConfig('pdf_statische_seite', parseInt(e.target.value) || 1)} disabled={!canEdit}
                          className="w-32 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" />
                      </div>
                    )}
                    {(monitorConfig.pdf_modus === 'seiten' || monitorConfig.pdf_modus === 'durchschalten') && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Seiten-Auswahl{monitorConfig.pdf_modus === 'durchschalten' ? ' (optional)' : ''}
                        </label>
                        <input type="text" placeholder="z.B. 1,3,5-7 — leer = alle" value={monitorConfig.pdf_seiten || ''}
                          onChange={e => updateConfig('pdf_seiten', e.target.value)} disabled={!canEdit}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" />
                      </div>
                    )}
                  </>
                )}

                {monitorConfig.layout_modus === 'bild_vollbild' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-gray-400 font-medium">Bild auswählen</label>
                      {canEdit && <UploadButton typ="bild" label="Bild hochladen" />}
                    </div>
                    {bilder.length ? (
                      <div className="grid grid-cols-4 gap-2">
                        {bilder.map(b => (
                          <div key={b.id} onClick={() => canEdit && updateConfig('aktives_bild_id', monitorConfig.aktives_bild_id === b.id ? null : b.id)}
                            className={`relative rounded-lg overflow-hidden border cursor-pointer ${monitorConfig.aktives_bild_id === b.id ? 'border-orange-500 ring-2 ring-orange-500/40' : 'border-gray-700'}`}>
                            <img src={`${MEDIA_BASE}${b.datei_url}`} alt={b.name} className="w-full h-20 object-cover" />
                            {monitorConfig.aktives_bild_id === b.id && <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] bg-orange-500 text-white rounded">Aktiv</span>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-xs">Noch keine Bilder — oben hochladen.</p>}
                    <div className="mt-3">
                      <label className="block text-xs text-gray-400 mb-1.5 font-medium">Skalierung</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { v: 'contain', l: 'Einpassen', desc: 'Ganzes Bild' },
                          { v: 'cover', l: 'Füllen', desc: 'Ausfüllen, ggf. beschnitten' },
                          { v: 'fill', l: 'Strecken', desc: 'Verzerrt' },
                        ].map(o => (
                          <button key={o.v} onClick={() => canEdit && updateConfig('bild_fit', o.v)} disabled={!canEdit}
                            className={`py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                              (monitorConfig.bild_fit || 'contain') === o.v
                                ? 'bg-orange-600/20 border-orange-500/40 text-orange-300'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-800/80'
                            }`}>
                            <div className="font-medium">{o.l}</div>
                            <div className="text-[10px] opacity-60">{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Toggle checked={monitorConfig.ist_standard} onChange={v => updateConfig('ist_standard', v)} disabled={!canEdit} />
              <div>
                <span className="text-sm text-white">Standard-Ansicht</span>
                <p className="text-xs text-gray-500">Wird angezeigt wenn keine andere Ansicht per Zeitplan aktiv ist</p>
              </div>
            </div>

            {/* Monitor-URL */}
            <div className="flex items-center gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-800">
              <Monitor className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Monitor-URL für diese Ansicht</p>
                <code className="text-blue-400 text-sm">{window.location.origin}/monitor?profil={monitorConfig.slug}</code>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/monitor?profil=${monitorConfig.slug}`); toast.success('URL kopiert'); }}
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
                  <button onClick={addZeitplanEntry}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 text-sm rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Zeitfenster
                  </button>
                )}
              </div>

              {(monitorConfig.zeitplan || []).length === 0 ? (
                <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700/40 text-center">
                  <p className="text-gray-500 text-sm">Kein Zeitplan — Ansicht wird nur per URL oder als Standard angezeigt.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(monitorConfig.zeitplan || []).map((entry, idx) => (
                    <div key={idx} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/40">
                      <div className="flex items-center gap-3">
                        {/* Wochentage */}
                        <div className="flex gap-1">
                          {WOCHENTAGE.map((tag, tagIdx) => (
                            <button key={tagIdx}
                              onClick={() => canEdit && toggleZeitplanTag(idx, tagIdx)}
                              disabled={!canEdit}
                              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                                (entry.tage || []).includes(tagIdx)
                                  ? 'bg-green-600/30 border border-green-500/40 text-green-300'
                                  : 'bg-gray-800 border border-gray-700 text-gray-500'
                              }`}>
                              {tag}
                            </button>
                          ))}
                        </div>
                        {/* Zeiten */}
                        <div className="flex items-center gap-2">
                          <input type="time" value={entry.von || '08:00'}
                            onChange={e => updateZeitplanEntry(idx, 'von', e.target.value)}
                            disabled={!canEdit}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50" />
                          <span className="text-gray-500">—</span>
                          <input type="time" value={entry.bis || '16:00'}
                            onChange={e => updateZeitplanEntry(idx, 'bis', e.target.value)}
                            disabled={!canEdit}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm disabled:opacity-50" />
                        </div>
                        {canEdit && (
                          <button onClick={() => removeZeitplanEntry(idx)}
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

            {/* Löschen erfolgt über die Toolbar oben (Aktive Ansicht → Löschen) */}
          </Section>

          {/* ═══ Baukasten-Editor (nur bei layout_modus='baukasten') ═══ */}
          {monitorConfig.layout_modus === 'baukasten' && (
            <Section id="baukasten" area="ansichten" title="Widget-Baukasten" description="Widgets per Drag &amp; Drop platzieren"
              icon={LayoutGrid} iconColor="bg-cyan-600/30" open={openSections.baukasten !== false} onToggle={toggleSection}
              badge={(monitorConfig.layout_widgets || []).length || null}>
              <BaukastenEditor
                widgets={monitorConfig.layout_widgets || []}
                cols={monitorConfig.baukasten_spalten || 24}
                rowHeight={monitorConfig.baukasten_zeilenhoehe || 40}
                onChange={(w) => updateConfig('layout_widgets', w)}
                onColsChange={(c) => updateConfig('baukasten_spalten', c)}
                onRowHeightChange={(r) => updateConfig('baukasten_zeilenhoehe', r)}
              />
            </Section>
          )}

          {/* ═══ Allgemein ═══ */}
          <Section id="allgemein" area="ansichten" title="Allgemein" description="Titel, Refresh und Import/Export"
            icon={Settings} iconColor="bg-gray-700" open={openSections.allgemein} onToggle={toggleSection}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Titel</label>
                <input type="text" value={monitorConfig.titel} onChange={e => updateConfig('titel', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Untertitel</label>
                <input type="text" value={monitorConfig.untertitel} onChange={e => updateConfig('untertitel', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Refresh-Intervall (Sekunden)</label>
              <input type="number" value={monitorConfig.refresh_intervall} onChange={e => updateConfig('refresh_intervall', parseInt(e.target.value) || 30)}
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
          <Section id="onair" area="ansichten" title="ON AIR Anpassung" description="Text, Farbe, Blinken und Splitscreen"
            icon={Radio} iconColor="bg-red-600/30" open={openSections.onair} onToggle={toggleSection}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">ON AIR Text</label>
                <input type="text" value={monitorConfig.on_air_text} onChange={e => updateConfig('on_air_text', e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Farbe (leer = Akzentfarbe)</label>
                <div className="flex gap-2">
                  <input type="color" value={monitorConfig.on_air_farbe || monitorConfig.akzent_farbe || '#da1f3d'}
                    onChange={e => updateConfig('on_air_farbe', e.target.value)}
                    disabled={!canEdit} className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer" />
                  <input type="text" value={monitorConfig.on_air_farbe} onChange={e => updateConfig('on_air_farbe', e.target.value)}
                    disabled={!canEdit} placeholder="Akzentfarbe"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
                </div>
              </div>
            </div>

            {/* Blinken */}
            <div className="flex items-center gap-3">
              <Toggle checked={monitorConfig.on_air_blinken} onChange={v => updateConfig('on_air_blinken', v)} disabled={!canEdit} />
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
                  {[{ v: 'links', l: 'Links' }, { v: 'rechts', l: 'Rechts' }].map(o => (
                    <button key={o.v} onClick={() => canEdit && updateConfig('on_air_split_seite', o.v)} disabled={!canEdit}
                      className={`py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                        (monitorConfig.on_air_split_seite || 'rechts') === o.v
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
                  const f = monitorConfig.on_air_farbe || monitorConfig.akzent_farbe || '#da1f3d';
                  const blink = monitorConfig.on_air_blinken ? 'animate-pulse' : '';
                  const onair = (
                    <div className="text-center">
                      <div className={`${blink} font-black uppercase tracking-[0.3em] leading-none`}
                        style={{ color: f, fontSize: monitorConfig.on_air_split ? '2rem' : '3rem', textShadow: `0 0 40px ${f}60` }}>
                        {monitorConfig.on_air_text || 'ON AIR'}
                      </div>
                      {monitorConfig.zeige_uhr && <div className="font-mono text-sm mt-3 tracking-widest font-bold animate-pulse" style={{ color: f, textShadow: `0 0 12px ${f}90` }}>12:34:56</div>}
                    </div>
                  );
                  if (monitorConfig.on_air_split) {
                    const p = Math.min(80, Math.max(20, monitorConfig.split_links_prozent || 50));
                    const onAirRechts = (monitorConfig.on_air_split_seite || 'rechts') === 'rechts';
                    const onairPane = <div className="w-full h-full flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at center, ' + f + '10 0%, #000 70%)' }}>{onair}</div>;
                    const untisPane = <div className="w-full h-full flex items-center justify-center text-white/25 text-xs bg-white/[0.02]">Stundenplan</div>;
                    return (
                      <div className="absolute inset-0 flex">
                        <div style={{ width: `${p}%` }}>{onAirRechts ? untisPane : onairPane}</div>
                        <div className="w-px bg-white/15" />
                        <div className="flex-1">{onAirRechts ? onairPane : untisPane}</div>
                      </div>
                    );
                  }
                  return <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at center, ' + f + '10 0%, #000 70%)' }}>{onair}</div>;
                })()}
              </div>
            </div>
          </Section>

          {/* ═══ Widgets ═══ */}
          <Section id="widgets" area={['standard', 'split', 'stundenplan'].includes(monitorConfig.layout_modus) ? 'ansichten' : 'nicht-relevant'} title="Widgets & Bereiche" description={`${activeWidgets} von ${widgetKeys.length} aktiv`}
            icon={Zap} iconColor="bg-blue-600/30" open={openSections.widgets} onToggle={toggleSection}
            statusDot={activeWidgets > 0 ? 'bg-blue-400' : 'bg-gray-600'}>

            {/* Categorized Widget Grid */}
            {cats.map(cat => (
              <div key={cat}>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">{catLabels[cat]}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {widgetDefs.filter(w => w.cat === cat).map(w => {
                    const WIcon = w.icon;
                    const active = monitorConfig[w.key];
                    return (
                      <button key={w.key} onClick={() => canEdit && updateConfig(w.key, !active)}
                        disabled={!canEdit}
                        className={`p-2.5 rounded-lg text-sm text-left border transition-all flex items-center gap-2.5 disabled:opacity-50 ${
                          active
                            ? 'bg-blue-600/15 border-blue-500/30 text-blue-300 shadow-sm shadow-blue-500/5'
                            : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                        }`}>
                        <WIcon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-400' : ''}`} />
                        <span className="flex-1">{w.label}</span>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
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
          <Section id="theme" area="ansichten" title="Theme & Farben" description="Farbschema und Design-Vorlagen"
            icon={Palette} iconColor="bg-purple-600/30" open={openSections.theme} onToggle={toggleSection}>
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Theme-Preset</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: 'custom', l: 'Benutzerdefiniert', color: 'gray' },
                  { v: 'veranstaltung', l: 'Veranstaltung', color: '#da1f3d' },
                  { v: 'schulbetrieb', l: 'Schulbetrieb', color: '#3b82f6' },
                  { v: 'nacht', l: 'Nacht', color: '#6b7280' },
                ].map(t => (
                  <button key={t.v} onClick={() => canEdit && applyTheme(t.v)}
                    disabled={!canEdit}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 flex items-center gap-2 ${
                      monitorConfig.theme_preset === t.v
                        ? 'border-purple-500 text-purple-400 bg-purple-900/20'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}>
                    {t.color !== 'gray' && <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />}
                    {t.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Hintergrundfarbe</label>
                <div className="flex gap-2">
                  <input type="color" value={monitorConfig.hintergrund_farbe}
                    onChange={e => { updateConfig('hintergrund_farbe', e.target.value); updateConfig('theme_preset', 'custom'); }}
                    disabled={!canEdit} className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer" />
                  <input type="text" value={monitorConfig.hintergrund_farbe}
                    onChange={e => { updateConfig('hintergrund_farbe', e.target.value); updateConfig('theme_preset', 'custom'); }}
                    disabled={!canEdit} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Akzentfarbe</label>
                <div className="flex gap-2">
                  <input type="color" value={monitorConfig.akzent_farbe}
                    onChange={e => { updateConfig('akzent_farbe', e.target.value); updateConfig('theme_preset', 'custom'); }}
                    disabled={!canEdit} className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer" />
                  <input type="text" value={monitorConfig.akzent_farbe}
                    onChange={e => { updateConfig('akzent_farbe', e.target.value); updateConfig('theme_preset', 'custom'); }}
                    disabled={!canEdit} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono disabled:opacity-50" />
                </div>
              </div>
            </div>
            <div className="h-12 rounded-lg overflow-hidden flex">
              <div className="flex-1" style={{ background: monitorConfig.hintergrund_farbe }} />
              <div className="w-24" style={{ background: monitorConfig.akzent_farbe }} />
            </div>
          </Section>

          {/* ═══ Medien ═══ */}
          <Section id="medien" area="inhalte" title="Medien & Dateien" description="Logos, Bilder, PDFs und Hintergründe"
            icon={Image} iconColor="bg-pink-600/30" open={openSections.medien} onToggle={toggleSection}
            badge={monitorDateien.length}>

            {/* Drag-&-Drop-Upload */}
            {canEdit && (
              <div onDragOver={e => { e.preventDefault(); }}
                onDrop={e => { e.preventDefault(); uploadDroppedFiles(Array.from(e.dataTransfer.files || [])); }}
                className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center text-gray-500 hover:border-pink-500/50 hover:text-gray-400 transition-colors">
                {uploading ? (
                  <span className="flex items-center justify-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Lädt hoch …</span>
                ) : (
                  <><UploadCloud className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Dateien hierher ziehen (Bilder → Slideshow, PDF → PDF)</p></>
                )}
              </div>
            )}

            {/* Logos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Image className="w-4 h-4 text-purple-400" /> Logos ({logos.length})</h4>
                {canEdit && <UploadButton typ="logo" label="Logo hochladen" />}
              </div>
              {logos.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {logos.map(logo => (
                    <div key={logo.id}
                      onClick={() => canEdit && updateConfig('aktives_logo_id', monitorConfig.aktives_logo_id === logo.id ? null : logo.id)}
                      className={`relative rounded-xl p-3 border-2 cursor-pointer transition-all ${
                        monitorConfig.aktives_logo_id === logo.id
                          ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                      }`}>
                      <img src={`${MEDIA_BASE}${logo.datei_url}`} alt={logo.name} className="w-full h-16 object-contain" />
                      {monitorConfig.aktives_logo_id === logo.id && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                      )}
                      <p className="text-xs text-gray-400 mt-2 truncate">{logo.name}</p>
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteDatei(logo.id); }}
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

            {monitorConfig.zeige_hintergrundbild && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2"><ImageIcon className="w-4 h-4 text-teal-400" /> Hintergrundbilder ({hintergruende.length})</h4>
                    {canEdit && <UploadButton typ="hintergrund" label="Bild hochladen" />}
                  </div>
                  {hintergruende.length > 0 ? (
                    <div className="grid grid-cols-4 gap-3">
                      {hintergruende.map(bg => (
                        <div key={bg.id}
                          onClick={() => canEdit && updateConfig('aktives_hintergrundbild_id', monitorConfig.aktives_hintergrundbild_id === bg.id ? null : bg.id)}
                          className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                            monitorConfig.aktives_hintergrundbild_id === bg.id ? 'border-purple-500' : 'border-gray-700 hover:border-gray-600'
                          }`}>
                          <img src={`${MEDIA_BASE}${bg.datei_url}`} alt={bg.name} className="w-full h-20 object-cover" />
                          {monitorConfig.aktives_hintergrundbild_id === bg.id && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                          )}
                          {canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteDatei(bg.id); }}
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

            {monitorConfig.zeige_pdf && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-orange-400" /> PDFs ({pdfs.length})</h4>
                    {canEdit && <UploadButton typ="pdf" label="PDF hochladen" />}
                  </div>
                  {pdfs.length > 0 ? (
                    <div className="space-y-2">
                      {pdfs.map(pdf => (
                        <div key={pdf.id}
                          onClick={() => canEdit && updateConfig('aktive_pdf_id', monitorConfig.aktive_pdf_id === pdf.id ? null : pdf.id)}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                            monitorConfig.aktive_pdf_id === pdf.id ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                          }`}>
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-orange-400" />
                            <span className="text-white text-sm">{pdf.name}</span>
                            {monitorConfig.aktive_pdf_id === pdf.id && <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">Aktiv</span>}
                          </div>
                          {canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteDatei(pdf.id); }}
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

            {monitorConfig.zeige_slideshow && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Image className="w-4 h-4 text-blue-400" /> Slideshow-Bilder ({bilder.length})</h4>
                  {canEdit && <UploadButton typ="bild" label="Bild hochladen" />}
                </div>
                {bilder.length > 0 ? (
                  <div className="grid grid-cols-4 gap-3">
                    {bilder.map(bild => (
                      <div key={bild.id} className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-800/50">
                        <img src={`${MEDIA_BASE}${bild.datei_url}`} alt={bild.name} className="w-full h-24 object-cover" />
                        <p className="text-xs text-gray-400 p-2 truncate">{bild.name}</p>
                        {canEdit && (
                          <button onClick={() => handleDeleteDatei(bild.id)}
                            className="absolute top-1 right-1 p-1 bg-black/60 text-gray-300 hover:text-red-400 rounded"><Trash2 className="w-3 h-3" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-500 text-sm">Noch keine Bilder hochgeladen.</p>}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Intervall: {monitorConfig.slideshow_intervall}s</label>
                  <input type="range" min={3} max={60} value={monitorConfig.slideshow_intervall}
                    onChange={e => updateConfig('slideshow_intervall', parseInt(e.target.value))}
                    disabled={!canEdit} className="w-full accent-blue-500" />
                </div>
              </div>
            )}
          </Section>

          {/* ═══ Ankündigungen ═══ */}
          <Section id="ankuendigungen" area="inhalte" title="Ankündigungen" description="Meldungen auf dem Display anzeigen"
            icon={Megaphone} iconColor="bg-amber-600/30" open={openSections.ankuendigungen} onToggle={toggleSection}
            badge={monitorAnkuendigungen.length}>

            {canEdit && (
              <button onClick={() => { setEditingAnkuendigung(null); setNewAnkuendigung({ titel: '', text: '', prioritaet: 'normal', ist_aktiv: true }); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">
                <Plus className="w-4 h-4" /> Neue Ankündigung
              </button>
            )}

            {newAnkuendigung && renderAnkuendigungForm(
              newAnkuendigung, setNewAnkuendigung, handleCreateAnkuendigung, () => setNewAnkuendigung(null), 'Erstellen'
            )}

            {editingAnkuendigung && renderAnkuendigungForm(
              editingAnkuendigung, setEditingAnkuendigung, handleUpdateAnkuendigung, () => setEditingAnkuendigung(null), 'Speichern'
            )}

            <div className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
              {monitorAnkuendigungen.map(a => (
                <div key={a.id} className="p-4 flex items-start justify-between bg-gray-800/20 hover:bg-gray-800/30 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{a.titel}</span>
                      <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${
                        a.prioritaet === 'dringend' ? 'bg-red-900/30 text-red-400' :
                        a.prioritaet === 'wichtig' ? 'bg-amber-900/30 text-amber-400' :
                        'bg-gray-700 text-gray-400'
                      }`}>{a.prioritaet}</span>
                      {!a.ist_aktiv && <span className="px-2 py-0.5 text-[10px] bg-gray-700 text-gray-500 rounded">Inaktiv</span>}
                    </div>
                    {a.text && <p className="text-sm text-gray-400 mt-1">{a.text}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 ml-4">
                      <button onClick={() => { setNewAnkuendigung(null); setEditingAnkuendigung({ ...a }); }}
                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteAnkuendigung(a.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
              {monitorAnkuendigungen.length === 0 && !newAnkuendigung && (
                <div className="p-8 text-center text-gray-500">
                  <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Keine Ankündigungen</p>
                </div>
              )}
            </div>
          </Section>

          {/* ═══ Events (aktivierbare Modi) ═══ */}
          <Section id="events" area="events" plain title="Events" description="Sondermodi: aktivieren → Bildschirme zeigen andere Ansichten, danach zurück"
            icon={Radio} iconColor="bg-violet-600/30" open={openSections.events} onToggle={toggleSection}
            badge={events.length}
            statusDot={events.some(e => e.aktiv) ? 'bg-violet-400 animate-pulse' : null}>
            <EventManager events={events} bildschirme={bildschirme} profiles={profiles} canEdit={canEdit}
              onSave={saveEvent} onDelete={deleteEvent} onToggleActive={toggleEventActive} />
          </Section>

          {/* ═══ WebUntis-Link-Bibliothek ═══ */}
          <Section id="webuntislinks" area="einstellungen" title="WebUntis-Links" description="Links einmal benennen und überall auswählen"
            icon={Calendar} iconColor="bg-purple-600/30" open={openSections.webuntislinks} onToggle={toggleSection}
            badge={webuntisLinks.length}>
            <WebUntisLinkManager links={webuntisLinks} canEdit={canEdit}
              onSave={saveWebuntisLink} onDelete={deleteWebuntisLink} />
          </Section>

          {/* ═══ ÖPNV Abfahrten (nur bei Abfahrtsmonitor-Layout) ═══ */}
          {monitorConfig.layout_modus === 'abfahrten' && (
          <Section id="oepnv" area="ansichten" title="ÖPNV Abfahrten" description="Stationen und Filter für den Abfahrtsmonitor"
            icon={Activity} iconColor="bg-blue-600/30" open={openSections.oepnv} onToggle={toggleSection}
            badge={monitorConfig.oepnv_stationen?.length || 0}>

            {/* API-Auswahl */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Datenquellen</label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Toggle checked={monitorConfig.oepnv_api_db !== false} onChange={v => updateConfig('oepnv_api_db', v)} disabled={!canEdit} />
                  <span className="text-xs text-white">DB (ganz Deutschland)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle checked={monitorConfig.oepnv_api_nahsh !== false} onChange={v => updateConfig('oepnv_api_nahsh', v)} disabled={!canEdit} />
                  <span className="text-xs text-white">NAH.SH (Schleswig-Holstein)</span>
                </div>
              </div>
            </div>

            {/* Stationssuche */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Station hinzufügen</label>
              <div className="relative">
                <input type="text" value={oepnvSuche}
                  onChange={e => {
                    setOepnvSuche(e.target.value);
                    clearTimeout(oepnvTimerRef.current);
                    if (e.target.value.length >= 2) {
                      setOepnvSuching(true);
                      oepnvTimerRef.current = setTimeout(async () => {
                        try {
                          const useDb = monitorConfig.oepnv_api_db !== false;
                          const useNahsh = monitorConfig.oepnv_api_nahsh !== false;
                          const res = await apiClient.get(`/monitor/oepnv/suche?q=${encodeURIComponent(e.target.value)}&results=12&use_db=${useDb}&use_nahsh=${useNahsh}`);
                          setOepnvErgebnisse(res.data || res || []);
                        } catch { setOepnvErgebnisse([]); }
                        setOepnvSuching(false);
                      }, 400);
                    } else {
                      setOepnvErgebnisse([]);
                    }
                  }}
                  disabled={!canEdit}
                  placeholder="Station suchen (z.B. Hamburg Hbf, Kiel ZOB...)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                {oepnvSuching && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 animate-spin" />}
              </div>

              {/* Suchergebnisse */}
              {oepnvErgebnisse.length > 0 && (
                <div className="mt-2 border border-gray-700 rounded-lg bg-gray-800 overflow-hidden max-h-64 overflow-y-auto">
                  {oepnvErgebnisse.map(s => {
                    const already = (monitorConfig.oepnv_stationen || []).some(st => st.id === s.id);
                    return (
                      <button key={s.id} disabled={already || !canEdit}
                        onClick={() => {
                          const stationen = [...(monitorConfig.oepnv_stationen || []), {
                            id: s.id, name: s.name, quelle: s.quelle || 'db',
                            filter_linien: [], filter_richtung: '', filter_via: '',
                            zeige_bus: true, zeige_bahn: true, zeige_fernverkehr: true,
                          }];
                          updateConfig('oepnv_stationen', stationen);
                          setOepnvSuche(''); setOepnvErgebnisse([]);
                          toast.success(`${s.name} hinzugefügt`);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between hover:bg-gray-700/50 border-b border-gray-700/50 last:border-0 transition-colors ${already ? 'opacity-40' : ''}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{s.name}</span>
                            {s.quelle && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                s.quelle === 'db+nahsh' ? 'bg-green-500/20 text-green-400' :
                                s.quelle === 'nahsh' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}>
                                {s.quelle === 'db+nahsh' ? 'DB + NAH.SH' : s.quelle === 'nahsh' ? 'NAH.SH' : 'DB'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {s.produkte?.join(', ') || s.typ}
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
            {(monitorConfig.oepnv_stationen || []).length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Konfigurierte Stationen</label>
                <div className="space-y-2">
                  {(monitorConfig.oepnv_stationen || []).map((station, idx) => (
                    <div key={station.id} className="p-3 bg-gray-800/60 border border-gray-700 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium">{station.name}</span>
                          {station.quelle && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                              station.quelle === 'db+nahsh' ? 'bg-green-500/20 text-green-400' :
                              station.quelle === 'nahsh' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {station.quelle === 'db+nahsh' ? 'DB + NAH.SH' : station.quelle === 'nahsh' ? 'NAH.SH' : 'DB'}
                            </span>
                          )}
                        </div>
                        <button onClick={() => {
                          const stationen = monitorConfig.oepnv_stationen.filter((_, i) => i !== idx);
                          updateConfig('oepnv_stationen', stationen);
                        }} disabled={!canEdit} className="text-gray-500 hover:text-red-400 disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Per-Station Produktfilter */}
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">Zeige:</span>
                        {[
                          { key: 'zeige_bus', label: 'Bus' },
                          { key: 'zeige_bahn', label: 'RE/RB' },
                          { key: 'zeige_sbahn', label: 'S-Bahn' },
                          { key: 'zeige_ubahn', label: 'U-Bahn' },
                          { key: 'zeige_tram', label: 'Tram' },
                          { key: 'zeige_fernverkehr', label: 'ICE/IC' },
                          { key: 'zeige_faehre', label: 'Fähre' },
                        ].map(p => (
                          <label key={p.key} className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox"
                              checked={station[p.key] !== false}
                              onChange={e => {
                                const stationen = [...monitorConfig.oepnv_stationen];
                                stationen[idx] = { ...stationen[idx], [p.key]: e.target.checked };
                                updateConfig('oepnv_stationen', stationen);
                              }}
                              disabled={!canEdit}
                              className="w-3 h-3 rounded bg-gray-900 border-gray-600 text-blue-500 focus:ring-0 disabled:opacity-50" />
                            <span className="text-[10px] text-white/70">{p.label}</span>
                          </label>
                        ))}
                      </div>

                      {/* Wegzeit */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">Wegzeit:</span>
                        <input type="number"
                          value={station.wegzeit_minuten || 0}
                          onChange={e => {
                            const stationen = [...monitorConfig.oepnv_stationen];
                            stationen[idx] = { ...stationen[idx], wegzeit_minuten: parseInt(e.target.value) || 0 };
                            updateConfig('oepnv_stationen', stationen);
                          }}
                          min={0} max={60} disabled={!canEdit}
                          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                        <span className="text-[10px] text-gray-500">Min (Abfahrten erst nach Wegzeit anzeigen)</span>
                      </div>

                      {/* API pro Station */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">API:</span>
                        <select
                          value={station.api || ''}
                          onChange={e => {
                            const stationen = [...monitorConfig.oepnv_stationen];
                            stationen[idx] = { ...stationen[idx], api: e.target.value };
                            updateConfig('oepnv_stationen', stationen);
                          }}
                          disabled={!canEdit}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50">
                          <option value="">Global (Standard)</option>
                          <option value="db">Nur DB REST</option>
                          <option value="nahsh">Nur NAH.SH</option>
                          <option value="beide">Beide APIs</option>
                        </select>
                        <span className="text-[10px] text-gray-500">Welche API für diese Station</span>
                      </div>

                      {/* Max Abfahrten pro Typ */}
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-[10px] text-gray-500">Max:</span>
                        {[
                          { key: 'max_abfahrten', label: 'Gesamt' },
                          { key: 'max_bus', label: 'Bus' },
                          { key: 'max_zug', label: 'Zug' },
                        ].map(f => (
                          <div key={f.key} className="flex items-center gap-1">
                            <input type="number"
                              value={station[f.key] || ''}
                              placeholder="∞"
                              onChange={e => {
                                const stationen = [...monitorConfig.oepnv_stationen];
                                stationen[idx] = { ...stationen[idx], [f.key]: parseInt(e.target.value) || 0 };
                                updateConfig('oepnv_stationen', stationen);
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
                          value={station.spalte ?? 0}
                          onChange={e => {
                            const stationen = [...monitorConfig.oepnv_stationen];
                            stationen[idx] = { ...stationen[idx], spalte: parseInt(e.target.value) };
                            updateConfig('oepnv_stationen', stationen);
                          }}
                          disabled={!canEdit}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50">
                          {Array.from({ length: monitorConfig.oepnv_layout_spalten || 3 }, (_, i) => (
                            <option key={i} value={i}>Spalte {i + 1}</option>
                          ))}
                        </select>
                        <span className="text-[10px] text-gray-500">In welcher Spalte wird diese Station angezeigt</span>
                      </div>

                      {/* Trennung + Kompakt */}
                      <div className="flex items-center gap-4 mb-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox"
                            checked={station.trennung || false}
                            onChange={e => {
                              const stationen = [...monitorConfig.oepnv_stationen];
                              stationen[idx] = { ...stationen[idx], trennung: e.target.checked };
                              updateConfig('oepnv_stationen', stationen);
                            }}
                            disabled={!canEdit}
                            className="w-3 h-3 rounded bg-gray-900 border-gray-600 text-blue-500 focus:ring-0 disabled:opacity-50" />
                          <span className="text-[10px] text-white/70">Bus/Zug trennen</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox"
                            checked={station.kompakt || false}
                            onChange={e => {
                              const stationen = [...monitorConfig.oepnv_stationen];
                              stationen[idx] = { ...stationen[idx], kompakt: e.target.checked };
                              updateConfig('oepnv_stationen', stationen);
                            }}
                            disabled={!canEdit}
                            className="w-3 h-3 rounded bg-gray-900 border-gray-600 text-blue-500 focus:ring-0 disabled:opacity-50" />
                          <span className="text-[10px] text-white/70">Kompaktmodus</span>
                        </label>
                      </div>

                      {/* Zusatz-Station (kombinieren) */}
                      <div className="mb-2 p-2 bg-gray-800/30 rounded border border-gray-700/50">
                        <div className="text-[10px] text-gray-500 mb-1.5 font-medium">Kombinieren mit 2. Station (Abfahrten zusammenführen)</div>
                        {station.zusatz_id ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 flex items-center gap-2">
                              <span className="text-white text-xs font-medium">{station.zusatz_name || station.zusatz_id}</span>
                              <span className="text-[9px] text-gray-500">ID: {station.zusatz_id}</span>
                              <select
                                value={station.zusatz_api || ''}
                                onChange={e => {
                                  const stationen = [...monitorConfig.oepnv_stationen];
                                  stationen[idx] = { ...stationen[idx], zusatz_api: e.target.value };
                                  updateConfig('oepnv_stationen', stationen);
                                }}
                                disabled={!canEdit}
                                className="ml-auto bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[10px] disabled:opacity-50">
                                <option value="">Auto</option>
                                <option value="db">DB</option>
                                <option value="nahsh">NAH.SH</option>
                                <option value="beide">Beide</option>
                              </select>
                            </div>
                            <button type="button" onClick={() => {
                              const stationen = [...monitorConfig.oepnv_stationen];
                              stationen[idx] = { ...stationen[idx], zusatz_id: '', zusatz_name: '', zusatz_api: '' };
                              updateConfig('oepnv_stationen', stationen);
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
                                      const res = await apiClient.get(`/monitor/oepnv/suche?q=${encodeURIComponent(val)}&results=8&use_db=true&use_nahsh=true`);
                                      const results = res.data || res || [];
                                      // Ergebnisse als Dropdown anzeigen
                                      const dropdown = inputEl.parentElement.querySelector('.zusatz-dropdown');
                                      if (dropdown) {
                                        dropdown.innerHTML = '';
                                        results.forEach(r => {
                                          const btn = document.createElement('button');
                                          btn.type = 'button';
                                          btn.className = 'w-full px-2 py-1.5 text-left text-[11px] text-white hover:bg-gray-700 flex items-center justify-between border-b border-gray-700/30 last:border-0';
                                          btn.innerHTML = `<span>${r.name}</span><span class="text-[9px] text-gray-500 ml-2">${r.id} · ${r.quelle || 'db'}</span>`;
                                          btn.onclick = () => {
                                            const stationen = [...monitorConfig.oepnv_stationen];
                                            stationen[idx] = { ...stationen[idx], zusatz_id: r.id, zusatz_name: r.name, zusatz_api: r.quelle === 'nahsh' ? 'nahsh' : r.quelle === 'db+nahsh' ? '' : 'db' };
                                            updateConfig('oepnv_stationen', stationen);
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
                              onBlur={e => { setTimeout(() => { const d = e.target.parentElement?.querySelector('.zusatz-dropdown'); if (d) d.innerHTML = ''; }, 200); }}
                            />
                            <div className="zusatz-dropdown absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto z-20" />
                          </div>
                        )}
                        {station.zusatz_id && (
                          <>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[10px] text-gray-500">Zusatz zeigt:</span>
                              {[
                                { key: 'zusatz_zeige_bus', label: 'Bus' },
                                { key: 'zusatz_zeige_bahn', label: 'RE/RB' },
                                { key: 'zusatz_zeige_sbahn', label: 'S-Bahn' },
                                { key: 'zusatz_zeige_ubahn', label: 'U-Bahn' },
                                { key: 'zusatz_zeige_tram', label: 'Tram' },
                                { key: 'zusatz_zeige_fernverkehr', label: 'ICE/IC' },
                                { key: 'zusatz_zeige_faehre', label: 'Fähre' },
                              ].map(p => (
                                <label key={p.key} className="flex items-center gap-1 cursor-pointer">
                                  <input type="checkbox"
                                    checked={station[p.key] !== false}
                                    onChange={e => {
                                      const stationen = [...monitorConfig.oepnv_stationen];
                                      stationen[idx] = { ...stationen[idx], [p.key]: e.target.checked };
                                      updateConfig('oepnv_stationen', stationen);
                                    }}
                                    disabled={!canEdit}
                                    className="w-3 h-3 rounded bg-gray-900 border-gray-600 text-blue-500 focus:ring-0 disabled:opacity-50" />
                                  <span className="text-[10px] text-white/70">{p.label}</span>
                                </label>
                              ))}
                            </div>
                            <div className="text-[9px] text-gray-600 mt-1">Tipp: Hauptstation auf DB (Züge), Zusatz auf NAH.SH (Busse) → mit Bus/Zug-Trennung kombiniert.</div>
                          </>
                        )}
                      </div>

                      {/* Filter — Linien (Badge-Eingabe) + Richtung + Via */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Linienfilter (Komma/Enter = trennen, leer = alle)</label>
                          <div className="flex flex-wrap gap-1 items-center bg-gray-900 border border-gray-700 rounded px-2 py-1 min-h-[30px]">
                            {(station.filter_linien || []).map((linie, li) => (
                              <span key={li} className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                {linie}
                                <button type="button" onClick={() => {
                                  const stationen = [...monitorConfig.oepnv_stationen];
                                  const linien = [...(stationen[idx].filter_linien || [])];
                                  linien.splice(li, 1);
                                  stationen[idx] = { ...stationen[idx], filter_linien: linien };
                                  updateConfig('oepnv_stationen', stationen);
                                }} disabled={!canEdit} className="hover:text-red-400 disabled:opacity-50">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                            <input type="text"
                              placeholder={station.filter_linien?.length ? '' : 'z.B. RE7, Bus 11'}
                              disabled={!canEdit}
                              className="flex-1 min-w-[60px] bg-transparent text-white text-xs outline-none py-0.5 disabled:opacity-50"
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ',') {
                                  e.preventDefault();
                                  const val = e.target.value.trim().replace(/,+$/, '').trim();
                                  if (val) {
                                    const stationen = [...monitorConfig.oepnv_stationen];
                                    const linien = [...(stationen[idx].filter_linien || [])];
                                    // Komma-getrennte Eingabe aufsplitten
                                    val.split(',').map(s => s.trim()).filter(Boolean).forEach(v => {
                                      if (!linien.includes(v)) linien.push(v);
                                    });
                                    stationen[idx] = { ...stationen[idx], filter_linien: linien };
                                    updateConfig('oepnv_stationen', stationen);
                                    e.target.value = '';
                                  }
                                }
                                if (e.key === 'Backspace' && !e.target.value) {
                                  const stationen = [...monitorConfig.oepnv_stationen];
                                  const linien = [...(stationen[idx].filter_linien || [])];
                                  if (linien.length > 0) {
                                    linien.pop();
                                    stationen[idx] = { ...stationen[idx], filter_linien: linien };
                                    updateConfig('oepnv_stationen', stationen);
                                  }
                                }
                              }}
                              onBlur={e => {
                                const val = e.target.value.trim().replace(/,+$/, '').trim();
                                if (val) {
                                  const stationen = [...monitorConfig.oepnv_stationen];
                                  const linien = [...(stationen[idx].filter_linien || [])];
                                  val.split(',').map(s => s.trim()).filter(Boolean).forEach(v => {
                                    if (!linien.includes(v)) linien.push(v);
                                  });
                                  stationen[idx] = { ...stationen[idx], filter_linien: linien };
                                  updateConfig('oepnv_stationen', stationen);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Richtungsfilter (leer = alle)</label>
                          <input type="text"
                            defaultValue={station.filter_richtung || ''}
                            onBlur={e => {
                              const stationen = [...monitorConfig.oepnv_stationen];
                              stationen[idx] = { ...stationen[idx], filter_richtung: e.target.value };
                              updateConfig('oepnv_stationen', stationen);
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
                            const stationen = [...monitorConfig.oepnv_stationen];
                            stationen[idx] = { ...stationen[idx], filter_via: e.target.value };
                            updateConfig('oepnv_stationen', stationen);
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Vorausschau (Min.)</label>
                <input type="number" value={monitorConfig.oepnv_dauer} onChange={e => updateConfig('oepnv_dauer', parseInt(e.target.value) || 60)}
                  min={10} max={180} disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Max. Abfahrten pro Station</label>
                <input type="number" value={monitorConfig.oepnv_max_abfahrten} onChange={e => updateConfig('oepnv_max_abfahrten', parseInt(e.target.value) || 20)}
                  min={5} max={50} disabled={!canEdit}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
              </div>
            </div>

            {/* Anzeige-Optionen */}
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Anzeige-Optionen</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'oepnv_zeige_via', label: 'Zwischenhalte (Via) anzeigen', desc: 'Zeigt Halte unter dem Ziel' },
                  { key: 'oepnv_zeige_relativ', label: 'Relative Zeit ("in X min")', desc: 'Countdown neben Abfahrtszeit' },
                  { key: 'oepnv_farbcodierung', label: 'Farbcodierte Zeiten', desc: 'Grün = gleich, gedimmt = >30 Min' },
                  { key: 'oepnv_highlight_naechste', label: 'Nächste Abfahrt hervorheben', desc: 'Erste Abfahrt visuell betont' },
                  { key: 'oepnv_auto_scroll', label: 'Auto-Scroll', desc: 'Scrollt bei vielen Abfahrten' },
                  { key: 'oepnv_stoerungsbanner', label: 'Störungsbanner', desc: 'Warnung bei gehäuften Ausfällen' },
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
              <select value={monitorConfig.oepnv_schriftgroesse || 'gross'}
                onChange={e => updateConfig('oepnv_schriftgroesse', e.target.value)}
                disabled={!canEdit}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50">
                <option value="normal">Normal</option>
                <option value="gross">Groß (HD)</option>
                <option value="4k">Sehr groß (4K)</option>
              </select>
            </div>

            {/* Layout-Spalten */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Layout-Spalten</label>
              <div className="flex items-center gap-3">
                <select value={monitorConfig.oepnv_layout_spalten || 3}
                  onChange={e => updateConfig('oepnv_layout_spalten', parseInt(e.target.value))}
                  disabled={!canEdit}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50">
                  <option value={1}>1 Spalte</option>
                  <option value={2}>2 Spalten</option>
                  <option value={3}>3 Spalten</option>
                  <option value={4}>4 Spalten</option>
                </select>
                <span className="text-[10px] text-gray-500">Stationen werden in diese Spalten aufgeteilt. Zuordnung pro Station oben konfigurierbar.</span>
              </div>
            </div>

            {(monitorConfig.oepnv_stationen || []).length === 0 && (
              <div className="p-6 text-center text-gray-500">
                <Activity className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Noch keine Stationen konfiguriert</p>
                <p className="text-xs mt-1">Oben nach einer Haltestelle oder einem Bahnhof suchen</p>
              </div>
            )}

            {/* ─── Streik-Modus ─── */}
            <div className="border-t border-gray-700/40 pt-4 mt-4">
              <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!monitorConfig.oepnv_streik_aktiv} disabled={!canEdit}
                    onChange={e => updateConfig('oepnv_streik_aktiv', e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-red-500 focus:ring-red-500/30" />
                  <span className="text-sm font-medium text-red-400">Streik-Modus</span>
                </label>
                {monitorConfig.oepnv_streik_aktiv && (
                  <span className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full font-medium">AKTIV</span>
                )}
              </div>

              {monitorConfig.oepnv_streik_aktiv && (
                <div className="space-y-3 ml-6">
                  {/* Banner-Text */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Banner-Text (optional)</label>
                    <input type="text" value={monitorConfig.oepnv_streik_text || ''} disabled={!canEdit}
                      onChange={e => updateConfig('oepnv_streik_text', e.target.value)}
                      placeholder="z.B. Streik bei DB Regio — einige Verbindungen entfallen"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 disabled:opacity-50" />
                  </div>

                  {/* Linien ausblenden */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Linien ausblenden</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(monitorConfig.oepnv_streik_linien || []).map((linie, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-300 rounded-full text-xs font-medium">
                          {linie}
                          {canEdit && (
                            <button onClick={() => {
                              const updated = (monitorConfig.oepnv_streik_linien || []).filter((_, j) => j !== i);
                              updateConfig('oepnv_streik_linien', updated);
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
                            const current = monitorConfig.oepnv_streik_linien || [];
                            if (!current.includes(val)) {
                              updateConfig('oepnv_streik_linien', [...current, val]);
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
                      ].map(typ => {
                        const active = (monitorConfig.oepnv_streik_typen || []).includes(typ.key);
                        return (
                          <button key={typ.key} disabled={!canEdit}
                            onClick={() => {
                              const current = monitorConfig.oepnv_streik_typen || [];
                              const updated = active ? current.filter(t => t !== typ.key) : [...current, typ.key];
                              updateConfig('oepnv_streik_typen', updated);
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all disabled:opacity-50 ${
                              active
                                ? 'bg-red-500/30 border-red-500/50 text-red-300'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                            }`}>
                            {active && <span className="mr-1">✕</span>}{typ.label}
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

          {/* ═══ API & Token ═══ */}
          <Section id="globalsettings" area="einstellungen" plain title="Globale Zugänge" description="Einmal eintragen — gilt für alle Ansichten (Wetter-Key, Raumplan-Login)"
            icon={Key} iconColor="bg-emerald-600/30" open badge={null}>
            {globalSettings ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">OpenWeatherMap API-Key (Wetter)</label>
                  <input type="password" value={globalSettings.wetter_api_key || ''} disabled={!canEdit}
                    onChange={e => setGlobalSettings({ ...globalSettings, wetter_api_key: e.target.value })}
                    placeholder="API-Key" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Raumplan-Server</label>
                    <input type="text" value={globalSettings.raumplan_server || ''} disabled={!canEdit}
                      onChange={e => setGlobalSettings({ ...globalSettings, raumplan_server: e.target.value })}
                      placeholder="katharineum.webuntis.com" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Raumplan-Schule</label>
                    <input type="text" value={globalSettings.raumplan_schule || ''} disabled={!canEdit}
                      onChange={e => setGlobalSettings({ ...globalSettings, raumplan_schule: e.target.value })}
                      placeholder="katharineum" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Raumplan-Benutzer (optional)</label>
                    <input type="text" value={globalSettings.raumplan_benutzername || ''} disabled={!canEdit}
                      onChange={e => setGlobalSettings({ ...globalSettings, raumplan_benutzername: e.target.value })}
                      placeholder="Leer = Anonym" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Raumplan-Passwort (optional)</label>
                    <input type="password" value={globalSettings.raumplan_passwort || ''} disabled={!canEdit}
                      onChange={e => setGlobalSettings({ ...globalSettings, raumplan_passwort: e.target.value })}
                      placeholder="Passwort" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                  </div>
                </div>
                {canEdit && (
                  <button onClick={saveGlobalSettings} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg">
                    <Save className="w-4 h-4" /> Speichern
                  </button>
                )}
              </>
            ) : <p className="text-sm text-gray-500">Lädt …</p>}
          </Section>

          <Section id="api" area="einstellungen" plain title="API & Token" description="Externe Steuerung per ATEM, HTTP etc."
            icon={Key} iconColor="bg-gray-600/30" open={openSections.api} onToggle={toggleSection}>
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
                <p><span className="text-green-400">POST</span> /api/monitor/onair <span className="text-gray-600">{'{"on_air": true}'}</span></p>
                <p><span className="text-amber-400">POST</span> /api/monitor/notfall <span className="text-gray-600">{'{"aktiv": true, "text": "..."}'}</span></p>
                <p className="border-t border-gray-700/40 pt-1.5"><span className="text-blue-400">Header:</span> X-Monitor-Token: {'<token>'}</p>
              </div>
            </div>
          </Section>
        </>
      )}

      </div>{/* Ende linke Spalte */}

      {/* Feste Live-Vorschau (Ansichten, ab lg) */}
      {activeArea === 'ansichten' && showPreview && monitorConfig && (
        <aside className="hidden lg:block sticky top-24 self-start">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-800">
              <span className="text-xs text-gray-400 flex items-center gap-2 truncate">
                <Activity className="w-3 h-3 shrink-0" /> Vorschau — {activeProfile?.name}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a href={`/monitor?profil=${monitorConfig.slug}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white" title="Groß öffnen">
                  <Maximize2 className="w-3.5 h-3.5" />
                </a>
                <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-white" title="Vorschau ausblenden">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="relative bg-black" style={{ paddingBottom: '56.25%' }}>
              <iframe key={`${monitorConfig.slug}-${savedAt}`} src={`/monitor?profil=${monitorConfig.slug}`}
                className="absolute inset-0 w-full h-full border-0" title="Monitor Preview"
                style={{ pointerEvents: 'none' }} />
            </div>
          </div>
        </aside>
      )}

      </div>{/* Ende Inhaltsbereich-Grid */}

      {/* Hidden Inputs */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadFile}
        accept={uploadTyp === 'pdf' ? '.pdf' : 'image/*'} />
      </div>
    </div>
    </AreaContext.Provider>
  );
}

// ─── Power-Zeitplan Editor (Wochentage + Ferienmodus + Ausnahmen) ───
function PowerZeitplanEditor({ bs, canEdit, update }) {
  const plan = bs.power_zeitplan || [];
  const ausnahmen = bs.power_ausnahmen || [];

  const setPlanEntry = (idx, patch) => {
    const next = plan.map((e, i) => i === idx ? { ...e, ...patch } : e);
    update('power_zeitplan', next);
  };
  const addPlanEntry = (preset) => {
    const entry = preset === 'wochenende'
      ? { tage: [5, 6], von: '10:00', bis: '16:00' }
      : preset === 'alle'
        ? { tage: [0, 1, 2, 3, 4, 5, 6], von: '07:00', bis: '17:00' }
        : { tage: [0, 1, 2, 3, 4], von: '07:00', bis: '17:00' };
    update('power_zeitplan', [...plan, entry]);
  };
  const removePlanEntry = (idx) => update('power_zeitplan', plan.filter((_, i) => i !== idx));
  const toggleTag = (idx, tagIdx) => {
    const tage = plan[idx]?.tage || [];
    setPlanEntry(idx, { tage: tage.includes(tagIdx) ? tage.filter(t => t !== tagIdx) : [...tage, tagIdx] });
  };

  const addAusnahme = () => {
    const heute = new Date().toISOString().slice(0, 10);
    update('power_ausnahmen', [...ausnahmen, { von_datum: heute, bis_datum: heute, von: '09:00', bis: '17:00', notiz: '' }]);
  };
  const setAusnahme = (idx, patch) => {
    update('power_ausnahmen', ausnahmen.map((a, i) => i === idx ? { ...a, ...patch } : a));
  };
  const removeAusnahme = (idx) => update('power_ausnahmen', ausnahmen.filter((_, i) => i !== idx));

  const modus = bs.power_modus || 'auto';
  const setModus = (m) => update('power_modus', m);

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
              { v: 'manuell_an', l: 'An' },
              { v: 'manuell_aus', l: 'Aus' },
            ].map(({ v, l }) => (
              <button key={v} type="button" disabled={!canEdit} onClick={() => setModus(v)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  modus === v
                    ? (v === 'manuell_an' ? 'bg-green-600 text-white'
                       : v === 'manuell_aus' ? 'bg-red-600 text-white'
                       : 'bg-blue-600 text-white')
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                } disabled:opacity-50`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {modus !== 'auto' && (
          <p className="text-[11px] text-amber-400">
            Manueller Modus aktiv — Zeitplan und Ferienmodus haben keinen Effekt.
          </p>
        )}
      </div>

      {/* Ferienmodus */}
      <div className={`flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-700/40 ${modus !== 'auto' ? 'opacity-50' : ''}`}>
        <div>
          <div className="text-sm font-medium text-white">Ferienmodus</div>
          <p className="text-[11px] text-gray-500">Bildschirm bleibt aus — außer zu eingestellten Sonderzeiten unten.</p>
        </div>
        <Toggle checked={!!bs.ferien_modus} disabled={!canEdit || modus !== 'auto'}
          onChange={(v) => update('ferien_modus', v)} />
      </div>

      {/* Wochentage-Zeitplan */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h5 className="text-sm font-semibold text-white">Wochen-Zeitplan</h5>
            <p className="text-[11px] text-gray-500">
              {bs.ferien_modus ? 'Inaktiv während Ferienmodus.' : 'Bildschirm ist nur während dieser Fenster an. Leer = immer an.'}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-1.5">
              <button onClick={() => addPlanEntry('woche')}
                className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs rounded">
                + Mo–Fr
              </button>
              <button onClick={() => addPlanEntry('wochenende')}
                className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs rounded">
                + Sa–So
              </button>
              <button onClick={() => addPlanEntry('alle')}
                className="px-2.5 py-1 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-300 text-xs rounded">
                + Alle Tage
              </button>
            </div>
          )}
        </div>

        {plan.length === 0 ? (
          <div className="p-3 bg-gray-800/20 rounded-lg border border-gray-700/30 text-center text-xs text-gray-500">
            Kein Zeitplan — Bildschirm ist {bs.ferien_modus ? 'aus (Ferienmodus)' : 'immer an'}.
          </div>
        ) : (
          <div className="space-y-2">
            {plan.map((entry, idx) => (
              <div key={idx} className={`p-2.5 rounded-lg border ${bs.ferien_modus ? 'bg-gray-800/10 border-gray-700/20 opacity-60' : 'bg-gray-800/30 border-gray-700/40'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1">
                    {WOCHENTAGE.map((tag, tagIdx) => (
                      <button key={tagIdx} disabled={!canEdit}
                        onClick={() => toggleTag(idx, tagIdx)}
                        className={`w-7 h-7 rounded text-[11px] font-bold transition-colors disabled:opacity-50 ${
                          (entry.tage || []).includes(tagIdx)
                            ? (tagIdx >= 5 ? 'bg-purple-600/30 border border-purple-500/40 text-purple-200' : 'bg-blue-600/30 border border-blue-500/40 text-blue-200')
                            : 'bg-gray-800 border border-gray-700 text-gray-500'
                        }`}>
                        {tag}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="time" value={entry.von || ''} disabled={!canEdit}
                      onChange={e => setPlanEntry(idx, { von: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                    <span className="text-gray-500 text-xs">—</span>
                    <input type="time" value={entry.bis || ''} disabled={!canEdit}
                      onChange={e => setPlanEntry(idx, { bis: e.target.value })}
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
            <button onClick={addAusnahme}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 text-xs rounded">
              <Plus className="w-3 h-3" /> Sonderzeit
            </button>
          )}
        </div>

        {ausnahmen.length === 0 ? (
          <div className="p-3 bg-gray-800/20 rounded-lg border border-gray-700/30 text-center text-xs text-gray-500">
            Keine Ausnahmen.
          </div>
        ) : (
          <div className="space-y-2">
            {ausnahmen.map((a, idx) => (
              <div key={idx} className="p-2.5 bg-amber-900/10 rounded-lg border border-amber-700/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" value={a.von_datum || ''} disabled={!canEdit}
                    onChange={e => setAusnahme(idx, { von_datum: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                  <span className="text-gray-500 text-xs">bis</span>
                  <input type="date" value={a.bis_datum || ''} disabled={!canEdit}
                    onChange={e => setAusnahme(idx, { bis_datum: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                  <div className="flex items-center gap-1.5 ml-2">
                    <input type="time" value={a.von || ''} disabled={!canEdit}
                      onChange={e => setAusnahme(idx, { von: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                    <span className="text-gray-500 text-xs">—</span>
                    <input type="time" value={a.bis || ''} disabled={!canEdit}
                      onChange={e => setAusnahme(idx, { bis: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs disabled:opacity-50" />
                  </div>
                  {canEdit && (
                    <button onClick={() => removeAusnahme(idx)}
                      className="ml-auto p-1 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <input type="text" value={a.notiz || ''} disabled={!canEdit}
                  onChange={e => setAusnahme(idx, { notiz: e.target.value })}
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
function EventManager({ events, bildschirme, profiles, canEdit, onSave, onDelete, onToggleActive }) {
  const [draft, setDraft] = useState(null); // {id?, name, farbe, beschreibung, aktiv_von, aktiv_bis, zuweisungen:[...]}
  const [previewId, setPreviewId] = useState(null); // Event-Karte mit aufgeklappter Vorschau
  const profileSlug = (id) => profiles.find(p => p.id === id)?.slug;
  const profileName = (id) => profiles.find(p => p.id === id)?.name || '—';
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
    if (!ev.aktiv_von || !ev.aktiv_bis) return null;
    const von = new Date(ev.aktiv_von).getTime(), bis = new Date(ev.aktiv_bis).getTime();
    if (now < von) return { text: `startet in ${humanDur(von - now)}`, cls: 'bg-blue-500/20 text-blue-300' };
    if (now < bis) return { text: `endet in ${humanDur(bis - now)}`, cls: 'bg-amber-500/20 text-amber-300' };
    return { text: 'abgelaufen', cls: 'bg-gray-700 text-gray-400' };
  };
  // Kollisionen: Events mit überlappendem Zeitfenster, die sich einen Bildschirm teilen
  const collisionIds = (() => {
    const ids = new Set();
    const win = ev => ev.aktiv_von && ev.aktiv_bis;
    const overlap = (a, b) => new Date(a.aktiv_von) < new Date(b.aktiv_bis) && new Date(b.aktiv_von) < new Date(a.aktiv_bis);
    const shares = (a, b) => { const sa = new Set((a.zuweisungen || []).map(z => z.bildschirm_id)); return (b.zuweisungen || []).some(z => sa.has(z.bildschirm_id)); };
    for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      if (win(a) && win(b) && overlap(a, b) && shares(a, b)) { ids.add(a.id); ids.add(b.id); }
    }
    return ids;
  })();
  const start = (ev) => setDraft(ev
    ? { ...ev, zuweisungen: (ev.zuweisungen || []).map(z => ({ bildschirm_id: z.bildschirm_id, profil_id: z.profil_id })) }
    : { name: '', farbe: '#7c3aed', beschreibung: '', aktiv_von: null, aktiv_bis: null, zuweisungen: [] });
  const profilFor = (bsId) => draft.zuweisungen.find(z => z.bildschirm_id === bsId)?.profil_id || '';
  const setProfil = (bsId, profilId) => setDraft(d => {
    const rest = d.zuweisungen.filter(z => z.bildschirm_id !== bsId);
    return { ...d, zuweisungen: profilId ? [...rest, { bildschirm_id: bsId, profil_id: profilId }] : rest };
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
          className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg">
          <Plus className="w-4 h-4" /> Neues Event
        </button>
      )}

      {draft && (
        <div className="p-4 bg-gray-800/40 rounded-xl border border-violet-500/30 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="z.B. Tag der offenen Tür" autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Farbe</label>
              <input type="color" value={draft.farbe} onChange={e => setDraft({ ...draft, farbe: e.target.value })}
                className="w-full h-10 bg-gray-800 border border-gray-700 rounded-lg" />
            </div>
          </div>

          {/* Zeitplanung (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Automatisch aktiv ab (optional)</label>
              <input type="datetime-local" value={toLocal(draft.aktiv_von)} onChange={e => setDraft({ ...draft, aktiv_von: toIso(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">bis (optional)</label>
              <input type="datetime-local" value={toLocal(draft.aktiv_bis)} onChange={e => setDraft({ ...draft, aktiv_bis: toIso(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-500">Schnell:</span>
              <button type="button" onClick={() => setDraft({ ...draft, aktiv_von: new Date().toISOString() })} className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">Ab = jetzt</button>
              {[2, 4, 8].map(h => (
                <button key={h} type="button" onClick={() => setDraft({ ...draft, aktiv_bis: new Date((draft.aktiv_von ? new Date(draft.aktiv_von) : new Date()).getTime() + h * 3600000).toISOString() })}
                  className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">bis +{h} h</button>
              ))}
              <button type="button" onClick={() => setDraft({ ...draft, aktiv_von: null, aktiv_bis: null })} className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs hover:bg-gray-700">leeren</button>
            </div>
            <p className="col-span-2 text-[11px] text-gray-500">Leer = nur manuell per „Aktivieren". Mit Zeitfenster schaltet das Event automatisch ein und wieder aus.</p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Ansicht pro Bildschirm (während des Events)</label>
            {bildschirme.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Keine Bildschirme angelegt.</p>
            ) : (
              <div className="space-y-2">
                {bildschirme.map(bs => {
                  const pid = profilFor(bs.id);
                  const slug = pid ? profileSlug(pid) : null;
                  return (
                    <div key={bs.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-300 w-40 shrink-0 truncate">{bs.name}</span>
                      <select value={pid} onChange={e => setProfil(bs.id, e.target.value ? parseInt(e.target.value) : null)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm">
                        <option value="">— unverändert —</option>
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {slug && (
                        <div className="hidden sm:block w-28 shrink-0 rounded overflow-hidden border border-gray-700 bg-black" style={{ aspectRatio: '16/9' }} title="Vorschau">
                          <iframe src={`/monitor?profil=${slug}`} className="w-full h-full border-0" style={{ pointerEvents: 'none' }} loading="lazy" title={`Vorschau ${bs.name}`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg">
              <Save className="w-4 h-4" /> Speichern
            </button>
            <button onClick={() => setDraft(null)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">Abbrechen</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {events.map(ev => (
          <div key={ev.id} className={`p-3 rounded-xl border ${
            ev.aktiv ? 'bg-violet-900/20 border-violet-500/40' : 'bg-gray-800/20 border-gray-700/40'}`}>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ev.farbe }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white text-sm">{ev.name}</span>
                  {ev.aktiv && <span className="px-2 py-0.5 text-[10px] bg-violet-500/30 text-violet-200 rounded-full">aktiv</span>}
                  {(() => { const b = timeBadge(ev); return b ? <span className={`px-2 py-0.5 text-[10px] rounded-full ${b.cls}`}>{b.text}</span> : null; })()}
                  {collisionIds.has(ev.id) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-red-500/20 text-red-300 rounded-full" title="Überlappt zeitlich mit einem anderen Event auf demselben Bildschirm">
                      <AlertTriangle className="w-3 h-3" /> Überschneidung
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {(ev.zuweisungen || []).length} Bildschirm(e)
                  {ev.aktiv_von && ev.aktiv_bis && <> · läuft automatisch {fmt(ev.aktiv_von)}–{fmt(ev.aktiv_bis)}</>}
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
                        ev.aktiv ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                      {ev.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button onClick={() => start(ev)} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(ev.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>
            {previewId === ev.id && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {(ev.zuweisungen || []).length === 0 && <p className="text-xs text-gray-500">Keine Zuweisungen.</p>}
                {(ev.zuweisungen || []).map(z => {
                  const slug = profileSlug(z.profil_id);
                  const bs = bildschirme.find(b => b.id === z.bildschirm_id);
                  return (
                    <div key={z.bildschirm_id} className="rounded-lg overflow-hidden border border-gray-700">
                      <div className="px-2 py-1 text-[11px] text-gray-400 bg-gray-800/60 truncate">{bs?.name || 'Bildschirm'} → {profileName(z.profil_id)}</div>
                      <div className="bg-black" style={{ aspectRatio: '16/9' }}>
                        {slug && <iframe src={`/monitor?profil=${slug}`} className="w-full h-full border-0" style={{ pointerEvents: 'none' }} loading="lazy" title={`Vorschau ${bs?.name}`} />}
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
            <p className="text-sm">Noch keine Events — z.B. „Tag der offenen Tür" anlegen und bei Bedarf aktivieren.</p>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Klausur-Vorlagen (selbst erstellbar) ────────────────────
function KlausurVorlagenBar({ vorlagen, webuntisLinks, onApply, onSave, onDelete }) {
  const [manage, setManage] = useState(false);
  const [draft, setDraft] = useState(null); // {id?, name, dauer_minuten, anzeige_modus, farbe, split_seite, split_prozent, webuntis_link_id}
  const newDraft = () => ({ name: '', dauer_minuten: 90, anzeige_modus: 'vollbild', farbe: '#1e40af', split_seite: 'rechts', split_prozent: 50, webuntis_link_id: null });
  const save = async () => { if (!draft.name.trim()) { toast.error('Name nötig'); return; } await onSave(draft); setDraft(null); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-500">Vorlage:</span>
        {vorlagen.length === 0 && <span className="text-[11px] text-gray-600">— noch keine —</span>}
        {vorlagen.map(v => (
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
            <button onClick={() => setDraft(newDraft())} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs rounded-lg">
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
                  <input type="number" min={5} value={draft.dauer_minuten} onChange={e => setDraft({ ...draft, dauer_minuten: parseInt(e.target.value) || 90 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Anzeige</label>
                  <select value={draft.anzeige_modus} onChange={e => setDraft({ ...draft, anzeige_modus: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm">
                    <option value="vollbild">Vollbild</option>
                    <option value="split">Splitscreen</option>
                    <option value="standard">Kein Zwang</option>
                  </select>
                </div>
              </div>
              {draft.anzeige_modus === 'split' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-gray-500 mb-0.5">Stundenplan-Link</label>
                    <select value={draft.webuntis_link_id || ''} onChange={e => setDraft({ ...draft, webuntis_link_id: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm">
                      <option value="">— Link der Ansicht —</option>
                      {webuntisLinks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <select value={draft.split_seite} onChange={e => setDraft({ ...draft, split_seite: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm">
                    <option value="links">Klausur links</option><option value="rechts">Klausur rechts</option>
                  </select>
                  <input type="number" min={20} max={80} value={draft.split_prozent} onChange={e => setDraft({ ...draft, split_prozent: parseInt(e.target.value) || 50 })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm" placeholder="% Klausur" />
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <input type="color" value={draft.farbe} onChange={e => setDraft({ ...draft, farbe: e.target.value })} className="h-8 w-12 bg-gray-800 border border-gray-700 rounded" />
                <div className="flex items-center gap-1.5">
                  {['#1e40af', '#b91c1c', '#15803d', '#a16207', '#7c3aed', '#0f766e'].map(c => (
                    <button key={c} type="button" onClick={() => setDraft({ ...draft, farbe: c })} title={c}
                      className={`w-5 h-5 rounded-full border-2 ${(draft.farbe || '').toLowerCase() === c ? 'border-white' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                </div>
                <button onClick={save} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Speichern</button>
                <button onClick={() => setDraft(null)} className="px-3 py-1.5 bg-gray-700 text-white text-xs rounded-lg">Abbrechen</button>
              </div>
            </div>
          )}
          {vorlagen.map(v => (
            <div key={v.id} className="flex items-center gap-2 text-xs text-gray-300">
              <span className="w-2 h-2 rounded-full" style={{ background: v.farbe }} />
              <span className="flex-1">{v.name} · {v.dauer_minuten} Min · {v.anzeige_modus}</span>
              <button onClick={() => setDraft({ ...v })} className="p-1 text-gray-400 hover:text-blue-400"><Edit className="w-3.5 h-3.5" /></button>
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
  const [draft, setDraft] = useState(null); // {id?, name, url, notiz}
  const start = (link) => setDraft(link ? { ...link } : { name: '', url: '', notiz: '' });
  const save = async () => {
    if (!draft.name.trim() || !draft.url.trim()) { toast.error('Name und URL nötig'); return; }
    await onSave(draft);
    setDraft(null);
  };
  return (
    <div className="space-y-3">
      {canEdit && !draft && (
        <button onClick={() => start(null)}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">
          <Plus className="w-4 h-4" /> Neuer Link
        </button>
      )}
      {draft && (
        <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700 space-y-3">
          <input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name (z.B. Klasse 10a — 1 Tag)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <input type="url" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://neilo.webuntis.com/..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <input type="text" value={draft.notiz || ''} onChange={e => setDraft({ ...draft, notiz: e.target.value })}
            placeholder="Notiz (optional)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <div className="flex items-center gap-2">
            <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg">
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
              {l.notiz && <div className="text-xs text-gray-600 mt-0.5">{l.notiz}</div>}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 ml-3 shrink-0">
                <button onClick={() => start(l)} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg"><Edit className="w-4 h-4" /></button>
                <button onClick={() => onDelete(l.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
        {links.length === 0 && !draft && (
          <div className="p-8 text-center text-gray-500">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Noch keine Links — hier einmal anlegen und in Ansicht/Klausur auswählen.</p>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Klausur-Form ────────────────────────────────────────────
function KlausurForm({ initial, bildschirme, webuntisLinks = [], onSave, onCancel }) {
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  };
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const [titel, setTitel] = useState(initial?.titel || 'Klausur');
  const [text, setText] = useState(initial?.text || '');
  const [von, setVon] = useState(initial ? toLocalInput(initial.aktiv_von) : toLocalInput(now));
  const [bis, setBis] = useState(initial ? toLocalInput(initial.aktiv_bis) : toLocalInput(in1h));
  const [farbe, setFarbe] = useState(initial?.farbe || '#1e40af');
  const [bildschirmIds, setBildschirmIds] = useState(initial?.bildschirm_ids || []);
  const [anzeigeModus, setAnzeigeModus] = useState(initial?.anzeige_modus || 'vollbild');
  const [webuntisLinkId, setWebuntisLinkId] = useState(initial?.webuntis_link_id || null);
  const [splitSeite, setSplitSeite] = useState(initial?.split_seite || 'rechts');
  const [splitProzent, setSplitProzent] = useState(initial?.split_prozent || 50);

  const toggleBs = (id) => setBildschirmIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const submit = () => {
    if (!titel.trim() || !von || !bis) return;
    onSave({
      titel, text,
      aktiv_von: new Date(von).toISOString(),
      aktiv_bis: new Date(bis).toISOString(),
      farbe, bildschirm_ids: bildschirmIds,
      anzeige_modus: anzeigeModus,
      webuntis_link_id: webuntisLinkId,
      split_seite: splitSeite,
      split_prozent: splitProzent,
    });
  };

  return (
    <div className="p-4 border border-blue-500/30 rounded-xl bg-blue-900/10 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Titel</label>
          <input type="text" value={titel} onChange={e => setTitel(e.target.value)} autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Farbe</label>
          <div className="flex items-center gap-2">
            <input type="color" value={farbe} onChange={e => setFarbe(e.target.value)}
              className="h-10 w-14 bg-gray-800 border border-gray-700 rounded-lg shrink-0" />
            <div className="flex items-center gap-1.5 flex-wrap">
              {['#1e40af', '#b91c1c', '#15803d', '#a16207', '#7c3aed', '#0f766e'].map(c => (
                <button key={c} type="button" onClick={() => setFarbe(c)} title={c}
                  className={`w-6 h-6 rounded-full border-2 ${farbe.toLowerCase() === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Hinweistext (optional)</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder="z.B. Bitte Ruhe — Klausur läuft bis 10:30"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Von</label>
          <input type="datetime-local" value={von} onChange={e => setVon(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Bis</label>
          <input type="datetime-local" value={bis} onChange={e => setBis(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
      </div>
      {/* Zeit-Schnellbuttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-500">Schnell:</span>
        <button type="button" onClick={() => setVon(toLocalInput(new Date()))} className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">Von = jetzt</button>
        {[45, 60, 90, 120].map(m => (
          <button key={m} type="button" onClick={() => setBis(toLocalInput(new Date((von ? new Date(von) : new Date()).getTime() + m * 60000)))}
            className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">Bis +{m} min</button>
        ))}
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-2">Auf welchen Bildschirmen?</label>
        {bildschirme.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Keine Bildschirme angelegt — zuerst Bildschirme erstellen.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bildschirme.map(bs => (
              <button key={bs.id} type="button" onClick={() => toggleBs(bs.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  bildschirmIds.includes(bs.id)
                    ? 'bg-blue-600/30 border-blue-500/40 text-blue-200'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}>
                {bs.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pt-2 border-t border-blue-500/20 space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Anzeige während der Klausur</label>
          <select value={anzeigeModus} onChange={e => setAnzeigeModus(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
            <option value="vollbild">Vollbild (Klausur-Hinweis)</option>
            <option value="split">Splitscreen (Klausur + Stundenplan)</option>
            <option value="standard">Kein Zwang (Ansicht-Layout)</option>
          </select>
        </div>
        {anzeigeModus === 'split' && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-800/40 rounded-lg">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Stundenplan-Link (WebUntis)</label>
              <select value={webuntisLinkId || ''} onChange={e => setWebuntisLinkId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                <option value="">— Link der Ansicht nutzen —</option>
                {webuntisLinks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Klausur-Seite</label>
              <select value={splitSeite} onChange={e => setSplitSeite(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                <option value="links">Links</option>
                <option value="rechts">Rechts</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Breite Klausur: {splitProzent}%</label>
              <input type="range" min={20} max={80} step={5} value={splitProzent}
                onChange={e => setSplitProzent(parseInt(e.target.value))} className="w-full accent-blue-500" />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-blue-500/20">
        <button onClick={onCancel} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
        <button onClick={submit} disabled={!titel.trim() || bildschirmIds.length === 0}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2">
          <Save className="w-3.5 h-3.5" /> Speichern
        </button>
      </div>
    </div>
  );
}

// ─── Klausur-Card (editierbar inline) ───────────────────────
function KlausurCard({ klausur, bildschirme, webuntisLinks = [], canEdit, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const von = new Date(klausur.aktiv_von);
  const bis = new Date(klausur.aktiv_bis);
  const now = new Date();
  const isLive = von <= now && now <= bis;
  const isPast = bis < now;

  if (editing) {
    return (
      <KlausurForm
        initial={klausur}
        bildschirme={bildschirme}
        webuntisLinks={webuntisLinks}
        onSave={(payload) => { onSave(payload); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      isLive ? 'bg-blue-900/20 border-blue-500/40' : isPast ? 'bg-gray-800/20 border-gray-700/40 opacity-60' : 'bg-gray-800/30 border-gray-700/40'
    }`}>
      <div className="w-2 h-10 rounded-full shrink-0" style={{ background: klausur.farbe }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white truncate">{klausur.titel}</span>
          {isLive && <span className="px-1.5 py-0.5 text-[9px] bg-red-600/30 text-red-300 border border-red-500/30 rounded-full animate-pulse">LIVE</span>}
          {isPast && <span className="px-1.5 py-0.5 text-[9px] bg-gray-700 text-gray-400 rounded-full">Vergangen</span>}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {von.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          {' – '}
          {bis.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {(klausur.bildschirm_ids || []).map(id => {
            const bs = bildschirme.find(b => b.id === id);
            return bs ? <span key={id} className="px-1.5 py-0.5 text-[9px] bg-gray-700/60 text-gray-300 rounded">{bs.name}</span> : null;
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
