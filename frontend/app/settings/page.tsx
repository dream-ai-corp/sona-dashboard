'use client';

import { useState, useEffect, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import {
  Settings,
  Wifi,
  WifiOff,
  MessageCircle,
  Brain,
  Volume2,
  RefreshCw,
  QrCode,
} from 'lucide-react';

const SONA_API = process.env.NEXT_PUBLIC_SONA_API_URL ?? '';

type Tab = 'general' | 'connections';

type WhatsAppStatus = 'CONNECTED' | 'QR_READY' | 'DISCONNECTED' | 'LOADING';

interface WhatsAppState {
  status: WhatsAppStatus;
  qr?: string;
}

interface BrainSlotInfo {
  exists?: boolean;
  expiresInMin?: number | null;
  valid?: boolean;
  configured?: boolean;
  baseUrl?: string | null;
  model?: string | null;
}
interface BrainState {
  mode: string;
  slots: Record<string, BrainSlotInfo>;
}
interface VoiceState {
  current: { en: string; fr: string };
  available: { en: Array<{ key: string; label: string }>; fr: Array<{ key: string; label: string }> };
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 20px',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'rgba(124,58,237,0.2)' : 'transparent',
        color: active ? '#a78bfa' : '#64748b',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: active ? 'inset 0 0 0 1px rgba(124,58,237,0.35)' : 'none',
        transition: 'all 150ms ease',
      }}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: WhatsAppStatus }) {
  const map: Record<WhatsAppStatus, { color: string; bg: string; border: string; label: string }> = {
    CONNECTED: { color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)', label: 'Connected' },
    QR_READY: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)', label: 'QR Ready' },
    DISCONNECTED: { color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: 'Disconnected' },
    LOADING: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)', label: 'Loading…' },
  };
  const s = map[status];
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: '20px',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {s.label}
    </span>
  );
}

