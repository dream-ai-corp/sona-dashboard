'use client';
import { useState } from 'react';
import { useSSE } from '@/lib/useSSE';

interface Card {
  label: string;
  value: string;
  sub?: string;
  color: string;
}

function StatCard({ label, value, sub, color }: Card) {
  return (
    <div className="flex-1 rounded-xl p-4 bg-gray-800 border border-gray-700 shadow">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

interface Job { id: string; status?: string; }
interface StatusPayload { daemon?: any; brain?: any; voice?: any; }

export default function StatusRow() {
  const [daemon, setDaemon] = useState<any>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useSSE<Job[]>('/api/jobs/stream', (all) => {
    if (!Array.isArray(all)) return;
    setActiveCount(all.filter(j => j.status === 'running' || j.status === 'in_progress').length);
    setTotalCount(all.length);
  });

  useSSE<StatusPayload>('/api/status/stream', (data) => {
    if (data?.daemon) setDaemon(data.daemon);
  });

  const daemonOn = daemon?.enabled ?? daemon?.running ?? false;
  const lastTick = daemon?.lastTick ? new Date(daemon.lastTick).toLocaleTimeString() : '--';

  return (
    <div className="flex gap-4">
      <StatCard
        label="Daemon"
        value={daemonOn ? 'ON' : 'OFF'}
        sub={`last tick ${lastTick}`}
        color={daemonOn ? 'text-emerald-400' : 'text-red-400'}
      />
      <StatCard
        label="Active Agents"
        value={String(activeCount)}
        sub={`${totalCount} total jobs`}
        color="text-violet-400"
      />
      <StatCard
        label="System Load"
        value="VPS"
        sub="4 vCPU / 15 GB"
        color="text-blue-400"
      />
      <StatCard
        label="Host"
        value="Online"
        sub="srv1589372"
        color="text-emerald-400"
      />
    </div>
  );
}
