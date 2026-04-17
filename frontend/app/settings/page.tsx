'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import PageShell from '@/components/PageShell';
import QRCode from 'react-qr-code';
import {
  Settings,
  Wifi,
  WifiOff,
  MessageCircle,
  Brain,
  Volume2,
  RefreshCw,
  QrCode,
  Image,
  Video,
  Music,
  ArrowRight,
  Info,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
} from 'lucide-react';

const SONA_API = process.env.NEXT_PUBLIC_SONA_API_URL ?? '';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3011';

type Tab = 'general' | 'connections' | 'media';

type WhatsAppStatus = 'CONNECTED' | 'QR_READY' | 'DISCONNECTED' | 'LOADING';

interface WhatsAppState {
  status: WhatsAppStatus;
  qr?: string;
}

interface BrainSlotInfo {
  exists?: boolean;
  expiresInMin?: number | null;
  valid?: boolean;
  configured?: boolean;
  baseUrl?: string | null;
  model?: string | null;
}
interface BrainState {
  mode: string;
  slots: Record<string, BrainSlotInfo>;
}
interface VoiceState {
  current: { en: string; fr: string };
  available: { en: Array<{ key: string; label: string }>; fr: Array<{ key: string; label: string }> };
}

interface MediaSettings {
  images: boolean;
  video: boolean;
  audio: boolean;
}

const MEDIA_STORAGE_KEY = 'sona_media_settings';

function loadMediaSettings(): MediaSettings {
  if (typeof window === 'undefined') return { images: false, video: false, audio: false };
  try {
    const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MediaSettings;
  } catch {}
  return { images: false, video: false, audio: false };
}

function saveMediaSettings(s: MediaSettings) {
  try {
    localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 20px',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'rgba(124,58,237,0.2)' : 'transparent',
        color: active ? '#a78bfa' : '#64748b',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: active ? 'inset 0 0 0 1px rgba(124,58,237,0.35)' : 'none',
        transition: 'all 150ms ease',
      }}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: WhatsAppStatus }) {
  const map: Record<WhatsAppStatus, { color: string; bg: string; border: string; label: string }> = {
    CONNECTED: { color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)', label: 'Connected' },
    QR_READY: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)', label: 'QR Ready' },
    DISCONNECTED: { color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: 'Disconnected' },
    LOADING: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)', label: 'Loading…' },
  };
  const s = map[status];
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: '20px',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {s.label}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  'data-testid': testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  'data-testid'?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        border: 'none',
        background: checked ? '#a78bfa' : 'rgba(255,255,255,0.12)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 200ms ease',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          left: checked ? '23px' : '3px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 200ms ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }}
      />
    </button>
  );
}

interface MediaCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  provider: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onGoToConnections: () => void;
  testId: string;
}

