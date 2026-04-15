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
  started_at?: string | number;
  startedAt?: string | number;
  completed_at?: string | number;
  mtime?: number;
}

interface ContentItem {
  type?: string;
  thinking?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: ContentItem[] | string;
  tool_use_id?: string;
}

interface LogLine {
  type?: string;
  message?: { role?: string; content?: ContentItem[] };
  raw?: string;
}

interface TimelineEntry {
  kind: 'thought' | 'tool' | 'tool_result' | 'dm' | 'text' | 'final';
  label: string;
  content: string;
  toolName?: string;
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
  if (s === 'killed')
    return { label: 'Killed', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.3)', icon: <Skull size={11} /> };
  return { label: status ?? 'Pending', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', icon: <Circle size={11} /> };
}

const SONA_TOOLS = new Set([
  'mcp__sona__sona_discord_dm',
  'mcp__sona__sona_music_control',
  'mcp__sona__sona_play_youtube',
  'mcp__sona__sona_remember',
  'mcp__sona__sona_recall',
  'mcp__sona__sona_browser_goto',
  'mcp__sona__sona_browser_click',
  'mcp__sona__sona_browser_type',
  'mcp__sona__sona_browser_read',
  'mcp__sona__sona_host_exec',
  'mcp__sona__sona_spawn_agent',
]);

function truncate(s: string, max = 300): string {
  if (!s) return '';
  const cleaned = s.replace(/\n+/g, ' ').trim();
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}

function formatToolInput(name: string, input: Record<string, unknown>): string {
  if (name === 'Bash' || name === 'mcp__sona__sona_host_exec') {
    return String(input.command ?? input.cmd ?? JSON.stringify(input)).slice(0, 200);
  }
  if (name === 'Read') return String(input.file_path ?? '');
  if (name === 'Edit') return `${input.file_path} — patch`;
  if (name === 'Write') return String(input.file_path ?? '');
  if (name === 'Grep') return `/${input.pattern}/ in ${input.path ?? '.'}`;
  if (name === 'Glob') return String(input.pattern ?? '');
  if (name === 'mcp__sona__sona_discord_dm') return truncate(String(input.content ?? ''), 200);
  if (name === 'mcp__sona__sona_host_exec') return truncate(String(input.command ?? ''), 200);
  return truncate(JSON.stringify(input), 200);
}

function extractTimeline(lines: LogLine[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let lastTextContent = '';

  for (const line of lines) {
    if (line.type === 'assistant' && line.message?.content) {
      for (const item of line.message.content) {
        if (item.type === 'thinking' && item.thinking) {
          entries.push({
            kind: 'thought',
            label: 'Thought',
            content: truncate(item.thinking, 300),
          });
        } else if (item.type === 'tool_use' && item.name) {
          const isDM = SONA_TOOLS.has(item.name) && item.name.includes('discord_dm');
          const isSona = SONA_TOOLS.has(item.name) && !isDM;
          const inputStr = item.input ? formatToolInput(item.name, item.input) : '';
          const shortName = item.name.replace('mcp__sona__sona_', '').replace('mcp__sona__', '');
          entries.push({
            kind: isDM ? 'dm' : 'tool',
            label: isDM ? `DM → ${inputStr.slice(0, 60)}` : `${shortName}`,
            content: isDM ? '' : inputStr,
            toolName: item.name,
          });
        } else if (item.type === 'text' && item.text) {
          lastTextContent = item.text;
        }
      }
    } else if (line.type === 'user' && line.message?.content) {
      for (const item of line.message.content) {
        if (item.type === 'tool_result') {
          const inner = item.content;
          let text = '';
          if (typeof inner === 'string') {
            text = inner;
          } else if (Array.isArray(inner)) {
            text = inner
              .filter((c) => c.type === 'text')
              .map((c) => c.text ?? '')
              .join('\n');
          }
          if (text) {
            entries.push({
              kind: 'tool_result',
              label: 'Output',
              content: truncate(text, 300),
            });
          }
        }
      }
    }
  }

  if (lastTextContent) {
    entries.push({
      kind: 'final',
      label: 'Final response',
      content: truncate(lastTextContent, 300),
    });
  }

  return entries;
}

const ENTRY_STYLES: Record<string, { icon: string; color: string; bg: string }> = {
  thought:     { icon: '💭', color: '#94a3b8', bg: 'rgba(148,163,184,0.06)' },
  tool:        { icon: '🔧', color: '#67e8f9', bg: 'rgba(6,182,212,0.06)'  },
  tool_result: { icon: '📤', color: '#64748b', bg: 'rgba(100,116,139,0.06)' },
  dm:          { icon: '📨', color: '#a78bfa', bg: 'rgba(124,58,237,0.08)'  },
  text:        { icon: '💬', color: '#cbd5e1', bg: 'rgba(203,213,225,0.04)' },
  final:       { icon: '✅', color: '#4ade80', bg: 'rgba(34,197,94,0.08)'   },
};

function TimelineView({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <p style={{ fontSize: '10px', color: '#475569', margin: 0 }}>(empty log)</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {entries.map((e, i) => {
        const st = ENTRY_STYLES[e.kind] ?? ENTRY_STYLES.text;
        return (
          <div
            key={i}
            style={{
              background: st.bg,
              borderLeft: `2px solid ${st.color}40`,
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              lineHeight: 1.5,
              fontFamily: 'monospace',
            }}
          >
            <span style={{ color: st.color, fontWeight: 600, marginRight: '6px' }}>
              {st.icon} {e.label}
            </span>
            {e.content && (
              <span style={{ color: '#64748b' }}>{e.content}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JobCard({ job, onKilled }: { job: Job; onKilled: () => void }) {
  const s = statusConfig(job.status);
  const isRunning = job.status === 'running' || job.status === 'in_progress';
  const [showLogs, setShowLogs] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [killing, setKilling] = useState(false);

  const startedAt = job.started_at ?? job.startedAt;

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/log`);
      if (res.ok) {
        const data = await res.json();
        setTimeline(extractTimeline(data.lines ?? []));
      } else {
        setTimeline([{ kind: 'text', label: 'Error', content: '(log not found)' }]);
      }
    } catch {
      setTimeline([{ kind: 'text', label: 'Error', content: '(error loading log)' }]);
    } finally {
      setLogsLoading(false);
    }
  };

  const toggleLogs = () => {
    if (!showLogs && timeline.length === 0) fetchLogs();
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
        {startedAt && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569' }}>
            <Clock size={10} /> {elapsed(startedAt)}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
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

      {showLogs && (
        <div style={{
          marginTop: '10px', padding: '10px 12px',
          background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
          maxHeight: '320px', overflow: 'auto',
        }}>
          <TimelineView entries={timeline} />
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [killingAll, setKillingAll] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      const all: Job[] = Array.isArray(data) ? data : (data?.jobs ?? []);
      setJobs(all);
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
          all.sort((a, b) => {
            const aR = a.status === 'running' || a.status === 'in_progress';
            const bR = b.status === 'running' || b.status === 'in_progress';
            if (aR && !bR) return -1;
            if (!aR && bR) return 1;
            return (b.mtime ?? 0) - (a.mtime ?? 0);
          });
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

  const handleKillAll = async () => {
    if (!confirm('Kill all running jobs?')) return;
    setKillingAll(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_SONA_API_URL ?? '';
      await fetch(`${apiUrl}/api/jobs/killall`, { method: 'POST' }).catch(() => {});
      await fetchJobs();
    } finally {
      setKillingAll(false);
    }
  };

  const runningCount = jobs.filter((j) => j.status === 'running' || j.status === 'in_progress').length;

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
        {loading && jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Loader2 size={32} color="#334155" style={{ margin: '0 auto 12px', display: 'block', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: '14px', color: '#334155', margin: 0 }}>Loading agents…</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Bot size={40} color="#1e2535" style={{ margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: '14px', color: '#334155', margin: 0 }}>No agents found</p>
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
