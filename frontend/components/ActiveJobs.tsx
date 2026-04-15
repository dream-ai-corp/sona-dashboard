'use client';
import { useState } from 'react';
import { useSSE } from '@/lib/useSSE';

interface Job {
  id: string;
  goal?: string;
  status?: string;
  startedAt?: string | number;
  started_at?: string | number;
  result?: string;
  mtime?: number;
}

function elapsed(startedAt?: string | number): string {
  if (!startedAt) return '';
  const start = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  const s = Math.floor((Date.now() - start) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function statusBadge(status?: string) {
  const s = status?.toLowerCase() ?? '';
  if (s === 'running' || s === 'in_progress') return 'bg-blue-500 text-white animate-pulse';
  if (s === 'done' || s === 'completed') return 'bg-emerald-500 text-white';
  if (s === 'error' || s === 'failed') return 'bg-red-500 text-white';
  return 'bg-gray-600 text-gray-200';
}

export default function ActiveJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useSSE<Job[]>('/api/jobs/stream', (all) => {
    if (Array.isArray(all)) setJobs(all);
  });

  const running = jobs.filter(j => j.status === 'running' || j.status === 'in_progress');
  const recent = jobs.filter(j => j.status !== 'running' && j.status !== 'in_progress').slice(0, 8);

  return (
    <div className="flex gap-4">
      {/* Running jobs */}
      <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 shadow p-4">
        <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block"></span>
          Running Jobs
          <span className="ml-auto text-xs text-gray-400">{running.length} active</span>
        </h2>
        {running.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No active jobs</p>
        ) : (
          <ul className="space-y-2">
            {running.map(job => (
              <li key={job.id} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-1">
                  <code className="text-gray-400 text-xs">{job.id?.slice(0, 8)}</code>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge(job.status)}`}>
                    {job.status}
                  </span>
                </div>
                <p className="text-white text-sm leading-snug line-clamp-2">{job.goal ?? '(no goal)'}</p>
                <p className="text-gray-500 text-xs mt-1">elapsed: {elapsed(job.started_at ?? job.startedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent completions */}
      <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 shadow p-4">
        <h2 className="text-white font-semibold mb-3">
          Recent Jobs
          <span className="ml-auto float-right text-xs text-gray-400">{recent.length} shown</span>
        </h2>
        {recent.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No recent jobs</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {recent.map(job => (
              <li key={job.id} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-1">
                  <code className="text-gray-400 text-xs">{job.id?.slice(0, 8)}</code>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge(job.status)}`}>
                    {job.status}
                  </span>
                </div>
                <p className="text-white text-sm leading-snug line-clamp-2">{job.goal ?? '(no goal)'}</p>
                {job.result && (
                  <p className="text-gray-400 text-xs mt-1 line-clamp-1">{job.result}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
