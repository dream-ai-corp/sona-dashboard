/* ─── POST /api/intent/detect ────────────────────────────────────────────────
 * Detects media-generation intent from a voice transcript (French + English).
 * Returns { intent: "generate_image" | "generate_video" | null, prompt: string | null }
 *
 * Patterns (AC1/AC2):
 *   Image: "génère une image de …", "crée une image de …", "génère moi une image de …"
 *   Video: "génère une vidéo de …", "crée une vidéo de …", "génère moi une vidéo de …"
 *
 * AC5: Phrases that don't contain these patterns → intent: null
 * ──────────────────────────────────────────────────────────────────────────── */

export const dynamic = 'force-dynamic';

// Normalise accents so both accented and unaccented inputs match
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .trim();
}

interface DetectResult {
  intent: 'generate_image' | 'generate_video' | null;
  prompt: string | null;
}

// Trigger words in normalised form (no accents)
const IMAGE_PATTERN =
  /(?:genere?(?:\s+moi)?|cree?(?:\s+moi)?)\s+(?:une?\s+)?(?:image|photo|illustration)s?\s+de\s+(.+)/i;

const VIDEO_PATTERN =
  /(?:genere?(?:\s+moi)?|cree?(?:\s+moi)?)\s+(?:une?\s+)?(?:video|clip|animation)s?\s+de\s+(.+)/i;

export function detectIntent(text: string): DetectResult {
  if (!text || !text.trim()) return { intent: null, prompt: null };

  const norm = normalise(text);

  const imgMatch = IMAGE_PATTERN.exec(norm);
  if (imgMatch) {
    return { intent: 'generate_image', prompt: imgMatch[1].trim() };
  }

  const vidMatch = VIDEO_PATTERN.exec(norm);
  if (vidMatch) {
    return { intent: 'generate_video', prompt: vidMatch[1].trim() };
  }

  return { intent: null, prompt: null };
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('text' in body)) {
    return Response.json({ error: 'text field required' }, { status: 400 });
  }

  const { text } = body as { text: unknown };
  if (typeof text !== 'string') {
    return Response.json({ error: 'text must be a string' }, { status: 400 });
  }

  return Response.json(detectIntent(text));
}
