'use client';
import { useState } from 'react';
import { useSSE } from '@/lib/useSSE';

interface StatusPayload { daemon?: any; brain?: any; voice?: any; }

export default function SystemPanel() {
  const [daemon, setDaemon] = useState<any>(null);

  useSSE<StatusPayload>('/api/status/stream', (data) => {
    if (data?.daemon) setDaemon(data.daemon);
  });

  const rows: [string, string][] = [
    ['Host', 'srv1589372 (Hostinger KVM4)'],
    ['OS', 'Debian 13 Trixie'],
    ['CPU', '4 vCPU'],
    ['RAM', '15 GB'],
    ['Disk', '197 GB NVMe'],
    ['Public IP', '72.60.185.57'],
    ['Daemon interval', daemon?.intervalMs ? `${daemon.intervalMs / 1000}s` : '3 min'],
    ['Max concurrent', daemon?.maxConcurrent ?? '2'],
    ['Last tick', daemon?.lastTick ? new Date(daemon.lastTick).toLocaleString() : '--'],
  ];

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow p-4">
      <h2 className="text-white font-semibold mb-3">System</h2>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm">
            <dt className="text-gray-400">{k}</dt>
            <dd className="text-gray-200 font-mono text-xs text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
