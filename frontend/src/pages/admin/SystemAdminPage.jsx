/**
 * System-Übersicht für Admins: Background-Jobs, DB-Backups, Login-Historie.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Archive, Users, Loader2, CheckCircle2, XCircle, RefreshCw, Link as LinkIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import apiClient from '../../lib/api';

function formatBytes(b) {
  if (!b) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 ? 1 : 0)} ${units[i]}`;
}

function formatDate(s) {
  if (!s) return '–';
  return new Date(s).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(s) {
  if (!s) return '–';
  const ms = Date.now() - new Date(s).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} h`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tagen`;
}

export default function SystemAdminPage() {
  const [jobs, setJobs] = useState([]);
  const [backups, setBackups] = useState({ daily: [], weekly: [] });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, b, s] = await Promise.all([
        apiClient.get('/admin/jobs'),
        apiClient.get('/admin/backups'),
        apiClient.get('/admin/login-history'),
      ]);
      setJobs(j.data || []);
      setBackups(b.data || { daily: [], weekly: [] });
      setSessions(s.data || []);
    } catch { toast.error('Laden fehlgeschlagen'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Letzte Runs pro Job-Namen
  const jobsByName = jobs.reduce((acc, j) => {
    if (!acc[j.name]) acc[j.name] = j;
    return acc;
  }, {});
  const latestJobs = Object.values(jobsByName);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">System</h1>
        <button onClick={load} disabled={loading}
          className="ml-auto p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
          title="Aktualisieren">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
        </button>
        <Link to="/admin/audit"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg">
          <LinkIcon className="w-4 h-4" /> Audit-Log
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Background-Jobs */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Background-Jobs</h2>
            <span className="text-xs text-gray-500 ml-auto">letzte Runs pro Job</span>
          </div>
          {latestJobs.length === 0 ? (
            <p className="text-sm text-gray-500">
              Noch keine Job-Runs erfasst. Commands mit{' '}
              <code className="text-gray-400">track_job(...)</code> wrappen.
            </p>
          ) : (
            <ul className="space-y-2">
              {latestJobs.map((j) => (
                <li key={j.name} className="bg-gray-800/40 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    {j.status === 'erfolg'
                      ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                      : <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-sm text-white">{j.name}</span>
                        <span className="text-xs text-gray-500">{formatRelative(j.timestamp)}</span>
                        {j.duration_ms != null && (
                          <span className="text-xs text-gray-500">· {j.duration_ms} ms</span>
                        )}
                      </div>
                      {j.message && <p className="text-xs text-gray-400 mt-0.5">{j.message}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Backups */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Archive className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">DB-Backups</h2>
          </div>
          {['daily', 'weekly'].map((k) => {
            const list = backups[k] || [];
            const newest = list[0];
            return (
              <div key={k} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wider text-gray-500">{k}</span>
                  <span className="text-xs text-gray-500">{list.length} Dateien</span>
                </div>
                {newest ? (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-sm text-white font-mono truncate">{newest.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatDate(newest.mtime)} · {formatBytes(newest.size)} ·{' '}
                      <span className="text-gray-400">{formatRelative(newest.mtime)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Kein Backup vorhanden</p>
                )}
              </div>
            );
          })}
        </section>

        {/* Login-Historie */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 xl:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Aktive Sitzungen</h2>
            <span className="text-xs text-gray-500 ml-auto">letzte 50</span>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500">Keine Sitzungen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="p-2">User</th>
                    <th className="p-2">Gerät</th>
                    <th className="p-2">IP</th>
                    <th className="p-2">Aktiv</th>
                    <th className="p-2">Letzte Aktivität</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                      <td className="p-2">
                        <div className="text-white">{s.username || '–'}</div>
                        <div className="text-xs text-gray-500">{s.email}</div>
                      </td>
                      <td className="p-2 text-gray-400">{s.device_info || '–'}</td>
                      <td className="p-2 text-gray-400 font-mono text-xs">{s.ip_address || '–'}</td>
                      <td className="p-2">
                        {s.is_current
                          ? <span className="text-green-400 text-xs">● aktiv</span>
                          : <span className="text-gray-500 text-xs">○ beendet</span>}
                      </td>
                      <td className="p-2 text-gray-400 text-xs whitespace-nowrap">
                        {formatRelative(s.last_activity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
