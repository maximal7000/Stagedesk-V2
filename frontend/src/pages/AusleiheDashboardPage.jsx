/**
 * Ausleihe-Dashboard: KPIs, Charts, Quick Actions und Tabellen
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Package, AlertTriangle, Clock, CalendarCheck,
  Plus, QrCode, RotateCcw, Loader2, TrendingUp,
  BarChart3, PieChart as PieChartIcon,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import apiClient from '../lib/api';

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
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-blue-500" />
          Ausleihe-Dashboard
        </h1>
        <p className="text-gray-400">
          Überblick über alle Ausleihen, Rückgaben und den Inventarstatus.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-900/30 rounded-lg">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Aktive Ausleihen</span>
          </div>
          <p className="text-3xl font-bold text-white">{aktiveAusleihen}</p>
        </div>

        <div className="bg-gray-900 border border-red-900/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-900/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-sm text-gray-400">Überfällige</span>
          </div>
          <p className="text-3xl font-bold text-red-400">{ueberfaellige}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-yellow-900/30 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <span className="text-sm text-gray-400">Heute fällig</span>
          </div>
          <p className="text-3xl font-bold text-white">{heuteFaellig}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-900/30 rounded-lg">
              <CalendarCheck className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm text-gray-400">Diese Woche fällig</span>
          </div>
          <p className="text-3xl font-bold text-white">{dieseWocheFaellig}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart: Ausleihen pro Monat */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Ausleihen pro Monat
          </h2>
          {monatsDaten.length > 0 ? (
            <div className="h-72 bg-gray-950 rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monatsDaten}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={{ stroke: '#1E293B' }}
                  />
                  <YAxis
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={{ stroke: '#1E293B' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111827',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F9FAFB',
                    }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Bar
                    dataKey="anzahl"
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                    stroke="#1E293B"
                    name="Ausleihen"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-gray-500">
              Keine Daten vorhanden
            </div>
          )}
        </div>

        {/* Pie Chart: Items nach Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-green-400" />
            Items nach Status
          </h2>
          {statusDaten.length > 0 ? (
            <div className="h-72 bg-gray-950 rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDaten}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    dataKey="value"
                    stroke="#1E293B"
                    strokeWidth={2}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {statusDaten.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111827',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F9FAFB',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ color: '#9CA3AF', fontSize: '13px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-gray-500">
              Keine Daten vorhanden
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Schnellzugriff</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/ausleihen"
            className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg transition-colors group"
          >
            <div className="p-2 bg-blue-900/30 rounded-lg">
              <Plus className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                Neue Ausleihe
              </h3>
              <p className="text-sm text-gray-400">Ausleihliste erstellen</p>
            </div>
          </Link>

          <Link
            to="/ausleihen"
            className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg transition-colors group"
          >
            <div className="p-2 bg-green-900/30 rounded-lg">
              <QrCode className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white group-hover:text-green-400 transition-colors">
                QR-Scanner
              </h3>
              <p className="text-sm text-gray-400">Item per QR-Code erfassen</p>
            </div>
          </Link>

          <button
            type="button"
            className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg transition-colors group text-left"
            onClick={() => toast.info('Schnellrückgabe kommt bald')}
          >
            <div className="p-2 bg-yellow-900/30 rounded-lg">
              <RotateCcw className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white group-hover:text-yellow-400 transition-colors">
                Schnellrückgabe
              </h3>
              <p className="text-sm text-gray-400">Rückgabe ohne Listenauswahl</p>
            </div>
          </button>
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Items */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Meistgeliehene Items
          </h2>
          {topItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">#</th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Item</th>
                    <th className="text-right py-2 text-gray-400 font-medium">Ausleihen</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.slice(0, 10).map((item, idx) => (
                    <tr key={item.id || idx} className="border-b border-gray-800/50">
                      <td className="py-2 pr-4 text-gray-500">{idx + 1}</td>
                      <td className="py-2 pr-4 text-white">{item.name}</td>
                      <td className="py-2 text-right text-gray-300">{item.ausleihen_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Keine Daten vorhanden
            </div>
          )}
        </div>

        {/* Überfällige Ausleihen */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            Überfällige Ausleihen
          </h2>
          {ueberfaelligeListe.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Ausleiher</th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Frist</th>
                    <th className="text-right py-2 text-gray-400 font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {ueberfaelligeListe.map((a) => (
                    <tr key={a.id} className="border-b border-gray-800/50">
                      <td className="py-2 pr-4 text-white">{a.ausleiher_name}</td>
                      <td className="py-2 pr-4 text-red-400">
                        {a.frist
                          ? new Date(a.frist).toLocaleDateString('de-DE')
                          : '–'}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          to={`/ausleihen/${a.id}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline"
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
            <div className="text-center py-8 text-gray-500">
              Keine überfälligen Ausleihen
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
