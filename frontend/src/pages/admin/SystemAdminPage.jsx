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
import { PageHeader, Button, StatusBadge } from '../../components/ui';

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
      <PageHeader eyebrow="Admin" title="Systemzustand"
        actions={
          <>
            <Button variant="ghost" onClick={load} disabled={loading} title="Aktualisieren" aria-label="Aktualisieren"
              icon={loading ? Loader2 : RefreshCw} className={loading ? '[&>svg]:animate-spin' : ''} />
            <Button as={Link} to="/admin/audit" variant="secondary" icon={LinkIcon}>Audit-Log</Button>
          </>
        } />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Background-Jobs */}
        <section>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-line-subtle">
            <Activity className="w-4 h-4 text-fg-subtle" />
            <h2 className="font-display text-lg font-semibold tracking-tight text-fg leading-none">Hintergrund-Jobs</h2>
            <span className="text-xs text-fg-subtle ml-auto">letzter Lauf je Job</span>
          </div>
          {latestJobs.length === 0 ? (
            <p className="text-sm text-fg-subtle">
              Noch keine Läufe erfasst. Management-Commands dafür in{' '}
              <code className="text-fg-muted font-mono">track_job(...)</code> einpacken.
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle -mx-1">
              {latestJobs.map((j) => (
                <li key={j.name} className="px-1 py-2.5">
                  <div className="flex items-start gap-2">
                    {j.status === 'erfolg'
                      ? <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" aria-label="Erfolgreich" />
                      : <XCircle className="w-4 h-4 text-bad shrink-0 mt-0.5" aria-label="Fehlgeschlagen" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-sm text-fg">{j.name}</span>
                        <span className="text-xs text-fg-subtle">{formatRelative(j.timestamp)}</span>
                        {j.duration_ms != null && (
                          <span className="text-xs text-fg-subtle tabular-nums">· {j.duration_ms} ms</span>
                        )}
                      </div>
                      {j.message && <p className="text-xs text-fg-muted mt-0.5">{j.message}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Backups */}
        <section>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-line-subtle">
            <Archive className="w-4 h-4 text-fg-subtle" />
            <h2 className="font-display text-lg font-semibold tracking-tight text-fg leading-none">Datenbank-Backups</h2>
          </div>
          {['daily', 'weekly'].map((k) => {
            const list = backups[k] || [];
            const newest = list[0];
            return (
              <div key={k} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-fg-muted">{k === 'daily' ? 'Täglich' : 'Wöchentlich'}</span>
                  <span className="text-xs text-fg-subtle tabular-nums">{list.length} Dateien</span>
                </div>
                {newest ? (
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-sm text-fg font-mono truncate">{newest.name}</div>
                    <div className="text-xs text-fg-subtle mt-0.5 tabular-nums">
                      {formatDate(newest.mtime)} · {formatBytes(newest.size)} ·{' '}
                      <span className="text-fg-muted">{formatRelative(newest.mtime)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-fg-subtle">Kein Backup vorhanden</p>
                )}
              </div>
            );
          })}
        </section>

        {/* Login-Historie */}
        <section className="xl:col-span-2">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-line-subtle">
            <Users className="w-4 h-4 text-fg-subtle" />
            <h2 className="font-display text-lg font-semibold tracking-tight text-fg leading-none">Sitzungen</h2>
            <span className="text-xs text-fg-subtle ml-auto">letzte 50</span>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-fg-subtle">Keine Sitzungen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-xs font-medium text-fg-muted">
                    <th className="p-2">Benutzer</th>
                    <th className="p-2">Gerät</th>
                    <th className="p-2">IP</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Letzte Aktivität</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-line-subtle hover:bg-raised">
                      <td className="p-2">
                        <div className="text-fg">{s.username || '–'}</div>
                        <div className="text-xs text-fg-subtle">{s.email}</div>
                      </td>
                      <td className="p-2 text-fg-muted">{s.device_info || '–'}</td>
                      <td className="p-2 text-fg-muted font-mono text-xs">{s.ip_address || '–'}</td>
                      <td className="p-2">
                        {s.is_current
                          ? <StatusBadge tone="positive" dot label="Aktiv" />
                          : <StatusBadge tone="neutral" label="Beendet" />}
                      </td>
                      <td className="p-2 text-fg-muted text-xs whitespace-nowrap">
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
