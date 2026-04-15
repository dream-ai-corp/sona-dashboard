'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  ChevronLeft,
  FolderOpen,
  GitBranch,
  Server,
  Tag,
  Plus,
  RefreshCw,
  Check,
  X,
  Pencil,
  Loader2,
  Calendar,
  Target,
  Clock,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

interface Service {
  name: string;
  port: number;
  url?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  tags?: string[];
  services?: Service[];
  git?: { remote?: string };
  hasBacklog: boolean;
}

interface BacklogItem {
  index: number;
  lineIndex: number;
  text: string;
  checked: boolean;
}

interface BacklogSection {
  header: string | null;
  level: number;
  items: BacklogItem[];
}

interface Sprint {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'completed';
}

interface Job {
  id: string;
  goal?: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  elapsedSec?: number;
  mtime?: number;
}

function statusStyle(status: string) {
  switch (status?.toLowerCase()) {
    case 'active': return { color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' };
    case 'paused': return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' };
    case 'archived': return { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)' };
    default: return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' };
  }
}

function sprintStatusStyle(status: string) {
  switch (status) {
    case 'active': return { color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' };
    case 'planning': return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' };
    case 'completed': return { color: '#94a3b8', bg: 'rgba(71,85,105,0.1)', border: 'rgba(71,85,105,0.25)' };
    default: return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' };
  }
}

const inputStyle: React.CSSProperties = {
  fontSize: '13px', padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#e2e8f0',
  outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
};

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  padding: '6px 12px', borderRadius: '8px',
  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  color: '#64748b', fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  padding: '6px 12px', borderRadius: '8px',
  background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
  color: '#a78bfa', fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};

function BacklogHeader({ header, level }: { header: string; level: number }) {
  return (
    <div
      data-testid="backlog-section-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
        marginTop: '4px',
        borderLeft: level === 2
          ? '2px solid rgba(124,58,237,0.5)'
          : level === 3
          ? '2px solid rgba(6,182,212,0.4)'
          : 'none',
        paddingLeft: level >= 2 ? '10px' : '0',
      }}
    >
      <span
        style={{
          fontSize: level === 1 ? '14px' : level === 2 ? '13px' : '12px',
          fontWeight: 700,
          color: level === 1 ? '#e2e8f0' : level === 2 ? '#a78bfa' : '#67e8f9',
          letterSpacing: '0.02em',
          lineHeight: 1.3,
        }}
      >
        {header}
      </span>
    </div>
  );
}

