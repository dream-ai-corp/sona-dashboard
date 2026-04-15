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

function statusStyle(status: string) {
  switch (status?.toLowerCase()) {
    case 'active': return { color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' };
    case 'paused': return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' };
    case 'archived': return { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)' };
    default: return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' };
  }
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

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ? decodeURIComponent(params.id) : '';

  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingBacklog, setLoadingBacklog] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      const data = await res.json() as { items?: BacklogItem[]; error?: string };
      if (data.error) throw new Error(data.error);
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backlog');
    } finally {
      setLoadingBacklog(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchBacklog();
  }, [fetchProject, fetchBacklog]);

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
      const data = await res.json() as { items?: BacklogItem[] };
      if (data.items) setItems(data.items);
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
      const data = await res.json() as { items?: BacklogItem[] };
      if (data.items) setItems(data.items);
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
      const data = await res.json() as { items?: BacklogItem[] };
      if (data.items) setItems(data.items);
      setNewItemText('');
    } finally {
      setSaving(false);
    }
  };

  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const ss = project ? statusStyle(project.status) : statusStyle('active');

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
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px',
                background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {project.status}
              </span>
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
            ) : (
              <div>
                {/* Open items */}
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

                {/* Done items */}
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

        </div>
      </main>

      <style>{`
        .edit-btn { opacity: 0 !important; }
        div:hover > .edit-btn, div:focus-within > .edit-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
