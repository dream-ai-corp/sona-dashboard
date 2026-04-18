'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { MessageCircle, X, Paperclip, Mic, MicOff, Send, Loader2, Radio, RadioTower, Settings2 } from 'lucide-react';

type Status = 'idle' | 'recording' | 'sending' | 'playing' | 'error';

interface Attachment { id: string; dataUrl: string; name: string; size: number; }
interface ConversationRow { id: number; role: string; content: string; channel: string; timestamp: number; }
interface AudioDevice { deviceId: string; label: string; kind: 'audioinput' | 'audiooutput'; }

// ─── S3-11: Voice intent types ──────────────────────────────────────────────
type MediaIntent = 'generate_image' | 'generate_video';

interface IntentResult { intent: MediaIntent | null; prompt: string | null; }

interface MediaMessage {
  type: 'generating_image' | 'generated_image' | 'generating_video' | 'generated_video' | 'generate_error';
  url?: string;
  jobId?: string;
  prompt: string;
  error?: string;
}

const MAX_ATTACHMENTS = 5;
const HOLD_THRESHOLD_MS = 350;
const VAD_SPEAKING_THRESHOLD = 0.03;
const VAD_SILENCE_MS = 1500;
const VAD_MIN_SEGMENT_MS = 400;
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// ─── S3-11: Intent detection + media generation helpers ─────────────────────

async function detectIntent(transcript: string): Promise<IntentResult> {
  try {
    const res = await fetch('/api/intent/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript }),
    });
    if (!res.ok) return { intent: null, prompt: null };
    return res.json();
  } catch {
    return { intent: null, prompt: null };
  }
}

async function postMediaMessage(msg: MediaMessage): Promise<void> {
  await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'assistant',
      content: JSON.stringify(msg),
      channel: 'dashboard',
    }),
  });
}

async function pollVideoJob(jobId: string, prompt: string): Promise<void> {
  const MAX_POLLS = 60;
  const INTERVAL_MS = 5000;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, INTERVAL_MS));
    try {
      const res = await fetch(`/api/generate/video/${jobId}`);
      if (!res.ok) break;
      const job = await res.json();
      if (job.status === 'done' && job.url) {
        await postMediaMessage({ type: 'generated_video', url: job.url, jobId, prompt });
        return;
      }
      if (job.status === 'failed' || job.status === 'error') {
        await postMediaMessage({ type: 'generate_error', error: job.error || 'Génération échouée', prompt });
        return;
      }
    } catch { break; }
  }
  await postMediaMessage({ type: 'generate_error', error: 'Timeout — la génération vidéo prend trop longtemps', prompt });
}

async function handleMediaIntent(intent: MediaIntent, prompt: string): Promise<void> {
  if (intent === 'generate_image') {
    await postMediaMessage({ type: 'generating_image', prompt });
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: 'pollinations-flux', width: 1024, height: 1024 }),
      });
      const data = await res.json();
      if (data.url) {
        await postMediaMessage({ type: 'generated_image', url: data.url, prompt });
      } else {
        await postMediaMessage({ type: 'generate_error', error: data.error || 'Génération échouée', prompt });
      }
    } catch (e) {
      await postMediaMessage({ type: 'generate_error', error: e instanceof Error ? e.message : 'Erreur inconnue', prompt });
    }
  } else {
    await postMediaMessage({ type: 'generating_video', prompt });
    try {
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: 'wan2.1', duration: 4 }),
      });
      const data = await res.json();
      if (data.ok && data.jobId) {
        void pollVideoJob(data.jobId, prompt);
      } else {
        await postMediaMessage({ type: 'generate_error', error: data.error || 'Génération échouée', prompt });
      }
    } catch (e) {
      await postMediaMessage({ type: 'generate_error', error: e instanceof Error ? e.message : 'Erreur inconnue', prompt });
    }
  }
}

async function detectAndHandleIntent(transcript: string): Promise<void> {
  const { intent, prompt } = await detectIntent(transcript);
  if (intent && prompt) await handleMediaIntent(intent, prompt);
}

