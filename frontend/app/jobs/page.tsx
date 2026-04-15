'use client';

import { useEffect, useState, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import {
  Loader2, CheckCircle2, XCircle, Circle, RefreshCw, Search, Clock, Activity,
} from 'lucide-react';

interface Job {
  id: string;
  goal?: string;
  status?: string;
  startedAt?: string | number;
  completedAt?: string | number;
  mtime?: number;
}

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

function statusConfig(status?: string) {
  const s = status?.toLowerCase() ?? '';
  if (s === 'running' || s === 'in_progress')
    return { label: 'Running', color: '#67e8f9', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.3)', icon: <Loader2 size={11} className="animate-spin" /> };
  if (s === 'done' || s === 'completed')
    return { label: 'Done', color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', icon: <CheckCircle2 size={11} /> };
  if (s === 'error' || s === 'failed')
    return { label: 'Failed', color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: <XCircle size={11} /> };
  return { label: status ?? 'Pending', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', icon: <Circle size={11} /> };
}

const STATUS_FILTERS = ['all', 'running', 'done', 'error'];

function JobRow({ job }: { job: Job }) {
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
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
        <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.4, flex: 1, margin: 0,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {job.goal ?? '(no goal)'}
        </p>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
          background: s.bg, color: s.color, border: `1px solid ${s.border}`,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {s.icon} {s.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <code style={{ fontSize: '10px', color: '#475569', fontFamily: 'monospace' }}>#{job.id?.slice(0, 8)}</code>
        {isRunning && job.startedAt && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#67e8f9' }}>
            <Clock size={10} /> {elapsed(job.startedAt)}
          </span>
        )}
        {!isRunning && (job.completedAt || job.mtime) && (
          <span style={{ fontSize: '10px', color: '#475569' }}>{timeAgo(job.completedAt ?? job.mtime)}</span>
        )}
      </div>
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : (data?.jobs ?? []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      es = new EventSource('/api/jobs/stream');
      es.onmessage = (e) => {
        try {
          const all: Job[] = JSON.parse(e.data);
          setJobs(all);
          setLoading(false);
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        retryTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [fetchJobs]);

  const filtered = jobs.filter(j => {
    const matchSearch = !search || (j.goal ?? '').toLowerCase().includes(search.toLowerCase()) || j.id.includes(search);
    const matchStatus = statusFilter === 'all' || (() => {
      const s = j.status?.toLowerCase() ?? '';
      if (statusFilter === 'running') return s === 'running' || s === 'in_progress';
      if (statusFilter === 'done') return s === 'done' || s === 'completed';
      if (statusFilter === 'error') return s === 'error' || s === 'failed';
      return true;
    })();
    return matchSearch && matchStatus;
  });

  const running = jobs.filter(j => j.status === 'running' || j.status === 'in_progress');

  return (
    <PageShell>
      {/* Top bar */}
      <div className="sona-page-topbar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>All Jobs</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            {jobs.length} total · {running.length} running
          </p>
        </div>
        <button
          onClick={fetchJobs}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', borderRadius: '10px',
            border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.1)',
            color: '#a78bfa', fontSize: '12px', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Search + filter bar */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by goal or job ID…"
              style={{
                width: '100%', paddingLeft: '36px', paddingRight: '14px', paddingTop: '9px', paddingBottom: '9px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', color: '#e2e8f0', fontSize: '13px', fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {STATUS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  border: `1px solid ${statusFilter === f ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  background: statusFilter === f ? 'rgba(124,58,237,0.15)' : 'transparent',
                  color: statusFilter === f ? '#a78bfa' : '#64748b',
                  cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Jobs list */}
        <div className="glass" style={{ borderRadius: '16px', padding: '20px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Activity size={15} color="#a78bfa" />
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Jobs</h2>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569' }}>{filtered.length} entries</span>
          </div>
          {filtered.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#334155', fontStyle: 'italic', textAlign: 'center', padding: '32px 0' }}>
              No jobs found
            </p>
          ) : (
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
              {filtered.map(job => <JobRow key={job.id} job={job} />)}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
