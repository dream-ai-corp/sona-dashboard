'use client';

import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import { Lightbulb, Plus, RefreshCw, MessageCircle } from 'lucide-react';

export default function BrainstormPage() {
  const [raw, setRaw] = useState('');
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newIdea, setNewIdea] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const flash = (type: 'ok' | 'err', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const fetchBrainstorm = useCallback(async () => {
    try {
      const res = await fetch('/api/brainstorm');
      if (res.ok) {
        const data = await res.json();
        setRaw(data.raw ?? '');
        setExists(data.exists ?? false);
      }
    } catch {
      flash('err', 'Impossible de charger le brainstorm');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrainstorm();
  }, [fetchBrainstorm]);

  const handleAddIdea = async () => {
    const idea = newIdea.trim();
    if (!idea) return;
    setSaving(true);
    try {
      const res = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });
      if (res.ok) {
        const data = await res.json();
        setRaw(data.raw ?? '');
        setExists(true);
        setNewIdea('');
        flash('ok', 'Idée ajoutée !');
      } else {
        flash('err', "Erreur lors de l'ajout");
      }
    } catch {
      flash('err', 'Réseau inaccessible');
    } finally {
      setSaving(false);
    }
  };

  const handlePromotePlaceholder = () => {
    flash('ok', 'Discute avec Pierre pour créer le projet');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a14', color: '#e2e8f0' }}>
      <Sidebar />
      <main style={{ marginLeft: '240px', flex: 1, padding: '0' }}>
        {/* Header */}
        <div style={{
          padding: '32px 40px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.8)',
          backdropFilter: 'blur(20px)',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Lightbulb size={22} color="#fbbf24" />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                Brainstorm — Nouveaux projets
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                Zone de réflexion libre pour des idées de projets qui n&apos;existent pas encore.
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '32px 40px', maxWidth: '860px' }}>
          {/* Feedback */}
          {feedback && (
            <div style={{
              marginBottom: '20px', padding: '10px 16px', borderRadius: '10px', fontSize: '13px',
              background: feedback.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: feedback.type === 'ok' ? '#4ade80' : '#f87171',
              border: `1px solid ${feedback.type === 'ok' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            }}>
              {feedback.msg}
            </div>
          )}

          {/* Add idea */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
          }}>
            <label style={{
              fontSize: '11px', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'block', marginBottom: '10px',
            }}>
              Nouvelle idée de projet
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddIdea()}
                placeholder="Décris ton idée de nouveau projet…"
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: '10px', fontSize: '14px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e2e8f0', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleAddIdea}
                disabled={saving || !newIdea.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '12px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                  background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)',
                  color: '#fbbf24', cursor: 'pointer', whiteSpace: 'nowrap',
                  opacity: saving || !newIdea.trim() ? 0.5 : 1,
                }}
              >
                <Plus size={15} /> Ajouter
              </button>
            </div>
          </div>

          {/* Ideas list */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <label style={{
                fontSize: '11px', fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                Idées capturées
              </label>
              <button
                onClick={() => { setLoading(true); fetchBrainstorm(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 10px', borderRadius: '7px', fontSize: '11px',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#475569', cursor: 'pointer',
                }}
              >
                <RefreshCw size={11} /> Rafraîchir
              </button>
            </div>

            {loading ? (
              <p style={{ color: '#475569', fontSize: '13px' }}>Chargement…</p>
            ) : !exists || !raw.trim() ? (
              <p style={{ color: '#475569', fontSize: '13px' }}>
                Aucune idée capturée pour l&apos;instant. Ajoute la première ci-dessus !
              </p>
            ) : (
              <pre style={{
                background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px', padding: '16px 18px', fontSize: '13px', color: '#94a3b8',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7,
                maxHeight: '500px', overflowY: 'auto', fontFamily: 'inherit',
                margin: 0,
              }}>{raw}</pre>
            )}
          </div>

          {/* Promote placeholder */}
          <div style={{
            background: 'rgba(124,58,237,0.05)',
            border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: '16px',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}>
            <MessageCircle size={20} color="#a78bfa" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#c4b5fd', marginBottom: '4px' }}>
                Promouvoir → Créer un projet
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Quand une idée est mûre, discute avec Pierre pour la transformer en projet.
              </div>
            </div>
            <button
              onClick={handlePromotePlaceholder}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)',
                color: '#a78bfa', cursor: 'pointer', whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Promouvoir
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
