'use client';
import { useEffect, useState } from 'react';

interface Card {
  label: string;
  value: string;
  sub?: string;
  color: string;
}

function StatCard({ label, value, sub, color }: Card) {
  return (
    <div className={`flex-1 rounded-xl p-4 bg-gray-800 border border-gray-700 shadow`}>
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function StatusRow() {
  const [daemon, setDaemon] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [sys, setSys] = useState<any>(null);
  const [containers, setContainers] = useState<string>('...');

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_SONA_API_URL ?? 'http://72.60.185.57:8080';
    const load = async () => {
      try {
        const [d, j] = await Promise.all([
          fetch(`${apiUrl}/api/daemon`).then(r => r.json()),
          fetch(`${apiUrl}/api/jobs`).then(r => r.json()),
        ]);
        setDaemon(d);
        const jobArr = Array.isArray(j) ? j : (j?.jobs ?? []);
        setJobs(jobArr);
      } catch {}
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const active = jobs.filter((j: any) => j?.status === 'running' || j?.status === 'in_progress').length;
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
        value={String(active)}
        sub={`${jobs.length} total jobs`}
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
