'use client';
import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export default function ChatWidget() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_SONA_API_URL ?? 'http://72.60.185.57:8080';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const reply = data?.reply ?? data?.response ?? data?.message ?? JSON.stringify(data);
      setMessages(m => [...m, { role: 'assistant', text: reply }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${e?.message}` }]);
    }
    setLoading(false);
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow p-4 flex flex-col">
      <h2 className="text-white font-semibold mb-3">Chat with Sona</h2>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-52 mb-3 pr-1">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm italic">Send a message to Sona…</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-700 text-gray-100'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 animate-pulse">…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask Sona something…"
          className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
