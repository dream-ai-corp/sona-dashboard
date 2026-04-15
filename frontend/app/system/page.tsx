'use client';

import { useState, useEffect, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import { Server, HardDrive, Zap, Brain, Volume2 } from 'lucide-react';
import { useSSE } from '@/lib/useSSE';

interface DaemonData {
  enabled?: boolean;
  running?: boolean;
  lastTick?: string | number;
  intervalMs?: number;
  maxConcurrent?: number;
  error?: string;
}

interface StatusPayload { daemon?: DaemonData; brain?: any; voice?: any; }

type ServiceStatus = 'up' | 'down' | 'unknown';

interface BrainSlotInfo { exists?: boolean; expiresInMin?: number | null; valid?: boolean; configured?: boolean; baseUrl?: string | null; model?: string | null; }
interface BrainState { mode: string; slots: Record<string, BrainSlotInfo>; }
interface VoiceState { current: { en: string; fr: string }; available: { en: Array<{key:string;label:string}>; fr: Array<{key:string;label:string}> } }

const SONA_API = process.env.NEXT_PUBLIC_SONA_API_URL ?? '';

function ServiceRow({ name, status }: { name: string; status: ServiceStatus }) {
  const color = status === 'up' ? '#4ade80' : status === 'down' ? '#f87171' : '#64748b';
  const label = status === 'up' ? 'Up' : status === 'down' ? 'Down' : 'Unknown';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: '13px', color: '#94a3b8', fontFamily: 'monospace' }}>{name}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color, fontWeight: 600 }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, boxShadow: status === 'up' ? `0 0 6px ${color}` : 'none' }} />
        {label}
      </span>
    </div>
  );
}

function BrainButton({ mode, label, hint, active, disabled, onClick }: { mode: string; label: string; hint: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      style={{
        padding: '10px 14px',
        borderRadius: '10px',
        border: active ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)',
        background: active ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.02)',
        color: active ? '#c4b5fd' : disabled ? '#475569' : '#cbd5e1',
        fontSize: '12px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', opacity: disabled ? 0.4 : 1,
        minWidth: '100px', textAlign: 'center',
      }}>
      <div>{label}</div>
      <div style={{ fontSize: '10px', fontWeight: 400, marginTop: '2px', color: active ? '#a78bfa' : '#64748b' }}>{hint}</div>
    </button>
  );
}

