'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Bot,
  Briefcase,
  Cpu,
  Brain,
  Settings,
  Zap,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', route: '/' },
  { icon: Bot,             label: 'Agents',    route: '/agents' },
  { icon: Briefcase,       label: 'Jobs',      route: '/jobs' },
  { icon: Cpu,             label: 'System',    route: '/system' },
  { icon: Brain,           label: 'Memory',    route: '/memory' },
  { icon: Settings,        label: 'Settings',  route: '/system' },
];

interface Project {
  id: string;
  name: string;
  jobStats?: { running: number; done: number; failed: number; error: number };
}

interface BacklogItem {
  checked: boolean;
  text: string;
  lineIndex: number;
}

function parseBacklog(content: string): BacklogItem[] {
  return content
    .split('\n')
    .map((line, i) => {
      const checked = /^- \[x\]/i.test(line);
      const unchecked = /^- \[ \]/.test(line);
      if (!checked && !unchecked) return null;
      const text = line.replace(/^- \[.\]\s*/, '').replace(/\s*\(job:[^)]+\)/, '').trim();
      return { checked, text, lineIndex: i };
    })
    .filter(Boolean) as BacklogItem[];
}

function toggleLine(content: string, lineIndex: number, checked: boolean): string {
  const lines = content.split('\n');
  const line = lines[lineIndex];
  if (checked) {
    lines[lineIndex] = line.replace(/^- \[x\]/i, '- [ ]');
  } else {
    lines[lineIndex] = line.replace(/^- \[ \]/, '- [x]');
  }
  return lines.join('\n');
}

function ProjectSection({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [backlog, setBacklog] = useState('');
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchBacklog = useCallback(async () => {
    const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/backlog`);
    if (res.ok) {
      const data = await res.json();
      setBacklog(data.content ?? '');
      setItems(parseBacklog(data.content ?? ''));
    }
  }, [project.id]);

  useEffect(() => {
    if (open) fetchBacklog();
  }, [open, fetchBacklog]);

  const saveBacklog = async (newContent: string) => {
    setSaving(true);
    try {
      await fetch(`/api/projects/${encodeURIComponent(project.id)}/backlog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      setBacklog(newContent);
      setItems(parseBacklog(newContent));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: BacklogItem) => {
    const newContent = toggleLine(backlog, item.lineIndex, item.checked);
    await saveBacklog(newContent);
  };

  const handleAdd = async () => {
    const text = newItem.trim();
    if (!text) return;
    const newContent = backlog + (backlog.endsWith('\n') ? '' : '\n') + `- [ ] ${text}\n`;
    await saveBacklog(newContent);
    setNewItem('');
  };

  const runningCount = project.jobStats?.running ?? 0;

  return (
    <div style={{ marginBottom: '2px' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '8px',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          color: '#64748b',
          border: 'none',
          fontSize: '13px',
          fontFamily: 'inherit',
          transition: 'all 150ms ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <FolderOpen size={14} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.name}
        </span>
        {runningCount > 0 && (
          <span style={{
            fontSize: '9px', fontWeight: 700, background: 'rgba(6,182,212,0.15)',
            color: '#67e8f9', border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: '10px', padding: '1px 5px',
          }}>
            {runningCount}
          </span>
        )}
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {open && (
        <div style={{
          marginLeft: '14px',
          paddingLeft: '12px',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          marginBottom: '4px',
        }}>
          {items.length === 0 && (
            <p style={{ fontSize: '11px', color: '#334155', padding: '4px 0', margin: 0 }}>No backlog items</p>
          )}
          {items.map((item, i) => (
            <label
              key={i}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '6px',
                padding: '3px 4px', cursor: 'pointer',
                fontSize: '11px', color: item.checked ? '#475569' : '#94a3b8',
                textDecoration: item.checked ? 'line-through' : 'none',
              }}
            >
              <input
                type="checkbox"
                checked={item.checked}
                disabled={saving}
                onChange={() => handleToggle(item)}
                style={{ marginTop: '2px', flexShrink: 0, accentColor: '#7c3aed', cursor: 'pointer' }}
              />
              <span style={{ lineHeight: 1.4 }}>{item.text}</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add item…"
              style={{
                flex: 1, fontSize: '11px', padding: '4px 6px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px', color: '#94a3b8',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newItem.trim()}
              style={{
                padding: '4px 6px', borderRadius: '6px',
                background: 'rgba(124,58,237,0.15)',
                border: '1px solid rgba(124,58,237,0.3)',
                color: '#a78bfa', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
              }}
            >
              <Plus size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        const list: Project[] = Array.isArray(data)
          ? data
          : (data?.projects ?? []);
        setProjects(list);
      })
      .catch(() => {});
  }, []);

  return (
    <aside
      style={{
        width: '240px',
        minHeight: '100vh',
        background: 'rgba(15, 15, 26, 0.95)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 50,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '28px 24px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(124, 58, 237, 0.5)',
              flexShrink: 0,
            }}
          >
            <Zap size={20} color="white" />
          </div>
          <div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                background: 'linear-gradient(135deg, #a78bfa, #67e8f9)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: 1.1,
              }}
            >
              SONA
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', letterSpacing: '0.1em', marginTop: '2px' }}>
              AI CONTROL
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '16px 12px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(({ icon: Icon, label, route }) => {
            const isActive = route === '/' ? pathname === '/' : pathname.startsWith(route);
            return (
              <Link
                key={label}
                href={route}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'all 200ms ease',
                  background: isActive
                    ? 'rgba(124, 58, 237, 0.15)'
                    : 'transparent',
                  color: isActive ? '#a78bfa' : '#64748b',
                  boxShadow: isActive
                    ? 'inset 0 0 0 1px rgba(124, 58, 237, 0.3), 0 0 12px rgba(124, 58, 237, 0.1)'
                    : 'none',
                  textDecoration: 'none',
                }}
              >
                <Icon size={17} />
                <span style={{ fontSize: '14px', fontWeight: isActive ? 600 : 400 }}>
                  {label}
                </span>
                {isActive && (
                  <div
                    style={{
                      marginLeft: 'auto',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#7c3aed',
                      boxShadow: '0 0 8px rgba(124, 58, 237, 0.8)',
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Projects */}
      {projects.length > 0 && (
        <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
          <div style={{
            padding: '8px 14px 6px',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
            color: '#334155', textTransform: 'uppercase',
          }}>
            Projects
          </div>
          {projects.map((p) => (
            <ProjectSection key={p.id} project={p} />
          ))}
        </div>
      )}

      {/* Bottom status */}
      <div
        style={{
          marginTop: 'auto',
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            className="status-dot-pulse"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>Online</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>srv1589372</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
