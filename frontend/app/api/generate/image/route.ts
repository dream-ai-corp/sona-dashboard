export const dynamic = 'force-dynamic';

/* ─── Config ─────────────────────────────────────────────────────
 * Supported providers determined by available env vars:
 *   REPLICATE_API_TOKEN  → Replicate (FLUX, SDXL, ByteDance Lightning)
 *   OPENAI_API_KEY       → OpenAI (DALL·E 3)
 *   OPENROUTER_API_KEY   → OpenRouter (router to many models)
 * ──────────────────────────────────────────────────────────────── */

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN ?? '';
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? '';

type GenerateRequest = {
  prompt: string;
  model: string;
  width?: number;
  height?: number;
};

type GenerateResult = { url: string } | { error: string };

/* ─── Model alias → Replicate full path ─────────────────────────── */
const MODEL_ALIASES: Record<string, string> = {
  'flux-schnell':   'black-forest-labs/FLUX.1-schnell',
  'flux-dev':       'black-forest-labs/FLUX.1-dev',
  'sdxl':           'stability-ai/sdxl',
  'sdxl-lightning': 'bytedance/sdxl-lightning-4step',
};

function resolveModel(model: string): string {
  return MODEL_ALIASES[model] ?? model;
}

/* ─── Provider dispatch ─────────────────────────────────────────── */
async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const { prompt, width = 1024, height = 1024 } = req;
  const model = resolveModel(req.model);

  // DALL·E 3 via OpenAI
  if (model.startsWith('openai/') && OPENAI_KEY) {
    return generateOpenAI(prompt, width, height);
  }

  // OpenRouter (routes to many providers)
  if (OPENROUTER_KEY) {
    return generateOpenRouter(prompt, model, width, height);
  }

  // Replicate (FLUX, SDXL, ByteDance Lightning, etc.)
  if (REPLICATE_TOKEN) {
    return generateReplicate(prompt, model, width, height);
  }

  return {
    error:
      'Aucun provider configuré. Ajoutez REPLICATE_API_TOKEN, OPENAI_API_KEY ou OPENROUTER_API_KEY dans les variables d\'environnement.',
  };
}

/* ─── OpenAI (DALL·E 3) ─────────────────────────────────────────── */
async function generateOpenAI(
  prompt: string,
  width: number,
  height: number,
): Promise<GenerateResult> {
  // Map dimensions to DALL·E 3 supported sizes
  const size =
    width === height ? '1024x1024' : width > height ? '1792x1024' : '1024x1792';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: (err as { error?: { message?: string } }).error?.message ?? `OpenAI error ${res.status}` };
  }

  const data = await res.json() as { data?: Array<{ url?: string }> };
  const url = data.data?.[0]?.url;
  if (!url) return { error: 'OpenAI: no image URL in response' };
  return { url };
}

/* ─── OpenRouter ────────────────────────────────────────────────── */
async function generateOpenRouter(
  prompt: string,
  model: string,
  width: number,
  height: number,
): Promise<GenerateResult> {
  // OpenRouter image generation endpoint (OpenAI-compatible)
  const res = await fetch('https://openrouter.ai/api/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://sona.beniben.dev',
      'X-Title': 'Sona Dashboard',
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: `${width}x${height}`,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: (err as { error?: { message?: string } }).error?.message ?? `OpenRouter error ${res.status}` };
  }

  const data = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> };
  const item = data.data?.[0];
  if (!item) return { error: 'OpenRouter: no image in response' };
  if (item.url) return { url: item.url };
  // base64 fallback — unlikely but handle it
  if (item.b64_json) {
    return { url: `data:image/png;base64,${item.b64_json}` };
  }
  return { error: 'OpenRouter: no URL or base64 in response' };
}

/* ─── Replicate ─────────────────────────────────────────────────── */
async function generateReplicate(
  prompt: string,
  model: string,
  width: number,
  height: number,
): Promise<GenerateResult> {
  // Replicate model IDs use owner/name format; version pinning is optional
  // We call the predictions API and poll for result
  const modelPath = model.includes(':') ? model : model; // supports version hash if present

  const createRes = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${REPLICATE_TOKEN}`,
    },
    body: JSON.stringify({
      input: {
        prompt,
        width,
        height,
        num_outputs: 1,
        output_format: 'webp',
        output_quality: 90,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    return { error: (err as { detail?: string }).detail ?? `Replicate create error ${createRes.status}` };
  }

  const prediction = await createRes.json() as { id?: string; error?: string; status?: string; urls?: { get?: string } };

  if (prediction.error) return { error: prediction.error };
  if (!prediction.id) return { error: 'Replicate: no prediction ID returned' };

  // Poll until done (max 90 s)
  const pollUrl = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Token ${REPLICATE_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!pollRes.ok) continue;

    const poll = await pollRes.json() as {
      status?: string;
      output?: string | string[];
      error?: string;
    };

    if (poll.status === 'succeeded') {
      const output = Array.isArray(poll.output) ? poll.output[0] : poll.output;
      if (!output) return { error: 'Replicate: empty output' };
      return { url: output };
    }

    if (poll.status === 'failed' || poll.status === 'canceled') {
      return { error: poll.error ?? `Replicate: generation ${poll.status}` };
    }
    // else: 'starting' or 'processing' → continue polling
  }

  return { error: 'Replicate: timeout — generation took too long' };
}

/* ─── Route handler ─────────────────────────────────────────────── */
export async function POST(req: Request) {
  let body: Partial<GenerateRequest>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, model, width, height } = body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return Response.json({ error: 'prompt is required' }, { status: 400 });
  }
  if (!model || typeof model !== 'string') {
    return Response.json({ error: 'model is required' }, { status: 400 });
  }

  try {
    const result = await generate({ prompt: prompt.trim(), model, width, height });
    if ('error' in result) {
      return Response.json(result, { status: 422 });
    }
    return Response.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
