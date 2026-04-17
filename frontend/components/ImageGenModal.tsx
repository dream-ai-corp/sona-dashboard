'use client';

import { useState, useCallback } from 'react';
import { ImageIcon, Download, Loader2, AlertCircle, Wand2 } from 'lucide-react';

interface Model {
  id: string;
  label: string;
  provider: string;
}

const MODELS: Model[] = [
  { id: 'flux-schnell', label: 'FLUX.1 Schnell', provider: 'Black Forest Labs' },
  { id: 'flux-dev',     label: 'FLUX.1 Dev',     provider: 'Black Forest Labs' },
  { id: 'sdxl',         label: 'SDXL 1.0',        provider: 'Stability AI' },
  { id: 'sdxl-lightning', label: 'SDXL Lightning', provider: 'ByteDance' },
];

const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;

const RATIO_TO_SIZE: Record<string, { width: number; height: number }> = {
  '1:1':  { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768  },
  '9:16': { width: 768,  height: 1344 },
  '4:3':  { width: 1152, height: 896  },
  '3:4':  { width: 896,  height: 1152 },
};
type Ratio = typeof RATIOS[number];

type GenState = 'idle' | 'loading' | 'done' | 'error';

function RatioButton({
  ratio,
  selected,
  onClick,
}: {
  ratio: Ratio;
  selected: boolean;
  onClick: () => void;
}) {
  // Visual aspect-ratio thumbnail
  const [w, h] = ratio.split(':').map(Number);
  const thumbW = 28;
  const thumbH = Math.round((h / w) * thumbW);

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      title={ratio}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: selected ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.02)',
        color: selected ? '#c4b5fd' : '#64748b',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '11px',
        fontWeight: selected ? 600 : 400,
        transition: 'all 150ms ease',
        minWidth: '52px',
      }}
    >
      {/* Mini thumbnail showing aspect ratio */}
      <div
        style={{
          width: `${thumbW}px`,
          height: `${Math.min(thumbH, 28)}px`,
          border: `1.5px solid ${selected ? '#a78bfa' : 'rgba(255,255,255,0.2)'}`,
          borderRadius: '2px',
          background: selected ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
        }}
      />
      <span>{ratio}</span>
    </button>
  );
}

export default function ImageGenModal() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('flux-schnell');
  const [ratio, setRatio] = useState<Ratio>('1:1');
  const [genState, setGenState] = useState<GenState>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setGenState('loading');
    setImageUrl(null);
    setErrorMsg(null);

    try {
      const size = RATIO_TO_SIZE[ratio] ?? RATIO_TO_SIZE['1:1'];
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), model, width: size.width, height: size.height }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed');
      setImageUrl(data.url);
      setGenState('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setGenState('error');
    }
  }, [prompt, model, ratio]);

  const handleDownload = useCallback(() => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `sona-image-${Date.now()}.png`;
    a.click();
  }, [imageUrl]);

  const isLoading = genState === 'loading';
  const canGenerate = prompt.trim().length > 0 && !isLoading;

  return (
    <div
      data-testid="image-gen-modal"
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
          htmlFor="image-gen-prompt-input"
          style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Prompt
        </label>
        <textarea
          id="image-gen-prompt-input"
          data-testid="image-gen-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
          placeholder="Décris l'image à générer… (Ctrl+Entrée pour générer)"
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
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.5)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        />
      </div>

      {/* Model + Ratio row */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Model selector */}
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            htmlFor="image-gen-model-select"
            style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Modèle
          </label>
          <select
            id="image-gen-model-select"
            data-testid="image-gen-model"
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

        {/* Ratio buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ratio
          </span>
          <div
            data-testid="image-gen-ratio"
            style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
          >
            {RATIOS.map((r) => (
              <RatioButton key={r} ratio={r} selected={ratio === r} onClick={() => setRatio(r)} />
            ))}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        data-testid="image-gen-submit"
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
            ? 'linear-gradient(135deg, #6d28d9, #a78bfa)'
            : 'rgba(255,255,255,0.04)',
          border: canGenerate ? 'none' : '1px solid rgba(255,255,255,0.06)',
          color: canGenerate ? 'white' : '#475569',
          fontSize: '14px',
          fontWeight: 600,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          boxShadow: canGenerate ? '0 4px 20px rgba(109,40,217,0.4)' : 'none',
          transition: 'all 200ms ease',
          alignSelf: 'flex-start',
          minWidth: '160px',
        }}
        onMouseEnter={(e) => {
          if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(109,40,217,0.6)';
        }}
        onMouseLeave={(e) => {
          if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(109,40,217,0.4)';
        }}
      >
        {isLoading ? (
          <>
            <Loader2 size={16} style={{ animation: 'sona-spin 1s linear infinite' }} />
            <span data-testid="image-gen-loading">Génération…</span>
          </>
        ) : (
          <>
            <Wand2 size={16} />
            Générer
          </>
        )}
      </button>

      {/* Error */}
      {genState === 'error' && errorMsg && (
        <div
          data-testid="image-gen-error"
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
      {genState === 'done' && imageUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Résultat
            </span>
            <button
              data-testid="image-gen-download"
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

          {/* Image preview */}
          <div
            data-testid="image-gen-preview"
            style={{
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid rgba(167,139,250,0.2)',
              background: '#0a0a0f',
              boxShadow: '0 8px 32px rgba(124,58,237,0.15)',
              maxWidth: '100%',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={prompt}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                maxHeight: '600px',
                objectFit: 'contain',
              }}
            />
          </div>

          {/* Metadata */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[
              { label: 'Modèle', value: MODELS.find((m) => m.id === model)?.label ?? model },
              { label: 'Ratio', value: ratio },
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

      {/* Idle placeholder when no image yet */}
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
          <ImageIcon size={36} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: '13px' }}>L&apos;image apparaîtra ici</span>
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
