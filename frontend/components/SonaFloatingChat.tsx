'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { MessageCircle, X, Paperclip, Mic, MicOff, Send, Loader2 } from 'lucide-react';

type Status = 'idle' | 'recording' | 'sending' | 'playing' | 'error';

interface Attachment {
  id: string;
  dataUrl: string;
  name: string;
  size: number;
}

interface ConversationRow {
  id: number;
  role: string;
  content: string;
  channel: string;
  timestamp: number;
}

const MAX_ATTACHMENTS = 5;
const HOLD_THRESHOLD_MS = 350; // anything longer than this counts as hold-to-talk

export default function SonaFloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ConversationRow[]>([]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [micMode, setMicMode] = useState<'idle' | 'hold' | 'toggle'>('idle');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const holdStartRef = useRef<number>(0);
  const holdDeterminedRef = useRef<boolean>(false);

  const [micSupported, setMicSupported] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) setMicSupported(false);
  }, []);

  // Fetch conversations history when opening
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) return;
      const data: ConversationRow[] = await res.json();
      const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
      setMessages(sorted.slice(-50));
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      fetchHistory();
    }
  }, [open, fetchHistory]);

  // SSE for live conversation updates (only when open)
  useEffect(() => {
    if (!open) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/conversations/stream');
      es.onmessage = (e) => {
        try {
          const all: ConversationRow[] = JSON.parse(e.data);
          const sorted = [...all].sort((a, b) => a.timestamp - b.timestamp);
          setMessages(sorted.slice(-50));
        } catch {}
      };
      es.onerror = () => { es?.close(); };
    } catch {}
    return () => { es?.close(); };
  }, [open]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);
  const primeAudioIfNeeded = useCallback(() => {
    // iOS Safari blocks HTMLAudioElement.play() unless it was triggered by
    // a user gesture. We prime the element with a silent WAV inside the
    // initial user interaction so later programmatic .play() calls work.
    const a = audioRef.current
    if (!a || (a as unknown as { __sonaPrimed?: boolean }).__sonaPrimed) return
    try {
      a.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
      const p = a.play()
      if (p && typeof p.then === "function") p.catch(() => {})
      ;(a as unknown as { __sonaPrimed?: boolean }).__sonaPrimed = true
    } catch {}
  }, [])


  // === Image attach ===
  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const incoming: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      incoming.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, dataUrl, name: f.name, size: f.size });
    }
    setAttachments(prev => [...prev, ...incoming].slice(0, MAX_ATTACHMENTS));
  }, []);

  // === Text submit ===
  const submitText = useCallback(async () => {
    const message = text.trim();
    if (!message && attachments.length === 0) return;
    setStatus('sending');
    setError('');
    try {
      const body: Record<string, unknown> = { message, sessionId: 'dashboard-floating', channel: 'dashboard' };
      if (attachments.length > 0) body.images = attachments.map(a => a.dataUrl);
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setStatus('error');
        setError(data.error);
        setTimeout(() => { setStatus('idle'); setError(''); }, 3000);
        return;
      }
      setText('');
      setAttachments([]);
      setStatus('idle');
      // The message will land in the conversations table and come back via SSE automatically.
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
      setTimeout(() => { setStatus('idle'); setError(''); }, 3000);
    }
  }, [text, attachments]);

  // === Voice: start and stop recording ===
  const startRecording = useCallback(async () => {
    primeAudioIfNeeded()
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        cleanupStream();
        if (blob.size < 1000) { setStatus('idle'); setMicMode('idle'); setError('Audio too short'); setTimeout(() => setError(''), 2000); return; }
        setStatus('sending');
        try {
          const b64 = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => { const s = String(r.result); const c = s.indexOf(','); resolve(c >= 0 ? s.slice(c + 1) : s); };
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
          const res = await fetch('/api/voice/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_base64: b64, mime: 'audio/webm', sessionId: 'dashboard-floating' }),
          });
          const data = await res.json();
          if (!data.ok) { setStatus('error'); setMicMode('idle'); setError(data.error || 'Unknown error'); setTimeout(() => { setStatus('idle'); setError(''); }, 3000); return; }
          setStatus('playing');
          if (data.audio_base64) {
            const bin = atob(data.audio_base64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const audioBlob = new Blob([arr], { type: data.audio_mime || 'audio/wav' });
            const url = URL.createObjectURL(audioBlob);
            if (audioRef.current) {
              audioRef.current.src = url;
              audioRef.current.onended = () => { setStatus('idle'); setMicMode('idle'); URL.revokeObjectURL(url); };
              audioRef.current.play().catch(() => { setStatus('idle'); setMicMode('idle'); });
            }
          } else { setStatus('idle'); setMicMode('idle'); }
        } catch (e) {
          setStatus('error');
          setMicMode('idle');
          setError(e instanceof Error ? e.message : String(e));
          setTimeout(() => { setStatus('idle'); setError(''); }, 3000);
        }
      };
      mr.start();
      setStatus('recording');
    } catch (e) {
      setStatus('error');
      setMicMode('idle');
      setError(e instanceof Error ? e.message : 'Microphone access denied');
      setTimeout(() => { setStatus('idle'); setError(''); }, 3000);
    }
  }, [cleanupStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // === Press-and-hold detection for mic ===
  // - Short tap (< HOLD_THRESHOLD_MS): toggle mode — tap once to start, tap again to stop
  // - Long press (>= HOLD_THRESHOLD_MS while held): push-to-talk — release finger to send
  const onMicPointerDown = useCallback(async (e: React.PointerEvent) => {
    e.preventDefault();
    if (status !== 'idle' && status !== 'error') {
      // Currently recording in toggle mode: pointer down stops it
      if (micMode === 'toggle' && status === 'recording') {
        stopRecording();
      }
      return;
    }
    holdStartRef.current = Date.now();
    holdDeterminedRef.current = false;
    await startRecording();
  }, [status, micMode, startRecording, stopRecording]);

  const onMicPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const duration = Date.now() - holdStartRef.current;
    if (holdDeterminedRef.current) return;
    holdDeterminedRef.current = true;
    if (duration >= HOLD_THRESHOLD_MS) {
      // Long press → push-to-talk, send on release
      setMicMode('hold');
      stopRecording();
    } else {
      // Short tap → toggle mode, keep recording until next tap
      setMicMode('toggle');
    }
  }, [stopRecording]);

  const onMicPointerCancel = useCallback(() => {
    // Finger moved off the button while holding — treat like hold release
    if (!holdDeterminedRef.current && status === 'recording') {
      holdDeterminedRef.current = true;
      setMicMode('hold');
      stopRecording();
    }
  }, [status, stopRecording]);

  const onMicClick = useCallback(() => {
    // Fallback click for non-pointer devices or second tap in toggle mode
    if (status === 'recording' && micMode === 'toggle') {
      stopRecording();
    }
  }, [status, micMode, stopRecording]);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); }
  }, [submitText]);

  const busy = status === 'sending' || status === 'playing';
  const recording = status === 'recording';

  const formatTime = (ts: number): string => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  // =================== RENDER ===================
  return (
    <>
      <audio ref={audioRef} playsInline preload="auto" style={{ display: 'none' }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Floating Action Button (always visible bottom-right) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Sona chat"
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            width: '60px',
            height: '60px',
            borderRadius: '30px',
            background: 'linear-gradient(135deg, #7c3aed, #c4b5fd)',
            border: 'none',
            boxShadow: '0 8px 24px rgba(124,58,237,0.45), 0 0 0 3px rgba(124,58,237,0.1)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            transition: 'transform 150ms ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <MessageCircle size={26} />
        </button>
      )}

      {/* Floating chat panel */}
      {open && (
        <div
          className="sona-chat-panel"
          style={{
            position: 'fixed',
            zIndex: 9999,
            background: 'rgba(15,15,26,0.98)',
            border: '1px solid rgba(124,58,237,0.3)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.15)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(124,58,237,0.08)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '16px', background: 'linear-gradient(135deg, #7c3aed, #c4b5fd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>S</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>Sona</div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  {recording ? '● Recording' : status === 'sending' ? 'Sending…' : status === 'playing' ? '♫ Speaking…' : 'Online'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                width: '32px', height: '32px', borderRadius: '16px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#94a3b8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 14px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minHeight: 0,
            }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px', padding: '30px 0' }}>
                No messages yet. Type, attach an image, or talk to Sona.
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%',
                    padding: '9px 13px',
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isUser ? 'rgba(124,58,237,0.18)' : 'rgba(148,163,184,0.08)',
                    border: `1px solid ${isUser ? 'rgba(124,58,237,0.3)' : 'rgba(148,163,184,0.1)'}`,
                    fontSize: '13px',
                    color: '#e2e8f0',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    <div>{m.content}</div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span>{formatTime(m.timestamp)}</span>
                      <span style={{ opacity: 0.6 }}>·</span>
                      <span style={{ textTransform: 'uppercase', letterSpacing: '0.3px' }}>{m.channel}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error banner */}
          {error && (
            <div style={{ padding: '6px 14px', fontSize: '11px', color: '#fca5a5', background: 'rgba(239,68,68,0.08)', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠ {error}
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', padding: '8px 14px 0', flexWrap: 'wrap' }}>
              {attachments.map(a => (
                <div key={a.id} style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <img src={a.dataUrl} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
                    style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px 14px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || recording}
              title="Attach image"
              style={{
                width: '38px', height: '38px', borderRadius: '19px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#94a3b8',
                cursor: busy ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
              <Paperclip size={16} />
            </button>

            <input
              type="text"
              value={text}
              disabled={busy || recording}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder={
                recording ? '● Recording — release or tap mic' :
                status === 'sending' ? 'Sending…' :
                status === 'playing' ? '♫ Sona speaking…' :
                'Type, attach, or talk…'
              }
              style={{
                flex: 1, minWidth: 0,
                padding: '10px 14px',
                background: 'rgba(15,15,26,0.8)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                color: '#e2e8f0',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />

            {/* Mic button — dual mode (tap to toggle OR press-and-hold) */}
            {micSupported && (
              <button
                onPointerDown={onMicPointerDown}
                onPointerUp={onMicPointerUp}
                onPointerCancel={onMicPointerCancel}
                onClick={onMicClick}
                disabled={busy && !recording}
                title={recording ? 'Release or tap to stop' : 'Tap or hold to talk'}
                aria-label="Talk to Sona"
                style={{
                  width: '46px', height: '46px', borderRadius: '23px',
                  background: recording ? 'linear-gradient(135deg, #ef4444, #f87171)' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                  border: 'none',
                  color: 'white',
                  cursor: busy && !recording ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: recording ? '0 0 0 4px rgba(239,68,68,0.3), 0 0 16px rgba(239,68,68,0.5)' : '0 4px 12px rgba(124,58,237,0.4)',
                  transition: 'all 150ms ease',
                  touchAction: 'none',
                }}>
                {recording ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}

            {/* Send button */}
            {(text.trim() || attachments.length > 0) && !recording && (
              <button
                onClick={submitText}
                disabled={busy}
                title="Send"
                aria-label="Send"
                style={{
                  width: '46px', height: '46px', borderRadius: '23px',
                  background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                  border: 'none',
                  color: 'white',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(124,58,237,0.4)',
                }}>
                {status === 'sending' ? <Loader2 size={18} className="sona-spin" /> : <Send size={18} />}
              </button>
            )}
          </div>

          {/* Mic mode hint */}
          {recording && (
            <div style={{ textAlign: 'center', fontSize: '10px', color: '#64748b', padding: '0 14px 8px' }}>
              {micMode === 'hold' ? 'Release to send' : micMode === 'toggle' ? 'Tap mic to stop' : 'Hold or tap'}
            </div>
          )}
        </div>
      )}

      {/* Responsive sizing — desktop floats, mobile full-screen */}
      <style jsx global>{`
        .sona-chat-panel {
          right: 20px;
          bottom: 20px;
          width: 400px;
          height: 600px;
          max-height: calc(100vh - 40px);
          border-radius: 20px;
        }
        @media (max-width: 640px) {
          .sona-chat-panel {
            right: 0;
            bottom: 0;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            max-height: 100vh;
            border-radius: 0;
            border-left: none;
            border-right: none;
            border-top: none;
          }
        }
        .sona-spin { animation: sona-spin 1s linear infinite; }
        @keyframes sona-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