// ─── S3-11: Render a chat message — handles media JSON or plain text ─────────
function renderMessageContent(content: string) {
  let parsed: MediaMessage | null = null;
  try { parsed = JSON.parse(content) as MediaMessage; } catch {}

  if (parsed && parsed.type) {
    switch (parsed.type) {
      case 'generating_image':
        return (
          <div style={{ fontSize: '12px', color: '#a78bfa' }}>
            <span style={{ marginRight: '6px' }}>🎨</span>
            Génération image en cours pour <em>"{parsed.prompt}"</em>…
          </div>
        );
      case 'generated_image':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <img
              data-testid="chat-generated-image"
              src={parsed.url}
              alt={parsed.prompt}
              style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid rgba(167,139,250,0.3)' }}
            />
            <div style={{ fontSize: '10px', color: '#64748b' }}>🎨 {parsed.prompt}</div>
          </div>
        );
      case 'generating_video':
        return (
          <div style={{ fontSize: '12px', color: '#67e8f9' }}>
            <span style={{ marginRight: '6px' }}>🎬</span>
            Génération vidéo en cours pour <em>"{parsed.prompt}"</em>…
          </div>
        );
      case 'generated_video':
        return (
          <div data-testid="chat-generated-video" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <video
              src={parsed.url}
              controls
              style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid rgba(103,232,249,0.3)' }}
            />
            <div style={{ fontSize: '10px', color: '#64748b' }}>🎬 {parsed.prompt}</div>
          </div>
        );
      case 'generate_error':
        return (
          <div style={{ fontSize: '12px', color: '#fca5a5' }}>
            ⚠ Erreur : {parsed.error}
          </div>
        );
    }
  }
  return <>{content}</>;
}

