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
    <div className="bg-surface rounded-lg p-6">
      {children}
    </div>
  );
}

// Einheitlicher Widget-Kopf: Titel in Display-Schrift, dezentes Icon, optionale Aktion.
function WidgetHeader({ icon: Icon, title, action }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-fg">
        {Icon && <Icon className="w-4 h-4 shrink-0 text-fg-subtle" />}
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
          <Link to="/veranstaltung" className="text-sm text-fg-muted hover:text-fg transition-colors">
            Alle anzeigen
          </Link>
        )}
      />
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Calendar} title="Keine Veranstaltung zugewiesen"
          description="Sobald dir eine Veranstaltung zugeteilt wird, erscheint sie hier." />
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {items.map((v) => (
            <li key={v.id}>
              <Link to={`/veranstaltung/${v.id}`}
                className="group flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-raised transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-fg">
                    {v.titel}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-fg-subtle">
                    <span className="tabular-nums">{formatDatum(v.datum_von)}</span>
                    {v.ort && (
                      <>
                        <span className="text-fg-disabled">·</span>
                        <span className="truncate">{v.ort}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-fg-subtle group-hover:text-fg transition-colors" />
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
    <div className="flex items-center gap-4 rounded-lg bg-surface p-5">
      <AlertTriangle className="w-5 h-5 shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base font-semibold tracking-tight text-fg">
          <span className="tabular-nums">{anzahl}</span> überfällige Ausleihe{anzahl > 1 ? 'n' : ''}
        </h3>
        {namen && <p className="mt-0.5 truncate text-sm text-fg-muted">{namen}</p>}
      </div>
      <Link to="/ausleihen"
        className="shrink-0 rounded-md bg-bad px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition">
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
      <h2 className="px-1 font-display text-lg font-semibold tracking-tight text-fg">Inventar</h2>
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
                log.aktion === 'erstellt' ? 'bg-ok' :
                log.aktion === 'zurueckgegeben' ? 'bg-info' :
                log.aktion === 'geloescht' ? 'bg-bad' :
                log.aktion === 'mahnung' ? 'bg-warn' : 'bg-fg-subtle'
              }`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <span className="font-medium text-fg">{log.aktion_display}</span>
                  <span className="text-fg-disabled"> · </span>
                  <span className="text-fg-muted">{log.entity_name || `${log.entity_type} #${log.entity_id}`}</span>
                </p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {log.user_username}
                  <span className="text-fg-disabled"> · </span>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
        {SCHNELLZUGRIFF.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to}
            className="group flex flex-col gap-3 rounded-md p-4 hover:bg-raised transition-colors">
            <Icon className="w-5 h-5 text-fg-subtle transition-colors group-hover:text-accent-fg" />
            <div>
              <h3 className="font-medium text-fg">{title}</h3>
              <p className="mt-0.5 text-sm text-fg-subtle">{desc}</p>
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
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" /></div>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-line-subtle">
          <div className="pr-4">
            <div className="text-xs uppercase tracking-wide text-fg-subtle">Punkte</div>
            <div className="mt-2 font-display text-3xl font-bold leading-none tabular-nums text-accent-fg">
              {stats.punkte}
            </div>
          </div>
          <div className="px-4">
            <div className="text-xs uppercase tracking-wide text-fg-subtle">Kompetenzen</div>
            <div className="mt-2 font-display text-3xl font-bold leading-none tabular-nums text-fg">
              {stats.anzahl_aktiv}
              <span className="text-lg font-semibold text-fg-subtle"> / {stats.anzahl_gesamt}</span>
            </div>
          </div>
          <div className="pl-4">
            <div className="text-xs uppercase tracking-wide text-fg-subtle">Badges</div>
            <div className="mt-2 font-display text-3xl font-bold leading-none tabular-nums text-warn">
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
