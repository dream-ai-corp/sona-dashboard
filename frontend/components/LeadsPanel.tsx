'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, X, Check, ChevronDown } from 'lucide-react';

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  notes: string;
  status: LeadStatus;
  createdAt: string;
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

const STATUS_COLORS: Record<LeadStatus, { bg: string; color: string }> = {
  new:       { bg: 'rgba(99,102,241,0.15)',  color: '#818cf8' },
  contacted: { bg: 'rgba(14,165,233,0.15)',  color: '#38bdf8' },
  qualified: { bg: 'rgba(234,179,8,0.15)',   color: '#fbbf24' },
  proposal:  { bg: 'rgba(249,115,22,0.15)',  color: '#fb923c' },
  won:       { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
  lost:      { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
};

const EMPTY_FORM = { name: '', email: '', phone: '', linkedinUrl: '', notes: '', status: 'new' as LeadStatus };

export default function LeadsPanel({ projectId }: { projectId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/leads`);
      if (!res.ok) throw new Error('Failed to fetch leads');
      setLeads(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to add lead');
      const lead: Lead = await res.json();
      setLeads((prev) => [...prev, lead]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete lead');
      setLeads((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStatusChange(id: string, status: LeadStatus) {
    try {
      const res = await fetch(`/api/projects/${projectId}/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update lead');
      const updated: Lead = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px',
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          Commercial Leads
          {leads.length > 0 && (
            <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>
              {leads.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: showForm ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '8px', padding: '5px 10px',
            color: '#818cf8', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? 'Cancel' : 'Add lead'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {(['name', 'email', 'phone', 'linkedinUrl'] as const).map((field) => (
              <input
                key={field}
                placeholder={field === 'linkedinUrl' ? 'LinkedIn URL' : field.charAt(0).toUpperCase() + field.slice(1)}
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                required={field === 'name'}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '7px', padding: '7px 10px', color: '#e2e8f0', fontSize: '12px', outline: 'none',
                }}
              />
            ))}
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '7px', padding: '7px 10px', color: '#e2e8f0', fontSize: '12px',
              outline: 'none', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as LeadStatus }))}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '7px', padding: '6px 10px', color: '#e2e8f0', fontSize: '12px', outline: 'none',
              }}
            >
              {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: '7px', padding: '6px 14px', color: '#818cf8',
                fontSize: '12px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              <Check size={12} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#475569', fontSize: '13px' }}>Loading leads…</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#334155', fontSize: '13px' }}>No leads yet. Add your first one.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Name', 'Email', 'Phone', 'LinkedIn', 'Status', 'Notes', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const sc = STATUS_COLORS[lead.status];
                return (
                  <tr key={lead.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 10px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>{lead.name}</td>
                    <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{lead.email || '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{lead.phone || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {lead.linkedinUrl
                        ? <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>↗</a>
                        : <span style={{ color: '#334155' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                          style={{
                            appearance: 'none', background: sc.bg, border: `1px solid ${sc.color}33`,
                            borderRadius: '20px', padding: '2px 20px 2px 8px',
                            color: sc.color, fontSize: '11px', fontWeight: 700,
                            cursor: 'pointer', outline: 'none', textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}
                        >
                          {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                        <ChevronDown size={9} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', color: sc.color, pointerEvents: 'none' }} />
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.notes || '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <button
                        onClick={() => handleDelete(lead.id)}
                        disabled={deletingId === lead.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '2px', display: 'flex', alignItems: 'center' }}
                        title="Delete lead"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