function MediaCard({
  icon,
  title,
  description,
  provider,
  enabled,
  onToggle,
  onGoToConnections,
  testId,
}: MediaCardProps) {
  return (
    <div
      className="glass"
      style={{
        borderRadius: '16px',
        padding: '24px',
        borderColor: enabled ? 'rgba(167,139,250,0.2)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {/* Icon */}
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: enabled ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${enabled ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.08)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 200ms ease',
          }}
        >
          {icon}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: '160px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9' }}>{title}</span>
            {enabled && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'rgba(167,139,250,0.15)',
                  color: '#a78bfa',
                  border: '1px solid rgba(167,139,250,0.25)',
                }}
              >
                Activé
              </span>
            )}
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{description}</p>
        </div>

        {/* Toggle */}
        <Toggle checked={enabled} onChange={onToggle} data-testid={testId} />
      </div>

      {/* Provider guide (shown when enabled) */}
      {enabled && (
        <div
          data-testid={`${testId}-guide`}
          style={{
            marginTop: '16px',
            padding: '14px 16px',
            background: 'rgba(167,139,250,0.06)',
            borderRadius: '10px',
            border: '1px solid rgba(167,139,250,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <Info size={14} color="#a78bfa" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: '#cbd5e1', flex: 1 }}>
            Pour utiliser la génération {title.toLowerCase()}, configurez un provider{' '}
            <strong style={{ color: '#e2e8f0' }}>{provider}</strong> dans l&apos;onglet Connexions.
          </span>
          <button
            onClick={onGoToConnections}
            data-testid={`${testId}-go-connections`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(167,139,250,0.35)',
              background: 'rgba(124,58,237,0.15)',
              color: '#a78bfa',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            Onglet Connexions
            <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function MediaTab({ onGoToConnections }: { onGoToConnections: () => void }) {
  const [settings, setSettings] = useState<MediaSettings>({ images: false, video: false, audio: false });

  useEffect(() => {
    setSettings(loadMediaSettings());
  }, []);

  const update = useCallback((key: keyof MediaSettings, value: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveMediaSettings(next);
      return next;
    });
  }, []);

  const mediaItems = [
    {
      key: 'images' as const,
      icon: <Image size={22} color={settings.images ? '#a78bfa' : '#64748b'} />,
      title: 'Images',
      description: "Génération d'images via IA (Replicate, DALL-E, Stability AI…)",
      provider: 'Replicate / DALL-E',
      testId: 'media-toggle-images',
    },
    {
      key: 'video' as const,
      icon: <Video size={22} color={settings.video ? '#a78bfa' : '#64748b'} />,
      title: 'Vidéo',
      description: 'Génération et édition de vidéos (Runway, Kling, HeyGen…)',
      provider: 'Runway / Kling',
      testId: 'media-toggle-video',
    },
    {
      key: 'audio' as const,
      icon: <Music size={22} color={settings.audio ? '#a78bfa' : '#64748b'} />,
      title: 'Audio',
      description: 'Génération audio, voix synthétisée et musique (ElevenLabs, Suno…)',
      provider: 'ElevenLabs / Suno',
      testId: 'media-toggle-audio',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
        Activez les modules de génération multimédia. Chaque module nécessite un provider configuré dans l&apos;onglet Connexions.
      </p>

      {mediaItems.map((item) => (
        <MediaCard
          key={item.key}
          icon={item.icon}
          title={item.title}
          description={item.description}
          provider={item.provider}
          enabled={settings[item.key]}
          onToggle={(v) => update(item.key, v)}
          onGoToConnections={onGoToConnections}
          testId={item.testId}
        />
      ))}
    </div>
  );
}

function GeneralTab() {
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [voice, setVoice] = useState<VoiceState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [brainR, voiceR] = await Promise.allSettled([
        fetch(`${SONA_API}/api/config/brain`).then((r) => r.json()),
        fetch(`${SONA_API}/api/config/voice`).then((r) => r.json()),
      ]);
      if (brainR.status === 'fulfilled' && brainR.value?.ok) setBrain(brainR.value);
      if (voiceR.status === 'fulfilled' && voiceR.value?.ok) setVoice(voiceR.value);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  const setBrainMode = async (mode: string) => {
    setBusy(true);
    try {
      await fetch(`${SONA_API}/api/config/brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const setVoiceConfig = async (lang: 'en' | 'fr', key: string) => {
    setBusy(true);
    try {
      const body = lang === 'en' ? { en: key } : { fr: key };
      await fetch(`${SONA_API}/api/config/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const brainModes = [
    { mode: 'claude_code_a', label: 'CC-A', hintBase: 'Claude Code account A' },
    { mode: 'claude_code_b', label: 'CC-B', hintBase: 'Claude Code account B' },
    { mode: 'openrouter', label: 'OpenRouter', hintBase: 'Free OpenRouter models' },
    { mode: 'lmstudio', label: 'LM Studio', hintBase: 'Local LM Studio via Tailscale' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Brain Mode */}
      <div
        className="glass"
        style={{ borderRadius: '16px', padding: '24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <Brain size={15} color="#a78bfa" />
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
            Brain Mode
          </h2>
          <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>
            Active:{' '}
            <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{brain?.mode ?? '…'}</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {brainModes.map(({ mode, label, hintBase }) => {
            const slot = brain?.slots?.[mode];
            let hint = hintBase;
            let disabled = busy;
            if (mode === 'claude_code_a' || mode === 'claude_code_b') {
              if (slot?.valid) hint = `${hintBase} · ${slot.expiresInMin}m left`;
              else if (slot?.exists) hint = `${hintBase} · expired`;
              else hint = `${hintBase} · empty slot`;
              disabled = disabled || !slot?.valid;
            } else if (mode === 'openrouter') {
              hint = slot?.configured ? `${slot.model}` : 'no API key';
              disabled = disabled || !slot?.configured;
            } else if (mode === 'lmstudio') {
              hint = slot?.configured ? `${slot.model}` : 'no base URL';
              disabled = disabled || !slot?.configured;
            }
            const active = brain?.mode === mode;
            return (
              <button
                key={mode}
                onClick={() => setBrainMode(mode)}
                disabled={disabled}
                title={hint}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: active ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)',
                  background: active ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.02)',
                  color: active ? '#c4b5fd' : disabled ? '#475569' : '#cbd5e1',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: disabled ? 0.4 : 1,
                  minWidth: '100px',
                  textAlign: 'center',
                }}
              >
                <div>{label}</div>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 400,
                    marginTop: '2px',
                    color: active ? '#a78bfa' : '#64748b',
                  }}
                >
                  {hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice Config */}
      <div className="glass" style={{ borderRadius: '16px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <Volume2 size={15} color="#f59e0b" />
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
            Voice Config
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: '240px' }}>
            <label
              style={{
                fontSize: '11px',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              English voice (Kokoro)
            </label>
            <select
              value={voice?.current?.en ?? ''}
              disabled={busy || !voice}
              onChange={(e) => setVoiceConfig('en', e.target.value)}
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(15,15,26,0.8)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {(voice?.available?.en ?? []).map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label || v.key}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 240px', minWidth: '240px' }}>
            <label
              style={{
                fontSize: '11px',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              French voice (Piper)
            </label>
            <select
              value={voice?.current?.fr ?? ''}
              disabled={busy || !voice}
              onChange={(e) => setVoiceConfig('fr', e.target.value)}
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(15,15,26,0.8)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {(voice?.available?.fr ?? []).map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label || v.key}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

type ProviderTestState = 'idle' | 'testing' | 'ok' | 'error';

interface ProviderRowProps {
  label: string;
  provider: string;
  placeholder: string;
  initialValue: string;
  onSaved: () => void;
}

function ProviderRow({ label, provider, placeholder, initialValue, onSaved }: ProviderRowProps) {
  const [value, setValue] = useState(initialValue);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<ProviderTestState>('idle');
  const [testMsg, setTestMsg] = useState('');

  // Sync when parent re-fetches
  useEffect(() => { setValue(initialValue); }, [initialValue]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: value }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestState('testing');
    setTestMsg('');
    try {
      const res = await fetch(`/api/settings/providers/${provider}/test`, {
        method: 'POST',
      });
      const data = await res.json() as { ok: boolean; error?: string };
      setTestState(data.ok ? 'ok' : 'error');
      setTestMsg(data.ok ? 'Connexion réussie' : (data.error ?? 'Échec'));
    } catch (e) {
      setTestState('error');
      setTestMsg(e instanceof Error ? e.message : 'Erreur réseau');
    }
    setTimeout(() => setTestState('idle'), 4000);
  };

  const hasKey = value.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>{label}</label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            data-testid={`provider-key-input-${provider}`}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '10px 40px 10px 12px',
              borderRadius: '8px',
              background: 'rgba(15,15,26,0.8)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              fontFamily: 'monospace',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.5)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          />
          <button
            onClick={() => setVisible((v) => !v)}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
            title={visible ? 'Masquer' : 'Afficher'}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <button
          data-testid={`provider-key-save-${provider}`}
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(124,58,237,0.15)',
            border: '1px solid rgba(124,58,237,0.3)',
            color: '#a78bfa',
            fontSize: '12px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>

        <button
          data-testid={`provider-key-test-${provider}`}
          onClick={handleTest}
          disabled={!hasKey || testState === 'testing'}
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background:
              testState === 'ok' ? 'rgba(34,197,94,0.1)' :
              testState === 'error' ? 'rgba(239,68,68,0.1)' :
              'rgba(255,255,255,0.03)',
            border:
              testState === 'ok' ? '1px solid rgba(34,197,94,0.3)' :
              testState === 'error' ? '1px solid rgba(239,68,68,0.3)' :
              '1px solid rgba(255,255,255,0.08)',
            color:
              testState === 'ok' ? '#4ade80' :
              testState === 'error' ? '#f87171' :
              '#64748b',
            fontSize: '12px',
            fontWeight: 600,
            cursor: (!hasKey || testState === 'testing') ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            opacity: (!hasKey || testState === 'testing') ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          {testState === 'testing' && <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />}
          {testState === 'ok' && <CheckCircle size={11} />}
          {testState === 'error' && <XCircle size={11} />}
          {testState === 'testing' ? 'Test…' : testState === 'ok' ? testMsg : testState === 'error' ? testMsg : 'Tester'}
        </button>
      </div>
    </div>
  );
}

function ProviderApiKeysSection() {
  const [keys, setKeys] = useState<Record<string, string>>({});

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/providers');
      if (res.ok) {
        const data = await res.json() as Record<string, string>;
        setKeys(data);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const providers: Array<{ provider: string; label: string; placeholder: string }> = [
    { provider: 'openrouter', label: 'OpenRouter API Key', placeholder: 'sk-or-v1-…' },
    { provider: 'replicate',  label: 'Replicate API Token', placeholder: 'r8_…' },
    { provider: 'openai',     label: 'OpenAI API Key', placeholder: 'sk-…' },
    { provider: 'huggingface', label: 'HuggingFace API Key', placeholder: 'hf_…' },
    { provider: 'together',   label: 'Together AI API Key (free credits)', placeholder: 'together-…' },
    { provider: 'fal',        label: 'Fal.ai API Key (free credits)', placeholder: 'fal-…' },
    { provider: 'kling',      label: 'Kling AI — vidéo (66 crédits/jour gratuits)', placeholder: 'accessKey:secretKey' },
    { provider: 'veo',        label: 'Google Veo — vidéo (100 crédits/mois gratuits)', placeholder: 'AIza…' },
  ];

  const configuredCount = providers.filter((p) => keys[p.provider]?.trim()).length;

  return (
    <div
      className="glass"
      style={{ borderRadius: '16px', padding: '24px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
        <KeyRound size={15} color="#f59e0b" />
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
          Provider API Keys
        </h2>
        <span
          data-testid="provider-keys-configured-count"
          style={{
            marginLeft: 'auto',
            fontSize: '11px',
            padding: '2px 10px',
            borderRadius: '20px',
            background: configuredCount > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
            border: configuredCount > 0 ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(100,116,139,0.25)',
            color: configuredCount > 0 ? '#4ade80' : '#64748b',
          }}
        >
          {configuredCount > 0 ? `${configuredCount} configuré${configuredCount > 1 ? 's' : ''}` : 'Aucun provider configuré'}
        </span>
      </div>

      <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px' }}>
        Clés utilisées pour la génération d&apos;images et autres fonctions IA. Stockées en base locale.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {providers.map((p) => (
          <ProviderRow
            key={p.provider}
            provider={p.provider}
            label={p.label}
            placeholder={p.placeholder}
            initialValue={keys[p.provider] ?? ''}
            onSaved={fetchKeys}
          />
        ))}
      </div>
    </div>
  );
}

function ConnectionsTab() {
  const [wa, setWa] = useState<WhatsAppState>({ status: 'LOADING' });
  const [toggling, setToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/whatsapp/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setWa(data);
      } else {
        setWa({ status: 'DISCONNECTED' });
      }
    } catch {
      setWa({ status: 'DISCONNECTED' });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch('/api/integrations/whatsapp/toggle', { method: 'POST' });
      if (res.ok) {
        await fetchStatus();
      }
    } finally {
      setToggling(false);
    }
  };

  const isConnected = wa.status === 'CONNECTED';
  const isQr = wa.status === 'QR_READY';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
        Manage external service integrations. Connect or disconnect services to extend Sona&apos;s capabilities.
      </p>

      {/* WhatsApp tile */}
      <div
        className="glass"
        style={{
          borderRadius: '16px',
          padding: '24px',
          borderColor: isConnected
            ? 'rgba(34,197,94,0.2)'
            : isQr
            ? 'rgba(251,191,36,0.2)'
            : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Icon */}
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(37,211,102,0.12)',
              border: '1px solid rgba(37,211,102,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MessageCircle size={22} color="#25d366" />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: '160px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9' }}>WhatsApp</span>
              <StatusBadge status={wa.status} />
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
              {isConnected
                ? 'Sona is connected and receiving WhatsApp messages.'
                : isQr
                ? 'Scan the QR code below with WhatsApp to connect.'
                : 'Connect WhatsApp to allow Sona to send and receive messages.'}
            </p>
          </div>

          {/* Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={fetchStatus}
              disabled={toggling}
              title="Refresh status"
              style={{
                padding: '8px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'transparent',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <RefreshCw size={14} style={{ animation: wa.status === 'LOADING' ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={handleToggle}
              disabled={toggling || wa.status === 'LOADING'}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: isConnected || isQr
                  ? '1px solid rgba(239,68,68,0.35)'
                  : '1px solid rgba(34,197,94,0.35)',
                background: isConnected || isQr
                  ? 'rgba(239,68,68,0.1)'
                  : 'rgba(34,197,94,0.1)',
                color: isConnected || isQr ? '#f87171' : '#4ade80',
                fontSize: '12px',
                fontWeight: 600,
                cursor: toggling || wa.status === 'LOADING' ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: toggling ? 0.6 : 1,
                transition: 'all 150ms ease',
              }}
            >
              {isConnected || isQr ? (
                <>
                  <WifiOff size={13} />
                  {toggling ? 'Stopping…' : 'Disconnect'}
                </>
              ) : (
                <>
                  <Wifi size={13} />
                  {toggling ? 'Starting…' : 'Connect'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* QR code */}
        {isQr && wa.qr && (
          <div
            style={{
              marginTop: '20px',
              padding: '16px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(251,191,36,0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <QrCode size={14} color="#fbbf24" />
              <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600 }}>
                Scan with WhatsApp to connect
              </span>
            </div>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px' }}>
              <QRCode value={wa.qr} size={200} level="L" />
            </div>
          </div>
        )}
      </div>

      {/* Provider API Keys */}
      <ProviderApiKeysSection />
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general');

  return (
    <PageShell>
      {/* Top bar */}
      <div
        className="sona-page-topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.6)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={18} color="#a78bfa" />
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
              Settings
            </h1>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            Sona configuration and integrations
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          padding: '16px 32px 0',
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <TabButton label="General" active={tab === 'general'} onClick={() => setTab('general')} />
        <TabButton label="Connexions" active={tab === 'connections'} onClick={() => setTab('connections')} />
        <TabButton label="Média" active={tab === 'media'} onClick={() => setTab('media')} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '28px 32px' }}>
        {tab === 'general' && <GeneralTab />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'media' && <MediaTab onGoToConnections={() => setTab('connections')} />}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PageShell>
  );
}
