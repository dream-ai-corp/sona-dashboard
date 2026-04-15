'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import { Activity, Zap, CheckCircle, XCircle, AlertCircle, Terminal, MessageSquare, Bot } from 'lucide-react';

interface ActivityEvent {
  ts: number;
  type: string;
  command?: string;
  stdout?: string;
  stderr?: string;
  ok?: boolean;
  code?: number;
  goal?: string;
  job_id?: string;
  content?: string;
  from?: string;
  channel?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function eventColor(type: string, ok?: boolean): string {
  if (ok === false) return '#ef4444';
  if (type === 'host_exec') return '#38bdf8';
  if (type === 'agent_spawn') return '#a78bfa';
  if (type === 'message') return '#94a3b8';
  if (type === 'response') return '#4ade80';
  if (type.includes('error') || type.includes('fail')) return '#ef4444';
  if (type.includes('done') || type.includes('complete') || type.includes('success')) return '#22c55e';
  if (type.includes('warn')) return '#f59e0b';
  return '#64748b';
}

function EventIcon({ type, ok }: { type: string; ok?: boolean }) {
  const color = eventColor(type, ok);
  if (ok === false) return <XCircle size={14} color={color} />;
  if (type === 'host_exec') return <Terminal size={14} color={color} />;
  if (type === 'agent_spawn') return <Bot size={14} color={color} />;
  if (type === 'message') return <MessageSquare size={14} color={color} />;
  if (type === 'response') return <MessageSquare size={14} color={color} />;
  if (type.includes('error') || type.includes('fail')) return <XCircle size={14} color={color} />;
  if (type.includes('done') || type.includes('complete')) return <CheckCircle size={14} color={color} />;
  if (type.includes('start') || type.includes('spawn')) return <Zap size={14} color={color} />;
  if (type.includes('warn')) return <AlertCircle size={14} color={color} />;
  return <Activity size={14} color={color} />;
}

function formatTypeLabel(type: string): string {
  switch (type) {
    case 'host_exec': return 'exec';
    case 'agent_spawn': return 'spawn';
    case 'message': return 'msg';
    case 'response': return 'reply';
    default: return type;
  }
}

function EventCard({ ev }: { ev: ActivityEvent }) {
  const [expanded, setExpanded] = useState(false);
  const color = eventColor(ev.type, ev.ok);
  const hasOutput = !!(ev.stdout || ev.stderr);
  const hasDetails = hasOutput || ev.goal || ev.content;

  return (
    <div
      onClick={() => hasDetails && setExpanded(v => !v)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '12px',
        padding: '10px 14px', borderRadius: '10px',
        borderLeft: `2px solid ${color}`,
        background: 'rgba(255,255,255,0.02)',
        cursor: hasDetails ? 'pointer' : 'default',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ marginTop: '2px', flexShrink: 0 }}>
        <EventIcon type={ev.type} ok={ev.ok} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header line: type badge + main content */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '10px', fontWeight: 700, color, fontFamily: 'monospace',
            textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
          }}>
            {formatTypeLabel(ev.type)}
          </span>

          {ev.type === 'host_exec' && ev.command && (
            <code style={{
              fontSize: '12px', color: '#cbd5e1', fontFamily: 'monospace',
              wordBreak: 'break-all', lineHeight: 1.4,
            }}>
              {ev.command}
            </code>
          )}

          {ev.type === 'agent_spawn' && ev.goal && (
            <span style={{ fontSize: '12px', color: '#c4b5fd', lineHeight: 1.4 }}>
              {String(ev.goal).slice(0, 120)}{String(ev.goal).length > 120 ? '…' : ''}
            </span>
          )}

          {(ev.type === 'message' || ev.type === 'response') && (
            <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
              {ev.from && <span style={{ color: '#64748b' }}>{ev.from}: </span>}
              {String(ev.content ?? ev.message ?? '').slice(0, 150)}
              {String(ev.content ?? ev.message ?? '').length > 150 ? '…' : ''}
            </span>
          )}

          {!['host_exec', 'agent_spawn', 'message', 'response'].includes(ev.type) && (
            <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
              {String(ev.goal ?? ev.message ?? ev.content ?? '').slice(0, 150)}
            </span>
          )}
        </div>

        {/* Status line for host_exec */}
        {ev.type === 'host_exec' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '3px', alignItems: 'center' }}>
            {ev.code !== undefined && (
              <span style={{
                fontSize: '10px', fontFamily: 'monospace',
                color: ev.code === 0 ? '#4ade80' : '#f87171',
              }}>
                exit {ev.code}
              </span>
            )}
            {hasOutput && (
              <span style={{ fontSize: '10px', color: '#475569' }}>
                {expanded ? '▲ hide output' : '▼ show output'}
              </span>
            )}
          </div>
        )}

        {/* Expanded output */}
        {expanded && (
          <div style={{ marginTop: '8px' }}>
            {ev.stdout && (
              <pre style={{
                padding: '8px 10px', background: 'rgba(0,0,0,0.4)', borderRadius: '6px',
                fontSize: '10px', color: '#94a3b8', lineHeight: 1.6,
                maxHeight: '200px', overflow: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
                margin: '0 0 6px',
              }}>
                {ev.stdout}
              </pre>
            )}
            {ev.stderr && (
              <pre style={{
                padding: '8px 10px', background: 'rgba(239,68,68,0.05)', borderRadius: '6px',
                fontSize: '10px', color: '#f87171', lineHeight: 1.6,
                maxHeight: '120px', overflow: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
                margin: 0,
              }}>
                {ev.stderr}
              </pre>
            )}
            {ev.goal && ev.type === 'agent_spawn' && (
              <div style={{
                padding: '8px 10px', background: 'rgba(167,139,250,0.05)', borderRadius: '6px',
                fontSize: '11px', color: '#c4b5fd', lineHeight: 1.6,
              }}>
                {ev.goal}
              </div>
            )}
          </div>
        )}

        {ev.error && (
          <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px', fontFamily: 'monospace' }}>
            {String(ev.error).slice(0, 200)}
          </div>
        )}
      </div>

      <div style={{ fontSize: '10px', color: '#334155', flexShrink: 0, fontFamily: 'monospace', marginTop: '2px' }}>
        {timeAgo(ev.ts)}
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      es = new EventSource('/api/activity/stream');

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        try {
          const data: ActivityEvent[] = JSON.parse(e.data);
          setEvents(data);
          setConnected(true);
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        setConnected(false);
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

  const filtered = filter
    ? events.filter(ev => JSON.stringify(ev).toLowerCase().includes(filter.toLowerCase()))
    : events;

  const reversed = filtered.slice().reverse();

  return (
    <PageShell>
      <div className="sona-page-topbar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Activity</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            {filtered.length} event{filtered.length !== 1 ? 's' : ''} ·{' '}
            <span style={{ color: connected ? '#4ade80' : '#f87171' }}>
              {connected ? 'live' : 'reconnecting…'}
            </span>
          </p>
        </div>
        <input
          type="text"
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '7px 12px', borderRadius: '10px', fontSize: '12px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#cbd5e1', outline: 'none', fontFamily: 'inherit', width: '180px',
          }}
        />
      </div>

      <div style={{ flex: 1, padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {reversed.length === 0 && (
          <div style={{ textAlign: 'center', color: '#334155', padding: '60px 0', fontSize: '14px' }}>
            No activity events yet.
          </div>
        )}
        {reversed.map((ev, i) => <EventCard key={i} ev={ev} />)}
      </div>
    </PageShell>
  );
}
