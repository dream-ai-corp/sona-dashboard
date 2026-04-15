'use client';
import { useEffect, useState } from 'react';

export default function BrainToggle() {
  const [mode, setMode] = useState<string>('...');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_SONA_API_URL ?? 'http://72.60.185.57:8080';

  const load = async () => {
    try {
      const b = await fetch(`${apiUrl}/api/brain`).then(r => r.json());
      setMode(b?.mode ?? b?.brain ?? JSON.stringify(b));
    } catch { setMode('err'); }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const toggle = async () => {
    const next = mode === 'claude_code' ? 'lmstudio' : 'claude_code';
    setLoading(true);
    setMsg('');
    try {
      await fetch(`${apiUrl}/api/brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      setMsg(`Switched to ${next}`);
      await load();
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
