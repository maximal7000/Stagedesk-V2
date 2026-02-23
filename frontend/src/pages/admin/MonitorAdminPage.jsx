/**
 * Monitor-Konfiguration — Admin-Seite (Multi-Profil)
 * Features: Profil-Management, Zeitplan-Editor, Layout-Modi, ON AIR Anpassung
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE = API_BASE.replace(/\/api\/?$/, '');

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// ─── Collapsible Section ────────────────────────────────────────
function Section({ id, title, description, icon: Icon, iconColor, open, onToggle, badge, statusDot, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => onToggle(id)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-800/40 transition-colors group">
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
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-gray-800/50 pt-4">{children}</div>}
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
  const [showPreview, setShowPreview] = useState(false);
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

  // Sections
  const [openSections, setOpenSections] = useState({
    profil: true,
    allgemein: false,
    widgets: true,
    onair: false,
    oepnv: false,
    theme: false,
    medien: false,
    ankuendigungen: false,
    api: false,
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
      if (profs.length > 0) {
        const std = profs.find(p => p.ist_standard) || profs[0];
        setActiveProfileId(std.id);
        fetchConfigForProfile(std.id);
      }
    })();
  }, [fetchProfiles, fetchConfigForProfile]);

  // Switch profile
  const switchProfile = (id) => {
    if (hasChanges && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    setActiveProfileId(id);
    fetchConfigForProfile(id);
  };

  // Ctrl+S Shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && canEdit) handleSaveMonitorConfig();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

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
    'zeige_webuntis','webuntis_url','webuntis_zoom','webuntis_dark_mode',
    'zeige_hintergrundbild','aktives_hintergrundbild_id',
    'zeige_qr_code','qr_code_url','qr_code_label',
    'zeige_freitext','freitext_titel','freitext_inhalt',
    'zeige_raumplan','raumplan_server','raumplan_schule','raumplan_raum','raumplan_benutzername','raumplan_passwort',
    'zeige_eigener_countdown','eigener_countdown_name','eigener_countdown_datum',
    'zeige_bildschirmschoner','bildschirmschoner_timeout',
    'zeige_seitenrotation','seitenrotation_intervall','seitenrotation_seiten',
    'zeige_oepnv','oepnv_stationen','oepnv_dauer','oepnv_max_abfahrten',
    'oepnv_zeige_bus','oepnv_zeige_bahn','oepnv_zeige_fernverkehr','oepnv_api_db','oepnv_api_nahsh',
    'on_air_text','on_air_groesse','on_air_position','on_air_blinken','on_air_farbe','on_air_vollbild',
    'refresh_intervall',
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
      toast.success(`Profil "${res.data.name}" erstellt`);
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleDeleteProfile = async (id) => {
    const prof = profiles.find(p => p.id === id);
    if (!prof || prof.ist_standard) return;
    if (!confirm(`Profil "${prof.name}" wirklich löschen?`)) return;
    try {
      await apiClient.delete(`/monitor/profile/${id}`);
      const profs = await fetchProfiles();
      const std = profs.find(p => p.ist_standard) || profs[0];
      if (activeProfileId === id) {
        setActiveProfileId(std.id);
        fetchConfigForProfile(std.id);
      }
      toast.success('Profil gelöscht');
    } catch { toast.error('Fehler beim Löschen'); }
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
      await apiClient.post('/monitor/dateien', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
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

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* ═══ Sticky Header ═══ */}
      <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/50">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
              <Monitor className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Monitor-Konfiguration</h1>
              {hasChanges && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Ungespeicherte Änderungen
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPreview(!showPreview)}
              className={`p-2.5 rounded-xl transition-colors ${showPreview ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title="Live-Vorschau">
              <Eye className="w-4 h-4" />
            </button>
            <a href={`/monitor${monitorConfig?.slug ? `?profil=${monitorConfig.slug}` : ''}`} target="_blank" rel="noopener noreferrer"
              className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl" title="In neuem Tab öffnen">
              <ExternalLink className="w-4 h-4" />
            </a>
            {canEdit && (
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
      </div>

      {!monitorConfig ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* ═══ Profil-Tabs ═══ */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              {profiles.map(p => (
                <button key={p.id} onClick={() => switchProfile(p.id)}
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
              ))}
              {canEdit && (
                <button onClick={() => setShowNewProfile(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 border border-dashed border-gray-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Neues Profil
                </button>
              )}
            </div>

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
                      <option value="standard">Standard-Layout</option>
                      <option value="stundenplan">Stundenplan-Vollbild</option>
                      <option value="onair">ON AIR Display</option>
                      <option value="abfahrten">Abfahrtsmonitor (ÖPNV)</option>
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

          {/* ═══ Mini Preview ═══ */}
          {showPreview && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
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
                  src={`/monitor?profil=${monitorConfig.slug}`}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Monitor Preview"
                  style={{ pointerEvents: 'none' }}
                />
              </div>
            </div>
          )}

          {/* ═══ Status Dashboard ═══ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`rounded-xl p-3.5 border transition-colors ${monitorConfig.ist_on_air ? 'bg-red-900/20 border-red-600/50' : 'bg-gray-900 border-gray-800'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">ON AIR</p>
                  <p className={`text-sm font-bold ${monitorConfig.ist_on_air ? 'text-red-400' : 'text-gray-400'}`}>
                    {monitorConfig.ist_on_air ? 'LIVE' : 'Aus'}
                  </p>
                </div>
                <Radio className={`w-5 h-5 ${monitorConfig.ist_on_air ? 'text-red-500 animate-pulse' : 'text-gray-700'}`} />
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Layout</p>
                  <p className="text-sm font-bold text-white">{{ standard: 'Standard', stundenplan: 'Stundenplan', onair: 'ON AIR', abfahrten: 'Abfahrten' }[monitorConfig.layout_modus] || 'Standard'}</p>
                </div>
                <Layers className="w-5 h-5 text-purple-500" />
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Dateien</p>
                  <p className="text-sm font-bold text-white">{monitorDateien.length}</p>
                </div>
                <Image className="w-5 h-5 text-pink-500" />
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Meldungen</p>
                  <p className="text-sm font-bold text-white">{monitorAnkuendigungen.length}</p>
                </div>
                <Megaphone className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </div>

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

          {/* ═══ Profil & Zeitplan ═══ */}
          <Section id="profil" title="Profil & Zeitplan" description="Name, Layout-Modus und automatische Zeitsteuerung"
            icon={CalendarClock} iconColor="bg-green-600/30" open={openSections.profil} onToggle={toggleSection}
            badge={monitorConfig.zeitplan?.length || null}>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Profil-Name</label>
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
                  <option value="standard">Standard-Layout</option>
                  <option value="stundenplan">Stundenplan-Vollbild</option>
                  <option value="onair">ON AIR Display</option>
                  <option value="abfahrten">Abfahrtsmonitor (ÖPNV)</option>
                </select>
              </div>
            </div>

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

            <div className="flex items-center gap-3">
              <Toggle checked={monitorConfig.ist_standard} onChange={v => updateConfig('ist_standard', v)} disabled={!canEdit} />
              <div>
                <span className="text-sm text-white">Standard-Profil</span>
                <p className="text-xs text-gray-500">Wird angezeigt wenn kein anderes Profil per Zeitplan aktiv ist</p>
              </div>
            </div>

            {/* Monitor-URL */}
            <div className="flex items-center gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-800">
              <Monitor className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Monitor-URL für dieses Profil</p>
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
                  <p className="text-xs text-gray-500">Wann wird dieses Profil automatisch aktiv?</p>
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
                  <p className="text-gray-500 text-sm">Kein Zeitplan — Profil wird nur per URL oder als Standard angezeigt.</p>
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

            {/* Delete Profile */}
            {canEdit && !monitorConfig.ist_standard && (
              <div className="pt-2 border-t border-gray-800">
                <button onClick={() => handleDeleteProfile(activeProfileId)}
                  className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg text-sm">
                  <Trash2 className="w-3.5 h-3.5" /> Profil löschen
                </button>
              </div>
            )}
          </Section>

          {/* ═══ Allgemein ═══ */}
          <Section id="allgemein" title="Allgemein" description="Titel, Refresh und Import/Export"
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
          <Section id="onair" title="ON AIR Anpassung" description="Größe, Position, Farbe und Verhalten"
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

            {/* Größe */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Größe</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { v: 'klein', l: 'Klein', desc: 'Dezent' },
                  { v: 'mittel', l: 'Mittel', desc: 'Standard' },
                  { v: 'gross', l: 'Groß', desc: 'Auffällig' },
                  { v: 'riesig', l: 'Riesig', desc: 'Maximum' },
                ].map(s => (
                  <button key={s.v} onClick={() => canEdit && updateConfig('on_air_groesse', s.v)}
                    disabled={!canEdit}
                    className={`py-2.5 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                      monitorConfig.on_air_groesse === s.v
                        ? 'bg-red-600/20 border-red-500/40 text-red-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-800/80'
                    }`}>
                    <div className="font-medium">{s.l}</div>
                    <div className="text-[10px] opacity-60">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Position */}
            <div>
              <label className="block text-xs text-gray-400 mb-2 font-medium">Position</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'banner-oben', l: 'Banner oben', desc: 'Volle Breite oben', icon: '▬' },
                  { v: 'banner-unten', l: 'Banner unten', desc: 'Volle Breite unten', icon: '▬' },
                  { v: 'mitte', l: 'Mitte', desc: 'Overlay zentriert', icon: '◉' },
                  { v: 'oben-links', l: 'Oben links', desc: 'Ecke oben links', icon: '◤' },
                  { v: 'oben-mitte', l: 'Oben Mitte', desc: 'Oben zentriert', icon: '▲' },
                  { v: 'oben-rechts', l: 'Oben rechts', desc: 'Ecke oben rechts', icon: '◥' },
                  { v: 'unten-links', l: 'Unten links', desc: 'Ecke unten links', icon: '◣' },
                  { v: 'unten-mitte', l: 'Unten Mitte', desc: 'Unten zentriert', icon: '▼' },
                  { v: 'unten-rechts', l: 'Unten rechts', desc: 'Ecke unten rechts', icon: '◢' },
                ].map(p => (
                  <button key={p.v} onClick={() => canEdit && updateConfig('on_air_position', p.v)}
                    disabled={!canEdit}
                    className={`py-2.5 px-3 rounded-lg text-sm border transition-colors disabled:opacity-50 text-left ${
                      monitorConfig.on_air_position === p.v
                        ? 'bg-red-600/20 border-red-500/40 text-red-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-800/80'
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{p.icon}</span>
                      <div>
                        <div className="font-medium text-xs">{p.l}</div>
                        <div className="text-[10px] opacity-60">{p.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Blinken */}
            <div className="flex items-center gap-3">
              <Toggle checked={monitorConfig.on_air_blinken} onChange={v => updateConfig('on_air_blinken', v)} disabled={!canEdit} />
              <span className="text-sm text-white">Blinken / Pulsieren</span>
            </div>

            {/* Vollbild Override */}
            <div className="flex items-center gap-3">
              <Toggle checked={monitorConfig.on_air_vollbild} onChange={v => updateConfig('on_air_vollbild', v)} disabled={!canEdit} />
              <div>
                <span className="text-sm text-white">Bei ON AIR automatisch Vollbild</span>
                <p className="text-xs text-gray-500 mt-0.5">Überschreibt das aktuelle Layout und zeigt die ON AIR Vollbild-Anzeige</p>
              </div>
            </div>

            {/* Live-Vorschau mit Position */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Vorschau</label>
              <div className="relative bg-gray-950 rounded-xl border border-gray-700/40 overflow-hidden" style={{ height: '200px' }}>
                {/* Mini-Monitor Hintergrund */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-white/5 text-xs">Monitor</div>
                </div>
                {(() => {
                  const f = monitorConfig.on_air_farbe || monitorConfig.akzent_farbe || '#da1f3d';
                  const blink = monitorConfig.on_air_blinken ? 'animate-pulse' : '';
                  const sizeClasses = {
                    klein: 'text-xs px-2 py-1',
                    mittel: 'text-sm px-3 py-1.5',
                    gross: 'text-lg px-5 py-2.5',
                    riesig: 'text-2xl px-7 py-3',
                  };
                  const sc = sizeClasses[monitorConfig.on_air_groesse] || sizeClasses.gross;
                  const pos = monitorConfig.on_air_position || 'banner-oben';

                  const badge = (
                    <div className={`${blink} rounded-lg font-black tracking-wider whitespace-nowrap ${sc}`}
                      style={{ background: f, color: '#fff', boxShadow: `0 4px 20px ${f}60` }}>
                      {monitorConfig.on_air_text || 'ON AIR'}
                    </div>
                  );

                  if (pos === 'banner-oben') return (
                    <div className="absolute top-0 left-0 right-0">
                      <div className={`${blink} flex items-center justify-center ${sc}`}
                        style={{ background: f, color: '#fff' }}>
                        <span className="font-black tracking-wider">{monitorConfig.on_air_text || 'ON AIR'}</span>
                      </div>
                    </div>
                  );
                  if (pos === 'banner-unten') return (
                    <div className="absolute bottom-0 left-0 right-0">
                      <div className={`${blink} flex items-center justify-center ${sc}`}
                        style={{ background: f, color: '#fff' }}>
                        <span className="font-black tracking-wider">{monitorConfig.on_air_text || 'ON AIR'}</span>
                      </div>
                    </div>
                  );
                  if (pos === 'mitte') return <div className="absolute inset-0 flex items-center justify-center">{badge}</div>;
                  if (pos === 'oben-links') return <div className="absolute top-3 left-3">{badge}</div>;
                  if (pos === 'oben-mitte') return <div className="absolute top-3 left-1/2 -translate-x-1/2">{badge}</div>;
                  if (pos === 'oben-rechts') return <div className="absolute top-3 right-3">{badge}</div>;
                  if (pos === 'unten-links') return <div className="absolute bottom-3 left-3">{badge}</div>;
                  if (pos === 'unten-mitte') return <div className="absolute bottom-3 left-1/2 -translate-x-1/2">{badge}</div>;
                  if (pos === 'unten-rechts') return <div className="absolute bottom-3 right-3">{badge}</div>;
                  return <div className="absolute top-3 right-3">{badge}</div>;
                })()}
              </div>
            </div>
          </Section>

          {/* ═══ Widgets ═══ */}
          <Section id="widgets" title="Widgets & Bereiche" description={`${activeWidgets} von ${widgetKeys.length} aktiv`}
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
              </div>
            ))}

            {/* ── Widget Settings ── */}
            <div className="space-y-3 border-t border-gray-800 pt-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Widget-Einstellungen</p>

              {monitorConfig.zeige_ticker && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Type className="w-4 h-4 text-blue-400" /> Ticker</h4>
                  <input type="text" value={monitorConfig.ticker_text} onChange={e => updateConfig('ticker_text', e.target.value)}
                    disabled={!canEdit} placeholder="Text der durchläuft..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Geschwindigkeit: {monitorConfig.ticker_geschwindigkeit} px/s</label>
                    <input type="range" min={10} max={200} value={monitorConfig.ticker_geschwindigkeit}
                      onChange={e => updateConfig('ticker_geschwindigkeit', parseInt(e.target.value))}
                      disabled={!canEdit} className="w-full accent-blue-500" />
                  </div>
                </div>
              )}

              {monitorConfig.zeige_wetter && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><CloudSun className="w-4 h-4 text-yellow-400" /> Wetter</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Stadt</label>
                      <input type="text" value={monitorConfig.wetter_stadt} onChange={e => updateConfig('wetter_stadt', e.target.value)}
                        disabled={!canEdit} placeholder="z.B. Lübeck"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">OpenWeatherMap API-Key</label>
                      <input type="password" value={monitorConfig.wetter_api_key} onChange={e => updateConfig('wetter_api_key', e.target.value)}
                        disabled={!canEdit} placeholder="API-Key"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                  </div>
                </div>
              )}

              {monitorConfig.zeige_webuntis && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-purple-400" /> WebUntis iFrame</h4>
                  <input type="url" value={monitorConfig.webuntis_url} onChange={e => updateConfig('webuntis_url', e.target.value)}
                    disabled={!canEdit} placeholder="https://neilo.webuntis.com/..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Zoom: {monitorConfig.webuntis_zoom}%</label>
                      <input type="range" min={50} max={150} value={monitorConfig.webuntis_zoom}
                        onChange={e => updateConfig('webuntis_zoom', parseInt(e.target.value))}
                        disabled={!canEdit} className="w-full accent-purple-500" />
                    </div>
                    <div className="flex items-end">
                      <button onClick={() => canEdit && updateConfig('webuntis_dark_mode', !monitorConfig.webuntis_dark_mode)}
                        disabled={!canEdit}
                        className={`px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                          monitorConfig.webuntis_dark_mode ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-400'
                        }`}>
                        <Moon className="w-4 h-4 inline mr-1" /> Dark-Mode
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {monitorConfig.zeige_qr_code && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><QrCode className="w-4 h-4 text-emerald-400" /> QR-Code</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">URL</label>
                      <input type="url" value={monitorConfig.qr_code_url} onChange={e => updateConfig('qr_code_url', e.target.value)}
                        disabled={!canEdit} placeholder="https://..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Beschriftung</label>
                      <input type="text" value={monitorConfig.qr_code_label} onChange={e => updateConfig('qr_code_label', e.target.value)}
                        disabled={!canEdit} placeholder="z.B. Event-Anmeldung"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                  </div>
                </div>
              )}

              {monitorConfig.zeige_freitext && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><AlignLeft className="w-4 h-4 text-teal-400" /> Freier Textblock</h4>
                  <input type="text" value={monitorConfig.freitext_titel} onChange={e => updateConfig('freitext_titel', e.target.value)}
                    disabled={!canEdit} placeholder="Titel"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                  <textarea value={monitorConfig.freitext_inhalt} onChange={e => updateConfig('freitext_inhalt', e.target.value)}
                    disabled={!canEdit} placeholder="Inhalt..." rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 resize-none disabled:opacity-50" />
                </div>
              )}

              {monitorConfig.zeige_raumplan && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-indigo-400" /> Raumplan (WebUntis API)</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Server</label>
                      <input type="text" value={monitorConfig.raumplan_server} onChange={e => updateConfig('raumplan_server', e.target.value)}
                        disabled={!canEdit} placeholder="katharineum.webuntis.com"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Schule</label>
                      <input type="text" value={monitorConfig.raumplan_schule} onChange={e => updateConfig('raumplan_schule', e.target.value)}
                        disabled={!canEdit} placeholder="katharineum"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Raum-Kürzel</label>
                      <input type="text" value={monitorConfig.raumplan_raum} onChange={e => updateConfig('raumplan_raum', e.target.value)}
                        disabled={!canEdit} placeholder="Aul"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Benutzername (optional)</label>
                      <input type="text" value={monitorConfig.raumplan_benutzername} onChange={e => updateConfig('raumplan_benutzername', e.target.value)}
                        disabled={!canEdit} placeholder="Leer = Anonym"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Passwort (optional)</label>
                      <input type="password" value={monitorConfig.raumplan_passwort} onChange={e => updateConfig('raumplan_passwort', e.target.value)}
                        disabled={!canEdit} placeholder="Passwort"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                  </div>
                </div>
              )}

              {monitorConfig.zeige_eigener_countdown && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Timer className="w-4 h-4 text-amber-400" /> Eigener Countdown</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Event-Name</label>
                      <input type="text" value={monitorConfig.eigener_countdown_name} onChange={e => updateConfig('eigener_countdown_name', e.target.value)}
                        disabled={!canEdit} placeholder="z.B. Schulkonzert"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Datum & Uhrzeit</label>
                      <input type="datetime-local" value={monitorConfig.eigener_countdown_datum ? monitorConfig.eigener_countdown_datum.slice(0, 16) : ''}
                        onChange={e => updateConfig('eigener_countdown_datum', e.target.value ? e.target.value + ':00Z' : null)}
                        disabled={!canEdit}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
                    </div>
                  </div>
                </div>
              )}

              {monitorConfig.zeige_bildschirmschoner && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><MonitorOff className="w-4 h-4 text-cyan-400" /> Bildschirmschoner</h4>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Timeout: {monitorConfig.bildschirmschoner_timeout} Minuten</label>
                    <input type="range" min={1} max={60} value={monitorConfig.bildschirmschoner_timeout}
                      onChange={e => updateConfig('bildschirmschoner_timeout', parseInt(e.target.value))}
                      disabled={!canEdit} className="w-full accent-cyan-500" />
                  </div>
                </div>
              )}

              {monitorConfig.zeige_seitenrotation && (
                <div className="p-4 bg-gray-800/30 rounded-xl space-y-3 border border-gray-700/40">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2"><RotateCw className="w-4 h-4 text-pink-400" /> Seitenrotation</h4>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Intervall: {monitorConfig.seitenrotation_intervall} Sekunden</label>
                    <input type="range" min={5} max={120} value={monitorConfig.seitenrotation_intervall}
                      onChange={e => updateConfig('seitenrotation_intervall', parseInt(e.target.value))}
                      disabled={!canEdit} className="w-full accent-pink-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">Seiten zum Rotieren</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { id: 'main', label: 'Hauptansicht' },
                        { id: 'veranstaltungen', label: 'Veranstaltungen' },
                        { id: 'ankuendigungen', label: 'Ankündigungen' },
                        { id: 'raumplan', label: 'Raumplan' },
                        { id: 'wetter', label: 'Wetter' },
                        { id: 'slideshow', label: 'Slideshow' },
                        { id: 'pdf', label: 'PDF' },
                        { id: 'freitext', label: 'Freier Text' },
                      ].map(page => {
                        const selected = (monitorConfig.seitenrotation_seiten || []).includes(page.id);
                        return (
                          <button key={page.id}
                            onClick={() => {
                              if (!canEdit) return;
                              const seiten = monitorConfig.seitenrotation_seiten || [];
                              updateConfig('seitenrotation_seiten', selected ? seiten.filter(s => s !== page.id) : [...seiten, page.id]);
                            }}
                            disabled={!canEdit}
                            className={`p-2 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
                              selected ? 'bg-pink-600/20 border-pink-500/40 text-pink-300' : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}>
                            {page.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {!monitorConfig.zeige_ticker && !monitorConfig.zeige_wetter && !monitorConfig.zeige_webuntis &&
               !monitorConfig.zeige_qr_code && !monitorConfig.zeige_freitext && !monitorConfig.zeige_raumplan &&
               !monitorConfig.zeige_eigener_countdown && !monitorConfig.zeige_bildschirmschoner && !monitorConfig.zeige_seitenrotation && (
                <p className="text-sm text-gray-600 text-center py-4">Aktiviere Widgets mit zusätzlichen Einstellungen, um sie hier zu konfigurieren.</p>
              )}
            </div>
          </Section>

          {/* ═══ Theme & Farben ═══ */}
          <Section id="theme" title="Theme & Farben" description="Farbschema und Design-Vorlagen"
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
          <Section id="medien" title="Medien & Dateien" description="Logos, Bilder, PDFs und Hintergründe"
            icon={Image} iconColor="bg-pink-600/30" open={openSections.medien} onToggle={toggleSection}
            badge={monitorDateien.length}>

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
          <Section id="ankuendigungen" title="Ankündigungen" description="Meldungen auf dem Display anzeigen"
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

          {/* ═══ ÖPNV Abfahrten (nur bei Abfahrtsmonitor-Layout) ═══ */}
          {monitorConfig.layout_modus === 'abfahrten' && (
          <Section id="oepnv" title="ÖPNV Abfahrten" description="Stationen und Filter für den Abfahrtsmonitor"
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
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">Zeige:</span>
                        {[
                          { key: 'zeige_bus', label: 'Bus' },
                          { key: 'zeige_bahn', label: 'Nahverkehr' },
                          { key: 'zeige_fernverkehr', label: 'Fernverkehr' },
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

            {(monitorConfig.oepnv_stationen || []).length === 0 && (
              <div className="p-6 text-center text-gray-500">
                <Activity className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Noch keine Stationen konfiguriert</p>
                <p className="text-xs mt-1">Oben nach einer Haltestelle oder einem Bahnhof suchen</p>
              </div>
            )}
          </Section>
          )}

          {/* ═══ API & Token ═══ */}
          <Section id="api" title="API & Token" description="Externe Steuerung per ATEM, HTTP etc."
            icon={Key} iconColor="bg-gray-600/30" open={openSections.api} onToggle={toggleSection}>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">API-Token (für dieses Profil)</label>
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
              <p className="text-gray-400 font-medium mb-2">Beispiel-Requests (ON AIR betrifft alle Profile):</p>
              <div className="font-mono text-gray-500 space-y-1.5">
                <p><span className="text-green-400">POST</span> /api/monitor/onair <span className="text-gray-600">{'{"on_air": true}'}</span></p>
                <p><span className="text-amber-400">POST</span> /api/monitor/notfall <span className="text-gray-600">{'{"aktiv": true, "text": "..."}'}</span></p>
                <p className="border-t border-gray-700/40 pt-1.5"><span className="text-blue-400">Header:</span> X-Monitor-Token: {'<token>'}</p>
              </div>
            </div>
          </Section>
        </>
      )}

      {/* Hidden Inputs */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadFile}
        accept={uploadTyp === 'pdf' ? '.pdf' : 'image/*'} />
    </div>
  );
}
