/**
 * Dashboard-Widget-Registry: jedes Widget hat einen Code, eine Permission
 * und eine Render-Komponente. Der Widget-Katalog im Backend muss zu den
 * Codes hier passen — Permission-Filterung passiert serverseitig zusätzlich.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, CalendarPlus, ChevronRight, Loader2, AlertTriangle,
  Package, Boxes, Wallet, History, Award, CheckCircle2,
} from 'lucide-react';
import apiClient from '../../lib/api';
import { StatTile, EmptyState } from '../ui';

function formatDatum(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatKurz(d) {
  return new Date(d).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function Card({ children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      {children}
    </div>
  );
}

// Einheitlicher Widget-Kopf: Titel in Display-Schrift, dezentes Icon, optionale Aktion.
function WidgetHeader({ icon: Icon, title, action }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-white">
        {Icon && <Icon className="w-4 h-4 shrink-0 text-gray-500" />}
        {title}
      </h2>
      {action}
    </div>
  );
}

// ─── Widget: Meine Veranstaltungen ─────────────────────────────────
function MeineVeranstaltungenWidget() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiClient.get('/veranstaltung/meine')
      .then((r) => setItems(Array.isArray(r.data) ? r.data.slice(0, 5) : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  return (
    <Card>
      <WidgetHeader
        icon={Calendar}
        title="Meine Veranstaltungen"
        action={(
          <Link to="/veranstaltung" className="text-sm text-gray-400 hover:text-accent transition-colors">
            Alle anzeigen
          </Link>
        )}
      />
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Calendar} title="Keine Veranstaltung zugewiesen"
          description="Sobald dir eine Veranstaltung zugeteilt wird, erscheint sie hier." />
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {items.map((v) => (
            <li key={v.id}>
              <Link to={`/veranstaltung/${v.id}`}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-800/70 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-white group-hover:text-accent transition-colors">
                    {v.titel}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
                    <span className="tabular-nums">{formatDatum(v.datum_von)}</span>
                    {v.ort && (
                      <>
                        <span className="text-gray-700">·</span>
                        <span className="truncate">{v.ort}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-gray-600 group-hover:text-accent transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Widget: Überfällige Ausleihen ─────────────────────────────────
function UeberfaelligeAusleihenWidget() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    apiClient.get('/inventar/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);
  if (!stats || !stats.ueberfaellige_ausleihen) return null;
  const anzahl = stats.ueberfaellige_ausleihen;
  const namen = stats.ueberfaellige_liste?.slice(0, 3).map(a =>
    `${a.ausleiher_name}, fällig am ${new Date(a.frist).toLocaleDateString('de-DE')}`
  ).join(' · ');
  return (
    <div className="flex items-center gap-4 rounded-xl border border-red-900/60 bg-red-950/30 p-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-900/50 bg-red-500/10">
        <AlertTriangle className="w-5 h-5 text-red-400" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base font-semibold tracking-tight text-red-200">
          <span className="tabular-nums">{anzahl}</span> überfällige Ausleihe{anzahl > 1 ? 'n' : ''}
        </h3>
        {namen && <p className="mt-0.5 truncate text-sm text-red-400/80">{namen}</p>}
      </div>
      <Link to="/ausleihen"
        className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors">
        Anzeigen
      </Link>
    </div>
  );
}

// ─── Widget: Inventar-Stats ────────────────────────────────────────
function InventarStatsWidget() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    apiClient.get('/inventar/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);
  if (!stats) return null;
  return (
    <section className="space-y-3">
      <h2 className="px-1 font-display text-lg font-semibold tracking-tight text-white">Inventar</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile icon={Boxes} label="Items gesamt" value={stats.total_items} />
        <StatTile icon={Package} label="Aktive Ausleihen" value={stats.aktive_ausleihen} />
        <StatTile icon={CheckCircle2} label="Verfügbar" value={stats.status_counts?.verfuegbar || 0} tone="positive" />
        <StatTile icon={AlertTriangle} label="Überfällig" value={stats.ueberfaellige_ausleihen}
          tone={stats.ueberfaellige_ausleihen > 0 ? 'danger' : 'default'} />
      </div>
    </section>
  );
}

// ─── Widget: Audit-Log ─────────────────────────────────────────────
function AuditLogWidget() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    apiClient.get('/inventar/audit-log?limit=10')
      .then(r => setItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);
  return (
    <Card>
      <WidgetHeader icon={History} title="Letzte Aktivitäten" />
      {items.length === 0 ? (
        <EmptyState icon={History} title="Noch keine Aktivitäten"
          description="Aktionen an Inventar und Ausleihen erscheinen hier." />
      ) : (
        <ul className="space-y-3.5">
          {items.map(log => (
            <li key={log.id} className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                log.aktion === 'erstellt' ? 'bg-green-500' :
                log.aktion === 'zurueckgegeben' ? 'bg-blue-500' :
                log.aktion === 'geloescht' ? 'bg-red-500' :
                log.aktion === 'mahnung' ? 'bg-orange-500' : 'bg-gray-500'
              }`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <span className="font-medium text-white">{log.aktion_display}</span>
                  <span className="text-gray-600"> · </span>
                  <span className="text-gray-300">{log.entity_name || `${log.entity_type} #${log.entity_id}`}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {log.user_username}
                  <span className="text-gray-700"> · </span>
                  <span className="tabular-nums">{formatKurz(log.timestamp)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Widget: Schnellzugriff ────────────────────────────────────────
const SCHNELLZUGRIFF = [
  { to: '/veranstaltung/neu', icon: CalendarPlus, title: 'Neue Veranstaltung', desc: 'Termin erfassen' },
  { to: '/haushalte', icon: Wallet, title: 'Haushalte', desc: 'Budgets verwalten' },
  { to: '/inventar', icon: Package, title: 'Inventar', desc: 'Bestand durchsuchen' },
];

function SchnellzugriffWidget() {
  return (
    <Card>
      <WidgetHeader title="Schnellzugriff" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SCHNELLZUGRIFF.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to}
            className="group flex flex-col gap-3 rounded-lg border border-gray-800 bg-gray-800/40 p-4 hover:border-gray-700 hover:bg-gray-800 transition-colors">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700/60 bg-gray-900/60 text-gray-400 transition-colors group-hover:border-accent/40 group-hover:text-accent">
              <Icon className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-medium text-white transition-colors group-hover:text-accent">{title}</h3>
              <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ─── Widget: Kompetenz-Punkte ──────────────────────────────────────
function KompetenzPunkteWidget() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    apiClient.get('/kompetenzen/stats/me').then(r => setStats(r.data)).catch(() => {});
  }, []);
  return (
    <Card>
      <WidgetHeader icon={Award} title="Meine Kompetenz-Punkte" />
      {!stats ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-gray-800">
          <div className="pr-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Punkte</div>
            <div className="mt-2 font-display text-3xl font-bold leading-none tabular-nums text-accent">
              {stats.punkte}
            </div>
          </div>
          <div className="px-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Kompetenzen</div>
            <div className="mt-2 font-display text-3xl font-bold leading-none tabular-nums text-white">
              {stats.anzahl_aktiv}
              <span className="text-lg font-semibold text-gray-500"> / {stats.anzahl_gesamt}</span>
            </div>
          </div>
          <div className="pl-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Badges</div>
            <div className="mt-2 font-display text-3xl font-bold leading-none tabular-nums text-yellow-400">
              {stats.badges?.length || 0}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export const WIDGET_REGISTRY = {
  meine_veranstaltungen: MeineVeranstaltungenWidget,
  ueberfaellige_ausleihen: UeberfaelligeAusleihenWidget,
  inventar_stats: InventarStatsWidget,
  audit_log: AuditLogWidget,
  schnellzugriff: SchnellzugriffWidget,
  kompetenz_punkte: KompetenzPunkteWidget,
};
