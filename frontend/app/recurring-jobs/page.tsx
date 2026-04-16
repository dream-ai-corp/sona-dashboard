'use client';

import { useEffect, useState, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import { Repeat2, RefreshCw, Plus, Clock, Play, Pause, CheckCircle2, XCircle, Circle } from 'lucide-react';

interface RecurringJob {
  id: string;
  name: string;
  goal: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastRunAt?: string | number;
  lastStatus?: string;
  nextRunAt?: string | number;
}

function formatDate(ts?: string | number): string {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function timeUntil(ts?: string | number): string {
  if (!ts) return '—';
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = ms - Date.now();
  if (diff < 0) return 'overdue';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `in ${s}s`;
  if (s < 3600) return `in ${Math.floor(s / 60)}m`;
  if (s < 86400) return `in ${Math.floor(s / 3600)}h`;
  return `in ${Math.floor(s / 86400)}d`;
}

function lastStatusBadge(status?: string) {
  const s = status?.toLowerCase() ?? '';
  if (s === 'done' || s === 'completed')
    return { label: 'Done', color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', icon: <CheckCircle2 size={11} /> };
  if (s === 'error' || s === 'failed')
    return { label: 'Failed', color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: <XCircle size={11} /> };
  if (s === 'running')
    return { label: 'Running', color: '#67e8f9', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.3)', icon: <Circle size={11} /> };
  return null;
}

function RecurringJobRow({ job, onToggle }: { job: RecurringJob; onToggle: (id: string, enabled: boolean) => void }) {
  const badge = lastStatusBadge(job.lastStatus);
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '12px',
      padding: '16px 20px',
      marginBottom: '10px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    }}>
      {/* Toggle */}
      <button
        onClick={() => onToggle(job.id, job.enabled)}
        title={job.enabled ? 'Pause' : 'Resume'}
        style={{
          flexShrink: 0,
          width: '32px', height: '32px',
          borderRadius: '8px',
          border: `1px solid ${job.enabled ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.08)'}`,
          background: job.enabled ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
          color: job.enabled ? '#a78bfa' : '#475569',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {job.enabled ? <Pause size={14} /> : <Play size={14} />}
      </button>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.name}
          </span>
          {!job.enabled && (
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)', color: '#475569', border: '1px solid rgba(255,255,255,0.08)',
            }}>PAUSED</span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.goal}
        </div>
      </div>

      {/* Schedule */}
      <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '110px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'monospace', color: '#a78bfa', marginBottom: '2px' }}>
          {job.schedule}
        </div>
        <div style={{ fontSize: '10px', color: '#475569' }}>{job.timezone}</div>
      </div>

      {/* Last run */}
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '120px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginBottom: '2px' }}>
          {badge && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '10px',
              background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
            }}>
              {badge.icon} {badge.label}
            </span>
          )}
        </div>
        <div style={{ fontSize: '10px', color: '#475569' }}>{formatDate(job.lastRunAt)}</div>
      </div>

      {/* Next run */}
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '90px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginBottom: '2px' }}>
          <Clock size={10} style={{ color: '#67e8f9' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: job.enabled ? '#67e8f9' : '#334155' }}>
            {job.enabled ? timeUntil(job.nextRunAt) : '—'}
          </span>
        </div>
        <div style={{ fontSize: '10px', color: '#475569' }}>
          {job.enabled ? formatDate(job.nextRunAt) : 'paused'}
        </div>
      </div>
    </div>
  );
}

export default function RecurringJobsPage() {
  const [jobs, setJobs] = useState<RecurringJob[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recurring-jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(Array.isArray(data) ? data : (data?.jobs ?? []));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleToggle = async (id: string, currentlyEnabled: boolean) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: !currentlyEnabled } : j));
    try {
      await fetch(`/api/recurring-jobs/${id}/toggle`, { method: 'POST' });
    } catch {
      // revert on error
      setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: currentlyEnabled } : j));
    }
  };

  const enabled = jobs.filter(j => j.enabled).length;

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
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
            Recurring Jobs
          </h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            {jobs.length} total · {enabled} active
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
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
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '10px',
              border: '1px solid rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.1)',
              color: '#67e8f9', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={13} />
            New Job
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '28px 32px' }}>
        <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Repeat2 size={15} color="#a78bfa" />
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
              Scheduled Agents
            </h2>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569' }}>
              {jobs.length} jobs
            </span>
          </div>

          {jobs.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Repeat2 size={32} style={{ color: '#1e293b', margin: '0 auto 16px', display: 'block' }} />
              <p style={{ fontSize: '14px', color: '#334155', margin: '0 0 6px' }}>No recurring jobs yet</p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: 0 }}>
                Create a recurring job to schedule agents on a cron-based schedule.
              </p>
            </div>
          ) : (
            <div>
              {/* Header row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                padding: '0 20px 10px', marginBottom: '4px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                color: '#334155', textTransform: 'uppercase',
              }}>
                <div style={{ width: '32px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>Name / Goal</div>
                <div style={{ width: '110px', flexShrink: 0, textAlign: 'center' }}>Schedule</div>
                <div style={{ width: '120px', flexShrink: 0, textAlign: 'right' }}>Last Run</div>
                <div style={{ width: '90px', flexShrink: 0, textAlign: 'right' }}>Next Run</div>
              </div>
              {jobs.map(job => (
                <RecurringJobRow key={job.id} job={job} onToggle={handleToggle} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
