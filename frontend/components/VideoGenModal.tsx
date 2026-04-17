'use client';

import { useState, useCallback, useRef } from 'react';
import { Video, Download, Loader2, AlertCircle, Wand2 } from 'lucide-react';

interface VideoModel {
  id: string;
  label: string;
  provider: string;
}

const MODELS: VideoModel[] = [
  { id: 'wan2.1',           label: 'Wan2.1',              provider: 'Wan-AI' },
  { id: 'animatediff',      label: 'AnimateDiff',         provider: 'ByteDance' },
  { id: 'stable-video',     label: 'Stable Video Diffusion', provider: 'Stability AI' },
  { id: 'cogvideox',        label: 'CogVideoX',           provider: 'THUDM' },
  { id: 'mochi-1',          label: 'Mochi 1',             provider: 'Genmo' },
];

const DURATIONS = ['2s', '4s', '8s'] as const;
type Duration = typeof DURATIONS[number];

const DURATION_SECONDS: Record<Duration, number> = {
  '2s': 2,
  '4s': 4,
  '8s': 8,
};

type GenState = 'idle' | 'loading' | 'done' | 'error';

function DurationButton({
  duration,
  selected,
  onClick,
}: {
  duration: Duration;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      title={`Durée : ${duration}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 18px',
        borderRadius: '10px',
        border: selected ? '1px solid #67e8f9' : '1px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(103,232,249,0.12)' : 'rgba(255,255,255,0.02)',
        color: selected ? '#67e8f9' : '#64748b',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '13px',
        fontWeight: selected ? 600 : 400,
        transition: 'all 150ms ease',
        minWidth: '52px',
      }}
    >
      {duration}
    </button>
  );
}

export default function VideoGenModal() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('wan2.1');
  const [duration, setDuration] = useState<Duration>('4s');
  const [genState, setGenState] = useState<GenState>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const esRef = useRef<EventSource | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    // Close any previous SSE connection
    esRef.current?.close();
    esRef.current = null;

    setGenState('loading');
    setVideoUrl(null);
    setErrorMsg(null);
    setProgress(0);
    setProgressMsg('Démarrage…');

    try {
      // 1. Submit to backend — get jobId
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          duration: DURATION_SECONDS[duration],
        }),
      });
      const data = await res.json() as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Soumission échouée');

      const { jobId } = data;
      if (!jobId) throw new Error('Pas de jobId retourné');

      // 2. Subscribe to SSE progress stream
      const es = new EventSource(`/api/generate/video/${jobId}/progress`);
      esRef.current = es;

      es.onmessage = (event) => {
        let job: {
          status: string;
          progress: number;
          message: string;
          url?: string;
          error?: string;
        };
        try {
          job = JSON.parse(event.data);
        } catch {
          return;
        }

        setProgress(job.progress ?? 0);
        setProgressMsg(job.message ?? '');

        if (job.status === 'succeeded') {
          setVideoUrl(job.url ?? null);
          setGenState('done');
          es.close();
          esRef.current = null;
        } else if (job.status === 'failed') {
          setErrorMsg(job.error ?? 'Génération échouée');
          setGenState('error');
          es.close();
          esRef.current = null;
        }
      };

      es.onerror = () => {
        setErrorMsg('Connexion SSE perdue. Réessayez.');
        setGenState('error');
        es.close();
        esRef.current = null;
      };
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue');
      setGenState('error');
    }
  }, [prompt, model, duration]);

  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `sona-video-${Date.now()}.mp4`;
    a.click();
  }, [videoUrl]);

  const isLoading = genState === 'loading';
  const canGenerate = prompt.trim().length > 0 && !isLoading;

  return (
    <div
      data-testid="video-gen-modal"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '720px',
        width: '100%',
      }}
    >
      {/* Prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label
          htmlFor="video-gen-prompt-input"
          style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Prompt
        </label>
        <textarea
          id="video-gen-prompt-input"
          data-testid="video-gen-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
          placeholder="Décris la vidéo à générer… (Ctrl+Entrée pour générer)"
          rows={3}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0',
            fontFamily: 'inherit',
            fontSize: '14px',
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
            transition: 'border-color 150ms ease',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(103,232,249,0.5)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        />
      </div>

      {/* Model + Duration row */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Model selector */}
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            htmlFor="video-gen-model-select"
            style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Modèle
          </label>
          <select
            id="video-gen-model-select"
            data-testid="video-gen-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(15,15,26,0.8)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              fontFamily: 'inherit',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.provider}
              </option>
            ))}
          </select>
        </div>

        {/* Duration buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Durée
          </span>
          <div
            data-testid="video-gen-duration"
            style={{ display: 'flex', gap: '8px' }}
          >
            {DURATIONS.map((d) => (
              <DurationButton key={d} duration={d} selected={duration === d} onClick={() => setDuration(d)} />
            ))}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        data-testid="video-gen-submit"
        onClick={handleGenerate}
        disabled={!canGenerate}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '14px 28px',
          borderRadius: '12px',
          background: canGenerate
            ? 'linear-gradient(135deg, #0e7490, #67e8f9)'
            : 'rgba(255,255,255,0.04)',
          border: canGenerate ? 'none' : '1px solid rgba(255,255,255,0.06)',
          color: canGenerate ? '#0a0f1a' : '#475569',
          fontSize: '14px',
          fontWeight: 600,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          boxShadow: canGenerate ? '0 4px 20px rgba(103,232,249,0.3)' : 'none',
          transition: 'all 200ms ease',
          alignSelf: 'flex-start',
          minWidth: '160px',
        }}
        onMouseEnter={(e) => {
          if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(103,232,249,0.5)';
        }}
        onMouseLeave={(e) => {
          if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(103,232,249,0.3)';
        }}
      >
        {isLoading ? (
          <>
            <Loader2 size={16} style={{ animation: 'sona-spin 1s linear infinite' }} />
            <span data-testid="video-gen-loading">Génération…</span>
          </>
        ) : (
          <>
            <Wand2 size={16} />
            Générer
          </>
        )}
      </button>

      {/* Progress bar — shown while loading */}
      {isLoading && (
        <div
          data-testid="video-gen-progress"
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div
            style={{
              height: '4px',
              borderRadius: '2px',
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}
          >
            <div
              data-testid="video-gen-progress-bar"
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #0e7490, #67e8f9)',
                borderRadius: '2px',
                transition: 'width 800ms ease',
              }}
            />
          </div>
          {progressMsg && (
            <span
              data-testid="video-gen-progress-msg"
              style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}
            >
              {progressMsg}
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {genState === 'error' && errorMsg && (
        <div
          data-testid="video-gen-error"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
            fontSize: '13px',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          {errorMsg}
        </div>
      )}

      {/* Result preview */}
      {genState === 'done' && videoUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Résultat
            </span>
            <button
              data-testid="video-gen-download"
              onClick={handleDownload}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(103,232,249,0.1)',
                border: '1px solid rgba(103,232,249,0.25)',
                color: '#67e8f9',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(103,232,249,0.18)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(103,232,249,0.1)';
              }}
            >
              <Download size={13} />
              Télécharger
            </button>
          </div>

          {/* Video preview */}
          <div
            data-testid="video-gen-preview"
            style={{
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid rgba(103,232,249,0.2)',
              background: '#0a0a0f',
              boxShadow: '0 8px 32px rgba(103,232,249,0.12)',
              maxWidth: '100%',
            }}
          >
            <video
              src={videoUrl}
              controls
              autoPlay
              loop
              muted
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                maxHeight: '480px',
              }}
            />
          </div>

          {/* Metadata */}
          <div
            data-testid="video-gen-meta"
            style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}
          >
            {[
              { label: 'Modèle', value: MODELS.find((m) => m.id === model)?.label ?? model },
              { label: 'Durée', value: duration },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '11px',
                  color: '#64748b',
                }}
              >
                <span style={{ color: '#475569' }}>{label}: </span>
                <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Idle placeholder */}
      {genState === 'idle' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '48px 24px',
            borderRadius: '16px',
            border: '1px dashed rgba(255,255,255,0.08)',
            color: '#334155',
          }}
        >
          <Video size={36} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: '13px' }}>La vidéo apparaîtra ici</span>
        </div>
      )}

      <style jsx global>{`
        @keyframes sona-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