function BacklogItemRow({
  item,
  onToggle,
  onEdit,
  saving,
}: {
  item: BacklogItem;
  onToggle: (item: BacklogItem) => void;
  onEdit: (item: BacklogItem, text: string) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitEdit = () => {
    if (draft.trim() && draft.trim() !== item.text) {
      onEdit(item, draft.trim());
    }
    setEditing(false);
    setDraft(item.text);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(item.text);
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 12px', borderRadius: '10px',
        background: item.checked ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${item.checked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)'}`,
        marginBottom: '6px', transition: 'all 150ms ease',
      }}
    >
      <button
        onClick={() => onToggle(item)}
        disabled={saving}
        style={{
          width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
          border: `2px solid ${item.checked ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
          background: item.checked ? 'rgba(34,197,94,0.2)' : 'transparent',
          cursor: saving ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 150ms ease', padding: 0,
        }}
      >
        {item.checked && <Check size={10} color="#4ade80" strokeWidth={3} />}
      </button>

      {editing ? (
        <div style={{ flex: 1, display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
            style={{
              flex: 1, fontSize: '13px', padding: '3px 8px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(124,58,237,0.4)',
              borderRadius: '6px', color: '#e2e8f0',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button onClick={commitEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4ade80', padding: '2px' }}>
            <Check size={14} />
          </button>
          <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <span
            style={{
              flex: 1, fontSize: '13px', lineHeight: 1.5,
              color: item.checked ? '#475569' : '#cbd5e1',
              textDecoration: item.checked ? 'line-through' : 'none',
            }}
          >
            {item.text}
          </span>
          <button
            onClick={() => { setDraft(item.text); setEditing(true); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#334155', padding: '2px', opacity: 0,
              transition: 'opacity 150ms',
            }}
            className="edit-btn"
          >
            <Pencil size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function SprintRow({
  sprint,
  onUpdate,
  onDelete,
}: {
  sprint: Sprint;
  onUpdate: (id: string, patch: Partial<Sprint>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Sprint>({ ...sprint });
  const [saving, setSaving] = useState(false);

  const ss = sprintStatusStyle(sprint.status);

  const commitEdit = async () => {
    setSaving(true);
    await onUpdate(sprint.id, draft);
    setSaving(false);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft({ ...sprint });
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{
        padding: '14px', borderRadius: '10px',
        background: 'rgba(124,58,237,0.06)',
        border: '1px solid rgba(124,58,237,0.25)',
        marginBottom: '8px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Sprint name"
            style={inputStyle}
          />
          <input
            value={draft.goal}
            onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}
            placeholder="Goal"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              type="date"
              value={draft.endDate}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Sprint['status'] }))}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={cancelEdit} style={ghostBtnStyle}>Cancel</button>
            <button onClick={commitEdit} disabled={saving} style={primaryBtnStyle}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px',
      padding: '12px 14px', borderRadius: '10px',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      marginBottom: '8px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{sprint.name}</span>
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
            background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {sprint.status}
          </span>
        </div>
        {sprint.goal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
            <Target size={11} color="#64748b" />
            <span style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>{sprint.goal}</span>
          </div>
        )}
        {(sprint.startDate || sprint.endDate) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Calendar size={11} color="#475569" />
            <span style={{ fontSize: '11px', color: '#475569' }}>
              {sprint.startDate || '?'} → {sprint.endDate || '?'}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <button
          onClick={() => setEditing(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: '4px', borderRadius: '6px', transition: 'color 150ms' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#a78bfa')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(sprint.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: '4px', borderRadius: '6px', transition: 'color 150ms' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ? decodeURIComponent(params.id) : '';

  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [sections, setSections] = useState<BacklogSection[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingBacklog, setLoadingBacklog] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Brief state
  const [brief, setBrief] = useState('');
  const [briefEditing, setBriefEditing] = useState(false);
  const [briefDraft, setBriefDraft] = useState('');
  const [briefSaving, setBriefSaving] = useState(false);

  // Sprints state
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [newSprint, setNewSprint] = useState<Omit<Sprint, 'id'>>({
    name: '', goal: '', startDate: '', endDate: '', status: 'planning',
  });
  const [sprintSaving, setSprintSaving] = useState(false);

  // Jobs history state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Status badge dropdown
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json() as { projects?: Project[] };
      const found = data.projects?.find((p) => p.id === id) ?? null;
      setProject(found);
    } catch {
      setProject(null);
    } finally {
      setLoadingProject(false);
    }
  }, [id]);

  const fetchBacklog = useCallback(async () => {
    setLoadingBacklog(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/backlog`);
      const data = await res.json() as { items?: BacklogItem[]; sections?: BacklogSection[]; error?: string };
      if (data.error) throw new Error(data.error);
      setItems(data.items ?? []);
      setSections(data.sections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backlog');
    } finally {
      setLoadingBacklog(false);
    }
  }, [id]);

  const fetchBrief = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/brief`);
      const data = await res.json() as { content: string };
      setBrief(data.content ?? '');
    } catch {
      setBrief('');
    }
  }, [id]);

  const fetchSprints = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/sprints`);
      const data = await res.json() as { sprints: Sprint[] };
      setSprints(data.sprints ?? []);
    } catch {
      setSprints([]);
    }
  }, [id]);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/jobs`);
      const data = await res.json() as { jobs?: Job[] };
      setJobs(data.jobs ?? []);
    } catch {
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchBacklog();
    fetchBrief();
    fetchSprints();
    fetchJobs();
  }, [fetchProject, fetchBacklog, fetchBrief, fetchSprints, fetchJobs]);

  const handleToggle = async (item: BacklogItem) => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(id)}/backlog/${item.index}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checked: !item.checked }),
        },
      );
      const data = await res.json() as { items?: BacklogItem[]; sections?: BacklogSection[] };
      if (data.items) setItems(data.items);
      if (data.sections) setSections(data.sections);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (item: BacklogItem, text: string) => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(id)}/backlog/${item.index}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      const data = await res.json() as { items?: BacklogItem[]; sections?: BacklogSection[] };
      if (data.items) setItems(data.items);
      if (data.sections) setSections(data.sections);
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    const text = newItemText.trim();
    if (!text) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/backlog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json() as { items?: BacklogItem[]; sections?: BacklogSection[] };
      if (data.items) setItems(data.items);
      if (data.sections) setSections(data.sections);
      setNewItemText('');
    } finally {
      setSaving(false);
    }
  };

  const handleBriefSave = async () => {
    setBriefSaving(true);
    try {
      await fetch(`/api/projects/${encodeURIComponent(id)}/brief`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: briefDraft }),
      });
      setBrief(briefDraft);
      setBriefEditing(false);
    } finally {
      setBriefSaving(false);
    }
  };

  const handleAddSprint = async () => {
    if (!newSprint.name.trim()) return;
    setSprintSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/sprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSprint),
      });
      const data = await res.json() as { sprints: Sprint[] };
      setSprints(data.sprints);
      setNewSprint({ name: '', goal: '', startDate: '', endDate: '', status: 'planning' });
    } finally {
      setSprintSaving(false);
    }
  };

  const handleUpdateSprint = async (sprintId: string, patch: Partial<Sprint>) => {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}/sprints/${sprintId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json() as { sprints: Sprint[] };
    setSprints(data.sprints);
  };

  const handleDeleteSprint = async (sprintId: string) => {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}/sprints/${sprintId}`, {
      method: 'DELETE',
    });
    const data = await res.json() as { sprints: Sprint[] };
    setSprints(data.sprints);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!project || statusSaving) return;
    setStatusSaving(true);
    setStatusDropdownOpen(false);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setProject((prev) => prev ? { ...prev, status: newStatus } : prev);
      }
    } finally {
      setStatusSaving(false);
    }
  };

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusDropdownOpen]);

  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const ss = project ? statusStyle(project.status) : statusStyle('active');

  const planningCount = sprints.filter((s) => s.status === 'planning').length;
  const activeCount = sprints.filter((s) => s.status === 'active').length;
  const completedCount = sprints.filter((s) => s.status === 'completed').length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)',
          position: 'sticky', top: 0, zIndex: 40,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/projects" style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '12px', color: '#475569', textDecoration: 'none',
              padding: '4px 8px', borderRadius: '6px',
              transition: 'color 150ms',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#a78bfa')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
            >
              <ChevronLeft size={13} />
              Projects
            </Link>
            <span style={{ color: '#1e293b' }}>/</span>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              {loadingProject ? id : (project?.name ?? id)}
            </h1>
            {project && (
              <div ref={statusDropdownRef} style={{ position: 'relative' }}>
                <button
                  data-testid="status-badge"
                  aria-label="Change project status"
                  onClick={() => setStatusDropdownOpen((o) => !o)}
                  disabled={statusSaving}
                  style={{
                    fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px',
                    background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: statusSaving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', transition: 'all 150ms',
                  }}
                >
                  {project.status}
                </button>
                {statusDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                    background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '4px', zIndex: 100,
                    minWidth: '110px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}>
                    {(['active', 'paused', 'archived'] as const).map((s) => {
                      const st = statusStyle(s);
                      const isCurrent = project.status.toLowerCase() === s;
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '7px',
                            width: '100%', padding: '7px 10px', borderRadius: '7px',
                            background: isCurrent ? st.bg : 'transparent',
                            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: '12px', fontWeight: 600,
                            color: isCurrent ? st.color : '#64748b',
                            textAlign: 'left', transition: 'all 100ms',
                          }}
                          onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                          onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            background: st.color, flexShrink: 0,
                          }} />
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={fetchBacklog}
            disabled={loadingBacklog}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
              borderRadius: '10px', border: '1px solid rgba(124,58,237,0.3)',
              background: 'rgba(124,58,237,0.1)', color: '#a78bfa',
              fontSize: '12px', fontWeight: 600,
              cursor: loadingBacklog ? 'not-allowed' : 'pointer',
              opacity: loadingBacklog ? 0.6 : 1, transition: 'all 200ms', fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={13} className={loadingBacklog ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '900px' }}>

          {/* Project info card */}
          {project && (
            <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(6,182,212,0.25))',
                  border: '1px solid rgba(124,58,237,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FolderOpen size={20} color="#a78bfa" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 4px' }}>
                    {project.name}
                  </h2>
                  {project.description && (
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>
                      {project.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    {project.tags?.map((tag) => (
                      <span key={tag} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        fontSize: '10px', padding: '2px 7px', borderRadius: '20px',
                        background: 'rgba(6,182,212,0.08)', color: '#67e8f9',
                        border: '1px solid rgba(6,182,212,0.2)',
                      }}>
                        <Tag size={8} /> {tag}
                      </span>
                    ))}
                    {project.services?.map((s) => (
                      <span key={s.name} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '10px', color: '#475569',
                      }}>
                        <Server size={10} /> :{s.port}
                      </span>
                    ))}
                    {project.git?.remote && (
                      <a
                        href={project.git.remote}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '10px', color: '#475569', textDecoration: 'none',
                        }}
                      >
                        <GitBranch size={10} />
                        {project.git.remote.replace('https://github.com/', '')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Brief */}
          <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Brief</h2>
              {!briefEditing && (
                <button
                  onClick={() => { setBriefDraft(brief); setBriefEditing(true); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#334155', padding: '4px 8px', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '11px', transition: 'color 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#a78bfa')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
                >
                  <Pencil size={13} />
                  Edit
                </button>
              )}
            </div>

            {briefEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <textarea
                  value={briefDraft}
                  onChange={(e) => setBriefDraft(e.target.value)}
                  placeholder="Write a brief overview of this project and its goals…"
                  style={{
                    width: '100%', minHeight: '120px', fontSize: '13px', lineHeight: 1.6,
                    padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(124,58,237,0.4)',
                    borderRadius: '10px', color: '#e2e8f0',
                    outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setBriefEditing(false); setBriefDraft(brief); }}
                    style={ghostBtnStyle}
                  >
                    Cancel
                  </button>
                  <button onClick={handleBriefSave} disabled={briefSaving} style={primaryBtnStyle}>
                    {briefSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div style={{
                fontSize: '13px', lineHeight: 1.7, color: brief ? '#cbd5e1' : '#334155',
                whiteSpace: 'pre-wrap',
              }}>
                {brief || 'No brief yet — click edit to add one.'}
              </div>
            )}
          </div>

          {/* Sprints */}
          <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Sprints</h2>
                {sprintSaving && <Loader2 size={13} color="#a78bfa" className="animate-spin" />}
              </div>
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#475569' }}>
                {activeCount > 0 && <span style={{ color: '#4ade80' }}>{activeCount} active</span>}
                {planningCount > 0 && <span style={{ color: '#fbbf24' }}>{planningCount} planning</span>}
                {completedCount > 0 && <span>{completedCount} completed</span>}
              </div>
            </div>

            {/* Add sprint form */}
            <div style={{
              padding: '14px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              marginBottom: '16px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                Add Sprint
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={newSprint.name}
                    onChange={(e) => setNewSprint((s) => ({ ...s, name: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSprint()}
                    placeholder="Sprint name"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    value={newSprint.goal}
                    onChange={(e) => setNewSprint((s) => ({ ...s, goal: e.target.value }))}
                    placeholder="Goal (optional)"
                    style={{ ...inputStyle, flex: 2 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={newSprint.startDate}
                    onChange={(e) => setNewSprint((s) => ({ ...s, startDate: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    type="date"
                    value={newSprint.endDate}
                    onChange={(e) => setNewSprint((s) => ({ ...s, endDate: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <select
                    value={newSprint.status}
                    onChange={(e) => setNewSprint((s) => ({ ...s, status: e.target.value as Sprint['status'] }))}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button
                    onClick={handleAddSprint}
                    disabled={sprintSaving || !newSprint.name.trim()}
                    style={{
                      ...primaryBtnStyle,
                      opacity: (sprintSaving || !newSprint.name.trim()) ? 0.5 : 1,
                      cursor: (sprintSaving || !newSprint.name.trim()) ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
            </div>

            {sprints.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#334155', fontSize: '13px' }}>
                No sprints yet. Add one above.
              </div>
            ) : (
              <div>
                {sprints.map((sprint) => (
                  <SprintRow
                    key={sprint.id}
                    sprint={sprint}
                    onUpdate={handleUpdateSprint}
                    onDelete={handleDeleteSprint}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Backlog */}
          <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Backlog</h2>
                {saving && <Loader2 size={13} color="#a78bfa" className="animate-spin" />}
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#475569' }}>
                <span>{open.length} open</span>
                <span>{done.length} done</span>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px', padding: '10px 12px', marginBottom: '16px',
                fontSize: '12px', color: '#f87171',
              }}>
                {error}
              </div>
            )}

            {/* Add item */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                placeholder="Add a new backlog item…"
                style={{
                  flex: 1, fontSize: '13px', padding: '9px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', color: '#e2e8f0',
                  outline: 'none', fontFamily: 'inherit',
                  transition: 'border-color 150ms',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
              <button
                onClick={handleAddItem}
                disabled={saving || !newItemText.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '9px 16px', borderRadius: '10px',
                  background: 'rgba(124,58,237,0.15)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  color: '#a78bfa', fontSize: '13px', fontWeight: 600,
                  cursor: (saving || !newItemText.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (saving || !newItemText.trim()) ? 0.5 : 1,
                  transition: 'all 150ms', fontFamily: 'inherit',
                }}
              >
                <Plus size={14} />
                Add Item
              </button>
            </div>

            {loadingBacklog ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#334155', fontSize: '13px' }}>
                Loading backlog…
              </div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#334155', fontSize: '13px' }}>
                No backlog items yet. Add one above.
              </div>
            ) : sections.length > 0 ? (
              <div>
                {sections.map((section, si) => {
                  const sOpen = section.items.filter((i) => !i.checked);
                  const sDone = section.items.filter((i) => i.checked);
                  return (
                    <div key={si} style={{ marginBottom: si < sections.length - 1 ? '20px' : 0 }}>
                      {section.header !== null && (
                        <BacklogHeader header={section.header} level={section.level} />
                      )}
                      {sOpen.length > 0 && (
                        <div style={{ marginBottom: sDone.length > 0 ? '10px' : 0 }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                            Open · {sOpen.length}
                          </div>
                          {sOpen.map((item) => (
                            <BacklogItemRow
                              key={item.index}
                              item={item}
                              onToggle={handleToggle}
                              onEdit={handleEdit}
                              saving={saving}
                            />
                          ))}
                        </div>
                      )}
                      {sDone.length > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                            Done · {sDone.length}
                          </div>
                          {sDone.map((item) => (
                            <BacklogItemRow
                              key={item.index}
                              item={item}
                              onToggle={handleToggle}
                              onEdit={handleEdit}
                              saving={saving}
                            />
                          ))}
                        </div>
                      )}
                      {section.items.length === 0 && section.header !== null && (
                        <div style={{ fontSize: '12px', color: '#334155', paddingLeft: '4px' }}>
                          No items in this section.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                {/* Fallback: flat open/done when no sections data */}
                {open.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                      Open · {open.length}
                    </div>
                    {open.map((item) => (
                      <BacklogItemRow
                        key={item.index}
                        item={item}
                        onToggle={handleToggle}
                        onEdit={handleEdit}
                        saving={saving}
                      />
                    ))}
                  </div>
                )}
                {done.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                      Done · {done.length}
                    </div>
                    {done.map((item) => (
                      <BacklogItemRow
                        key={item.index}
                        item={item}
                        onToggle={handleToggle}
                        onEdit={handleEdit}
                        saving={saving}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Job History */}
          <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Job History</h2>
                {loadingJobs && <Loader2 size={13} color="#a78bfa" className="animate-spin" />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#475569' }}>{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
                <button
                  onClick={fetchJobs}
                  disabled={loadingJobs}
                  style={{
                    background: 'none', border: 'none', cursor: loadingJobs ? 'not-allowed' : 'pointer',
                    color: '#334155', padding: '4px', borderRadius: '6px', display: 'flex',
                    alignItems: 'center', transition: 'color 150ms',
                    opacity: loadingJobs ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#a78bfa')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
                  title="Refresh jobs"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>

            {loadingJobs ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#334155', fontSize: '13px' }}>
                Loading jobs…
              </div>
            ) : jobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#334155', fontSize: '13px' }}>
                No jobs found for this project.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {jobs.map((job) => {
                  const isDone = job.status === 'done' || job.status === 'completed';
                  const isRunning = job.status === 'running' || job.status === 'in_progress';
                  const isError = !isDone && !isRunning;
                  const statusColor = isDone ? '#4ade80' : isRunning ? '#38bdf8' : '#f87171';
                  const statusBg = isDone ? 'rgba(34,197,94,0.1)' : isRunning ? 'rgba(56,189,248,0.1)' : 'rgba(248,113,113,0.1)';
                  const statusBorder = isDone ? 'rgba(34,197,94,0.25)' : isRunning ? 'rgba(56,189,248,0.25)' : 'rgba(248,113,113,0.25)';
                  const StatusIcon = isDone ? CheckCircle2 : isRunning ? Loader2 : AlertCircle;

                  const finishedAt = job.completedAt ?? job.mtime;
                  const timeAgo = finishedAt ? (() => {
                    const diffMs = Date.now() - finishedAt;
                    const diffMin = Math.floor(diffMs / 60000);
                    const diffHr = Math.floor(diffMin / 60);
                    const diffDay = Math.floor(diffHr / 24);
                    if (diffDay > 0) return `${diffDay}d ago`;
                    if (diffHr > 0) return `${diffHr}h ago`;
                    if (diffMin > 0) return `${diffMin}m ago`;
                    return 'just now';
                  })() : null;

                  return (
                    <div
                      key={job.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        padding: '12px 14px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        transition: 'border-color 150ms',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                    >
                      <StatusIcon
                        size={15}
                        color={statusColor}
                        style={{ flexShrink: 0, marginTop: '1px' }}
                        className={isRunning ? 'animate-spin' : undefined}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5,
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          marginBottom: '5px',
                        }}>
                          {job.goal ?? '(no goal)'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <code style={{
                            fontSize: '10px', color: '#475569',
                            fontFamily: 'monospace',
                          }}>
                            {job.id.slice(0, 8)}
                          </code>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px',
                            background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`,
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                            {job.status}
                          </span>
                          {job.elapsedSec != null && (
                            <span style={{ fontSize: '10px', color: '#475569', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <Clock size={9} /> {job.elapsedSec}s
                            </span>
                          )}
                          {timeAgo && (
                            <span style={{ fontSize: '10px', color: '#334155' }}>{timeAgo}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </main>

      <style>{`
        .edit-btn { opacity: 0 !important; }
        div:hover > .edit-btn, div:focus-within > .edit-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
