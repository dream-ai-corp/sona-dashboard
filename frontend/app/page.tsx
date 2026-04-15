'use client';

import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import SonaChatInput from '@/components/SonaChatInput';
import StatCard from '@/components/StatCard';
import {
  Bot,
  Briefcase,
  Cpu,
  MemoryStick,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  HardDrive,
  Server,
  Activity,
  Zap,
  Circle,
  ChevronRight,
} from 'lucide-react';

/* ─── types ─────────────────────────────────────────── */
interface DaemonData {
  enabled?: boolean;
  running?: boolean;
  lastTick?: string | number;
  intervalMs?: number;
  maxConcurrent?: number;
  error?: string;
}

interface Job {
  id: string;
  goal?: string;
  status?: string;
  startedAt?: string | number;
  completedAt?: string | number;
  result?: string;
  mtime?: number;
}

/* ─── helpers ───────────────────────────────────────── */
function elapsed(startedAt?: string | number): string {
  if (!startedAt) return '';
  const start = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  const s = Math.floor((Date.now() - start) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeAgo(ts?: string | number): string {
  if (!ts) return '';
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusConfig(status?: string): { label: string; color: string; bg: string; border: string; icon: React.ReactNode } {
  const s = status?.toLowerCase() ?? '';
  if (s === 'running' || s === 'in_progress')
    return { label: 'Running', color: '#67e8f9', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.3)', icon: <Loader2 size={11} className="animate-spin" /> };
  if (s === 'done' || s === 'completed')
    return { label: 'Done', color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', icon: <CheckCircle2 size={11} /> };
  if (s === 'error' || s === 'failed')
    return { label: 'Failed', color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: <XCircle size={11} /> };
  return { label: status ?? 'Pending', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', icon: <Circle size={11} /> };
}

/* ─── Service row ───────────────────────────────────── */
function ServiceRow({ name, status }: { name: string; status: 'up' | 'down' | 'unknown' }) {
  const color = status === 'up' ? '#4ade80' : status === 'down' ? '#f87171' : '#64748b';
  const label = status === 'up' ? 'Up' : status === 'down' ? 'Down' : '?';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: '13px', color: '#94a3b8' }}>{name}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color, fontWeight: 600 }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, boxShadow: status === 'up' ? `0 0 6px ${color}` : 'none' }} />
        {label}
      </span>
    </div>
  );
}

