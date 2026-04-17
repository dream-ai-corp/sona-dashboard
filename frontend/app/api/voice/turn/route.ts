/**
 * POST /api/voice/turn
 *
 * S3-11: Voice command intent detection.
 * 1. Forward audio to Sona agent for transcription + TTS response.
 * 2. Check transcription for media generation commands:
 *    "génère une image de X" → POST /api/generate/image
 *    "crée une vidéo de X"   → POST /api/generate/video
 * 3. Post generation result as an assistant message in conversations.
 * 4. Return normal voice response so the chat speaks the confirmation.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const SONA_AGENT = process.env.SONA_AGENT_URL ?? 'http://host.docker.internal:8080';
const BACKEND    = process.env.BACKEND_URL     ?? 'http://backend:3011';

// ── Intent detection (mirrors backend/src/index.js detectMediaIntent) ─────────

type MediaIntent = { intent: 'image' | 'video' | 'audio' | null; prompt: string | null };

function detectMediaIntent(text: string): MediaIntent {
  if (!text || typeof text !== 'string') return { intent: null, prompt: null };

  const normalized = text.trim().toLowerCase();

  const imagePatterns: RegExp[] = [
    /(?:génère?|generè?|générer?|générez?|crée?|créer?|créez?|fais?|faire?)\s+(?:une?\s+)?(?:image|photo|illustration|dessin|visuel)\s+(?:de\s+|d'|du\s+|des\s+)?(.+)/i,
    /(?:generate?|create?|draw|make?)\s+(?:an?\s+)?(?:image|photo|picture|illustration)\s+(?:of\s+|from\s+)?(.+)/i,
    /^dessines?\s+(.+)/i,
    /^(?:image|photo)\s*[:;]\s*(.+)/i,
  ];

  const videoPatterns: RegExp[] = [
    /(?:génère?|generè?|générer?|générez?|crée?|créer?|créez?|fais?|faire?)\s+(?:une?\s+)?(?:vidéo|video|clip|animation|animé)\s+(?:de\s+|d'|du\s+|des\s+)?(.+)/i,
    /(?:generate?|create?|make?)\s+(?:an?\s+)?(?:video|clip|animation)\s+(?:of\s+|from\s+)?(.+)/i,
    /^(?:vidéo|video)\s*[:;]\s*(.+)/i,
  ];

  const audioPatterns: RegExp[] = [
    /(?:génère?|generè?|générer?|générez?|crée?|créer?|créez?|compose?|joue?)\s+(?:une?\s+)?(?:musique|chanson|son|audio|mélodie|bande.son)\s+(?:de\s+|d'|du\s+|des\s+|sur\s+)?(.+)/i,
    /(?:generate?|create?|compose?|make?)\s+(?:an?\s+)?(?:music|song|audio|sound|melody)\s+(?:of\s+|from\s+|about\s+)?(.+)/i,
    /^(?:musique|music|audio)\s*[:;]\s*(.+)/i,
  ];

  for (const re of imagePatterns) {
    const m = normalized.match(re);
    if (m) return { intent: 'image', prompt: m[1].trim() };
  }
  for (const re of videoPatterns) {
    const m = normalized.match(re);
    if (m) return { intent: 'video', prompt: m[1].trim() };
  }
  for (const re of audioPatterns) {
    const m = normalized.match(re);
    if (m) return { intent: 'audio', prompt: m[1].trim() };
  }

  return { intent: null, prompt: null };
}

// ── Generation trigger ─────────────────────────────────────────────────────────

async function triggerGeneration(intent: 'image' | 'video' | 'audio', prompt: string): Promise<string> {
  if (intent === 'image') {
    const res = await fetch(`${BACKEND}/api/generate/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: 'flux-schnell', ratio: '1:1' }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!data.ok) throw new Error((data.error as string) ?? 'Image generation failed');
    const url = (data.imageUrl as string) ?? '';
    return `[image généré]\n${url}`;
  }

  if (intent === 'video') {
    const res = await fetch(`${BACKEND}/api/generate/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: 'wan2.1', duration: 4 }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!data.ok) throw new Error((data.error as string) ?? 'Video generation failed');
    const jobId = data.jobId as string;
    return `[vidéo en cours de génération — job ${jobId}]`;
  }

  // audio: not yet available, return placeholder
  return `[génération audio non disponible pour le moment — prompt : ${prompt}]`;
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const { audio_base64, mime, sessionId } = body;

  if (!audio_base64 || typeof audio_base64 !== 'string') {
    return NextResponse.json({ ok: false, error: 'audio_base64 required' }, { status: 400 });
  }

  // 1. Forward to Sona agent for transcription + TTS
  let agentData: Record<string, unknown>;
  try {
    const agentRes = await fetch(`${SONA_AGENT}/api/voice/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_base64, mime: mime ?? 'audio/webm', sessionId: sessionId ?? 'dashboard-floating' }),
      signal: AbortSignal.timeout(30_000),
    });
    agentData = await agentRes.json() as Record<string, unknown>;
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message ?? 'Sona agent unreachable' }, { status: 502 });
  }

  if (!agentData.ok) {
    return NextResponse.json(agentData, { status: 502 });
  }

  // skipped means no speech detected — pass through
  if (agentData.skipped) {
    return NextResponse.json(agentData);
  }

  // 2. Check transcription for media generation intent
  const transcription = (agentData.text as string) ?? '';
  const { intent, prompt } = detectMediaIntent(transcription);

  if (intent && prompt) {
    // Fire generation asynchronously; don't block the voice response
    (async () => {
      try {
        const resultText = await triggerGeneration(intent, prompt);

        // Post user command + result to conversations DB
        await fetch(`${BACKEND}/api/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'user', content: transcription, channel: 'voice-intent' }),
        });
        await fetch(`${BACKEND}/api/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'assistant', content: resultText, channel: 'voice-intent' }),
        });
      } catch (err) {
        console.error('[voice/turn] intent generation error:', (err as Error).message);
      }
    })();
  }

  // 3. Return normal agent response (with audio for TTS playback)
  return NextResponse.json(agentData);
}