export default function SystemPage() {
  const [daemon, setDaemon] = useState<DaemonData | null>(null);
  const [services, setServices] = useState<Record<string, ServiceStatus>>({});
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [voice, setVoice] = useState<VoiceState | null>(null);
  const [busy, setBusy] = useState(false);

  // SSE for daemon (fast updates)
  useSSE<StatusPayload>('/api/status/stream', (data) => {
    if (data?.daemon) setDaemon(data.daemon);
  });

  // Fetch brain + voice + services on mount + interval
  const refreshAll = useCallback(async () => {
    try {
      const [brainR, voiceR, svcR] = await Promise.allSettled([
        fetch(`${SONA_API}/api/config/brain`).then(r => r.json()),
        fetch(`${SONA_API}/api/config/voice`).then(r => r.json()),
        fetch(`${SONA_API}/api/services`).then(r => r.json()),
      ]);
      if (brainR.status === 'fulfilled' && brainR.value?.ok) setBrain(brainR.value);
      if (voiceR.status === 'fulfilled' && voiceR.value?.ok) setVoice(voiceR.value);
      if (svcR.status === 'fulfilled' && svcR.value?.ok) setServices(svcR.value.services ?? {});
    } catch {}
  }, []);

  useEffect(() => {
    refreshAll();
    const id = setInterval(refreshAll, 10000);
    return () => clearInterval(id);
  }, [refreshAll]);

  const setBrainMode = async (mode: string) => {
    setBusy(true);
    try {
      await fetch(`${SONA_API}/api/config/brain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      await refreshAll();
    } finally { setBusy(false); }
  };

  const setVoiceConfig = async (lang: 'en' | 'fr', key: string) => {
    setBusy(true);
    try {
      const body = lang === 'en' ? { en: key } : { fr: key };
      await fetch(`${SONA_API}/api/config/voice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await refreshAll();
    } finally { setBusy(false); }
  };

  const daemonOn = daemon?.enabled ?? daemon?.running ?? false;
  const lastTick = daemon?.lastTick ? new Date(daemon.lastTick).toLocaleTimeString('en-US', { hour12: false }) : '--';

  const sysRows: [string, string][] = [
    ['Host', 'srv1589372'],
    ['OS', 'Debian 13 Trixie'],
    ['CPU', '4 vCPU'],
    ['RAM', '15 GB'],
    ['Disk', '197 GB NVMe'],
    ['Public IP', '72.60.185.57'],
    ['Daemon interval', daemon?.intervalMs ? `${daemon.intervalMs / 1000}s` : '3 min'],
    ['Max concurrent jobs', String(daemon?.maxConcurrent ?? 2)],
    ['Last tick', lastTick],
    ['Brain mode', brain?.mode ?? '…'],
    ['Voice (EN / FR)', voice?.current ? `${voice.current.en} / ${voice.current.fr}` : '…'],
  ];

  const svc = (n: string): ServiceStatus => (services[n] as ServiceStatus) ?? 'unknown';

  const brainModes = [
    { mode: 'claude_code_a', label: 'CC-A', hintBase: 'Claude Code account A' },
    { mode: 'claude_code_b', label: 'CC-B', hintBase: 'Claude Code account B' },
    { mode: 'openrouter', label: 'OpenRouter', hintBase: 'Free OpenRouter models' },
    { mode: 'lmstudio', label: 'LM Studio', hintBase: 'Local LM Studio via Tailscale' },
  ];

  return (
    <PageShell>
      <div className="sona-page-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 40 }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>System &amp; Settings</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>Host info, services, brain mode, and voice config · live</p>
        </div>
      </div>

      <div style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {/* Left column: system info + daemon */}
          <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '400px' }}>
            <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <Server size={15} color="#67e8f9" />
                <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Host Info</h2>
              </div>
              <dl style={{ margin: 0 }}>
                {sysRows.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <dt style={{ fontSize: '12px', color: '#64748b' }}>{k}</dt>
                    <dd style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace', margin: 0 }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="glass" style={{ borderRadius: '16px', padding: '20px', borderColor: daemonOn ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Zap size={15} color={daemonOn ? '#4ade80' : '#f87171'} />
                  <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Backlog Daemon</h2>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: daemonOn ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: daemonOn ? '#4ade80' : '#f87171', border: `1px solid ${daemonOn ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                  {daemonOn ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 2 }}>
                <div>Last tick: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{lastTick}</span></div>
                <div>Interval: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{daemon?.intervalMs ? `${daemon.intervalMs / 1000}s` : '3 min'}</span></div>
                <div>Concurrency: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>max {daemon?.maxConcurrent ?? 2}</span></div>
                {daemon?.error && <div style={{ color: '#f87171', marginTop: '8px' }}>Error: {daemon.error}</div>}
              </div>
            </div>
          </div>

          {/* Right column: services */}
          <div style={{ flex: '1 1 350px', minWidth: '300px' }}>
            <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <HardDrive size={15} color="#a78bfa" />
                <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Services</h2>
              </div>
              <ServiceRow name="sona-agent" status={svc('sona-agent')} />
              <ServiceRow name="sona-host-bridge" status={svc('sona-host-bridge')} />
              <ServiceRow name="whisper-server" status={svc('whisper-server')} />
              <ServiceRow name="kokoro-server" status={svc('kokoro-server')} />
              <ServiceRow name="ssh-socks-relay" status={svc('ssh-socks-relay')} />
              <ServiceRow name="sona-dashboard-backend" status={svc('sona-dashboard-backend')} />
              <ServiceRow name="sona-dashboard-frontend" status={svc('sona-dashboard-frontend')} />
            </div>
          </div>
        </div>

        {/* Brain mode switcher */}
        <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Brain size={15} color="#a78bfa" />
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Brain Mode</h2>
            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>Active: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{brain?.mode ?? '…'}</span></span>
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
              return (
                <BrainButton
                  key={mode}
                  mode={mode}
                  label={label}
                  hint={hint}
                  active={brain?.mode === mode}
                  disabled={disabled}
                  onClick={() => setBrainMode(mode)}
                />
              );
            })}
          </div>
        </div>

        {/* Voice config switcher */}
        <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Volume2 size={15} color="#f59e0b" />
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Voice Config</h2>
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px', minWidth: '240px' }}>
              <label style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>English voice (Kokoro)</label>
              <select
                value={voice?.current?.en ?? ''}
                disabled={busy || !voice}
                onChange={(e) => setVoiceConfig('en', e.target.value)}
                style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(15,15,26,0.8)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '12px' }}
              >
                {(voice?.available?.en ?? []).map((v) => (
                  <option key={v.key} value={v.key}>{v.label || v.key}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 240px', minWidth: '240px' }}>
              <label style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>French voice (Piper)</label>
              <select
                value={voice?.current?.fr ?? ''}
                disabled={busy || !voice}
                onChange={(e) => setVoiceConfig('fr', e.target.value)}
                style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(15,15,26,0.8)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '12px' }}
              >
                {(voice?.available?.fr ?? []).map((v) => (
                  <option key={v.key} value={v.key}>{v.label || v.key}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