export default function SonaFloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ConversationRow[]>([]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [micMode, setMicMode] = useState<'idle' | 'hold' | 'toggle'>('idle');
  const [showDevices, setShowDevices] = useState(false);

  // Device selection
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  // Continuous mode
  const [continuousMode, setContinuousMode] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const continuousModeRef = useRef(false);
  const [queueSize, setQueueSize] = useState(0);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const holdStartRef = useRef<number>(0);
  const recordingStartedAtRef = useRef<number>(0);
  const pendingStopRef = useRef(false);
  const holdDeterminedRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const sawSpeechRef = useRef(false);
  const segmentQueueRef = useRef<Blob[]>([]);
  const queueProcessingRef = useRef(false);

  const [micSupported, setMicSupported] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) setMicSupported(false);
  }, []);
  useEffect(() => { continuousModeRef.current = continuousMode; }, [continuousMode]);

  useEffect(() => { const t = streamRef.current?.getAudioTracks()[0]; if (t) t.enabled = !micMuted; }, [micMuted]);


  // ─── Device enumeration + change detection ────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const audio = all
        .filter((d): d is MediaDeviceInfo & { kind: 'audioinput' | 'audiooutput' } =>
          d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `${d.kind === 'audioinput' ? 'Mic' : 'Speaker'} ${d.deviceId.slice(0, 6)}`, kind: d.kind }));
      setDevices(audio);
    } catch {}
  }, []);

  useEffect(() => {
    refreshDevices();
    const handler = () => {
      refreshDevices();
      const _a = audioRef.current;
      if (_a && selectedSpeakerId && typeof (_a as any).setSinkId === 'function') (_a as any).setSinkId(selectedSpeakerId).catch(() => {});
      // If the current mic track ended (BT disconnect etc.), restart recording
      const track = streamRef.current?.getAudioTracks()[0];
      if (track && track.readyState === 'ended' && continuousModeRef.current) {
        console.warn('[device] mic track ended after device change, restarting');
        void restartRecording();
      }
    };
    navigator.mediaDevices?.addEventListener('devicechange', handler);
    return () => { navigator.mediaDevices?.removeEventListener('devicechange', handler); };
  }, [refreshDevices]);

  // Set audio output when speaker changes
  useEffect(() => {
    const a = audioRef.current;
    if (a && selectedSpeakerId && typeof (a as any).setSinkId === 'function') {
      (a as any).setSinkId(selectedSpeakerId).catch(() => {});
    }
  }, [selectedSpeakerId]);

  // ─── Conversations SSE ────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) return;
      const data: ConversationRow[] = await res.json();
      setMessages([...data].sort((a, b) => a.timestamp - b.timestamp).slice(-50));
    } catch {}
  }, []);
  useEffect(() => { if (open) fetchHistory(); }, [open, fetchHistory]);
  useEffect(() => {
    if (!open) return;
    let es: EventSource | null = null;
    const connect = () => {
      es = new EventSource('/api/conversations/stream');
      es.onmessage = (e) => {
        try {
          const all: ConversationRow[] = JSON.parse(e.data);
          setMessages([...all].sort((a, b) => a.timestamp - b.timestamp).slice(-50));
        } catch {}
      };
      es.onerror = () => { es?.close(); };
    };
    connect();
    return () => { es?.close(); };
  }, [open]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // ─── Audio helpers ────────────────────────────────────────────────
  const cleanupStream = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    if (vadRafRef.current != null) { cancelAnimationFrame(vadRafRef.current); vadRafRef.current = null; }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch {}
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    silenceStartRef.current = null;
    sawSpeechRef.current = false;
  }, []);

  const primeAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a || (a as any).__primed) return;
    try { a.src = SILENT_WAV; a.play()?.catch(() => {}); (a as any).__primed = true; } catch {}
  }, []);

  // ─── VAD (reuse single AudioContext per session) ──────────────────
  const setupVadContext = useCallback((stream: MediaStream): boolean => {
    if (analyserRef.current && audioContextRef.current && audioContextRef.current.state !== 'closed') return true;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;
      return true;
    } catch { return false; }
  }, []);

  const startVadLoop = useCallback((stream: MediaStream, segStart: number) => {
    if (!setupVadContext(stream)) return;
    const analyser = analyserRef.current!;
    if (vadRafRef.current != null) cancelAnimationFrame(vadRafRef.current);
    const data = new Uint8Array(analyser.fftSize);
    silenceStartRef.current = null;
    sawSpeechRef.current = false;
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      const now = Date.now();
      if (rms > VAD_SPEAKING_THRESHOLD) { sawSpeechRef.current = true; silenceStartRef.current = null; }
      else if (sawSpeechRef.current) {
        if (silenceStartRef.current == null) silenceStartRef.current = now;
        if (now - silenceStartRef.current >= VAD_SILENCE_MS && now - segStart >= VAD_MIN_SEGMENT_MS) {
          if (mediaRecorderRef.current?.state === 'recording') try { mediaRecorderRef.current.stop(); } catch {}
          return;
        }
      }
      vadRafRef.current = requestAnimationFrame(tick);
    };
    vadRafRef.current = requestAnimationFrame(tick);
  }, [setupVadContext]);

  // ─── Segment queue (continuous mode) ──────────────────────────────
  const drainQueue = useCallback(async () => {
    if (queueProcessingRef.current) return;
    queueProcessingRef.current = true;
    try {
      while (segmentQueueRef.current.length > 0) {
        const blob = segmentQueueRef.current.shift()!;
        setQueueSize(segmentQueueRef.current.length);
        if (blob.size < 1000) continue;
        setStatus('sending');
        try {
          const b64 = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => { const s = String(r.result); const c = s.indexOf(','); resolve(c >= 0 ? s.slice(c + 1) : s); };
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
          const res = await fetch('/api/voice/turn', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_base64: b64, mime: 'audio/webm', sessionId: 'dashboard-floating' }),
          });
          let data: any = null;
          try { const txt = await res.text(); if (txt?.trim()) data = JSON.parse(txt); else continue; } catch { continue; }
          if (!data?.ok) continue;
          // S3-11: Detect media generation intent from transcript (fire-and-forget)
          if (data.transcript) void detectAndHandleIntent(data.transcript);
          if (data.audio_base64 && audioRef.current) {
            setStatus('playing');
            await new Promise<void>(resolve => {
              const bin = atob(data.audio_base64);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              const url = URL.createObjectURL(new Blob([arr], { type: data.audio_mime || 'audio/wav' }));
              const a = audioRef.current!;
              a.src = url; a.load(); a.volume = 1; a.muted = false;
              a.onended = () => { URL.revokeObjectURL(url); resolve(); };
              a.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
            });
          }
        } catch (e) { console.error('[queue] error', e); }
      }
    } finally {
      queueProcessingRef.current = false;
      setQueueSize(0);
      if (continuousModeRef.current) {
        const alive = streamRef.current?.getAudioTracks().some(t => t.readyState === 'live' && t.enabled);
        const recording = mediaRecorderRef.current?.state === 'recording';
        if (!recording || !alive) {
          cleanupStream();
          setTimeout(() => { if (continuousModeRef.current) void startRecording(); }, 150);
        } else setStatus('recording');
      } else setStatus('idle');
    }
  }, [cleanupStream]);

  // ─── Recording ────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    primeAudio();
    setError('');
    try {
      const constraint: MediaStreamConstraints['audio'] = selectedMicId ? { deviceId: selectedMicId } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraint });
      streamRef.current = stream;
      const _trk = stream.getAudioTracks()[0]; console.log("[sona-mic] track:", _trk?.label, "state:"+_trk?.readyState, "enabled:"+_trk?.enabled, "muted:"+_trk?.muted, "deviceId:"+_trk?.getSettings()?.deviceId);
      // Detect track ending (BT disconnect, permission revoke)
      stream.getAudioTracks().forEach(t => {
        t.onended = () => {
          console.warn('[mic] track ended, restarting...');
          if (continuousModeRef.current) void restartRecording();
        };
      });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      if (continuousModeRef.current) startVadLoop(stream, Date.now());
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        console.log("[sona-mic] onstop blob:", blob.size, "bytes, chunks:", chunksRef.current.length);
        // Continuous mode: queue + chain next recorder
        if (continuousModeRef.current && streamRef.current) {
          if (blob.size >= 1000) {
            segmentQueueRef.current.push(blob);
            setQueueSize(segmentQueueRef.current.length);
            void drainQueue();
          }
          try {
            const next = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = next;
            next.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            next.onstop = mr.onstop;
            next.start();
            if (vadRafRef.current != null) cancelAnimationFrame(vadRafRef.current);
            silenceStartRef.current = null;
            sawSpeechRef.current = false;
            startVadLoop(streamRef.current, Date.now());
            if (!queueProcessingRef.current) setStatus('recording');
          } catch (e) { console.error('[continuous] chain error', e); }
          return;
        }
        // One-shot mode
        cleanupStream();
        if (blob.size < 1000) { setStatus('idle'); setMicMode('idle'); return; }
        setStatus('sending');
        try {
          const b64 = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => { const s = String(r.result); const c = s.indexOf(','); resolve(c >= 0 ? s.slice(c + 1) : s); };
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
          const res = await fetch('/api/voice/turn', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_base64: b64, mime: 'audio/webm', sessionId: 'dashboard-floating' }),
          });
          let data: any = null;
          try { const txt = await res.text(); if (txt?.trim()) data = JSON.parse(txt); } catch {}
          if (!data?.ok) { setStatus('error'); setMicMode('idle'); setError(data?.error || 'Error'); setTimeout(() => { setStatus('idle'); setError(''); }, 3000); return; }
          if (data.skipped) { setStatus('idle'); setMicMode('idle'); return; }
          // S3-11: Detect media generation intent from transcript (fire-and-forget)
          if (data.transcript) void detectAndHandleIntent(data.transcript);
          setStatus('playing');
          if (data.audio_base64 && audioRef.current) {
            const bin = atob(data.audio_base64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const url = URL.createObjectURL(new Blob([arr], { type: data.audio_mime || 'audio/wav' }));
            const a = audioRef.current;
            a.src = url; a.load(); a.volume = 1; a.muted = false;
            a.onended = () => { setStatus('idle'); setMicMode('idle'); URL.revokeObjectURL(url); };
            a.play().catch(() => { setStatus('idle'); setMicMode('idle'); });
          } else { setStatus('idle'); setMicMode('idle'); }
        } catch (e) { setStatus('error'); setMicMode('idle'); setError(e instanceof Error ? e.message : String(e)); setTimeout(() => { setStatus('idle'); setError(''); }, 3000); }
      };
      mr.start();
      recordingStartedAtRef.current = Date.now();
      setStatus('recording');
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        setTimeout(() => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); }, 800);
      }
    } catch (e) {
      console.log("[sona-mic] recording started, mimeType:", mr.mimeType);
      setStatus('error'); setMicMode('idle');
      setError(e instanceof Error ? e.message : 'Microphone access denied');
      setTimeout(() => { setStatus('idle'); setError(''); }, 3000);
    }
  }, [cleanupStream, primeAudio, selectedMicId, startVadLoop, drainQueue]);

  const restartRecording = useCallback(async () => {
    cleanupStream();
    setStatus('idle');
    await new Promise(r => setTimeout(r, 200));
    if (continuousModeRef.current) void startRecording();
  }, [cleanupStream, startRecording]);


  // When mic device changes mid-session, restart the stream with the new device
  const prevMicRef = useRef(selectedMicId);
  useEffect(() => {
    if (prevMicRef.current === selectedMicId) return;
    prevMicRef.current = selectedMicId;
    const isActive = mediaRecorderRef.current?.state === 'recording' || continuousModeRef.current;
    if (isActive) {
      console.log('[mic] device changed to', selectedMicId || 'default', '— restarting stream');
      // Stop current recorder + stream, then restart with new device
      if (mediaRecorderRef.current?.state === 'recording') try { mediaRecorderRef.current.stop(); } catch {}
      cleanupStream();
      setStatus('idle');
      // Small delay then restart
      setTimeout(() => { void startRecording(); }, 200);
    }
  }, [selectedMicId, cleanupStream, startRecording]);

  const stopRecording = useCallback(() => {    if (mediaRecorderRef.current?.state === 'recording' ) {      const elapsed = Date.now() - recordingStartedAtRef.current;      if (elapsed < 800) {        setTimeout(() => { if (mediaRecorderRef.current?.state === 'recording' ) mediaRecorderRef.current.stop(); }, 800 - elapsed);      } else {        mediaRecorderRef.current.stop();      }    } else {      pendingStopRef.current = true;    }  }, []);

  // ─── Continuous mode toggle ───────────────────────────────────────
  const toggleContinuous = useCallback(() => {
    if (continuousMode) {
      setContinuousMode(false);
      if (mediaRecorderRef.current?.state === 'recording') try { mediaRecorderRef.current.stop(); } catch {}
      cleanupStream();
      setStatus('idle');
      setMicMode('idle');
    } else {
      setContinuousMode(true);
      primeAudio();
    }
  }, [continuousMode, cleanupStream, primeAudio]);

  useEffect(() => {
    if (continuousMode && status === 'idle') void startRecording();
  }, [continuousMode]);

  // ─── Pointer handlers (tap/hold dual) ─────────────────────────────
  const onMicPointerDown = useCallback(async (e: React.PointerEvent) => {
    e.preventDefault();
    if (status !== 'idle' && status !== 'error') {
      if (micMode === 'toggle' && status === 'recording') stopRecording();
      return;
    }
    holdStartRef.current = Date.now();
    holdDeterminedRef.current = false;
    await startRecording();
  }, [status, micMode, startRecording, stopRecording]);

  const onMicPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (holdDeterminedRef.current) return;
    holdDeterminedRef.current = true;
    if (Date.now() - holdStartRef.current >= HOLD_THRESHOLD_MS) { setMicMode('hold'); stopRecording(); }
    else setMicMode('toggle');
  }, [stopRecording]);

  const onMicPointerCancel = useCallback(() => {
    if (!holdDeterminedRef.current && status === 'recording') { holdDeterminedRef.current = true; setMicMode('hold'); stopRecording(); }
  }, [status, stopRecording]);

  const onMicClick = useCallback(() => {
    if (status === 'recording' && micMode === 'toggle') stopRecording();
  }, [status, micMode, stopRecording]);

  // ─── Text + image submit ──────────────────────────────────────────
  const playAudioWithSink = useCallback(async (url: string): Promise<void> => {
    const a = audioRef.current;
    if (!a) { URL.revokeObjectURL(url); return; }
    if (selectedSpeakerId && typeof (a as any).setSinkId === 'function') {
      try { await (a as any).setSinkId(selectedSpeakerId); } catch (e) { console.warn('setSinkId:', e); }
    }
    a.src = url; a.load(); a.volume = 1; a.muted = false;
    return new Promise<void>(resolve => {
      a.onended = () => { URL.revokeObjectURL(url); resolve(); };
      a.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
    });
  }, [selectedSpeakerId]);

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const incoming: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
      incoming.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, dataUrl, name: f.name, size: f.size });
    }
    setAttachments(prev => [...prev, ...incoming].slice(0, MAX_ATTACHMENTS));
  }, []);

  const submitText = useCallback(async () => {
    const msg = text.trim();
    if (!msg && attachments.length === 0) return;
    setStatus('sending'); setError('');
    try {
      const body: Record<string, unknown> = { message: msg, sessionId: 'dashboard-floating', channel: 'dashboard' };
      if (attachments.length > 0) body.images = attachments.map(a => a.dataUrl);
      const res = await fetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) { setStatus('error'); setError(data.error); setTimeout(() => { setStatus('idle'); setError(''); }, 3000); return; }
      setText(''); setAttachments([]); setStatus('idle');
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); setTimeout(() => { setStatus('idle'); setError(''); }, 3000); }
  }, [text, attachments]);

  const onKey = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); } }, [submitText]);

  const busy = status === 'sending' || status === 'playing';
  const recording = status === 'recording';
  const micInputs = devices.filter(d => d.kind === 'audioinput');
  const spkOutputs = devices.filter(d => d.kind === 'audiooutput');
  const fmtTime = (ts: number) => { try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  // ═══════════════════════ RENDER ═══════════════════════════════════
  return (
    <>
      <audio ref={audioRef} playsInline preload="auto" style={{ display: 'none' }} />
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />

      {/* ── FAB ── */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open Sona chat" style={{
          position: 'fixed', right: '20px', bottom: '20px', width: '60px', height: '60px', borderRadius: '30px',
          background: 'linear-gradient(135deg, #7c3aed, #c4b5fd)', border: 'none',
          boxShadow: '0 8px 24px rgba(124,58,237,0.45)', color: 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}><MessageCircle size={26} /></button>
      )}

      {/* ── Panel ── */}
      {open && (
        <div className="sona-chat-panel" style={{
          position: 'fixed', zIndex: 9999, background: 'rgba(15,15,26,0.98)',
          border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(124,58,237,0.08)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '16px', background: 'linear-gradient(135deg, #7c3aed, #c4b5fd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>S</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>Sona</div>
                <div style={{ fontSize: '10px', color: continuousMode ? '#4ade80' : '#64748b' }}>
                  {continuousMode ? '🔴 Live stream' : recording ? '● Recording' : status === 'sending' ? 'Sending…' : status === 'playing' ? '♫ Speaking…' : 'Online'}
                  {queueSize > 0 && ` · ${queueSize} in queue`}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setShowDevices(v => !v)} title="Audio devices" style={{ width: '28px', height: '28px', borderRadius: '14px', background: showDevices ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: showDevices ? '#a78bfa' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Settings2 size={13} />
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ width: '28px', height: '28px', borderRadius: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Device selector panel */}
          {showDevices && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,15,26,0.6)', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
              <div>
                <label style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Microphone</label>
                <select value={selectedMicId} onChange={(e) => setSelectedMicId(e.target.value)} style={{ width: '100%', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(15,15,26,0.8)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '11px', fontFamily: 'monospace' }}>
                  <option value="">System default</option>
                  {micInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Speaker</label>
                <select value={selectedSpeakerId} onChange={(e) => setSelectedSpeakerId(e.target.value)} style={{ width: '100%', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(15,15,26,0.8)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '11px', fontFamily: 'monospace' }}>
                  <option value="">System default</option>
                  {spkOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
            {messages.length === 0 && <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px', padding: '30px 0' }}>No messages yet.</div>}
            {messages.map(m => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%', padding: '9px 13px',
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isUser ? 'rgba(124,58,237,0.18)' : 'rgba(148,163,184,0.08)',
                    border: `1px solid ${isUser ? 'rgba(124,58,237,0.3)' : 'rgba(148,163,184,0.1)'}`,
                    fontSize: '13px', color: '#e2e8f0', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    <div>{renderMessageContent(m.content)}</div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '6px' }}>
                      <span>{fmtTime(m.timestamp)}</span><span style={{ opacity: 0.6 }}>·</span><span style={{ textTransform: 'uppercase', letterSpacing: '0.3px' }}>{m.channel}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error */}
          {error && <div style={{ padding: '6px 14px', fontSize: '11px', color: '#fca5a5', background: 'rgba(239,68,68,0.08)', borderTop: '1px solid rgba(239,68,68,0.2)' }}>⚠ {error}</div>}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', padding: '8px 14px 0', flexWrap: 'wrap' }}>
              {attachments.map(a => (
                <div key={a.id} style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <img src={a.dataUrl} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => setAttachments(p => p.filter(x => x.id !== a.id))} style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><X size={10} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={busy || recording} title="Attach image" style={{ width: '36px', height: '36px', borderRadius: '18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Paperclip size={15} /></button>

            <input type="text" value={text} disabled={busy || recording} onChange={e => setText(e.target.value)} onKeyDown={onKey}
              placeholder={continuousMode ? '🔴 Live — speak freely' : recording ? '● Recording' : status === 'sending' ? 'Sending…' : status === 'playing' ? '♫ Speaking…' : 'Type, attach, or talk…'}
              style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'rgba(15,15,26,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px', color: '#e2e8f0', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />

            {/* Mute mic */}
            {(continuousMode || recording) && (
              <button onClick={() => setMicMuted(m => !m)} title={micMuted ? 'Unmute' : 'Mute'} style={{
                width: '36px', height: '36px', borderRadius: '18px',
                background: micMuted ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (micMuted ? '#ef4444' : 'rgba(255,255,255,0.08)'),
                color: micMuted ? '#f87171' : '#94a3b8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}><MicOff size={15} /></button>
            )}

            {/* Continuous toggle */}
            {micSupported && (
              <button onClick={toggleContinuous} disabled={status === 'sending'} title={continuousMode ? 'Stop live stream' : 'Start live stream'} style={{
                width: '36px', height: '36px', borderRadius: '18px',
                background: continuousMode ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${continuousMode ? '#22c55e' : 'rgba(255,255,255,0.08)'}`,
                color: continuousMode ? '#4ade80' : '#94a3b8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: continuousMode ? '0 0 0 3px rgba(34,197,94,0.15)' : 'none',
              }}>{continuousMode ? <RadioTower size={15} /> : <Radio size={15} />}</button>
            )}

            {/* Mic (hidden in continuous mode) */}
            {micSupported && !continuousMode && (
              <button onPointerDown={onMicPointerDown} onPointerUp={onMicPointerUp} onPointerCancel={onMicPointerCancel} onClick={onMicClick}
                disabled={busy && !recording} title={recording ? 'Stop' : 'Talk'} aria-label="Talk to Sona" style={{
                width: '44px', height: '44px', borderRadius: '22px',
                background: recording ? 'linear-gradient(135deg, #ef4444, #f87171)' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                border: 'none', color: 'white', cursor: busy && !recording ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: recording ? '0 0 0 4px rgba(239,68,68,0.3), 0 0 16px rgba(239,68,68,0.5)' : '0 4px 12px rgba(124,58,237,0.4)',
                touchAction: 'none',
              }}>{recording ? <MicOff size={17} /> : <Mic size={17} />}</button>
            )}

            {/* Send */}
            {(text.trim() || attachments.length > 0) && !recording && !continuousMode && (
              <button onClick={submitText} disabled={busy} title="Send" style={{
                width: '44px', height: '44px', borderRadius: '22px',
                background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', border: 'none', color: 'white',
                cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 4px 12px rgba(124,58,237,0.4)',
              }}>{status === 'sending' ? <Loader2 size={17} className="sona-spin" /> : <Send size={17} />}</button>
            )}
          </div>

          {/* Hint */}
          {(recording || continuousMode) && (
            <div style={{ textAlign: 'center', fontSize: '10px', color: continuousMode ? '#4ade80' : '#64748b', padding: '0 14px 8px' }}>
              {continuousMode
                ? <>🔴 Live — speak, pause, repeat{queueSize > 0 && <span style={{ color: '#fbbf24' }}> · {queueSize} queued</span>}{status === 'playing' && <span style={{ color: '#67e8f9' }}> · speaking</span>}{status === 'sending' && <span style={{ color: '#a78bfa' }}> · processing</span>}</>
                : micMode === 'hold' ? 'Release to send' : micMode === 'toggle' ? 'Tap mic to stop' : 'Hold or tap'}
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        .sona-chat-panel { right: 20px; bottom: 20px; width: 400px; height: 600px; max-height: calc(100vh - 40px); border-radius: 20px; }
        @media (max-width: 640px) { .sona-chat-panel { right: 0; bottom: 0; left: 0; top: 0; width: 100%; height: 100%; max-height: 100vh; border-radius: 0; } }
        .sona-spin { animation: sona-spin 1s linear infinite; }
        @keyframes sona-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
