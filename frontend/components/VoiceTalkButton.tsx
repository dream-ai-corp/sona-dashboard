'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

const SONA_API = process.env.NEXT_PUBLIC_SONA_API_URL ?? '';

type Status = 'idle' | 'recording' | 'sending' | 'playing' | 'error';

export default function VoiceTalkButton({ sessionId = 'dashboard-voice' }: { sessionId?: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [reply, setReply] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Check if getUserMedia is available (requires HTTPS or localhost)
  const [micSupported, setMicSupported] = useState<boolean>(true);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicSupported(false);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
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


  const startRecording = useCallback(async () => {
    primeAudioIfNeeded()
    setError('');
    setTranscript('');
    setReply('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        cleanup();
        if (blob.size < 1000) {
          setStatus('idle');
          setError('Audio too short');
          return;
        }
        setStatus('sending');
        try {
          const b64 = await blobToBase64(blob);
          const res = await fetch(`${SONA_API}/api/voice/turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio_base64: b64,
              mime: 'audio/webm',
              sessionId,
            }),
          });
          const data = await res.json();
          if (!data.ok) {
            setStatus('error');
            setError(data.error || 'Unknown error');
            return;
          }
          setTranscript(data.transcript || '');
          setReply(data.reply || '');
          setElapsedMs(data.elapsedMs || 0);
          setStatus('playing');
          // Play the returned audio
          if (data.audio_base64) {
            const audioBlob = base64ToBlob(data.audio_base64, data.audio_mime || 'audio/wav');
            const url = URL.createObjectURL(audioBlob);
            if (audioRef.current) {
              audioRef.current.src = url;
              audioRef.current.onended = () => {
                setStatus('idle');
                URL.revokeObjectURL(url);
              };
              audioRef.current.play().catch((e) => {
                console.error('audio play failed', e);
                setStatus('idle');
              });
            }
          } else {
            setStatus('idle');
          }
        } catch (e) {
          setStatus('error');
          setError(e instanceof Error ? e.message : String(e));
        }
      };
      mr.start();
      setStatus('recording');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Microphone access denied');
    }
  }, [cleanup, sessionId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggle = useCallback(() => {
    if (status === 'recording') stopRecording();
    else if (status === 'idle' || status === 'error') startRecording();
  }, [status, startRecording, stopRecording]);

  if (!micSupported) {
    return (
      <div style={{ padding: '16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', color: '#fca5a5', fontSize: '12px', lineHeight: 1.5 }}>
        <strong>🎙 Microphone unavailable</strong><br />
        Your browser blocks <code>getUserMedia()</code> on insecure (HTTP) origins. Options:
        <ul style={{ margin: '8px 0 0 18px' }}>
          <li>SSH tunnel: <code>ssh -L 3010:localhost:3010 -L 8080:localhost:8080 sona-vps</code> then open <code>http://localhost:3010</code></li>
          <li>Or enable HTTPS on the VPS (ask Claude to set up Caddy + sslip.io)</li>
        </ul>
      </div>
    );
  }

  const btnColor =
    status === 'recording' ? '#ef4444' :
    status === 'sending' ? '#a78bfa' :
    status === 'playing' ? '#4ade80' :
    status === 'error' ? '#f97316' : '#7c3aed';
  const btnLabel =
    status === 'recording' ? 'Recording… click to stop' :
    status === 'sending' ? 'Transcribing + thinking…' :
    status === 'playing' ? 'Sona is speaking…' :
    status === 'error' ? 'Error — click to retry' : 'Talk to Sona';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <audio ref={audioRef} playsInline preload="auto" style={{ display: 'none' }} />
      <button
        onClick={toggle}
        disabled={status === 'sending' || status === 'playing'}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 20px',
          borderRadius: '12px',
          border: `1px solid ${btnColor}`,
          background: status === 'recording' ? `${btnColor}22` : `${btnColor}11`,
          color: btnColor,
          fontSize: '13px', fontWeight: 600,
          cursor: status === 'sending' || status === 'playing' ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: status === 'recording' ? `0 0 12px ${btnColor}44` : 'none',
          transition: 'all 150ms ease',
        }}>
        {status === 'sending' ? <Loader2 size={15} className="spin" /> :
         status === 'recording' ? <MicOff size={15} /> :
         <Mic size={15} />}
        {btnLabel}
      </button>

      {(transcript || reply) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
          {transcript && (
            <div style={{ padding: '10px 14px', background: 'rgba(148,163,184,0.08)', borderRadius: '10px', borderLeft: '2px solid #7c3aed' }}>
              <div style={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>You said</div>
              <div style={{ color: '#cbd5e1' }}>{transcript}</div>
            </div>
          )}
          {reply && (
            <div style={{ padding: '10px 14px', background: 'rgba(74,222,128,0.06)', borderRadius: '10px', borderLeft: '2px solid #4ade80' }}>
              <div style={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Sona · {elapsedMs}ms</div>
              <div style={{ color: '#cbd5e1' }}>{reply}</div>
            </div>
          )}
        </div>
      )}
      {error && (
        <div style={{ fontSize: '11px', color: '#fca5a5' }}>⚠ {error}</div>
      )}
      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      // Strip data URL prefix if present
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
