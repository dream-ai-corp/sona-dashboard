'use client';
import { useEffect, useState } from 'react';

export default function SystemPanel() {
  const [daemon, setDaemon] = useState<any>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_SONA_API_URL ?? 'http://72.60.185.57:8080';
    const load = async () => {
      try {
        const d = await fetch(`${apiUrl}/api/daemon`).then(r => r.json());
        setDaemon(d);
      } catch {}
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

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
