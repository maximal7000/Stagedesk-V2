/**
 * Ausleihe-Dashboard: KPIs, Charts, Quick Actions und Tabellen
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Package, AlertTriangle, Clock, CalendarCheck,
  Plus, QrCode, RotateCcw, Loader2,
  BarChart3, PieChart as PieChartIcon,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import apiClient from '../../lib/api';
import { PageHeader, StatTile } from '../../components/ui';

const STATUS_COLORS = {
  verfuegbar: '#22C55E',
  ausgeliehen: '#3B82F6',
  reserviert: '#EAB308',
  defekt: '#EF4444',
};

const STATUS_LABELS = {
  verfuegbar: 'Verfügbar',
  ausgeliehen: 'Ausgeliehen',
  reserviert: 'Reserviert',
  defekt: 'Defekt',
};

export default function AusleiheDashboardPage() {
  const [stats, setStats] = useState(null);
  const [erweitert, setErweitert] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiClient.get('/inventar/stats'),
      apiClient.get('/inventar/stats/erweitert'),
    ])
      .then(([statsRes, erweitertRes]) => {
        if (!cancelled) {
          setStats(statsRes.data);
          setErweitert(erweitertRes.data);
        }
      })
      .catch((err) => {
        console.error('Dashboard-Daten konnten nicht geladen werden:', err);
        if (!cancelled) {
          toast.error('Dashboard-Daten konnten nicht geladen werden');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-accent-fg animate-spin" />
      </div>
    );
  }

  const aktiveAusleihen = stats?.aktive_ausleihen ?? 0;
  const ueberfaellige = stats?.ueberfaellige_ausleihen ?? 0;
  const heuteFaellig = erweitert?.heute_faellig ?? 0;
  const dieseWocheFaellig = erweitert?.woche_faellig ?? 0;

  const monatsDaten = (erweitert?.ausleihen_pro_monat ?? []).map((m) => ({
    name: m.monat,
    anzahl: m.anzahl,
  }));

  // items_nach_status kommt als Dict {status: count} vom Backend
  const statusRaw = erweitert?.items_nach_status ?? {};
  const statusDaten = Object.entries(statusRaw).map(([status, anzahl]) => ({
    name: STATUS_LABELS[status] || status,
    value: anzahl,
    color: STATUS_COLORS[status] || '#6B7280',
  }));

  const topItems = erweitert?.top_items ?? [];
  const ueberfaelligeListe = stats?.ueberfaellige_liste ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ausleihe-Dashboard"
        meta="Ausleihen, Rückgaben und Inventarstatus auf einen Blick"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Package} label="Aktive Ausleihen" value={aktiveAusleihen} />
        <StatTile icon={AlertTriangle} label="Überfällige" value={ueberfaellige}
          tone={ueberfaellige > 0 ? 'danger' : 'default'} />
        <StatTile icon={Clock} label="Heute fällig" value={heuteFaellig} tone="warning" />
        <StatTile icon={CalendarCheck} label="Diese Woche fällig" value={dieseWocheFaellig} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart: Ausleihen pro Monat */}
        <div className="border-t border-line-subtle pt-6">
          <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-fg-subtle" />
            Ausleihen pro Monat
          </h2>
          {monatsDaten.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monatsDaten}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#24221f" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#8a847b', fontSize: 12 }}
                    axisLine={{ stroke: '#24221f' }}
                    tickLine={{ stroke: '#24221f' }}
                  />
                  <YAxis
                    tick={{ fill: '#8a847b', fontSize: 12 }}
                    axisLine={{ stroke: '#24221f' }}
                    tickLine={{ stroke: '#24221f' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#211f1c',
                      border: '1px solid #35322e',
                      borderRadius: '8px',
                      color: '#f2efe9',
                    }}
                    labelStyle={{ color: '#8a847b' }}
                  />
                  <Bar
                    dataKey="anzahl"
                    fill="#da1f3d"
                    radius={[4, 4, 0, 0]}
                    stroke="#24221f"
                    name="Ausleihen"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-fg-subtle">
              Keine Daten vorhanden
            </div>
          )}
        </div>

        {/* Pie Chart: Items nach Status */}
        <div className="border-t border-line-subtle pt-6">
          <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-fg-subtle" />
            Items nach Status
          </h2>
          {statusDaten.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDaten}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    dataKey="value"
                    stroke="#24221f"
                    strokeWidth={2}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {statusDaten.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#211f1c',
                      border: '1px solid #35322e',
                      borderRadius: '8px',
                      color: '#f2efe9',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ color: '#8a847b', fontSize: '13px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-fg-subtle">
              Keine Daten vorhanden
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="border-t border-line-subtle pt-6">
        <h2 className="text-lg font-semibold text-fg mb-4">Schnellzugriff</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/ausleihen"
            className="flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-lg transition-colors group"
          >
            <div className="shrink-0">
              <Plus className="w-5 h-5 text-fg-subtle" />
            </div>
            <div>
              <h3 className="font-semibold text-fg group-hover:text-accent-fg transition-colors">
                Neue Ausleihe
              </h3>
              <p className="text-sm text-fg-muted">Ausleihliste erstellen</p>
            </div>
          </Link>

          <Link
            to="/ausleihen"
            className="flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-lg transition-colors group"
          >
            <div className="shrink-0">
              <QrCode className="w-5 h-5 text-fg-subtle" />
            </div>
            <div>
              <h3 className="font-semibold text-fg group-hover:text-accent-fg transition-colors">
                QR-Scanner
              </h3>
              <p className="text-sm text-fg-muted">Item per QR-Code erfassen</p>
            </div>
          </Link>

          <button
            type="button"
            className="flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-lg transition-colors group text-left"
            onClick={() => toast.info('Schnellrückgabe kommt bald')}
          >
            <div className="shrink-0">
              <RotateCcw className="w-5 h-5 text-fg-subtle" />
            </div>
            <div>
              <h3 className="font-semibold text-fg group-hover:text-accent-fg transition-colors">
                Schnellrückgabe
              </h3>
              <p className="text-sm text-fg-muted">Rückgabe ohne Listenauswahl</p>
            </div>
          </button>
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Items */}
        <div className="border-t border-line-subtle pt-6">
          <h2 className="text-lg font-semibold text-fg mb-4">
            Meistgeliehene Items
          </h2>
          {topItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line-subtle">
                    <th className="text-left py-2 pr-4 text-fg-muted font-medium">#</th>
                    <th className="text-left py-2 pr-4 text-fg-muted font-medium">Item</th>
                    <th className="text-right py-2 text-fg-muted font-medium">Ausleihen</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.slice(0, 10).map((item, idx) => (
                    <tr key={item.id || idx} className="border-b border-line-subtle">
                      <td className="py-2 pr-4 text-fg-subtle">{idx + 1}</td>
                      <td className="py-2 pr-4 text-fg">{item.name}</td>
                      <td className="py-2 text-right text-fg-muted">{item.ausleihen_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-fg-subtle">
              Keine Daten vorhanden
            </div>
          )}
        </div>

        {/* Überfällige Ausleihen */}
        <div className="border-t border-line-subtle pt-6">
          <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-bad" />
            Überfällige Ausleihen
          </h2>
          {ueberfaelligeListe.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line-subtle">
                    <th className="text-left py-2 pr-4 text-fg-muted font-medium">Ausleiher</th>
                    <th className="text-left py-2 pr-4 text-fg-muted font-medium">Frist</th>
                    <th className="text-right py-2 text-fg-muted font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {ueberfaelligeListe.map((a) => (
                    <tr key={a.id} className="border-b border-line-subtle">
                      <td className="py-2 pr-4 text-fg">{a.ausleiher_name}</td>
                      <td className="py-2 pr-4 text-bad">
                        {a.frist
                          ? new Date(a.frist).toLocaleDateString('de-DE')
                          : '–'}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          to={`/ausleihen/${a.id}`}
                          className="text-accent-fg hover:opacity-80 hover:underline"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-fg-subtle">
              Keine überfälligen Ausleihen
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
