'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Paperclip, Mic, MicOff, Send, X, Loader2 } from 'lucide-react';

type Status = 'idle' | 'recording' | 'sending' | 'playing' | 'error';

interface Attachment {
  id: string;
  dataUrl: string;
  name: string;
  size: number;
}

interface Props {
  sessionId?: string;
  channel?: string;
  compact?: boolean; // when true, hide status panel below
}

export default function SonaChatInput({ sessionId = 'dashboard', channel = 'dashboard', compact = false }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastReply, setLastReply] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLInputElement | null>(null);

  const [micSupported, setMicSupported] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) setMicSupported(false);
  }, []);

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


  const fadeStatus = useCallback(() => {
    setTimeout(() => { setStatus('idle'); setError(''); }, 400);
  }, []);

  // ── Image attach ────────────────────────────────────
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
    setAttachments((prev) => [...prev, ...incoming].slice(0, 5));
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter(a => a.id !== id));
  }, []);

  // ── Text submit ─────────────────────────────────────
  const submitText = useCallback(async () => {
    const message = text.trim();
    if (!message && attachments.length === 0) return;
    setStatus('sending');
    setError('');
    try {
      const body: Record<string, unknown> = {
        message,
        sessionId,
        channel,
      };
      if (attachments.length > 0) {
        body.images = attachments.map(a => a.dataUrl);
      }
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setStatus('error');
        setError(data.error);
        return;
      }
      setLastTranscript(message);
      setLastReply((data.reply as string) ?? '');
      setText('');
      setAttachments([]);
      setStatus('idle');
      fadeStatus();
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [text, attachments, sessionId, channel, fadeStatus]);

  // ── Voice record ────────────────────────────────────
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
        if (blob.size < 1000) { setStatus('idle'); setError('Audio too short'); return; }
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
            body: JSON.stringify({ audio_base64: b64, mime: 'audio/webm', sessionId }),
          });
          const data = await res.json();
          if (!data.ok) { setStatus('error'); setError(data.error || 'Unknown error'); return; }
          setLastTranscript(data.transcript || '');
          setLastReply(data.reply || '');
          setStatus('playing');
          if (data.audio_base64) {
            const bin = atob(data.audio_base64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const audioBlob = new Blob([arr], { type: data.audio_mime || 'audio/wav' });
            const url = URL.createObjectURL(audioBlob);
            if (audioRef.current) {
              audioRef.current.src = url;
              audioRef.current.onended = () => { setStatus('idle'); URL.revokeObjectURL(url); };
              audioRef.current.play().catch(() => setStatus('idle'));
            }
          } else { setStatus('idle'); }
        } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
      };
      mr.start();
      setStatus('recording');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Microphone access denied');
    }
  }, [cleanupStream, sessionId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  }, []);

  const onMicClick = useCallback(() => {
    if (status === 'recording') stopRecording();
    else if (status === 'idle' || status === 'error') startRecording();
  }, [status, stopRecording, startRecording]);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); }
  }, [submitText]);

  const busy = status === 'sending' || status === 'playing';
  const micColor = status === 'recording' ? '#ef4444' : '#a78bfa';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 }}>
      <audio ref={audioRef} playsInline preload="auto" style={{ display: 'none' }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Attachment thumbnails */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {attachments.map(a => (
            <div key={a.id} style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={a.dataUrl} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                onClick={() => removeAttachment(a.id)}
                style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main input row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '6px 8px 6px 12px',
        borderRadius: '12px',
        background: 'rgba(15,15,26,0.85)',
        border: `1px solid ${status === 'recording' ? 'rgba(239,68,68,0.5)' : status === 'error' ? 'rgba(249,115,22,0.4)' : 'rgba(124,58,237,0.25)'}`,
        transition: 'border 150ms ease',
        minWidth: 0,
      }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          title="Attach image"
          style={{ padding: '6px', borderRadius: '8px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Paperclip size={15} />
        </button>

        <input
          ref={textRef}
          type="text"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            status === 'recording' ? '● Recording — click mic to stop' :
            status === 'sending' ? 'Sending…' :
            status === 'playing' ? '♫ Sona is speaking…' :
            'Type or speak to Sona…'
          }
          style={{
            flex: 1, minWidth: 0,
            padding: '8px 2px',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e2e8f0',
            fontSize: '13px',
            fontFamily: 'inherit',
          }}
        />

        {micSupported && (
          <button
            onClick={onMicClick}
            disabled={busy && status !== 'recording'}
            title={status === 'recording' ? 'Stop recording' : 'Talk to Sona'}
            style={{
              padding: '8px',
              borderRadius: '8px',
              background: status === 'recording' ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.1)',
              border: `1px solid ${status === 'recording' ? '#ef4444' : 'rgba(124,58,237,0.3)'}`,
              color: micColor,
              cursor: busy && status !== 'recording' ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center',
              boxShadow: status === 'recording' ? '0 0 12px rgba(239,68,68,0.4)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            {status === 'recording' ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
        )}

        <button
          onClick={submitText}
          disabled={busy || (!text.trim() && attachments.length === 0)}
          title="Send (Enter)"
          style={{
            padding: '8px',
            borderRadius: '8px',
            background: text.trim() || attachments.length > 0 ? 'rgba(124,58,237,0.2)' : 'transparent',
            border: `1px solid ${text.trim() || attachments.length > 0 ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.06)'}`,
            color: text.trim() || attachments.length > 0 ? '#c4b5fd' : '#475569',
            cursor: busy || (!text.trim() && attachments.length === 0) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center',
          }}
        >
          {status === 'sending' ? <Loader2 size={15} className="sona-spin" /> : <Send size={15} />}
        </button>
      </div>

      {/* Status / last turn summary */}
      {!compact && (lastTranscript || lastReply || error) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', padding: '2px 4px' }}>
          {lastTranscript && !error && (
            <div style={{ color: '#64748b' }}>
              <span style={{ color: '#7c3aed', fontWeight: 600 }}>You:</span> {lastTranscript.slice(0, 120)}{lastTranscript.length > 120 ? '…' : ''}
            </div>
          )}
          {lastReply && !error && (
            <div style={{ color: '#94a3b8' }}>
              <span style={{ color: '#4ade80', fontWeight: 600 }}>Sona:</span> {lastReply.slice(0, 160)}{lastReply.length > 160 ? '…' : ''}
            </div>
          )}
          {error && <div style={{ color: '#fca5a5' }}>⚠ {error}</div>}
        </div>
      )}

      <style jsx>{`
        .sona-spin { animation: sona-spin 1s linear infinite; }
        @keyframes sona-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
