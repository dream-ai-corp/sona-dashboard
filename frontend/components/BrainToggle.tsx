'use client';
import { useState } from 'react';
import { useSSE } from '@/lib/useSSE';

interface StatusPayload { daemon?: any; brain?: any; voice?: any; }

export default function BrainToggle() {
  const [mode, setMode] = useState<string>('...');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_SONA_API_URL ?? '';

  useSSE<StatusPayload>('/api/status/stream', (data) => {
    if (!data?.brain) return;
    const b = data.brain;
    setMode(b?.mode ?? b?.brain ?? JSON.stringify(b));
  });

  const toggle = async () => {
    const next = mode === 'claude_code' ? 'lmstudio' : 'claude_code';
    setLoading(true);
    setMsg('');
    try {
      await fetch(`${apiUrl}/api/config/brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      setMsg(`Switched to ${next}`);
      // The status SSE will push the updated brain mode within 15s; reflect immediately
      setMode(next);
    } catch (e: any) {
      setMsg(`Error: ${e?.message}`);
    }
    setLoading(false);
  };

  const isCC = mode === 'claude_code';

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow p-4">
      <h2 className="text-white font-semibold mb-3">Brain Mode</h2>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-gray-400 text-xs mb-1">Current</p>
          <p className={`text-lg font-bold ${isCC ? 'text-violet-400' : 'text-blue-400'}`}>{mode}</p>
        </div>
        <button
          onClick={toggle}
          disabled={loading || mode === '...' || mode === 'err'}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
            isCC
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-violet-600 hover:bg-violet-500 text-white'
          }`}
        >
          {loading ? 'Switching…' : isCC ? 'Switch to LMStudio' : 'Switch to Claude'}
        </button>
      </div>
      {msg && <p className="text-emerald-400 text-xs mt-2">{msg}</p>}
    </div>
  );
}
