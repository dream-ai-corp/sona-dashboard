'use client';

import { useEffect, useState, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import {
  Repeat2, RefreshCw, Plus, Clock, Play, Pause,
  CheckCircle2, XCircle, Circle, Trash2, X, AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecurringJob {
  id: string;
  name: string;
  goal: string;
  schedule: string;
  scheduleType?: string;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek?: number[];
  timezone: string;
  enabled: boolean;
  lastRunAt?: string | number | null;
  lastStatus?: string | null;
  nextRunAt?: string | number | null;
}

type FrequencyType = 'daily' | 'weekly' | 'custom';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COMMON_TIMEZONES = [
  'UTC',
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts?: string | number | null): string {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function timeUntil(ts?: string | number | null): string {
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

function lastStatusBadge(status?: string | null) {
  const s = status?.toLowerCase() ?? '';
  if (s === 'done' || s === 'completed')
    return { label: 'Done', color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', icon: <CheckCircle2 size={11} /> };
  if (s === 'error' || s === 'failed')
    return { label: 'Failed', color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: <XCircle size={11} /> };
  if (s === 'running')
    return { label: 'Running', color: '#67e8f9', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.3)', icon: <Circle size={11} /> };
  return null;
}

/** Build a 5-part cron expression from form fields */
function buildCronExpression(freq: FrequencyType, startTime: string, daysOfWeek: number[]): string {
  if (freq === 'custom') return '';
  const [hStr, mStr] = startTime.split(':');
  const h = parseInt(hStr ?? '9', 10);
  const m = parseInt(mStr ?? '0', 10);
  if (freq === 'daily') return `${m} ${h} * * *`;
  // weekly
  const days = daysOfWeek.length ? daysOfWeek.sort((a, b) => a - b).join(',') : '*';
  return `${m} ${h} * * ${days}`;
}

// ── New Job Modal ─────────────────────────────────────────────────────────────

interface NewJobModalProps {
  onClose: () => void;
  onCreated: (job: RecurringJob) => void;
}

function NewJobModal({ onClose, onCreated }: NewJobModalProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [freq, setFreq] = useState<FrequencyType>('daily');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]); // Mon default
  const [customCron, setCustomCron] = useState('0 9 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cronPreview = freq === 'custom' ? customCron : buildCronExpression(freq, startTime, daysOfWeek);

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Name is required'); return; }
    if (!goal.trim()) { setError('Goal / prompt is required'); return; }
    if (!cronPreview.trim()) { setError('Schedule is required'); return; }
    if (freq === 'weekly' && daysOfWeek.length === 0) {
      setError('Select at least one day of the week'); return;
    }

    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        goal: goal.trim(),
        schedule: cronPreview.trim(),
        scheduleType: freq,
        startTime: freq !== 'custom' ? startTime : null,
        endTime: (freq !== 'custom' && endTime) ? endTime : null,
        daysOfWeek: freq === 'weekly' ? daysOfWeek : [],
        timezone,
      };
      const res = await fetch('/api/recurring-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const job: RecurringJob = await res.json();
      onCreated(job);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
    color: '#e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 700,
    color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase',
    marginBottom: '6px',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px', width: '100%', maxWidth: '560px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Repeat2 size={16} color="#a78bfa" />
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              New Recurring Job
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
              color: '#64748b', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px' }}>
          {/* Name */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Name</label>
            <input
              style={inputStyle}
              placeholder="e.g. Daily project sync"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Goal */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Goal / Prompt</label>
            <textarea
              style={{ ...inputStyle, minHeight: '90px', resize: 'vertical', lineHeight: 1.5 }}
              placeholder="Describe what the sub-agent should do each time this job runs…"
              value={goal}
              onChange={e => setGoal(e.target.value)}
            />
          </div>

          {/* Frequency */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Frequency</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['daily', 'weekly', 'custom'] as FrequencyType[]).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFreq(f)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: '8px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    border: freq === f ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    background: freq === f ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                    color: freq === f ? '#a78bfa' : '#64748b',
                    transition: 'all 0.15s',
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Daily / Weekly: start + end time */}
          {freq !== 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Start Time</label>
                <input
                  type="time"
                  style={inputStyle}
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>End Time <span style={{ color: '#334155', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="time"
                  style={inputStyle}
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Weekly: days selector */}
          {freq === 'weekly' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Days of Week</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {DAY_LABELS.map((label, idx) => {
                  const active = daysOfWeek.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      style={{
                        flex: 1, padding: '7px 0', borderRadius: '8px',
                        fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'inherit',
                        border: active ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.06)',
                        background: active ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.02)',
                        color: active ? '#a78bfa' : '#334155',
                        transition: 'all 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom cron */}
          {freq === 'custom' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Cron Expression</label>
              <input
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '14px' }}
                placeholder="* * * * *"
                value={customCron}
                onChange={e => setCustomCron(e.target.value)}
                spellCheck={false}
              />
              <p style={{ fontSize: '11px', color: '#334155', margin: '5px 0 0' }}>
                Format: minute hour day-of-month month day-of-week
              </p>
            </div>
          )}

          {/* Timezone */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Timezone</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz} style={{ background: '#0f0f1a' }}>{tz}</option>
              ))}
            </select>
          </div>

          {/* Cron preview */}
          {cronPreview && (
            <div style={{
              marginBottom: '20px', padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <Clock size={12} color="#a78bfa" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: '#64748b' }}>Cron expression:</span>
              <code style={{ fontSize: '13px', color: '#a78bfa', fontFamily: 'monospace', fontWeight: 600 }}>
                {cronPreview}
              </code>
              <span style={{ fontSize: '11px', color: '#475569', marginLeft: 'auto' }}>{timezone}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: '16px', padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              display: 'flex', alignItems: 'center', gap: '8px',
              fontSize: '12px', color: '#f87171',
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                color: '#64748b', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '9px 20px', borderRadius: '10px',
                border: '1px solid rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.2)',
                color: submitting ? '#64748b' : '#a78bfa',
                fontSize: '13px', fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: submitting ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {submitting ? (
                <><RefreshCw size={12} className="animate-spin" /> Creating…</>
              ) : (
                <><Plus size={12} /> Create Job</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RecurringJobRow({
  job,
  onToggle,
  onDelete,
}: {
  job: RecurringJob;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
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

      {/* Delete */}
      <button
        onClick={() => onDelete(job.id)}
        title="Delete job"
        style={{
          flexShrink: 0,
          width: '30px', height: '30px',
          borderRadius: '8px',
          border: '1px solid rgba(239,68,68,0.15)',
          background: 'rgba(239,68,68,0.06)',
          color: '#475569',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.4)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#475569'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.15)'; }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecurringJobsPage() {
  const [jobs, setJobs] = useState<RecurringJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

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
      // Refresh to get updated nextRunAt
      fetchJobs();
    } catch {
      setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: currentlyEnabled } : j));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recurring job?')) return;
    setJobs(prev => prev.filter(j => j.id !== id));
    try {
      await fetch(`/api/recurring-jobs/${id}`, { method: 'DELETE' });
    } catch {
      fetchJobs(); // revert on error
    }
  };

  const handleCreated = (job: RecurringJob) => {
    setJobs(prev => [job, ...prev]);
  };

  const enabled = jobs.filter(j => j.enabled).length;

  return (
    <PageShell>
      {showModal && (
        <NewJobModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

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
            onClick={() => setShowModal(true)}
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
              <p style={{ fontSize: '12px', color: '#1e293b', margin: '0 0 20px' }}>
                Create a recurring job to schedule agents on a cron-based schedule.
              </p>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '9px 18px', borderRadius: '10px',
                  border: '1px solid rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.08)',
                  color: '#67e8f9', fontSize: '12px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Plus size={13} /> Create your first job
              </button>
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
                <div style={{ width: '30px', flexShrink: 0 }} />
              </div>
              {jobs.map(job => (
                <RecurringJobRow
                  key={job.id}
                  job={job}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
