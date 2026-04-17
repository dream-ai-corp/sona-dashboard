'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lightbulb, Plus, ArrowRight } from 'lucide-react';

interface BrainstormItem {
  text: string;
  line: number;
}

function parseItems(raw: string): BrainstormItem[] {
  return raw.split('\n')
    .map((line, i) => ({ text: line.replace(/^[-*]\s*/, '').trim(), line: i }))
    .filter(item => item.text && !item.text.startsWith('#'));
}

export default function BrainstormPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<BrainstormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIdea, setNewIdea] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorm`);
      if (!res.ok) { setItems([]); return; }
      const data = await res.json();
      setItems(parseItems(data.raw ?? data.content ?? ''));
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async () => {
    const idea = newIdea.trim();
    if (!idea) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });
      if (!res.ok) throw new Error('Failed to add idea');
      setNewIdea('');
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass" style={{ borderRadius: 16, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lightbulb size={15} color="#fbbf24" />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Brainstorm</h3>
          <span style={{ fontSize: 11, color: '#64748b' }}>({items.length})</span>
        </div>
        <a href="/brainstorm" style={{ fontSize: 11, color: '#a78bfa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          Global brainstorm <ArrowRight size={11} />
        </a>
      </div>

      {/* Add idea input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: items.length > 0 ? 12 : 0 }}>
        <input
          type="text"
          value={newIdea}
          onChange={(e) => setNewIdea(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
          placeholder="Add an idea for this project..."
          disabled={saving}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(15,15,26,0.8)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newIdea.trim()}
          style={{
            padding: '8px 14px', borderRadius: 8, border: 'none',
            background: newIdea.trim() ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)',
            color: newIdea.trim() ? '#fbbf24' : '#475569',
            fontSize: 12, fontWeight: 600, cursor: saving || !newIdea.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {error && <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>{error}</div>}

      {/* Ideas list */}
      {loading ? (
        <div style={{ fontSize: 12, color: '#475569' }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '12px 0' }}>
          No ideas yet for this project.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <div key={i} style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(251,191,36,0.04)',
              border: '1px solid rgba(251,191,36,0.1)',
              fontSize: 12, color: '#e2e8f0', lineHeight: 1.5,
            }}>
              {item.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