function GeneralTab() {
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [voice, setVoice] = useState<VoiceState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [brainR, voiceR] = await Promise.allSettled([
        fetch(`${SONA_API}/api/config/brain`).then((r) => r.json()),
        fetch(`${SONA_API}/api/config/voice`).then((r) => r.json()),
      ]);
      if (brainR.status === 'fulfilled' && brainR.value?.ok) setBrain(brainR.value);
      if (voiceR.status === 'fulfilled' && voiceR.value?.ok) setVoice(voiceR.value);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  const setBrainMode = async (mode: string) => {
    setBusy(true);
    try {
      await fetch(`${SONA_API}/api/config/brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const setVoiceConfig = async (lang: 'en' | 'fr', key: string) => {
    setBusy(true);
    try {
      const body = lang === 'en' ? { en: key } : { fr: key };
      await fetch(`${SONA_API}/api/config/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const brainModes = [
    { mode: 'claude_code_a', label: 'CC-A', hintBase: 'Claude Code account A' },
    { mode: 'claude_code_b', label: 'CC-B', hintBase: 'Claude Code account B' },
    { mode: 'openrouter', label: 'OpenRouter', hintBase: 'Free OpenRouter models' },
    { mode: 'lmstudio', label: 'LM Studio', hintBase: 'Local LM Studio via Tailscale' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Brain Mode */}
      <div
        className="glass"
        style={{ borderRadius: '16px', padding: '24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <Brain size={15} color="#a78bfa" />
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
            Brain Mode
          </h2>
          <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>
            Active:{' '}
            <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{brain?.mode ?? '…'}</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {brainModes.map(({ mode, label, hintBase }) => {
            const slot = brain?.slots?.[mode];
            let hint = hintBase;
            let disabled = busy;
            if (mode === 'claude_code_a' || mode === 'claude_code_b') {
              if (slot?.valid) hint = `${hintBase} · ${slot.expiresInMin}m left`;
              else if (slot?.exists) hint = `${hintBase} · expired`;
              else hint = `${hintBase} · empty slot`;
              disabled = disabled || !slot?.valid;
            } else if (mode === 'openrouter') {
              hint = slot?.configured ? `${slot.model}` : 'no API key';
              disabled = disabled || !slot?.configured;
            } else if (mode === 'lmstudio') {
              hint = slot?.configured ? `${slot.model}` : 'no base URL';
              disabled = disabled || !slot?.configured;
            }
            const active = brain?.mode === mode;
            return (
              <button
                key={mode}
                onClick={() => setBrainMode(mode)}
                disabled={disabled}
                title={hint}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: active ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)',
                  background: active ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.02)',
                  color: active ? '#c4b5fd' : disabled ? '#475569' : '#cbd5e1',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: disabled ? 0.4 : 1,
                  minWidth: '100px',
                  textAlign: 'center',
                }}
              >
                <div>{label}</div>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 400,
                    marginTop: '2px',
                    color: active ? '#a78bfa' : '#64748b',
                  }}
                >
                  {hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice Config */}
      <div className="glass" style={{ borderRadius: '16px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <Volume2 size={15} color="#f59e0b" />
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
            Voice Config
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: '240px' }}>
            <label
              style={{
                fontSize: '11px',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              English voice (Kokoro)
            </label>
            <select
              value={voice?.current?.en ?? ''}
              disabled={busy || !voice}
              onChange={(e) => setVoiceConfig('en', e.target.value)}
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(15,15,26,0.8)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {(voice?.available?.en ?? []).map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label || v.key}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 240px', minWidth: '240px' }}>
            <label
              style={{
                fontSize: '11px',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              French voice (Piper)
            </label>
            <select
              value={voice?.current?.fr ?? ''}
              disabled={busy || !voice}
              onChange={(e) => setVoiceConfig('fr', e.target.value)}
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(15,15,26,0.8)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {(voice?.available?.fr ?? []).map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label || v.key}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionsTab() {
  const [wa, setWa] = useState<WhatsAppState>({ status: 'LOADING' });
  const [toggling, setToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/whatsapp/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setWa(data);
      } else {
        setWa({ status: 'DISCONNECTED' });
      }
    } catch {
      setWa({ status: 'DISCONNECTED' });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch('/api/integrations/whatsapp/toggle', { method: 'POST' });
      if (res.ok) {
        await fetchStatus();
      }
    } finally {
      setToggling(false);
    }
  };

  const isConnected = wa.status === 'CONNECTED';
  const isQr = wa.status === 'QR_READY';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
        Manage external service integrations. Connect or disconnect services to extend Sona&apos;s capabilities.
      </p>

      {/* WhatsApp tile */}
      <div
        className="glass"
        style={{
          borderRadius: '16px',
          padding: '24px',
          borderColor: isConnected
            ? 'rgba(34,197,94,0.2)'
            : isQr
            ? 'rgba(251,191,36,0.2)'
            : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Icon */}
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(37,211,102,0.12)',
              border: '1px solid rgba(37,211,102,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MessageCircle size={22} color="#25d366" />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: '160px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9' }}>WhatsApp</span>
              <StatusBadge status={wa.status} />
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
              {isConnected
                ? 'Sona is connected and receiving WhatsApp messages.'
                : isQr
                ? 'Scan the QR code below with WhatsApp to connect.'
                : 'Connect WhatsApp to allow Sona to send and receive messages.'}
            </p>
          </div>

          {/* Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={fetchStatus}
              disabled={toggling}
              title="Refresh status"
              style={{
                padding: '8px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'transparent',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <RefreshCw size={14} style={{ animation: wa.status === 'LOADING' ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={handleToggle}
              disabled={toggling || wa.status === 'LOADING'}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: isConnected || isQr
                  ? '1px solid rgba(239,68,68,0.35)'
                  : '1px solid rgba(34,197,94,0.35)',
                background: isConnected || isQr
                  ? 'rgba(239,68,68,0.1)'
                  : 'rgba(34,197,94,0.1)',
                color: isConnected || isQr ? '#f87171' : '#4ade80',
                fontSize: '12px',
                fontWeight: 600,
                cursor: toggling || wa.status === 'LOADING' ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: toggling ? 0.6 : 1,
                transition: 'all 150ms ease',
              }}
            >
              {isConnected || isQr ? (
                <>
                  <WifiOff size={13} />
                  {toggling ? 'Stopping…' : 'Disconnect'}
                </>
              ) : (
                <>
                  <Wifi size={13} />
                  {toggling ? 'Starting…' : 'Connect'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* QR code */}
        {isQr && wa.qr && (
          <div
            style={{
              marginTop: '20px',
              padding: '16px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(251,191,36,0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <QrCode size={14} color="#fbbf24" />
              <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600 }}>
                Scan with WhatsApp to connect
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={wa.qr}
              alt="WhatsApp QR code"
              style={{
                width: '200px',
                height: '200px',
                borderRadius: '8px',
                background: 'white',
                padding: '8px',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general');

  return (
    <PageShell>
      {/* Top bar */}
      <div
        className="sona-page-topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.6)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={18} color="#a78bfa" />
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
              Settings
            </h1>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            Sona configuration and integrations
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          padding: '16px 32px 0',
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <TabButton label="General" active={tab === 'general'} onClick={() => setTab('general')} />
        <TabButton label="Connections" active={tab === 'connections'} onClick={() => setTab('connections')} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '28px 32px' }}>
        {tab === 'general' ? <GeneralTab /> : <ConnectionsTab />}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PageShell>
  );
}
