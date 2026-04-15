'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import PageShell from '@/components/PageShell';
import { MessageSquare, RefreshCw, Trash2 } from 'lucide-react';

interface ConversationRow {
  id: number;
  role: string;
  content: string;
  channel: string;
  timestamp: number;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return String(ts);
  }
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function ConversationsPage() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const connectSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource('/api/conversations/stream');
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (Array.isArray(data)) {
          setRows(data);
          setLoading(false);
        }
      } catch {
        // ignore malformed frames
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      // Reconnect after 3 seconds
      setTimeout(connectSSE, 3000);
    };
  }, []);

  useEffect(() => {
    connectSSE();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connectSSE]);

  const handleManualRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClear = async () => {
    if (!confirm('Clear all conversations? This cannot be undone.')) return;
    setClearing(true);
    try {
      await fetch('/api/conversations', { method: 'DELETE' });
      setRows([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to clear');
    } finally {
      setClearing(false);
    }
  };

  // Group by date
  const grouped: { date: string; rows: ConversationRow[] }[] = [];
  for (const row of rows) {
    const date = formatDate(row.timestamp);
    const last = grouped[grouped.length - 1];
    if (last && last.date === date) {
      last.rows.push(row);
    } else {
      grouped.push({ date, rows: [row] });
    }
  }

  return (
    <PageShell>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Conversations</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            {rows.length} message{rows.length !== 1 ? 's' : ''} · persisted in SQLite ·{' '}
            <span style={{ color: connected ? '#4ade80' : '#f87171' }}>
              {connected ? 'live' : 'reconnecting…'}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {rows.length > 0 && (
            <button
              onClick={handleClear}
              disabled={clearing}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '10px',
                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
                color: '#f87171', fontSize: '12px', fontWeight: 600,
                cursor: clearing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              <Trash2 size={13} />
              Clear All
            </button>
          )}
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '10px',
              border: '1px solid rgba(124,58,237,0.3)',
              background: 'rgba(124,58,237,0.1)', color: '#a78bfa',
              fontSize: '12px', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '12px', padding: '14px 18px', color: '#f87171', fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div style={{ textAlign: 'center', color: '#334155', padding: '60px 0', fontSize: '14px' }}>
            <MessageSquare size={36} color="#1e2535" style={{ margin: '0 auto 12px', display: 'block' }} />
            No conversations yet. Messages from Discord will appear here.
          </div>
        )}

        {grouped.map(({ date, rows: dayRows }) => (
          <div key={date}>
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
              color: '#334155', textTransform: 'uppercase', marginBottom: '12px',
            }}>
              {date}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {dayRows.map((row) => {
                const isUser = row.role === 'user';
                return (
                  <div
                    key={row.id}
                    className="glass"
                    style={{
                      borderRadius: '12px',
                      padding: '12px 16px',
                      background: isUser ? 'rgba(124,58,237,0.04)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isUser ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                        color: isUser ? '#a78bfa' : '#67e8f9',
                      }}>
                        {isUser ? 'Pierre' : 'Sona'}
                      </span>
                      <span style={{ fontSize: '10px', color: '#334155', fontFamily: 'monospace' }}>
                        {formatTime(row.timestamp)}
                      </span>
                      {row.channel && row.channel !== 'discord' && (
                        <span style={{
                          fontSize: '10px', color: '#475569',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '4px', padding: '1px 5px',
                        }}>
                          {row.channel}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {row.content}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
