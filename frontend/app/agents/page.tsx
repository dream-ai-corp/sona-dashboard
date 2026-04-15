'use client';

import { useEffect, useState, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Zap,
  RefreshCw,
  Clock,
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
        padding: '16px 18px',
        marginBottom: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
        <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5, flex: 1, margin: 0 }}>
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#67e8f9' }}>
            <Clock size={10} /> {elapsed(job.startedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      const all: Job[] = Array.isArray(data) ? data : (data?.jobs ?? []);
      setJobs(all.filter(j => j.status === 'running' || j.status === 'in_progress'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      es = new EventSource('/api/jobs/stream');

      es.onmessage = (e) => {
        try {
          const all: Job[] = JSON.parse(e.data);
          all.sort((a, b) => {
            const aRunning = a.status === 'running' || a.status === 'in_progress';
            const bRunning = b.status === 'running' || b.status === 'in_progress';
            if (aRunning && !bRunning) return -1;
            if (!aRunning && bRunning) return 1;
            return (b.mtime ?? 0) - (a.mtime ?? 0);
          });
          setJobs(all.filter((j) => j.status === 'running' || j.status === 'in_progress'));
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
  }, []);

  return (
    <PageShell>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>Active Agents</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>Running jobs and agents</p>
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
      <div style={{ flex: 1, padding: '28px 32px' }}>
        <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#67e8f9', boxShadow: '0 0 8px rgba(6,182,212,0.8)' }} className="status-dot-pulse" />
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Running Jobs</h2>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569', background: 'rgba(6,182,212,0.08)', padding: '2px 8px', borderRadius: '20px', border: '1px solid rgba(6,182,212,0.15)' }}>
              {jobs.length} active
            </span>
          </div>

          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Bot size={40} color="#1e2535" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '14px', color: '#334155', margin: 0 }}>No active agents right now</p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: '6px 0 0' }}>Agents will appear here when jobs are running</p>
            </div>
          ) : (
            <div>
              {jobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