/* ─── Job card ──────────────────────────────────────── */
function JobCard({ job }: { job: Job }) {
  const s = statusConfig(job.status);
  const isRunning = job.status === 'running' || job.status === 'in_progress';

  return (
    <div
      className={isRunning ? 'shimmer' : ''}
      style={{
        background: isRunning ? 'rgba(6,182,212,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isRunning ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: '12px',
        padding: '14px 16px',
        marginBottom: '8px',
        transition: 'all 200ms ease',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
        {/* Goal text */}
        <p style={{
          fontSize: '13px',
          color: '#cbd5e1',
          lineHeight: 1.4,
          flex: 1,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          margin: 0,
        }}>
          {job.goal ?? '(no goal)'}
        </p>
        {/* Status badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 600,
          background: s.bg,
          color: s.color,
          border: `1px solid ${s.border}`,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {s.icon}
          {s.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <code style={{ fontSize: '10px', color: '#475569', fontFamily: 'monospace' }}>
          #{job.id?.slice(0, 8)}
        </code>
        {isRunning && job.startedAt && (
          <span style={{ fontSize: '10px', color: '#67e8f9' }}>⏱ {elapsed(job.startedAt)}</span>
        )}
        {!isRunning && (job.completedAt || job.mtime) && (
          <span style={{ fontSize: '10px', color: '#475569' }}>{timeAgo(job.completedAt ?? job.mtime)}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────── */
export default function Home() {
  const [daemon, setDaemon] = useState<DaemonData | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [now, setNow] = useState('');
  const [loading, setLoading] = useState(false);
  const [brain, setBrain] = useState<string>('...');
  const [voice, setVoice] = useState<string>('...');

  // Clock
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchSystem = useCallback(async () => {
    setLoading(true);
    try {
      const sysRes = await fetch('/api/system').then(r => r.json()).catch(() => null);
      if (sysRes && !sysRes.error) setDaemon(sysRes);
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE: real-time job updates via /api/jobs/stream
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es = new EventSource('/api/jobs/stream');
      es.onmessage = (e) => {
        try {
          const all: Job[] = JSON.parse(e.data);
          all.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
          setJobs(all);
          setLoading(false);
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es?.close(); es = null;
        retryTimer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => { es?.close(); if (retryTimer) clearTimeout(retryTimer); };
  }, []);

  // SSE: real-time daemon / brain / voice updates via /api/stream
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es = new EventSource('/api/stream');
      es.addEventListener('daemon', (e) => {
        try {
          const d = JSON.parse(e.data);
          setDaemon({ enabled: d.enabled, running: d.enabled, lastTick: d.lastTickAt, intervalMs: (d.intervalSec ?? 180) * 1000, maxConcurrent: d.maxConcurrent });
        } catch { /* ignore */ }
      });
      es.addEventListener('brain', (e) => {
        try { setBrain(JSON.parse(e.data)?.mode ?? 'n/a'); } catch { /* ignore */ }
      });
      es.addEventListener('voice', (e) => {
        try {
          const v = JSON.parse(e.data);
          setVoice(v?.language ?? v?.voice ?? v?.en ?? 'en');
        } catch { /* ignore */ }
      });
      es.onerror = () => {
        es?.close(); es = null;
        retryTimer = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => { es?.close(); if (retryTimer) clearTimeout(retryTimer); };
  }, []);

  // System: load once on mount as fallback for daemon state
  const fetchData = useCallback(() => fetchSystem(), [fetchSystem]);
  useEffect(() => { fetchSystem(); }, [fetchSystem]);

  /* derived stats */
  const running = jobs.filter(j => j.status === 'running' || j.status === 'in_progress');
  const recent = jobs.filter(j => j.status !== 'running' && j.status !== 'in_progress');
  const daemonOn = daemon?.enabled ?? daemon?.running ?? false;
  const lastTick = daemon?.lastTick
    ? new Date(daemon.lastTick).toLocaleTimeString('en-US', { hour12: false })
    : '--';

  const systemRows: [string, string][] = [
    ['Host', 'srv1589372'],
    ['OS', 'Debian 13 Trixie'],
    ['CPU', '4 vCPU'],
    ['RAM', '15 GB NVMe'],
    ['Disk', '197 GB'],
    ['IP', '72.60.185.57'],
    ['Daemon interval', daemon?.intervalMs ? `${daemon.intervalMs / 1000}s` : '3 min'],
    ['Max concurrent', String(daemon?.maxConcurrent ?? 2)],
    ['Last tick', lastTick],
  ];

  /* ─── render ─────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar />

      {/* Main content — offset by sidebar width */}
      <main style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* ── Top bar ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          padding: '16px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.6)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: '0 0 auto' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
              Sona Dashboard
            </h1>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 0' }}>
              Real-time AI assistant control panel
            </p>
          </div>

          {/* Composite chat input: text + image + push-to-talk */}
          <div style={{ flex: '1 1 420px', minWidth: '280px', maxWidth: '720px' }}>
            <SonaChatInput sessionId="dashboard" channel="dashboard" compact={true} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Brain badge */}
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: '20px',
              background: brain === 'claude_code' ? 'rgba(124,58,237,0.15)' : 'rgba(6,182,212,0.12)',
              color: brain === 'claude_code' ? '#a78bfa' : '#67e8f9',
              border: `1px solid ${brain === 'claude_code' ? 'rgba(124,58,237,0.3)' : 'rgba(6,182,212,0.25)'}`,
            }}>
              {brain}
            </span>

            {/* Voice badge */}
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: '20px',
              background: voice?.toUpperCase() === 'FR' ? 'rgba(244,63,94,0.12)' : 'rgba(34,197,94,0.1)',
              color: voice?.toUpperCase() === 'FR' ? '#fb7185' : '#4ade80',
              border: `1px solid ${voice?.toUpperCase() === 'FR' ? 'rgba(244,63,94,0.25)' : 'rgba(34,197,94,0.2)'}`,
            }}>
              {voice?.toUpperCase() ?? 'EN'}
            </span>

            {/* Clock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', fontFamily: 'monospace' }}>
              <Clock size={13} />
              {now}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(124,58,237,0.3)',
                background: 'rgba(124,58,237,0.1)',
                color: '#a78bfa',
                fontSize: '12px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'all 200ms',
                fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Stat cards row */}
          <div style={{ display: 'flex', gap: '16px' }}>
            <StatCard
              icon={Bot}
              title="Active Agents"
              value={String(running.length)}
              sub={`${jobs.length} total jobs`}
              accent="violet"
            />
            <StatCard
              icon={Briefcase}
              title="Jobs Running"
              value={String(running.length)}
              sub={running.length ? running[0]?.goal?.slice(0, 30) + '…' : 'Idle'}
              accent="cyan"
            />
            <StatCard
              icon={Cpu}
              title="CPU"
              value="4 vCPU"
              sub="Hostinger KVM4"
              accent="green"
            />
            <StatCard
              icon={MemoryStick}
              title="RAM"
              value="15 GB"
              sub={daemonOn ? 'Daemon on' : 'Daemon off'}
              accent={daemonOn ? 'green' : 'red'}
            />
          </div>

          {/* Middle row: Jobs + System */}
          <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>

            {/* ── Jobs panel (60%) ── */}
            <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Running jobs */}
              <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#67e8f9', boxShadow: '0 0 8px rgba(6,182,212,0.8)' }} className="status-dot-pulse" />
                  <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Running Jobs</h2>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569', background: 'rgba(6,182,212,0.08)', padding: '2px 8px', borderRadius: '20px', border: '1px solid rgba(6,182,212,0.15)' }}>
                    {running.length} active
                  </span>
                </div>

                {running.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <Zap size={28} color="#1e2535" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <p style={{ fontSize: '13px', color: '#334155', margin: 0 }}>No active jobs right now</p>
                  </div>
                ) : (
                  <div>
                    {running.map(job => <JobCard key={job.id} job={job} />)}
                  </div>
                )}
              </div>

              {/* Recent jobs */}
              <div className="glass" style={{ borderRadius: '16px', padding: '20px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <Activity size={15} color="#a78bfa" />
                  <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Recent Jobs</h2>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569' }}>
                    {recent.length} entries
                  </span>
                </div>

                {recent.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#334155', fontStyle: 'italic' }}>No completed jobs found</p>
                ) : (
                  <div style={{ maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                    {recent.map(job => <JobCard key={job.id} job={job} />)}
                  </div>
                )}
              </div>
            </div>

            {/* ── System panel (40%) ── */}
            <div style={{ flex: '0 0 calc(40% - 20px)', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* System info */}
              <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <Server size={15} color="#67e8f9" />
                  <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>System</h2>
                </div>
                <dl style={{ margin: 0 }}>
                  {systemRows.map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <dt style={{ fontSize: '12px', color: '#64748b' }}>{k}</dt>
                      <dd style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace', margin: 0 }}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Services */}
              <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <HardDrive size={15} color="#a78bfa" />
                  <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Services</h2>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <ServiceRow name="sona-agent" status={daemon?.error ? 'down' : daemon ? 'up' : 'unknown'} />
                  <ServiceRow name="sona-dashboard" status="up" />
                  <ServiceRow name="whisper-server" status="unknown" />
                  <ServiceRow name="kokoro-server" status="unknown" />
                  <ServiceRow name="sona-host-bridge" status="unknown" />
                </div>
              </div>

              {/* Daemon status */}
              <div
                className="glass"
                style={{
                  borderRadius: '16px',
                  padding: '20px',
                  borderColor: daemonOn ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Zap size={15} color={daemonOn ? '#4ade80' : '#f87171'} />
                    <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Daemon</h2>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '20px',
                    background: daemonOn ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: daemonOn ? '#4ade80' : '#f87171',
                    border: `1px solid ${daemonOn ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  }}>
                    {daemonOn ? 'RUNNING' : 'STOPPED'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.8 }}>
                  <div>Last tick: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{lastTick}</span></div>
                  <div>Interval: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{daemon?.intervalMs ? `${daemon.intervalMs / 1000}s` : '3 min'}</span></div>
                  <div>Concurrency: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>max {daemon?.maxConcurrent ?? 2}</span></div>
                </div>
              </div>

            </div>
          </div>

          {/* ── Activity timeline ── */}
          <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Activity size={15} color="#a78bfa" />
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Recent Activity</h2>
            </div>

            {jobs.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#334155', fontStyle: 'italic' }}>No recent activity</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {jobs.slice(0, 6).map((job, i) => {
                  const s = statusConfig(job.status);
                  return (
                    <div key={job.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      {/* Timeline line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px', flexShrink: 0 }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.border}`, marginTop: '5px' }} />
                        {i < jobs.slice(0, 6).length - 1 && (
                          <div style={{ width: '1px', flex: 1, background: 'rgba(255,255,255,0.06)', minHeight: '20px' }} />
                        )}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, paddingBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
                            {job.goal?.slice(0, 80) ?? '(no goal)'}
                          </span>
                          <ChevronRight size={11} color="#334155" />
                          <span style={{ fontSize: '11px', color: s.color, fontWeight: 600 }}>{s.label}</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#334155', fontFamily: 'monospace' }}>
                          #{job.id?.slice(0, 8)} · {timeAgo(job.completedAt ?? job.mtime ?? job.startedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          fontSize: '11px',
          color: '#1e293b',
          padding: '16px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          Sona Dashboard · live via SSE · {now}
        </div>
      </main>
    </div>
  );
}
