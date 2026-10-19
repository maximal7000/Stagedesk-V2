/**
 * Kompetenzen-Modul: Eigene Kompetenzen, Scoreboard, Admin-Funktionen.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Award, Trophy, ChevronDown, ChevronRight, CheckCircle2,
  AlertTriangle, Circle, Users, Settings, Download, BarChart3,
  Medal, Clock, TrendingUp, Search, Loader2, ArrowLeft, MapPin, Infinity,
} from 'lucide-react';
import apiClient from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import { Button, EmptyState, PageHeader, StatTile, StatusBadge as UiBadge } from '../../components/ui';
import KompetenzAdminTab from './KompetenzAdminTab';
import SkillGapTab from './SkillGapTab';
import KompetenzHistorieGraph from './KompetenzHistorieGraph';

// ─── Utilities ────────────────────────────────────────────────────

// Farbstrich links am Kategorie-Kopf (Kategorie-Farbe aus dem Katalog)
const KATEGORIE_STRICH = {
  gray: 'bg-gray-500', yellow: 'bg-amber-500', blue: 'bg-blue-500',
  purple: 'bg-purple-500', green: 'bg-green-500',
};

function ukStatus(uk) {
  const unbegrenzt = uk.hat_kompetenz && uk.erworben_am && !uk.ablauf_am;
  if (unbegrenzt) return 'unbegrenzt';
  if (uk.hat_kompetenz && !uk.ist_abgelaufen) return 'aktiv';
  if (uk.hat_kompetenz && uk.ist_abgelaufen) return 'abgelaufen';
  if (uk.tage_bis_ablauf !== null && uk.tage_bis_ablauf !== undefined && uk.tage_bis_ablauf <= 14 && uk.ist_aktiv) {
    return 'warnung';
  }
  return 'fehlt';
}

function StatusBadge({ uk }) {
  const s = ukStatus(uk);
  const cfg = {
    aktiv: { icon: CheckCircle2, cls: 'text-green-400', label: 'Aktiv' },
    unbegrenzt: { icon: CheckCircle2, cls: 'text-green-400', label: 'Aktiv · läuft nicht ab' },
    warnung: { icon: Clock, cls: 'text-amber-400', label: `Läuft in ${uk.tage_bis_ablauf} Tagen ab` },
    abgelaufen: { icon: AlertTriangle, cls: 'text-red-400', label: 'Abgelaufen' },
    fehlt: { icon: Circle, cls: 'text-gray-500', label: 'Nicht vorhanden' },
  }[s];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cfg.cls}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

function ProgressBar({ percent, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-amber-500',
    purple: 'bg-purple-500',
  };
  return (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full ${colors[color] || colors.blue} transition-all`}
           style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

// ─── Kategorie-Accordion (Meine Kompetenzen / User-Ansicht) ──────

function KompetenzAccordion({ kompetenzen, kategorien, isAdmin, onToggle, onSaveStufen, targetKid, showToggle }) {
  const [open, setOpen] = useState({});
  const [editingStufen, setEditingStufen] = useState(null); // uk.id or null

  // Gruppieren: Kategorie → (Gruppe | null) → Kompetenz
  const grouped = useMemo(() => {
    const out = {};
    for (const uk of kompetenzen) {
      const kat = uk.kategorie_name;
      const gruppe = uk.gruppe_name || '_';
      if (!out[kat]) out[kat] = {};
      if (!out[kat][gruppe]) out[kat][gruppe] = [];
      out[kat][gruppe].push(uk);
    }
    return out;
  }, [kompetenzen]);

  const katStats = useMemo(() => {
    const stats = {};
    for (const [kat, gruppen] of Object.entries(grouped)) {
      let gesamt = 0, aktiv = 0;
      for (const items of Object.values(gruppen)) {
        gesamt += items.length;
        aktiv += items.filter(uk => uk.ist_aktiv).length;
      }
      stats[kat] = { gesamt, aktiv, prozent: gesamt ? (aktiv / gesamt) * 100 : 0 };
    }
    return stats;
  }, [grouped]);

  const toggle = (key) => setOpen(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([kat, gruppen]) => {
        const katDef = kategorien.find(k => k.name === kat);
        const farbe = katDef?.farbe || 'blue';
        const stats = katStats[kat];
        const isOpen = open[kat] !== false;
        return (
          <div key={kat} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle(kat)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-800/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-1 self-stretch rounded-full ${KATEGORIE_STRICH[farbe] || KATEGORIE_STRICH.blue}`} aria-hidden="true" />
                {isOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" /> : <ChevronRight className="w-4 h-4 shrink-0 text-gray-500" />}
                <div className="text-left min-w-0">
                  <div className="font-display text-lg font-semibold tracking-tight text-white truncate leading-tight">{kat}</div>
                  <div className="text-xs text-gray-400 tabular-nums">{stats.aktiv} von {stats.gesamt} aktiv</div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold tabular-nums text-gray-300 w-10 text-right">{stats.prozent.toFixed(0)}%</span>
                <div className="w-28"><ProgressBar percent={stats.prozent} color={farbe} /></div>
              </div>
            </button>
            {isOpen && (
              <div className="p-4 pt-0 space-y-3">
                {Object.entries(gruppen).map(([gruppe, items]) => (
                  <div key={gruppe}>
                    {gruppe !== '_' && (
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.12em] mt-3 mb-1.5 pl-2.5">
                        {gruppe}
                      </div>
                    )}
                    <div className="space-y-1">
                      {items.map(uk => {
                        const hatCustomStufen = uk.custom_ablauf_stufen && uk.custom_ablauf_stufen.length > 0;
                        return (
                          <div key={uk.kompetenz_id}
                               className="rounded-lg hover:bg-gray-800/60 transition-colors">
                            <div className="flex items-center justify-between gap-3 p-2.5">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {showToggle ? (
                                  <input
                                    type="checkbox"
                                    checked={uk.hat_kompetenz && !uk.ist_abgelaufen}
                                    onChange={(e) => onToggle(uk, e.target.checked)}
                                    aria-label={`${uk.kompetenz_name} bestätigen`}
                                    className="w-4 h-4 rounded cursor-pointer accent-accent focus-visible:ring-2 focus-visible:ring-accent"
                                  />
                                ) : (
                                  <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                    {uk.ist_aktiv ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                                     uk.ist_abgelaufen ? <AlertTriangle className="w-4 h-4 text-red-400" /> :
                                     <Circle className="w-4 h-4 text-gray-600" />}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm text-white truncate">{uk.kompetenz_name}</div>
                                    {hatCustomStufen && (
                                      <span title="Individuelle Ablauf-Stufen aktiv" className="shrink-0">
                                        <UiBadge tone="warning" label="Individuell" />
                                      </span>
                                    )}
                                  </div>
                                  <StatusBadge uk={uk} />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {showToggle && onSaveStufen && (
                                  <button type="button"
                                    onClick={() => setEditingStufen(editingStufen === uk.kompetenz_id ? null : uk.kompetenz_id)}
                                    title="Individuelle Ablauf-Stufen"
                                    aria-label="Individuelle Ablauf-Stufen bearbeiten"
                                    className={`p-1.5 rounded-lg hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                      hatCustomStufen ? 'text-amber-400' : 'text-gray-500 hover:text-white'
                                    }`}>
                                    <Clock className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <div className="text-xs text-gray-500 tabular-nums">
                                  {uk.punkte} P
                                </div>
                              </div>
                            </div>
                            {editingStufen === uk.kompetenz_id && showToggle && onSaveStufen && (
                              <StufenEditor
                                uk={uk}
                                onSave={async (stufen) => {
                                  await onSaveStufen(uk, stufen);
                                  setEditingStufen(null);
                                }}
                                onClose={() => setEditingStufen(null)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StufenEditor({ uk, onSave, onClose }) {
  const [value, setValue] = useState((uk.custom_ablauf_stufen || []).join(', '));
  const [saving, setSaving] = useState(false);
  const hatCustom = uk.custom_ablauf_stufen && uk.custom_ablauf_stufen.length > 0;
  const effektiv = uk.effektive_stufen || [];

  const parse = () => value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0);

  const save = async (stufen) => {
    setSaving(true);
    try { await onSave(stufen); } finally { setSaving(false); }
  };

  const istUnbegrenzt = hatCustom && uk.custom_ablauf_stufen.every(n => n === 0);

  return (
    <div className="px-3 pb-3 pt-2 border-t border-gray-700/40 text-xs">
      <div className="text-gray-400 mb-2">
        Effektiv: <span className="text-gray-300 tabular-nums">
          {effektiv.length && effektiv.every(n => n === 0) ? 'läuft nicht ab' : (effektiv.length ? `${effektiv.join(', ')} Tage` : 'Keine Angabe')}
        </span>
        {hatCustom && <span className="ml-2 text-amber-400">(individuell)</span>}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tage, z.B. 30, 60, 90, 180 (0 = läuft nicht ab)"
          className="flex-1 min-w-[12rem] bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <Button type="button" variant="primary" size="sm" disabled={saving} onClick={() => save(parse())}>
          Speichern
        </Button>
        <button type="button" disabled={saving || istUnbegrenzt} onClick={() => save([0])}
                title="Läuft nie ab"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 rounded-lg hover:bg-emerald-500/25 disabled:opacity-50 disabled:pointer-events-none text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Infinity className="w-3.5 h-3.5" /> Unbegrenzt
        </button>
        {hatCustom && (
          <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => save([])}
                  title="Auf Standard zurücksetzen">
            Zurücksetzen
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
      </div>
      <p className="text-gray-500 mt-2">
        Leer lassen für den Standard aus Kompetenz oder globaler Einstellung. <code>0</code> oder „Unbegrenzt" heißt: läuft nie ab. Nach dem Speichern wird bei aktiver Kompetenz das nächste Ablaufdatum neu berechnet.
      </p>
    </div>
  );
}

// ─── Scoreboard ─────────────────────────────────────────────────

function Scoreboard({ data, currentKid }) {
  if (!data.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <EmptyState icon={Trophy} title="Noch keine Punkte vergeben"
          description="Sobald Kompetenzen bestätigt werden, erscheint hier die Rangliste." />
      </div>
    );
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
      {data.map((entry) => {
        const isMe = entry.user_keycloak_id === currentKid;
        let medal = null;
        if (entry.rang === 1) medal = <Medal className="w-5 h-5 text-amber-400" />;
        else if (entry.rang === 2) medal = <Medal className="w-5 h-5 text-gray-300" />;
        else if (entry.rang === 3) medal = <Medal className="w-5 h-5 text-orange-400" />;
        return (
          <div key={entry.user_keycloak_id}
               className={`relative flex items-center gap-4 px-4 py-3 ${isMe ? 'bg-accent/[0.06]' : ''}`}>
            {isMe && <span className="absolute left-0 inset-y-0 w-0.5 bg-accent" aria-hidden="true" />}
            <div className="w-8 flex justify-center font-display font-semibold text-lg text-gray-500 tabular-nums">
              {medal || entry.rang}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white truncate">
                {(entry.user_first_name || entry.user_last_name)
                  ? [entry.user_first_name, entry.user_last_name].filter(Boolean).join(' ')
                  : entry.user_username} {isMe && <span className="ml-1 text-xs font-medium text-accent">Du</span>}
              </div>
              <div className="text-xs text-gray-500 tabular-nums">
                {entry.anzahl_aktiv} / {entry.anzahl_gesamt} Kompetenzen aktiv
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-white tabular-nums leading-none">{entry.punkte}</div>
              <div className="text-[11px] text-gray-500 mt-1">Punkte</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stats-Cards ────────────────────────────────────────────────

function StatsCards({ stats }) {
  if (!stats) return null;
  const fortschritt = stats.kategorien?.length
    ? stats.kategorien.reduce((s, k) => s + k.prozent, 0) / stats.kategorien.length
    : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatTile icon={CheckCircle2} label="Aktive Kompetenzen"
                value={<>{stats.anzahl_aktiv}<span className="text-base font-semibold text-gray-500"> / {stats.anzahl_gesamt}</span></>} />
      <StatTile icon={Trophy} label="Punkte" value={stats.punkte} />
      <StatTile icon={Award} label="Badges" value={stats.badges?.length || 0} />
      <StatTile icon={TrendingUp} label="Ø Fortschritt" value={`${fortschritt.toFixed(0)}%`} tone={fortschritt >= 75 ? 'positive' : 'default'} />
    </div>
  );
}

function BadgeList({ badges }) {
  if (!badges?.length) return null;
  return (
    <div className="mb-6">
      <div className="text-sm font-semibold text-gray-300 mb-2.5 flex items-center gap-2">
        <Award className="w-4 h-4 text-amber-400" /> Erreichte Badges
      </div>
      <div className="flex flex-wrap gap-2">
        {badges.map(b => (
          <span key={b} className="inline-flex items-center gap-1.5 bg-amber-500/10 ring-1 ring-inset ring-amber-500/25 text-amber-200 px-2.5 py-1 rounded-md text-sm">
            <Award className="w-3.5 h-3.5" /> {b}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────

export default function KompetenzenPage() {
  const { hasPermission, isAdmin, profile } = useUser();
  const { userId } = useParams(); // für /kompetenzen/user/:userId
  const navigate = useNavigate();
  const kann_view_all_initial = isAdmin || hasPermission('kompetenzen.view_all');
  // Admin landet auf User-Auswahl, außer er schaut sich gerade einen User an
  const [activeTab, setActiveTab] = useState(
    userId ? 'meine' : (kann_view_all_initial ? 'users' : 'meine')
  );
  const [kompetenzen, setKompetenzen] = useState([]);
  const [kategorien, setKategorien] = useState([]);
  const [stats, setStats] = useState(null);
  const [scoreboard, setScoreboard] = useState([]);
  const [loading, setLoading] = useState(true);

  const kann_manage = isAdmin || hasPermission('kompetenzen.manage');
  const kann_view_all = isAdmin || hasPermission('kompetenzen.view_all');
  const kann_edit_catalog = isAdmin || hasPermission('kompetenzen.edit_catalog');

  const targetKid = userId || profile?.keycloak_id;
  // Sobald eine userId in der URL ist, wird die User-Ansicht verwendet —
  // auch wenn es die eigene ID ist (sonst bleibt die Seite leer bei Admin-Klick auf sich selbst).
  const viewingOther = !!userId;

  // Admin ohne userId braucht seine persönliche Liste nicht zu laden
  const skipOwnList = kann_view_all_initial && !viewingOther;

  // Anzeigename des betrachteten Mitglieds (aus dem Scoreboard, falls vorhanden)
  const viewedEntry = viewingOther ? scoreboard.find(e => e.user_keycloak_id === userId) : null;
  const viewedName = viewedEntry
    ? ([viewedEntry.user_first_name, viewedEntry.user_last_name].filter(Boolean).join(' ') || viewedEntry.user_username)
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const baseCalls = [
        apiClient.get('/kompetenzen/kategorien'),
        apiClient.get('/kompetenzen/scoreboard'),
      ];
      if (viewingOther) {
        baseCalls.push(
          apiClient.get(`/kompetenzen/user/${userId}`),
          apiClient.get(`/kompetenzen/stats/user/${userId}`),
        );
      } else if (!skipOwnList) {
        baseCalls.push(
          apiClient.get('/kompetenzen/me'),
          apiClient.get('/kompetenzen/stats/me'),
        );
      }
      const results = await Promise.all(baseCalls);
      setKategorien(results[0].data);
      setScoreboard(results[1].data);
      if (results.length > 2) {
        setKompetenzen(results[2].data);
        setStats(results[3].data);
      } else {
        setKompetenzen([]);
        setStats(null);
      }
    } catch (e) {
      console.error(e);
      toast.error('Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [userId, viewingOther, skipOwnList]);

  useEffect(() => { load(); }, [load]);

  // Tab automatisch wechseln, wenn User ausgewählt/verlassen wird
  useEffect(() => {
    if (viewingOther) {
      setActiveTab('meine');
    } else if (kann_view_all_initial) {
      setActiveTab('users');
    }
  }, [viewingOther, kann_view_all_initial]);

  const toggleKompetenz = async (uk, neuer_wert) => {
    if (!kann_manage) {
      toast.error('Keine Berechtigung');
      return;
    }
    try {
      const res = await apiClient.put(
        `/kompetenzen/user/${uk.user_keycloak_id}/${uk.kompetenz_id}`,
        { hat_kompetenz: neuer_wert },
      );
      // Lokales State-Update statt Full-Reload — verhindert Scroll-Sprung und Layout-Flicker
      setKompetenzen(prev => prev.map(k =>
        k.kompetenz_id === uk.kompetenz_id ? { ...k, ...res.data } : k
      ));
      // Stats im Hintergrund nachladen (ohne Loading-Spinner)
      const statsUrl = viewingOther
        ? `/kompetenzen/stats/user/${userId}`
        : '/kompetenzen/stats/me';
      apiClient.get(statsUrl).then(r => setStats(r.data)).catch(() => {});
      apiClient.get('/kompetenzen/scoreboard').then(r => setScoreboard(r.data)).catch(() => {});
      toast.success(neuer_wert ? 'Kompetenz bestätigt' : 'Kompetenz entzogen');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler');
    }
  };

  const saveUserStufen = async (uk, stufen) => {
    if (!kann_manage) {
      toast.error('Keine Berechtigung');
      return;
    }
    try {
      const res = await apiClient.put(
        `/kompetenzen/user/${uk.user_keycloak_id}/${uk.kompetenz_id}/stufen`,
        { custom_ablauf_stufen: stufen },
      );
      setKompetenzen(prev => prev.map(k =>
        k.kompetenz_id === uk.kompetenz_id ? { ...k, ...res.data } : k
      ));
      toast.success(stufen.length ? 'Individuelle Stufen gespeichert' : 'Auf Standard zurückgesetzt');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler');
    }
  };

  const downloadPDF = async () => {
    try {
      const url = viewingOther ? `/kompetenzen/pdf/user/${userId}` : '/kompetenzen/pdf/me';
      const res = await apiClient.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `kompetenzen_${targetKid}.pdf`;
      link.click();
    } catch (e) {
      toast.error('PDF-Export fehlgeschlagen');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      {viewingOther && (
        <Button as={Link} to="/kompetenzen" variant="ghost" size="sm" icon={ArrowLeft} className="mb-3 -ml-2.5">
          {kann_view_all_initial ? 'Alle Mitglieder' : 'Meine Kompetenzen'}
        </Button>
      )}

      <PageHeader
        eyebrow="Kompetenzen"
        title={viewingOther ? (viewedName || 'Mitglied') : (skipOwnList ? 'Team-Übersicht' : 'Meine Kompetenzen')}
        meta={stats ? <span className="tabular-nums">{stats.anzahl_aktiv} von {stats.anzahl_gesamt} aktiv · {stats.punkte} Punkte</span> : undefined}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-800 overflow-x-auto">
        {/* "Meine" nur wenn nicht Admin-Einstieg — oder wenn gerade ein User betrachtet wird */}
        {(!skipOwnList || viewingOther) && (
          <TabButton active={activeTab === 'meine'} onClick={() => setActiveTab('meine')} icon={Award}>
            {viewingOther ? 'Kompetenzen' : 'Meine'}
          </TabButton>
        )}
        <TabButton active={activeTab === 'score'} onClick={() => setActiveTab('score')} icon={Trophy}>
          Scoreboard
        </TabButton>
        {(!skipOwnList || viewingOther) && (
          <TabButton active={activeTab === 'historie'} onClick={() => setActiveTab('historie')} icon={TrendingUp}>
            Verlauf
          </TabButton>
        )}
        {kann_view_all && (
          <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users}>
            Mitglieder
          </TabButton>
        )}
        {kann_view_all && (
          <TabButton active={activeTab === 'gap'} onClick={() => setActiveTab('gap')} icon={BarChart3}>
            Skill-Gap
          </TabButton>
        )}
        {kann_edit_catalog && (
          <TabButton active={activeTab === 'katalog'} onClick={() => setActiveTab('katalog')} icon={Settings}>
            Katalog
          </TabButton>
        )}
        <div className="flex-1" />
        {(!skipOwnList || viewingOther) && (
          <Button variant="ghost" size="sm" icon={Download} onClick={downloadPDF} className="shrink-0">
            PDF
          </Button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'meine' && (!skipOwnList || viewingOther) && (
        <div>
          <StatsCards stats={stats} />
          <BadgeList badges={stats?.badges} />
          <KompetenzAccordion
            kompetenzen={kompetenzen}
            kategorien={kategorien}
            isAdmin={kann_manage}
            onToggle={toggleKompetenz}
            onSaveStufen={kann_manage ? saveUserStufen : null}
            targetKid={targetKid}
            showToggle={kann_manage && (viewingOther || kann_manage)}
          />
        </div>
      )}

      {activeTab === 'score' && (
        <Scoreboard data={scoreboard} currentKid={profile?.keycloak_id} />
      )}

      {activeTab === 'historie' && (
        <KompetenzHistorieGraph userId={viewingOther ? userId : null} />
      )}

      {activeTab === 'users' && kann_view_all && (
        <UsersList
          onSelectUser={(kid) => navigate(`/kompetenzen/user/${kid}`)}
          scoreboard={scoreboard}
        />
      )}

      {activeTab === 'gap' && kann_view_all && (
        <SkillGapTab />
      )}

      {activeTab === 'katalog' && kann_edit_catalog && (
        <KompetenzAdminTab kategorien={kategorien} onReload={load} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset rounded-t-md ${
        active
          ? 'border-accent text-white'
          : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'
      }`}
    >
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

function UsersList({ onSelectUser, scoreboard = [] }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBereich, setFilterBereich] = useState('');

  useEffect(() => {
    apiClient.get('/users/users').then(r => {
      setUsers(Array.isArray(r.data) ? r.data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const scoreByKid = useMemo(
    () => Object.fromEntries((scoreboard || []).map(s => [s.user_keycloak_id, s])),
    [scoreboard]
  );

  const alleBereiche = useMemo(() => {
    const m = new Map();
    for (const u of users) for (const b of (u.bereiche || [])) m.set(b.id, b.name);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [users]);

  const filtered = users.filter(u => {
    // Admins werden in der User-Auswahl ausgeblendet — sie haben keine Kompetenzen zu prüfen
    if (u.is_admin) return false;
    if (filterBereich && !(u.bereiche || []).some(b => String(b.id) === filterBereich)) {
      return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="flex items-center justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>;
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name oder E-Mail"
            className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        {alleBereiche.length > 0 && (
          <select value={filterBereich} onChange={(e) => setFilterBereich(e.target.value)}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <option value="">Alle Bereiche</option>
            {alleBereiche.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <EmptyState icon={Search} title="Niemand gefunden"
            description="Prüfe die Schreibweise oder wähle einen anderen Bereich." />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
          {filtered.map(u => {
            const s = scoreByKid[u.keycloak_id];
            const istAdmin = u.is_admin || (u.keycloak_roles || []).includes('admin');
            return (
              <button
                key={u.keycloak_id || u.id}
                onClick={() => onSelectUser(u.keycloak_id)}
                disabled={!u.keycloak_id}
                className="group w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${
                  istAdmin ? 'bg-gray-700 text-gray-200' : 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/30'
                }`}>
                  {(u.first_name || u.username)?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate group-hover:text-accent transition-colors">
                      {u.first_name ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}` : (u.username || 'Unbekannter Nutzer')}
                    </span>
                    {istAdmin && (
                      <UiBadge tone="neutral" label="Admin" />
                    )}
                  </div>
                  {(u.bereiche?.length > 0 || u.permission_groups?.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {u.bereiche?.map(b => (
                        <span key={`b${b.id}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-500/10 ring-1 ring-inset ring-sky-500/25 text-sky-300 rounded-md text-[10px] font-medium">
                          <MapPin className="w-2.5 h-2.5" /> {b.name}
                        </span>
                      ))}
                      {u.permission_groups?.map(g => (
                        <span key={`g${g.id}`}
                              className="inline-flex items-center px-1.5 py-0.5 bg-gray-800 ring-1 ring-inset ring-gray-700 text-gray-400 rounded-md text-[10px] font-medium">
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {s ? (
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-white tabular-nums leading-none">{s.punkte}</div>
                    <div className="text-[10px] text-gray-500 tabular-nums mt-1">{s.anzahl_aktiv}/{s.anzahl_gesamt} aktiv</div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 shrink-0">–</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
