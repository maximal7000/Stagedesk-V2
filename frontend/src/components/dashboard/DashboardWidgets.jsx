/**
 * Dashboard-Widget-Registry: jedes Widget hat einen Code, eine Permission
 * und eine Render-Komponente. Der Widget-Katalog im Backend muss zu den
 * Codes hier passen — Permission-Filterung passiert serverseitig zusätzlich.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, ChevronRight, Loader2, AlertTriangle, Package, Boxes, Award,
} from 'lucide-react';
import apiClient from '../../lib/api';

function formatDatum(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Card({ children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      {children}
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Meine Veranstaltungen
        </h2>
        <Link to="/veranstaltung" className="text-sm text-blue-400 hover:text-blue-300">
          Alle anzeigen
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Du bist keiner Veranstaltung zugewiesen.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((v) => (
            <li key={v.id}>
              <Link to={`/veranstaltung/${v.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 transition-colors group">
                <div>
                  <span className="font-medium text-white group-hover:text-blue-400">{v.titel}</span>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {formatDatum(v.datum_von)}{v.ort && ` · ${v.ort}`}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-blue-400" />
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
  return (
    <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 flex items-center gap-4">
      <AlertTriangle className="w-8 h-8 text-red-400 flex-shrink-0" />
      <div className="flex-1">
        <h3 className="font-semibold text-red-300">
          {stats.ueberfaellige_ausleihen} überfällige Ausleihe{stats.ueberfaellige_ausleihen > 1 ? 'n' : ''}
        </h3>
        <p className="text-sm text-red-400/80">
          {stats.ueberfaellige_liste?.slice(0, 3).map(a =>
            `${a.ausleiher_name} (Frist: ${new Date(a.frist).toLocaleDateString('de-DE')})`
          ).join(', ')}
        </p>
      </div>
      <Link to="/ausleihen" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg flex-shrink-0">
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-1">
          <Boxes className="w-4 h-4" /><span className="text-sm">Items gesamt</span>
        </div>
        <p className="text-2xl font-bold text-white">{stats.total_items}</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-1">
          <Package className="w-4 h-4" /><span className="text-sm">Aktive Ausleihen</span>
        </div>
        <p className="text-2xl font-bold text-blue-400">{stats.aktive_ausleihen}</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-1">
          <span className="text-sm">Verfügbar</span>
        </div>
        <p className="text-2xl font-bold text-green-400">{stats.status_counts?.verfuegbar || 0}</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-1">
          <AlertTriangle className="w-4 h-4" /><span className="text-sm">Überfällig</span>
        </div>
        <p className={`text-2xl font-bold ${stats.ueberfaellige_ausleihen > 0 ? 'text-red-400' : 'text-gray-500'}`}>
          {stats.ueberfaellige_ausleihen}
        </p>
      </div>
    </div>
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
      <h2 className="text-xl font-bold text-white mb-4">Letzte Aktivitäten</h2>
      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-500"><p>Noch keine Aktivitäten vorhanden</p></div>
      ) : (
        <ul className="space-y-3">
          {items.map(log => (
            <li key={log.id} className="flex items-start gap-3 text-sm">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                log.aktion === 'erstellt' ? 'bg-green-500' :
                log.aktion === 'zurueckgegeben' ? 'bg-blue-500' :
                log.aktion === 'geloescht' ? 'bg-red-500' :
                log.aktion === 'mahnung' ? 'bg-orange-500' : 'bg-gray-500'
              }`} />
              <div className="flex-1 min-w-0">
                <span className="text-white">{log.aktion_display}</span>
                <span className="text-gray-400"> – {log.entity_name || `${log.entity_type} #${log.entity_id}`}</span>
                <p className="text-gray-500 text-xs mt-0.5">
                  {log.user_username} · {new Date(log.timestamp).toLocaleDateString('de-DE',
                    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
function SchnellzugriffWidget() {
  return (
    <Card>
      <h2 className="text-xl font-bold text-white mb-4">Schnellzugriff</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/veranstaltung/neu"
          className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group">
          <div className="text-3xl mb-2">📅</div>
          <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400">Neue Veranstaltung</h3>
          <p className="text-sm text-gray-400">Veranstaltung anlegen</p>
        </Link>
        <Link to="/haushalte"
          className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group">
          <div className="text-3xl mb-2">🏠</div>
          <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400">Haushalte</h3>
          <p className="text-sm text-gray-400">Haushalte verwalten</p>
        </Link>
        <Link to="/inventar"
          className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group">
          <div className="text-3xl mb-2">📦</div>
          <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400">Inventar</h3>
          <p className="text-sm text-gray-400">Inventar durchsuchen</p>
        </Link>
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
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-yellow-400" /> Meine Kompetenz-Punkte
      </h2>
      {!stats ? (
        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-400 uppercase">Punkte</div>
            <div className="text-2xl font-bold text-blue-400 mt-1">{stats.punkte}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase">Aktiv</div>
            <div className="text-2xl font-bold text-white mt-1">{stats.anzahl_aktiv} / {stats.anzahl_gesamt}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase">Badges</div>
            <div className="text-2xl font-bold text-yellow-400 mt-1">{stats.badges?.length || 0}</div>
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
