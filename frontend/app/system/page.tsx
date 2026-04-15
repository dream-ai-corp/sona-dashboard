'use client';

import { useState } from 'react';
import PageShell from '@/components/PageShell';
import { Server, HardDrive, Zap } from 'lucide-react';
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

function ServiceRow({ name, status }: { name: string; status: 'up' | 'down' | 'unknown' }) {
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

export default function SystemPage() {
  const [daemon, setDaemon] = useState<DaemonData | null>(null);
  const [brain, setBrain] = useState('...');
  const [voice, setVoice] = useState('...');

  useSSE<StatusPayload>('/api/status/stream', (data) => {
    if (data?.daemon) setDaemon(data.daemon);
    if (data?.brain) {
      const b = data.brain;
      setBrain(b?.mode ?? b?.brain ?? 'n/a');
    }
    if (data?.voice) {
      const v = data.voice;
      setVoice((v?.language ?? v?.voice ?? 'n/a').toUpperCase());
    }
  });

  const daemonOn = daemon?.enabled ?? daemon?.running ?? false;
  const lastTick = daemon?.lastTick
    ? new Date(daemon.lastTick).toLocaleTimeString('en-US', { hour12: false })
    : '--';

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
    ['Brain mode', brain],
    ['Voice language', voice],
  ];

  const sonaAgentStatus: 'up' | 'down' | 'unknown' = daemon?.error ? 'down' : daemon ? 'up' : 'unknown';

  return (
    <PageShell>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>System</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>Host info, services, and daemon status · live via SSE</p>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '28px 32px', display: 'flex', gap: '20px' }}>

        {/* Left: System info + Daemon */}
        <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

          {/* Daemon */}
          <div className="glass" style={{ borderRadius: '16px', padding: '20px', borderColor: daemonOn ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={15} color={daemonOn ? '#4ade80' : '#f87171'} />
                <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Backlog Daemon</h2>
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                background: daemonOn ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: daemonOn ? '#4ade80' : '#f87171',
                border: `1px solid ${daemonOn ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}>
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

        {/* Right: Services */}
        <div style={{ flex: '0 0 calc(45% - 20px)' }}>
          <div className="glass" style={{ borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <HardDrive size={15} color="#a78bfa" />
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Services</h2>
            </div>
            <ServiceRow name="sona-agent" status={sonaAgentStatus} />
            <ServiceRow name="sona-dashboard" status="up" />
            <ServiceRow name="whisper-server" status="unknown" />
            <ServiceRow name="kokoro-server" status="unknown" />
            <ServiceRow name="sona-host-bridge" status="unknown" />
            <ServiceRow name="ssh-socks-relay" status="unknown" />
          </div>
        </div>

      </div>
    </PageShell>
  );
}
