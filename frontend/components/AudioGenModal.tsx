'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Music, Download, Loader2, AlertCircle, Wand2 } from 'lucide-react';

interface AudioModel {
  id: string;
  label: string;
  provider: string;
  note?: string;
  types?: string[];
}

type AudioType = 'music' | 'sound_effect' | 'voice';
type Duration = '5s' | '10s' | '15s' | '30s';
type GenState = 'idle' | 'loading' | 'done' | 'error';

const FALLBACK_MODELS: AudioModel[] = [
  { id: 'musicgen-small', label: 'MusicGen Small (3.3s/s)',       provider: 'Replicate', types: ['music'] },
  { id: 'musicgen-large', label: 'MusicGen Large (haute qualité)', provider: 'Replicate', types: ['music'] },
  { id: 'audiogen',       label: 'AudioGen (effets sonores)',      provider: 'Replicate', types: ['sound_effect'] },
  { id: 'bark',           label: 'Bark (voix/effets)',             provider: 'Replicate', types: ['voice', 'sound_effect'] },
];

const AUDIO_TYPES: { id: AudioType; label: string }[] = [
  { id: 'music',        label: 'Musique' },
  { id: 'sound_effect', label: 'Effet sonore' },
  { id: 'voice',        label: 'Voix' },
];

const DURATIONS: Duration[] = ['5s', '10s', '15s', '30s'];
const DURATION_SECONDS: Record<Duration, number> = {
  '5s': 5,
  '10s': 10,
  '15s': 15,
  '30s': 30,
};

function TypeButton({
  type,
  selected,
  onClick,
}: {
  type: { id: AudioType; label: string };
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      title={type.label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 18px',
        borderRadius: '10px',
        border: selected ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.02)',
        color: selected ? '#4ade80' : '#64748b',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '13px',
        fontWeight: selected ? 600 : 400,
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {type.label}
    </button>
  );
}

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
        border: selected ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.02)',
        color: selected ? '#4ade80' : '#64748b',
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

export default function AudioGenModal() {
  const [prompt, setPrompt] = useState('');
  const [models, setModels] = useState<AudioModel[]>(FALLBACK_MODELS);
  const [model, setModel] = useState('musicgen-small');
  const [audioType, setAudioType] = useState<AudioType>('music');
  const [duration, setDuration] = useState<Duration>('10s');
  const [genState, setGenState] = useState<GenState>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const esRef = useRef<EventSource | null>(null);

  // Fetch available models from backend (ElevenLabs appear only when keys are configured)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/models/audio')
      .then((r) => r.ok ? r.json() : null)
      .then((data: { ok: boolean; models: AudioModel[] } | null) => {
        if (!cancelled && data?.ok && Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
          setModel((prev) => data.models.some((m) => m.id === prev) ? prev : data.models[0].id);
        }
      })
      .catch(() => { /* keep fallback */ });
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    esRef.current?.close();
    esRef.current = null;

    setGenState('loading');
    setAudioUrl(null);
    setErrorMsg(null);
    setProgress(0);
    setProgressMsg('Démarrage…');

    try {
      const res = await fetch('/api/generate/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          type: audioType,
          duration: DURATION_SECONDS[duration],
        }),
      });
      const data = await res.json() as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Soumission échouée');

      const { jobId } = data;
      if (!jobId) throw new Error('Pas de jobId retourné');

      const es = new EventSource(`/api/generate/audio/${jobId}/progress`);
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
          setAudioUrl(job.url ?? null);
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
  }, [prompt, model, audioType, duration]);

  const handleDownload = useCallback(() => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `sona-audio-${Date.now()}.mp3`;
    a.click();
  }, [audioUrl]);

  const isLoading = genState === 'loading';
  const canGenerate = prompt.trim().length > 0 && !isLoading;

  return (
    <div
      data-testid="audio-gen-modal"
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
          htmlFor="audio-gen-prompt-input"
          style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Prompt
        </label>
        <textarea
          id="audio-gen-prompt-input"
          data-testid="audio-gen-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
          placeholder="Décris l'audio à générer… ex: mélodie piano calme avec cordes (Ctrl+Entrée pour générer)"
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
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(74,222,128,0.5)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        />
      </div>

      {/* Type selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Type
        </span>
        <div
          data-testid="audio-gen-type"
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
        >
          {AUDIO_TYPES.map((t) => (
            <TypeButton key={t.id} type={t} selected={audioType === t.id} onClick={() => setAudioType(t.id)} />
          ))}
        </div>
      </div>

      {/* Model + Duration row */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Model selector */}
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            htmlFor="audio-gen-model-select"
            style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Modèle
          </label>
          <select
            id="audio-gen-model-select"
            data-testid="audio-gen-model"
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
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.provider}{m.note ? ` (${m.note})` : ''}
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
            data-testid="audio-gen-duration"
            style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
          >
            {DURATIONS.map((d) => (
              <DurationButton key={d} duration={d} selected={duration === d} onClick={() => setDuration(d)} />
            ))}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        data-testid="audio-gen-submit"
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
            ? 'linear-gradient(135deg, #166534, #4ade80)'
            : 'rgba(255,255,255,0.04)',
          border: canGenerate ? 'none' : '1px solid rgba(255,255,255,0.06)',
          color: canGenerate ? '#0a0f1a' : '#475569',
          fontSize: '14px',
          fontWeight: 600,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          boxShadow: canGenerate ? '0 4px 20px rgba(74,222,128,0.3)' : 'none',
          transition: 'all 200ms ease',
          alignSelf: 'flex-start',
          minWidth: '160px',
        }}
        onMouseEnter={(e) => {
          if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(74,222,128,0.5)';
        }}
        onMouseLeave={(e) => {
          if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(74,222,128,0.3)';
        }}
      >
        {isLoading ? (
          <>
            <Loader2 size={16} style={{ animation: 'sona-spin 1s linear infinite' }} />
            <span data-testid="audio-gen-loading">Génération…</span>
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
          data-testid="audio-gen-progress"
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
              data-testid="audio-gen-progress-bar"
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #166534, #4ade80)',
                borderRadius: '2px',
                transition: 'width 800ms ease',
              }}
            />
          </div>
          {progressMsg && (
            <span
              data-testid="audio-gen-progress-msg"
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
          data-testid="audio-gen-error"
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
      {genState === 'done' && audioUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Résultat
            </span>
            <button
              data-testid="audio-gen-download"
              onClick={handleDownload}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(74,222,128,0.1)',
                border: '1px solid rgba(74,222,128,0.25)',
                color: '#4ade80',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(74,222,128,0.18)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(74,222,128,0.1)';
              }}
            >
              <Download size={13} />
              Télécharger
            </button>
          </div>

          {/* Audio player */}
          <div
            data-testid="audio-gen-preview"
            style={{
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid rgba(74,222,128,0.2)',
              background: 'rgba(10,15,26,0.8)',
              boxShadow: '0 8px 32px rgba(74,222,128,0.12)',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Music size={18} color="#4ade80" />
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>Audio généré</span>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              src={audioUrl}
              controls
              autoPlay={false}
              style={{
                width: '100%',
                accentColor: '#4ade80',
              }}
            />
          </div>

          {/* Metadata */}
          <div
            data-testid="audio-gen-meta"
            style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}
          >
            {[
              { label: 'Modèle',  value: models.find((m) => m.id === model)?.label ?? model },
              { label: 'Type',    value: AUDIO_TYPES.find((t) => t.id === audioType)?.label ?? audioType },
              { label: 'Durée',   value: duration },
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
          <Music size={36} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: '13px' }}>L&apos;audio apparaîtra ici</span>
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
