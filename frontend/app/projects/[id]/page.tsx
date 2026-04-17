'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import LeadsPanel from '@/components/LeadsPanel';
import BrainstormPanel from '@/components/BrainstormPanel';
import FilesPanel from '@/components/FilesPanel';
import { marked } from 'marked';
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
  CircleCheck,
  RotateCcw,
  Mic,
  Play,
  Pause,
  Square,
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
  urls?: Record<string, string>;
  hasBacklog: boolean;
  priority?: 'high' | 'medium' | 'low';
}

interface BacklogItem {
  id?: string;
  index: number;
  lineIndex: number;
  text: string;
  checked: boolean;
  status?: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority: 'P1' | 'P2' | 'P3' | null;
  acceptanceCriteria?: string[];
  branch?: string | null;
  external_id?: string | null;
  sprint_id?: string;
  assigned_job_id?: string | null;
}

interface BacklogSection {
  header: string | null;
  level: number;
  items: BacklogItem[];
  sprint_id?: string;
  sprint_status?: 'planning' | 'active' | 'paused' | 'done';
  sprint_priority?: 'high' | 'medium' | 'low';
}

interface DbSprint {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  priority: 'high' | 'medium' | 'low';
  status: 'planning' | 'active' | 'paused' | 'done';
  created_at: number;
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

interface AuditReport {
  id: string;
  project: string;
  sprint: string;
  item_id: string | null;
  status: 'pass' | 'partial' | 'fail';
  detail: string | null;
  created_at: number;
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


type AuditStatus = 'pass' | 'partial' | 'fail' | null;

function auditChipStyle(status: AuditStatus): { color: string; bg: string; border: string; label: string } {
  switch (status) {
    case 'pass':    return { color: '#4ade80', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   label: 'Audit OK' };
    case 'partial': return { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', label: 'Audit partiel' };
    case 'fail':    return { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', label: 'Audit FAIL' };
    default:        return { color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', label: 'Non audité' };
  }
}

function auditItemIconStyle(status: AuditStatus): { color: string; title: string } {
  switch (status) {
    case 'pass':    return { color: '#4ade80', title: 'Audit: PASS' };
    case 'partial': return { color: '#fbbf24', title: 'Audit: PARTIAL' };
    case 'fail':    return { color: '#f87171', title: 'Audit: FAIL' };
    default:        return { color: 'transparent', title: '' };
  }
}

function AuditModal({
  sprint,
  reports,
  onClose,
}: {
  sprint: string;
  reports: AuditReport[];
  onClose: () => void;
}) {
  const sprintReport = reports.find((r) => !r.item_id) ?? reports[0];
  const itemReports = reports.filter((r) => r.item_id);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px', padding: '24px', maxWidth: '600px', width: '100%',
        maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              Rapport d'audit
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{sprint}</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>

        {sprintReport && (
          <div style={{
            padding: '14px', borderRadius: '10px',
            background: sprintReport.status === 'pass'
              ? 'rgba(34,197,94,0.06)' : sprintReport.status === 'partial'
              ? 'rgba(251,191,36,0.06)' : 'rgba(248,113,113,0.06)',
            border: `1px solid ${sprintReport.status === 'pass' ? 'rgba(34,197,94,0.2)' : sprintReport.status === 'partial' ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.2)'}`,
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: sprintReport.detail ? '10px' : 0 }}>
              {sprintReport.status === 'pass' && <CheckCircle2 size={15} color="#4ade80" />}
              {sprintReport.status === 'partial' && <AlertCircle size={15} color="#fbbf24" />}
              {sprintReport.status === 'fail' && <X size={15} color="#f87171" />}
              <span style={{
                fontSize: '12px', fontWeight: 700,
                color: sprintReport.status === 'pass' ? '#4ade80' : sprintReport.status === 'partial' ? '#fbbf24' : '#f87171',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {sprintReport.status}
              </span>
              <span style={{ fontSize: '11px', color: '#475569', marginLeft: 'auto' }}>
                {new Date(sprintReport.created_at).toLocaleDateString()}
              </span>
            </div>
            {sprintReport.detail && (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {sprintReport.detail}
              </p>
            )}
          </div>
        )}

        {itemReports.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              Par item
            </div>
            {itemReports.map((r) => {
              const chip = auditChipStyle(r.status);
              return (
                <div key={r.id} style={{
                  display: 'flex', gap: '10px', padding: '10px 12px',
                  borderRadius: '8px', marginBottom: '6px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px',
                    background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`,
                    flexShrink: 0, alignSelf: 'flex-start', letterSpacing: '0.04em',
                  }}>
                    {r.item_id}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: chip.color, marginBottom: r.detail ? '4px' : 0 }}>
                      {r.status.toUpperCase()}
                    </div>
                    {r.detail && (
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {r.detail}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {reports.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#334155', fontSize: '13px' }}>
            Aucun rapport d'audit pour ce sprint.
          </div>
        )}
      </div>
    </div>
  );
}

function sprintPriorityBadge(priority?: 'high' | 'medium' | 'low') {
  const colors: Record<string, { color: string; bg: string; border: string }> = {
    high: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
    medium: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
    low: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' },
  };
  return colors[priority ?? 'medium'] ?? colors.medium;
}

function BacklogHeader({
  header,
  level,
  auditStatus,
  onAuditClick,
  sprintStatus,
  sprintPriority,
  onSprintAction,
}: {
  header: string;
  level: number;
  auditStatus: AuditStatus;
  onAuditClick: () => void;
  sprintStatus?: 'planning' | 'active' | 'paused' | 'done';
  sprintPriority?: 'high' | 'medium' | 'low';
  onSprintAction?: (action: 'active' | 'paused' | 'planning') => void;
}) {
  const chip = auditChipStyle(auditStatus);
  const prioBadge = sprintPriorityBadge(sprintPriority);
  const sprintControlBtnStyle: React.CSSProperties = {
    background: 'none', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px', padding: '3px 6px', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', transition: 'all 150ms',
  };
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
      {sprintPriority && (
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '10px',
          background: prioBadge.bg, color: prioBadge.color,
          border: `1px solid ${prioBadge.border}`,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {sprintPriority}
        </span>
      )}
      {sprintStatus && (
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '10px',
          background: sprintStatus === 'active' ? 'rgba(34,197,94,0.1)' : sprintStatus === 'paused' ? 'rgba(251,191,36,0.1)' : 'rgba(100,116,139,0.1)',
          color: sprintStatus === 'active' ? '#4ade80' : sprintStatus === 'paused' ? '#fbbf24' : '#94a3b8',
          border: `1px solid ${sprintStatus === 'active' ? 'rgba(34,197,94,0.25)' : sprintStatus === 'paused' ? 'rgba(251,191,36,0.25)' : 'rgba(100,116,139,0.2)'}`,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {sprintStatus}
        </span>
      )}
      {onSprintAction && (
        <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
          <button
            onClick={() => onSprintAction('active')}
            title="Activer le sprint"
            data-testid="sprint-play"
            style={{ ...sprintControlBtnStyle, color: sprintStatus === 'active' ? '#4ade80' : '#475569' }}
          >
            <Play size={11} />
          </button>
          <button
            onClick={() => onSprintAction('paused')}
            title="Mettre en pause"
            data-testid="sprint-pause"
            style={{ ...sprintControlBtnStyle, color: sprintStatus === 'paused' ? '#fbbf24' : '#475569' }}
          >
            <Pause size={11} />
          </button>
          <button
            onClick={() => onSprintAction('planning')}
            title="Arrêter (planning)"
            data-testid="sprint-stop"
            style={{ ...sprintControlBtnStyle, color: sprintStatus === 'planning' ? '#94a3b8' : '#475569' }}
          >
            <Square size={11} />
          </button>
        </div>
      )}
      <button
        onClick={onAuditClick}
        title={chip.label}
        style={{
          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
          background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`,
          cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 150ms',
          fontFamily: 'inherit',
        }}
      >
        Audit
      </button>
    </div>
  );
}

function priorityColor(p: string | null): { color: string; bg: string; border: string } {
  switch (p) {
    case 'P1': return { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' };
    case 'P2': return { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' };
    case 'P3': return { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)' };
    default:   return { color: '#475569', bg: 'rgba(71,85,105,0.1)',   border: 'rgba(71,85,105,0.2)' };
  }
}

function BacklogItemRow({
  item,
  onToggle,
  onEdit,
  onPriorityChange,
  saving,
  auditStatus,
}: {
  item: BacklogItem;
  onToggle: (item: BacklogItem) => void;
  onEdit: (item: BacklogItem, text: string) => void;
  onPriorityChange: (item: BacklogItem, priority: 'P1' | 'P2' | 'P3' | null) => void;
  saving: boolean;
  auditStatus: AuditStatus;
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

  const pc = priorityColor(item.priority);
  const PRIORITIES: Array<'P1' | 'P2' | 'P3' | null> = ['P1', 'P2', 'P3', null];
  const cyclePriority = () => {
    const idx = PRIORITIES.indexOf(item.priority);
    const next = PRIORITIES[(idx + 1) % PRIORITIES.length];
    onPriorityChange(item, next);
  };

  const hasAC = (item.acceptanceCriteria?.length ?? 0) > 0;
  const hasBranch = !!item.branch;

  return (
    <div
      style={{
        padding: '10px 12px', borderRadius: '10px',
        background: item.checked ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${item.checked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)'}`,
        marginBottom: '6px', transition: 'all 150ms ease',
      }}
    >
      {/* Main item row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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

        {/* Priority badge — click to cycle P1→P2→P3→none */}
        <button
          onClick={cyclePriority}
          disabled={saving}
          title="Click to change priority"
          style={{
            flexShrink: 0, fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
            padding: '2px 6px', borderRadius: '5px', cursor: saving ? 'not-allowed' : 'pointer',
            color: item.checked ? '#334155' : pc.color,
            background: item.checked ? 'rgba(255,255,255,0.03)' : pc.bg,
            border: `1px solid ${item.checked ? 'rgba(255,255,255,0.06)' : pc.border}`,
            transition: 'all 150ms ease', minWidth: '30px', textAlign: 'center',
          }}
        >
          {item.priority ?? '—'}
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

      {/* Acceptance Criteria & Branch (shown only when not editing) */}
      {!editing && (hasAC || hasBranch) && (
        <div style={{ paddingLeft: '16px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {item.acceptanceCriteria?.map((ac, i) => (
            <div
              key={i}
              data-testid="ac-item"
              style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}
            >
              <CircleCheck size={11} color="#64748b" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>{ac}</span>
            </div>
          ))}
          {item.branch && (
            <div style={{ marginTop: hasBranch && hasAC ? '2px' : 0 }}>
              <code
                data-testid="branch-chip"
                style={{
                  fontSize: '10px', color: '#475569',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '4px', padding: '1px 6px',
                  fontFamily: 'monospace',
                }}
              >
                {item.branch}
              </code>
            </div>
          )}
        </div>
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

  // Audit state
  const [auditReports, setAuditReports] = useState<AuditReport[]>([]);
  const [auditModal, setAuditModal] = useState<{ sprint: string; reports: AuditReport[] } | null>(null);
  const [sprintsOpen, setSprintsOpen] = useState(false);
    const [jobFilter, setJobFilter] = useState<'all' | 'running' | 'done' | 'failed'>('all');

  // Status badge dropdown
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Voice input for backlog
  const [backlogListening, setBacklogListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backlogRecognitionRef = useRef<any>(null);

  useEffect(() => () => { backlogRecognitionRef.current?.stop(); }, []);

  const toggleBacklogVoice = () => {
    if (backlogListening) {
      backlogRecognitionRef.current?.stop();
      setBacklogListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input is not supported in this browser.'); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = new SR() as any;
    r.lang = navigator.language?.startsWith('fr') ? 'fr-FR' : navigator.language ?? 'fr-FR';
    r.continuous = true;
    r.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(e.results as any[]).map((res: any) => res[0].transcript).join('');
      setNewItemText(transcript);
    };
    r.onend = () => setBacklogListening(false);
    r.onerror = () => setBacklogListening(false);
    backlogRecognitionRef.current = r;
    r.start();
    setBacklogListening(true);
  };

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

  const [dbSprints, setDbSprints] = useState<DbSprint[]>([]);

  const fetchBacklog = useCallback(async () => {
    setLoadingBacklog(true);
    try {
      const res = await fetch(`/api/backlogs/${encodeURIComponent(id)}/full`);
      const data = await res.json() as { items?: BacklogItem[]; sections?: BacklogSection[]; sprints?: DbSprint[]; error?: string };
      if (data.error) throw new Error(data.error);
      setItems(data.items ?? []);
      setSections(data.sections ?? []);
      setDbSprints(data.sprints ?? []);
    } catch (e) {
      // Fallback to old markdown endpoint if DB endpoint fails
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}/backlog`);
        const data = await res.json() as { items?: BacklogItem[]; sections?: BacklogSection[]; error?: string };
        if (!data.error) {
          setItems(data.items ?? []);
          setSections(data.sections ?? []);
        }
      } catch {
        setError(e instanceof Error ? e.message : 'Failed to load backlog');
      }
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

  const fetchAudits = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits?project=${encodeURIComponent(id)}`);
      const data = await res.json() as { audits?: AuditReport[]; error?: string };
      setAuditReports(data.audits ?? []);
    } catch {
      setAuditReports([]);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchBacklog();
    fetchBrief();
    fetchSprints();
    fetchJobs();
    fetchAudits();

    // Silent auto-refresh every 5s — backlog and jobs can change while a daemon job runs
    const silentRefreshBacklog = async () => {
      try {
        const res = await fetch(`/api/backlogs/${encodeURIComponent(id)}/full`);
        const data = await res.json() as { items?: BacklogItem[]; sections?: BacklogSection[]; sprints?: DbSprint[]; error?: string };
        if (!data.error) { setItems(data.items ?? []); setSections(data.sections ?? []); setDbSprints(data.sprints ?? []); }
      } catch {}
    };
    const silentRefreshJobs = async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}/jobs`);
        const data = await res.json() as { jobs?: Job[] };
        setJobs(data.jobs ?? []);
      } catch {}
    };
    const silentRefreshAudits = async () => {
      try {
        const res = await fetch(`/api/audits?project=${encodeURIComponent(id)}`);
        const data = await res.json() as { audits?: AuditReport[]; error?: string };
        setAuditReports(data.audits ?? []);
      } catch {}
    };
    const interval = setInterval(() => { silentRefreshBacklog(); silentRefreshJobs(); silentRefreshAudits(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchProject, fetchBacklog, fetchBrief, fetchSprints, fetchJobs, id]);

  const handleToggle = async (item: BacklogItem) => {
    setSaving(true);
    try {
      if (item.id) {
        // DB-backed item
        const newStatus = item.checked ? 'todo' : 'done';
        await fetch(
          `/api/backlogs/${encodeURIComponent(id)}/items/${item.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          },
        );
        await fetchBacklog();
      } else {
        // Legacy markdown fallback
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
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (item: BacklogItem, text: string) => {
    setSaving(true);
    try {
      if (item.id) {
        await fetch(
          `/api/backlogs/${encodeURIComponent(id)}/items/${item.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          },
        );
        await fetchBacklog();
      } else {
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
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePriorityChange = async (item: BacklogItem, priority: 'P1' | 'P2' | 'P3' | null) => {
    setSaving(true);
    try {
      if (item.id) {
        await fetch(
          `/api/backlogs/${encodeURIComponent(id)}/items/${item.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority }),
          },
        );
        await fetchBacklog();
      } else {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(id)}/backlog/${item.index}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority }),
          },
        );
        const data = await res.json() as { items?: BacklogItem[]; sections?: BacklogSection[] };
        if (data.items) setItems(data.items);
        if (data.sections) setSections(data.sections);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSprintAction = async (sprintId: string, action: 'active' | 'paused' | 'planning') => {
    setSaving(true);
    try {
      await fetch(
        `/api/backlogs/${encodeURIComponent(id)}/sprints/${sprintId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: action }),
        },
      );
      await fetchBacklog();
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    const text = newItemText.trim();
    if (!text) return;
    setSaving(true);
    try {
      if (dbSprints.length > 0) {
        // Add to first active sprint, or first sprint if none active
        const activeSprint = dbSprints.find(s => s.status === 'active') ?? dbSprints[0];
        await fetch(`/api/backlogs/${encodeURIComponent(id)}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sprint_id: activeSprint.id, text }),
        });
        await fetchBacklog();
      } else {
        // Fallback: create a default sprint first, then add item
        const sprintRes = await fetch(`/api/backlogs/${encodeURIComponent(id)}/sprints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Backlog', priority: 'medium' }),
        });
        const sprint = await sprintRes.json();
        await fetch(`/api/backlogs/${encodeURIComponent(id)}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sprint_id: sprint.id, text }),
        });
        await fetchBacklog();
      }
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

  const handleProjectPriorityChange = async (newPriority: "high" | "medium" | "low") => {
    setPriorityDropdownOpen(false);
    setPrioritySaving(true);
    try {
      await fetch("/api/project/" + id + "/priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      setProject((p) => p ? { ...p, priority: newPriority } : p);
    } catch (e) {
      console.error("priority update failed", e);
    } finally {
      setPrioritySaving(false);
    }
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
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  {project.status?.toLowerCase() === 'active' && (
                    <span className="status-dot-pulse" style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: ss.color, flexShrink: 0,
                    }} />
                  )}
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
            {project && (
              <div ref={priorityDropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setPriorityDropdownOpen((o) => !o)}
                  disabled={prioritySaving}
                  style={{
                    fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px',
                    background: (project.priority || 'medium') === 'high' ? 'rgba(239,68,68,0.12)' : (project.priority || 'medium') === 'low' ? 'rgba(100,116,139,0.12)' : 'rgba(251,191,36,0.12)',
                    color: (project.priority || 'medium') === 'high' ? '#f87171' : (project.priority || 'medium') === 'low' ? '#94a3b8' : '#fbbf24',
                    border: `1px solid ${(project.priority || 'medium') === 'high' ? 'rgba(239,68,68,0.25)' : (project.priority || 'medium') === 'low' ? 'rgba(100,116,139,0.2)' : 'rgba(251,191,36,0.25)'}`,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: prioritySaving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', transition: 'all 150ms',
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  {(project.priority || 'medium') === 'high' ? '\u2191' : (project.priority || 'medium') === 'low' ? '\u2193' : '\u2194'} {project.priority || 'medium'}
                </button>
                {priorityDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                    background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '4px', zIndex: 100,
                    minWidth: '100px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}>
                    {(['high', 'medium', 'low'] as const).map((pr) => {
                      const colors: Record<string, string> = { high: '#f87171', medium: '#fbbf24', low: '#94a3b8' };
                      const isCurrent = (project.priority || 'medium') === pr;
                      return (
                        <button
                          key={pr}
                          onClick={() => handleProjectPriorityChange(pr)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '7px',
                            width: '100%', padding: '7px 10px', borderRadius: '7px',
                            background: isCurrent ? 'rgba(255,255,255,0.06)' : 'transparent',
                            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: '12px', fontWeight: 600,
                            color: isCurrent ? colors[pr] : '#64748b',
                            textAlign: 'left', transition: 'all 100ms',
                          }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: colors[pr], flexShrink: 0 }} />
                          {pr.charAt(0).toUpperCase() + pr.slice(1)}
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
        <div style={{ flex: 1, padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', alignItems: 'start' }}>

          {/* === LEFT COLUMN === */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

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
                      s.url ? (
                        <a
                          key={s.name}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            fontSize: '10px', color: '#67e8f9', textDecoration: 'none',
                          }}
                        >
                          <Server size={10} /> {s.url.replace('http://72.60.185.57:', ':')}
                        </a>
                      ) : (
                        <span key={s.name} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '10px', color: '#475569',
                        }}>
                          <Server size={10} /> :{s.port}
                        </span>
                      )
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
                    {project.urls && Object.keys(project.urls).length > 0 && Object.entries(project.urls).map(([label, url]) => (
                      <a key={label} href={String(url)} target="_blank" rel="noopener noreferrer" style={{
                        display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10,
                        color: "#67e8f9", textDecoration: "none",
                        padding: "2px 6px", borderRadius: 4,
                        background: "rgba(6,182,212,0.08)",
                      }}>{label}</a>
                    ))}
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
                <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(brief); const b = document.querySelector('[data-brief-copy]'); if (b) { b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); } } catch {}
                  }}
                  data-brief-copy
                  style={{
                    background: 'none', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                    color: '#475569', padding: '4px 10px', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '11px', transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#67e8f9')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                >
                  Copy
                </button>
                <button
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text.trim()) { setBriefDraft(text); setBriefEditing(true); }
                    } catch {}
                  }}
                  style={{
                    background: 'none', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                    color: '#475569', padding: '4px 10px', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '11px', transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#fbbf24')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                >
                  Paste
                </button>
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
                </div>
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
              <div
                className="md-preview"
                style={{ fontSize: '13px', lineHeight: 1.8, color: '#cbd5e1' }}
                dangerouslySetInnerHTML={{ __html: marked.parse(brief || 'No brief yet.') as string }}
              />
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
                  border: `1px solid ${backlogListening ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '10px', color: '#e2e8f0',
                  outline: 'none', fontFamily: 'inherit',
                  transition: 'border-color 150ms',
                }}
                onFocus={(e) => { if (!backlogListening) e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'; }}
                onBlur={(e) => { if (!backlogListening) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
              <button
                onClick={toggleBacklogVoice}
                title={backlogListening ? 'Stop recording' : 'Dictate backlog item'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '38px', borderRadius: '10px',
                  background: backlogListening ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                  border: backlogListening ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(255,255,255,0.1)',
                  color: backlogListening ? '#f87171' : '#64748b',
                  cursor: 'pointer', transition: 'all 150ms', fontFamily: 'inherit', flexShrink: 0,
                }}
              >
                <Mic size={14} className={backlogListening ? 'animate-pulse' : ''} />
              </button>
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
              <button onClick={() => setSprintsOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: '10px',
                background: sprintsOpen ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)',
                border: sprintsOpen ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(255,255,255,0.1)',
                color: sprintsOpen ? '#fbbf24' : '#64748b',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>Sprints</button>
            </div>

            {sprintsOpen && (
          <>
          {/* Sprints */}
          <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setSprintsOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
                  <span style={{ fontSize: 12, color: '#475569', transform: sprintsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}>{String.fromCharCode(9654)}</span>
                  <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Sprints</h2>
                </button>
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

            {!sprintsOpen ? null : sprints.length === 0 ? (
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
          </>
          )}


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
                {sections.filter(sec => sec.items.length > 0).map((section, si) => {
                  const sOpen = section.items.filter((i) => !i.checked);
                  const sDone = section.items.filter((i) => i.checked);

                  // Compute audit status for this sprint section
                  const sprintAudits = section.header
                    ? auditReports.filter((r) => r.sprint === section.header)
                    : [];
                  const sprintAuditStatus: AuditStatus = sprintAudits.length === 0
                    ? null
                    : sprintAudits.some((r) => r.status === 'fail')    ? 'fail'
                    : sprintAudits.some((r) => r.status === 'partial') ? 'partial'
                    : 'pass';

                  // Match item to audit record by **S-ID** or full text
                  const getItemAuditStatus = (text: string): AuditStatus => {
                    if (sprintAudits.length === 0) return null;
                    const idMatch = text.match(/\*\*([A-Z][A-Z0-9-]+)\*\*/)?.[1] ?? text;
                    const rec = sprintAudits.find((r) => r.item_id === idMatch || r.item_id === text);
                    return rec?.status ?? null;
                  };

                  return (
                    <div key={si} style={{ marginBottom: si < sections.length - 1 ? '20px' : 0 }}>
                      {section.header !== null && (
                        <BacklogHeader
                          header={section.header}
                          level={section.level}
                          auditStatus={sprintAuditStatus}
                          onAuditClick={() => setAuditModal({ sprint: section.header!, reports: sprintAudits })}
                          sprintStatus={section.sprint_status}
                          sprintPriority={section.sprint_priority}
                          onSprintAction={section.sprint_id ? (action) => handleSprintAction(section.sprint_id!, action) : undefined}
                        />
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
                              onPriorityChange={handlePriorityChange}
                              saving={saving}
                              auditStatus={getItemAuditStatus(item.text)}
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
                              onPriorityChange={handlePriorityChange}
                              saving={saving}
                              auditStatus={getItemAuditStatus(item.text)}
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
                        onPriorityChange={handlePriorityChange}
                        saving={saving}
                        auditStatus={null}
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
                        onPriorityChange={handlePriorityChange}
                        saving={saving}
                        auditStatus={null}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          </div>

          {/* === RIGHT COLUMN === */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '100px' }}>

          {/* Job History */}
          <div className="glass" style={{ borderRadius: '16px', padding: '20px', maxHeight: '600px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Job History</h2>
                {loadingJobs && <Loader2 size={13} color="#a78bfa" className="animate-spin" />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#475569' }}>{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
                <div style={{ display: "flex", gap: 3 }}>                  {(["all", "running", "done", "failed"] as const).map(f => (                    <button key={f} onClick={() => setJobFilter(f)} style={{                      padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600,                      background: jobFilter === f ? "rgba(124,58,237,0.15)" : "none",                      color: jobFilter === f ? "#a78bfa" : "#475569",                      border: jobFilter === f ? "1px solid rgba(124,58,237,0.3)" : "1px solid transparent",                      cursor: "pointer", textTransform: "capitalize",                    }}>{f}</button>                  ))}                </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
                {jobs.filter(j => jobFilter === 'all' || (jobFilter === 'running' ? (j.status === 'running' || j.status === 'in_progress') : jobFilter === 'done' ? (j.status === 'done' || j.status === 'completed') : (j.status === 'error' || j.status === 'failed'))).slice(0, 30).map((job) => {
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
                          {(() => { const g = job.goal ?? '(no goal)'; const m = g.match(/TASK:\s*(.+)/); return m ? m[1].trim() : g; })()}
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

          <BrainstormPanel projectId={id} />
          <FilesPanel projectId={id} />

        </div>

        </div>

        {/* Full-width section below the 2-column grid */}
        <div style={{ padding: '0 32px 32px' }}>
          <LeadsPanel projectId={id} />
        </div>
      </main>

      <style>{`
        .md-preview h1 { font-size: 22px; font-weight: 700; color: #f1f5f9; margin: 0 0 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; }
        .md-preview h2 { font-size: 18px; font-weight: 600; color: #e2e8f0; margin: 20px 0 8px; }
        .md-preview h3 { font-size: 15px; font-weight: 600; color: #cbd5e1; margin: 16px 0 6px; }
        .md-preview p { margin: 0 0 12px; }
        .md-preview ul, .md-preview ol { margin: 0 0 12px; padding-left: 20px; }
        .md-preview li { margin-bottom: 4px; }
        .md-preview code { background: rgba(124,58,237,0.15); color: #c4b5fd; padding: 1px 5px; border-radius: 4px; font-size: 12px; font-family: monospace; }
        .md-preview pre { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; overflow-x: auto; margin: 0 0 14px; }
        .md-preview pre code { background: none; padding: 0; color: #94a3b8; }
        .md-preview blockquote { border-left: 3px solid rgba(124,58,237,0.5); margin: 0 0 12px; padding: 4px 14px; color: #64748b; }
        .md-preview a { color: #67e8f9; }
        .md-preview hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0; }
        .md-preview strong { color: #f1f5f9; font-weight: 700; }
        .md-preview em { color: #94a3b8; }
        .md-preview table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 13px; }
        .md-preview th { background: rgba(255,255,255,0.04); color: #94a3b8; padding: 8px 12px; text-align: left; border: 1px solid rgba(255,255,255,0.08); }
        .md-preview td { padding: 7px 12px; border: 1px solid rgba(255,255,255,0.06); color: #cbd5e1; }
        @media (max-width: 1024px) {
          main > div { grid-template-columns: 1fr !important; }
        }
        .edit-btn { opacity: 0 !important; }
        div:hover > .edit-btn, div:focus-within > .edit-btn { opacity: 1 !important; }
      `}</style>

      {auditModal && (
        <AuditModal
          sprint={auditModal.sprint}
          reports={auditModal.reports}
          onClose={() => setAuditModal(null)}
        />
      )}
    </div>
  );
}
