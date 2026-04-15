'use client';
import { useEffect, useState } from 'react';

interface StatusData {
  brain?: { mode?: string };
  voice?: { language?: string };
}

export default function Header() {
  const [now, setNow] = useState('');
  const [brain, setBrain] = useState('...');
  const [voice, setVoice] = useState('...');

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_SONA_API_URL ?? 'http://72.60.185.57:8080';
        const [b, v] = await Promise.all([
          fetch(`${apiUrl}/api/brain`).then(r => r.json()),
          fetch(`${apiUrl}/api/voice`).then(r => r.json()),
        ]);
        setBrain(b?.mode ?? b?.brain ?? JSON.stringify(b));
        setVoice(v?.language ?? v?.voice ?? JSON.stringify(v));
      } catch {
        setBrain('err');
        setVoice('err');
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const brainColor = brain === 'claude_code' ? 'bg-violet-500' : brain === 'lmstudio' ? 'bg-blue-500' : 'bg-gray-500';
  const voiceColor = voice?.toUpperCase?.() === 'FR' ? 'bg-rose-500' : 'bg-emerald-500';

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow">S</div>
        <div>
          <h1 className="text-white font-bold text-xl leading-tight tracking-tight">Sona</h1>
          <p className="text-gray-400 text-xs">AI Assistant Dashboard</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${brainColor}`}>
          {brain}
        </span>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${voiceColor}`}>
          {voice?.toUpperCase?.() ?? voice}
        </span>
        <span className="text-gray-400 text-sm font-mono">{now}</span>
      </div>
    </header>
  );
}
