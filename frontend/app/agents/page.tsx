'use client';

import { useEffect, useState, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Skull,
} from 'lucide-react';

interface Job {
  id: string;
  goal?: string;
  status?: string;
  startedAt?: string | number;
  completedAt?: string | number;
  mtime?: number;
}

interface LogLine {
  type?: string;
  message?: { content?: { type?: string; text?: string }[] };
  raw?: string;
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

function extractLogText(lines: LogLine[]): string {
  return lines
    .filter((l) => l.type === 'assistant' || l.type === 'tool_result' || l.raw)
    .map((l) => {
      if (l.raw) return l.raw;
      const content = l.message?.content ?? [];
      return content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');
    })
    .filter(Boolean)
    .slice(-30)
    .join('\n');
}

function JobCard({ job, onKilled }: { job: Job; onKilled: () => void }) {
  const s = statusConfig(job.status);
  const isRunning = job.status === 'running' || job.status === 'in_progress';
  const [showLogs, setShowLogs] = useState(false);
  const [logText, setLogText] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [killing, setKilling] = useState(false);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/log`);
      if (res.ok) {
        const data = await res.json();
        setLogText(extractLogText(data.lines ?? []));
      } else {
        setLogText('(log not found)');
      }
    } catch {
      setLogText('(error loading log)');
    } finally {
      setLogsLoading(false);
    }
  };

  const toggleLogs = () => {
    if (!showLogs && !logText) fetchLogs();
    setShowLogs((v) => !v);
  };

  const handleKill = async () => {
    if (!confirm(`Kill job ${job.id.slice(0, 8)}?`)) return;
    setKilling(true);
    try {
      await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      onKilled();
    } finally {
      setKilling(false);
    }
  };

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
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
        <p style={{
          fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5, flex: 1, margin: 0,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
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

      {/* Meta + actions row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <code style={{ fontSize: '10px', color: '#475569', fontFamily: 'monospace' }}>#{job.id?.slice(0, 8)}</code>
        {job.startedAt && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569' }}>
            <Clock size={10} /> {elapsed(job.startedAt)}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {/* Logs button */}
          <button
            onClick={toggleLogs}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
              color: '#64748b', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {logsLoading ? <Loader2 size={10} className="animate-spin" /> : (showLogs ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
            Logs
          </button>

          {/* Kill button — only for running jobs */}
          {isRunning && (
            <button
              onClick={handleKill}
              disabled={killing}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
                color: '#f87171', cursor: killing ? 'not-allowed' : 'pointer',
                opacity: killing ? 0.6 : 1, fontFamily: 'inherit',
              }}
            >
              {killing ? <Loader2 size={10} className="animate-spin" /> : <Skull size={10} />}
              Kill
            </button>
          )}
        </div>
      </div>

      {/* Log expand */}
      {showLogs && (
        <pre style={{
          marginTop: '10px', padding: '10px 12px',
          background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
          fontSize: '10px', color: '#64748b', lineHeight: 1.6,
          maxHeight: '200px', overflow: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: 'monospace',
        }}>
          {logText || '(empty log)'}
        </pre>
      )}
    </div>
  );
}

export default function AgentsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [killingAll, setKillingAll] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      const all: Job[] = Array.isArray(data) ? data : (data?.jobs ?? []);
      // Sort: running first, then by mtime desc
      all.sort((a, b) => {
        const aRunning = a.status === 'running' || a.status === 'in_progress';
        const bRunning = b.status === 'running' || b.status === 'in_progress';
        if (aRunning && !bRunning) return -1;
        if (!aRunning && bRunning) return 1;
        return (b.mtime ?? 0) - (a.mtime ?? 0);
      });
      setJobs(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 5000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  const handleKillAll = async () => {
    if (!confirm('Kill all running jobs?')) return;
    setKillingAll(true);
    try {
      await fetch('http://172.17.0.1:8080/api/jobs/killall', { method: 'POST' }).catch(() => {});
      await fetchJobs();
    } finally {
      setKillingAll(false);
    }
  };

  const runningCount = jobs.filter((j) => j.status === 'running' || j.status === 'in_progress').length;

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
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>All Agents</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            {runningCount} running · {jobs.length} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {runningCount > 0 && (
            <button
              onClick={handleKillAll}
              disabled={killingAll}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '10px',
                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
                color: '#f87171', fontSize: '12px', fontWeight: 600,
                cursor: killingAll ? 'not-allowed' : 'pointer',
                opacity: killingAll ? 0.6 : 1, fontFamily: 'inherit',
              }}
            >
              {killingAll ? <Loader2 size={13} className="animate-spin" /> : <Skull size={13} />}
              Kill All Running
            </button>
          )}
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
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '28px 32px' }}>
        {jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Bot size={40} color="#1e2535" style={{ margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: '14px', color: '#334155', margin: 0 }}>No jobs found</p>
          </div>
        ) : (
          <div>
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onKilled={fetchJobs} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
