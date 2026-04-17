'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  FolderOpen,
  GitBranch,
  Server,
  Tag,
  CheckSquare,
  ArrowRight,
  RefreshCw,
  Plus,
  X,
  Search,
} from 'lucide-react';

interface Service {
  name: string;
  port: number;
  url?: string;
  container?: string;
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

type StatusFilter = 'all' | 'active' | 'paused' | 'archived';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

function statusStyle(status: string): { color: string; bg: string; border: string } {
  switch (status?.toLowerCase()) {
    case 'active':
      return { color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' };
    case 'paused':
      return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' };
    case 'archived':
      return { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)' };
    default:
      return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' };
  }
}

function ProjectCard({ project }: { project: Project }) {
  const ss = statusStyle(project.status);
  return (
    <Link
      href={`/projects/${encodeURIComponent(project.id)}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px',
          padding: '20px',
          cursor: 'pointer',
          transition: 'all 200ms ease',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(124,58,237,0.06)';
          e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(124,58,237,0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))',
              border: '1px solid rgba(124,58,237,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FolderOpen size={16} color="#a78bfa" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
                {project.name}
              </h3>
              <code style={{ fontSize: '10px', color: '#475569', fontFamily: 'monospace' }}>{project.id}</code>
            </div>
          </div>
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', flexShrink: 0,
            background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}>
            {project.status?.toLowerCase() === 'active' && (
              <span className="status-dot-pulse" style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: ss.color, flexShrink: 0,
              }} />
            )}
            {project.status}
          </span>
        </div>

        {/* Description */}
        {project.description && (
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
            {project.description}
          </p>
        )}

        {/* Tags */}
        {project.tags && project.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {project.tags.map((tag) => (
              <span key={tag} style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                fontSize: '10px', padding: '2px 7px', borderRadius: '20px',
                background: 'rgba(6,182,212,0.08)', color: '#67e8f9',
                border: '1px solid rgba(6,182,212,0.2)',
              }}>
                <Tag size={8} />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', paddingTop: '4px' }}>
          {project.services && project.services.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569' }}>
              <Server size={11} />
              {project.services.map((s) => s.port).join(', ')}
            </span>
          )}
          {project.git?.remote && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569' }}>
              <GitBranch size={11} />
              git
            </span>
          )}
          {project.hasBacklog && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569' }}>
              <CheckSquare size={11} />
              backlog
            </span>
          )}
          <ArrowRight size={13} color="#475569" style={{ marginLeft: 'auto' }} />
        </div>
      </div>
    </Link>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', features: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) { setFormError('Project name is required'); return; }
    if (!form.description.trim()) { setFormError('Description is required'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, features: form.features }),
      });
      const data = await res.json() as { project?: Project; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create project');
      setShowModal(false);
      setForm({ name: '', description: '', features: '' });
      await fetchProjects();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json() as { projects?: Project[]; error?: string };
      if (data.error) throw new Error(data.error);
      setProjects(data.projects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const q = searchQuery.trim().toLowerCase();
  const filtered = projects
    .filter((p) => filter === 'all' || p.status?.toLowerCase() === filter)
    .filter((p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );

  const counts = {
    all: projects.length,
    active: projects.filter((p) => p.status?.toLowerCase() === 'active').length,
    paused: projects.filter((p) => p.status?.toLowerCase() === 'paused').length,
    archived: projects.filter((p) => p.status?.toLowerCase() === 'archived').length,
  };

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
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
              Projects
            </h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
              {filtered.length} project{filtered.length !== 1 ? 's' : ''}
              {q ? ` matching "${searchQuery}"` : filter !== 'all' ? ` · ${filter}` : ' tracked'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchProjects}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                borderRadius: '10px', border: '1px solid rgba(124,58,237,0.3)',
                background: 'rgba(124,58,237,0.1)', color: '#a78bfa',
                fontSize: '12px', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1, transition: 'all 200ms', fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => { setShowModal(true); setFormError(null); }}
              data-testid="new-project-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                borderRadius: '10px', border: '1px solid rgba(34,197,94,0.3)',
                background: 'rgba(34,197,94,0.1)', color: '#4ade80',
                fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 200ms', fontFamily: 'inherit',
              }}
            >
              <Plus size={13} />
              New Project
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '28px 32px' }}>
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '12px', padding: '16px', marginBottom: '24px',
              fontSize: '13px', color: '#f87171',
            }}>
              {error}
            </div>
          )}

          {/* Search input */}
          {!loading && projects.length > 0 && (
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search
                size={14}
                color="#475569"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects by name or description…"
                data-testid="project-search"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '9px 14px 9px 34px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  color: '#f1f5f9', fontSize: '13px',
                  fontFamily: 'inherit', outline: 'none',
                  transition: 'border-color 150ms',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '2px',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          {/* Status filter tabs */}
          {!loading && projects.length > 0 && (
            <div
              style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}
              role="tablist"
              aria-label="Filter projects by status"
            >
              {FILTERS.map(({ value, label }) => {
                const active = filter === value;
                const ss = value !== 'all' ? statusStyle(value) : null;
                return (
                  <button
                    key={value}
                    role="tab"
                    aria-selected={active}
                    data-filter={value}
                    onClick={() => setFilter(value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '20px', fontFamily: 'inherit',
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      transition: 'all 150ms ease',
                      background: active
                        ? (ss ? ss.bg : 'rgba(124,58,237,0.15)')
                        : 'rgba(255,255,255,0.03)',
                      color: active
                        ? (ss ? ss.color : '#a78bfa')
                        : '#475569',
                      border: active
                        ? `1px solid ${ss ? ss.border : 'rgba(124,58,237,0.3)'}`
                        : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {label}
                    <span style={{
                      fontSize: '10px', fontWeight: 700,
                      padding: '1px 6px', borderRadius: '10px',
                      background: active
                        ? 'rgba(255,255,255,0.15)'
                        : 'rgba(255,255,255,0.05)',
                      color: active ? (ss ? ss.color : '#a78bfa') : '#334155',
                    }}>
                      {counts[value]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '16px', padding: '20px', height: '160px',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <FolderOpen size={40} color="#1e2535" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '14px', color: '#334155', margin: 0 }}>
                {q ? `No projects matching "${searchQuery}"` : filter !== 'all' ? `No ${filter} projects` : 'No projects found'}
              </p>
              {q ? (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    marginTop: '8px', fontSize: '12px', color: '#a78bfa',
                    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Clear search
                </button>
              ) : filter !== 'all' ? (
                <button
                  onClick={() => setFilter('all')}
                  style={{
                    marginTop: '8px', fontSize: '12px', color: '#a78bfa',
                    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Show all projects
                </button>
              ) : (
                <p style={{ fontSize: '12px', color: '#1e293b', margin: '4px 0 0' }}>
                  Add a directory to <code style={{ fontFamily: 'monospace' }}>/home/beniben/sona-workspace/projects/</code>
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* New Project Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '520px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>New Project</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Project Name <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="my-awesome-project"
                  data-testid="new-project-name"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)', color: '#f1f5f9',
                    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Description <span style={{ color: '#f87171' }}>*</span>
                  <span style={{ fontWeight: 400, color: '#475569', marginLeft: '6px' }}>What is this project about? (1–3 sentences)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="A short description of what this project does..."
                  rows={3}
                  data-testid="new-project-description"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)', color: '#f1f5f9',
                    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Key Features / Goals
                  <span style={{ fontWeight: 400, color: '#475569', marginLeft: '6px' }}>Optional · one per line</span>
                </label>
                <textarea
                  value={form.features}
                  onChange={(e) => setForm(f => ({ ...f, features: e.target.value }))}
                  placeholder={"User authentication\nDashboard with real-time data\nExport to CSV"}
                  rows={4}
                  data-testid="new-project-features"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)', color: '#f1f5f9',
                    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              {formError && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#f87171',
                }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '9px 18px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  data-testid="new-project-submit"
                  style={{
                    padding: '9px 22px', borderRadius: '10px',
                    border: '1px solid rgba(34,197,94,0.4)',
                    background: creating ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.15)',
                    color: '#4ade80', fontSize: '13px', fontWeight: 600,
                    cursor: creating ? 'not-allowed' : 'pointer',
                    opacity: creating ? 0.6 : 1, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
