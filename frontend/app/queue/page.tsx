'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import {
  ListOrdered,
  Plus,
  Trash2,
  GripVertical,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Timer,
  Calendar,
} from 'lucide-react';

interface QueueItem {
  id: string;
  item_id: string | null;
  item_text: string | null;
  project_id: string;
  sprint_id: string | null;
  priority: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  scheduled_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  agent_job_id: string | null;
  estimated_duration_sec: number | null;
  sort_order: number;
  created_at: number;
}

interface Project {
  id: string;
  name: string;
  hasBacklog: boolean;
}

interface BacklogItem {
  index: number;
  text: string;
  checked: boolean;
  priority: string | null;
}

const PROJECT_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  '#a78bfa', '#67e8f9', '#f472b6', '#fbbf24', '#4ade80',
  '#fb923c', '#818cf8', '#34d399', '#f87171', '#38bdf8',
];

function getProjectColor(projectId: string): string {
  if (!PROJECT_COLORS[projectId]) {
    const idx = Object.keys(PROJECT_COLORS).length % COLOR_PALETTE.length;
    PROJECT_COLORS[projectId] = COLOR_PALETTE[idx];
  }
  return PROJECT_COLORS[projectId];
}

function formatDuration(sec: number | null): string {
  if (!sec) return '--';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return '--';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function priorityLabel(p: number): string {
  return p === 1 ? 'P1' : p === 3 ? 'P3' : 'P2';
}

function priorityColor(p: number): string {
  return p === 1 ? '#f87171' : p === 3 ? '#64748b' : '#fbbf24';
}

// ── Timeline component ──────────────────────────────────────────────────────

function Timeline({ items, scale }: { items: QueueItem[]; scale: '1d' | '3d' | '7d' }) {
  const hours = scale === '1d' ? 24 : scale === '3d' ? 72 : 168;
  const now = Date.now();
  const startMs = now;
  const endMs = now + hours * 3600_000;
  const totalMs = endMs - startMs;

  // Build blocks from queued + running items with estimated durations
  const blocks: { id: string; projectId: string; label: string; startPct: number; widthPct: number; status: string }[] = [];
  let cursor = now;

  // Running items first
  const running = items.filter((i) => i.status === 'running');
  for (const item of running) {
    const start = item.started_at ?? now;
    const estEnd = start + (item.estimated_duration_sec ?? 1800) * 1000;
    const s = Math.max(0, (start - startMs) / totalMs) * 100;
    const w = Math.max(1, ((estEnd - start) / totalMs) * 100);
    blocks.push({ id: item.id, projectId: item.project_id, label: item.item_text ?? item.project_id, startPct: s, widthPct: w, status: 'running' });
    cursor = Math.max(cursor, estEnd);
  }

  // Queued items stacked after running
  const queued = items.filter((i) => i.status === 'queued');
  for (const item of queued) {
    const dur = (item.estimated_duration_sec ?? 1800) * 1000;
    const s = Math.max(0, (cursor - startMs) / totalMs) * 100;
    const w = Math.max(0.5, (dur / totalMs) * 100);
    blocks.push({ id: item.id, projectId: item.project_id, label: item.item_text ?? item.project_id, startPct: s, widthPct: w, status: 'queued' });
    cursor += dur;
  }

  // Hour markers
  const markerCount = scale === '1d' ? 6 : scale === '3d' ? 6 : 7;
  const markerStep = hours / markerCount;

  return (
    <div style={{ position: 'relative', height: '60px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      {/* Hour markers */}
      {Array.from({ length: markerCount + 1 }).map((_, i) => {
        const pct = (i * markerStep / hours) * 100;
        const d = new Date(now + i * markerStep * 3600_000);
        const label = scale === '7d'
          ? d.toLocaleDateString('fr-FR', { weekday: 'short' })
          : `${d.getHours()}h`;
        return (
          <div key={i} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.05)', zIndex: 1 }}>
            <span style={{ position: 'absolute', top: '2px', left: '4px', fontSize: '9px', color: '#475569', whiteSpace: 'nowrap' }}>{label}</span>
          </div>
        );
      })}
      {/* Blocks */}
      {blocks.map((b) => {
        const color = getProjectColor(b.projectId);
        return (
          <div
            key={b.id}
            title={b.label}
            style={{
              position: 'absolute',
              left: `${b.startPct}%`,
              width: `${Math.min(b.widthPct, 100 - b.startPct)}%`,
              top: '20px',
              height: '32px',
              background: b.status === 'running' ? `${color}33` : `${color}1a`,
              border: `1px solid ${color}66`,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '6px',
              overflow: 'hidden',
              zIndex: 2,
              animation: b.status === 'running' ? 'pulse 2s ease-in-out infinite' : undefined,
            }}
          >
            <span style={{ fontSize: '10px', color, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {b.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Queue Card ──────────────────────────────────────────────────────────────

function QueueCard({
  item,
  onDelete,
  dragHandleProps,
}: {
  item: QueueItem;
  onDelete: (id: string) => void;
  dragHandleProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}) {
  const color = getProjectColor(item.project_id);

  return (
    <div
      data-testid="queue-card"
      {...dragHandleProps}
      style={{
        padding: '12px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
        marginBottom: '6px',
        cursor: dragHandleProps?.draggable ? 'grab' : 'default',
        animation: item.status === 'running' ? 'pulse 2s ease-in-out infinite' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        {dragHandleProps?.draggable && (
          <GripVertical size={14} color="#475569" style={{ marginTop: '2px', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
            {/* Project chip */}
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
              background: `${color}1a`, color, border: `1px solid ${color}44`,
            }}>
              {item.project_id}
            </span>
            {/* Priority chip */}
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px',
              color: priorityColor(item.priority),
            }}>
              {priorityLabel(item.priority)}
            </span>
            {item.sprint_id && (
              <span style={{ fontSize: '10px', color: '#475569' }}>
                {item.sprint_id}
              </span>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.4, marginBottom: '4px' }}>
            {item.item_text ?? 'Untitled task'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#475569' }}>
            {item.estimated_duration_sec && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Timer size={10} /> ~{formatDuration(item.estimated_duration_sec)}
              </span>
            )}
            {item.started_at && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Clock size={10} /> {timeAgo(item.started_at)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onDelete(item.id)}
          style={{
            background: 'transparent', border: 'none', color: '#475569',
            cursor: 'pointer', padding: '4px', flexShrink: 0,
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Add from backlog modal ──────────────────────────────────────────────────

function AddModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: { item_text: string; project_id: string; priority: number }) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/projects').then((r) => r.json()).then((data) => {
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      if (list.length > 0 && !selectedProject) setSelectedProject(list[0].id);
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    fetch(`/api/projects/${encodeURIComponent(selectedProject)}/backlog`)
      .then((r) => r.json())
      .then((data) => {
        const items = (data.items ?? []).filter((i: BacklogItem) => !i.checked);
        setBacklogItems(items);
      })
      .catch(() => setBacklogItems([]))
      .finally(() => setLoading(false));
  }, [selectedProject]);

  if (!open) return null;

  return (
    <div
      data-testid="add-queue-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '480px', maxHeight: '70vh', overflow: 'auto',
          background: '#0f1729', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px', padding: '24px',
        }}
      >
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: '0 0 16px' }}>
          Add to Queue
        </h3>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          style={{
            width: '100%', fontSize: '13px', padding: '8px 10px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: '#e2e8f0', marginBottom: '12px', fontFamily: 'inherit',
          }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
          ))}
        </select>

        {loading && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Loader2 size={16} color="#a78bfa" className="animate-spin" />
          </div>
        )}

        {!loading && backlogItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#475569', fontSize: '13px' }}>
            No open backlog items for this project.
          </div>
        )}

        {!loading && backlogItems.map((item) => (
          <button
            key={item.index}
            onClick={() => {
              const prio = item.priority === 'P1' ? 1 : item.priority === 'P3' ? 3 : 2;
              onAdd({ item_text: item.text, project_id: selectedProject, priority: prio });
            }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 12px', marginBottom: '4px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
              color: '#e2e8f0', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {item.priority && (
              <span style={{ color: priorityColor(item.priority === 'P1' ? 1 : item.priority === 'P3' ? 3 : 2), fontWeight: 700, marginRight: '6px', fontSize: '11px' }}>
                [{item.priority}]
              </span>
            )}
            {item.text}
          </button>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [timeScale, setTimeScale] = useState<'1d' | '3d' | '7d'>('1d');
  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/queue/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAdd = async (data: { item_text: string; project_id: string; priority: number }) => {
    const res = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowAdd(false);
      fetchQueue();
    }
  };

  const handleDragStart = (id: string) => {
    dragItem.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverItem.current = id;
  };

  const handleDrop = async () => {
    if (!dragItem.current || !dragOverItem.current || dragItem.current === dragOverItem.current) return;
    const queued = items.filter((i) => i.status === 'queued');
    const fromIdx = queued.findIndex((i) => i.id === dragItem.current);
    const toIdx = queued.findIndex((i) => i.id === dragOverItem.current);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...queued];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const ids = reordered.map((i) => i.id);
    // Optimistic update
    const updated = items.map((i) => {
      if (i.status !== 'queued') return i;
      const newOrder = ids.indexOf(i.id);
      return { ...i, sort_order: newOrder };
    });
    setItems(updated);

    await fetch('/api/queue/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const queued = items.filter((i) => i.status === 'queued').sort((a, b) => a.sort_order - b.sort_order || a.priority - b.priority);
  const running = items.filter((i) => i.status === 'running');
  const done = items.filter((i) => ['done', 'failed', 'cancelled'].includes(i.status)).sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));

  const columnStyle: React.CSSProperties = {
    flex: 1,
    minWidth: '280px',
    maxWidth: '400px',
  };

  const columnHeaderStyle = (color: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '8px',
    marginBottom: '12px', paddingBottom: '8px',
    borderBottom: `2px solid ${color}`,
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0f1a' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ListOrdered size={20} color="#a78bfa" />
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Agent Queue</h1>
            <span style={{ fontSize: '12px', color: '#475569' }}>
              {queued.length} queued / {running.length} running / {done.length} done
            </span>
          </div>
          <button
            data-testid="add-to-queue-btn"
            onClick={() => setShowAdd(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '8px 14px', borderRadius: '10px',
              background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
              color: '#a78bfa', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {/* Timeline */}
        <div className="glass" style={{ borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={13} color="#64748b" />
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Timeline</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['1d', '3d', '7d'] as const).map((s) => (
                <button
                  key={s}
                  data-testid={`scale-${s}`}
                  onClick={() => setTimeScale(s)}
                  style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                    background: timeScale === s ? 'rgba(124,58,237,0.2)' : 'transparent',
                    border: timeScale === s ? '1px solid rgba(124,58,237,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    color: timeScale === s ? '#a78bfa' : '#475569',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <Timeline items={items} scale={timeScale} />
        </div>

        {/* Kanban columns */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Loader2 size={24} color="#a78bfa" className="animate-spin" />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Queued */}
            <div style={columnStyle} data-testid="column-queued">
              <div style={columnHeaderStyle('#fbbf24')}>
                <Clock size={14} color="#fbbf24" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#fbbf24' }}>Queued</span>
                <span style={{ fontSize: '11px', color: '#475569' }}>({queued.length})</span>
              </div>
              {queued.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#334155', fontSize: '12px' }}>
                  Queue is empty
                </div>
              )}
              {queued.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  onDelete={handleDelete}
                  dragHandleProps={{
                    draggable: true,
                    onDragStart: () => handleDragStart(item.id),
                    onDragOver: (e: React.DragEvent) => handleDragOver(e, item.id),
                    onDrop: () => { handleDrop(); },
                    onDragEnd: handleDragEnd,
                  }}
                />
              ))}
            </div>

            {/* Running */}
            <div style={columnStyle} data-testid="column-running">
              <div style={columnHeaderStyle('#a78bfa')}>
                <Loader2 size={14} color="#a78bfa" className="animate-spin" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#a78bfa' }}>Running</span>
                <span style={{ fontSize: '11px', color: '#475569' }}>({running.length})</span>
              </div>
              {running.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#334155', fontSize: '12px' }}>
                  No running agents
                </div>
              )}
              {running.map((item) => (
                <QueueCard key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </div>

            {/* Done */}
            <div style={columnStyle} data-testid="column-done">
              <div style={columnHeaderStyle('#4ade80')}>
                <CheckCircle2 size={14} color="#4ade80" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#4ade80' }}>Done</span>
                <span style={{ fontSize: '11px', color: '#475569' }}>({done.length})</span>
              </div>
              {done.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#334155', fontSize: '12px' }}>
                  No completed items
                </div>
              )}
              {done.map((item) => (
                <QueueCard key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        <AddModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} />

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </main>
    </div>
  );
}
