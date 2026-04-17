export const dynamic = 'force-dynamic';

/* ─── Config ─────────────────────────────────────────────────────
 * API keys are loaded from the backend DB at runtime.
 * Env vars (REPLICATE_API_TOKEN, OPENAI_API_KEY, OPENROUTER_API_KEY)
 * are used as fallback when no DB value is set.
 * ──────────────────────────────────────────────────────────────── */

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

type ProviderKeys = {
  replicate: string;
  openai: string;
  openrouter: string;
};

async function fetchProviderKeys(): Promise<ProviderKeys> {
  try {
    const res = await fetch(`${BACKEND}/api/settings/providers`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error('backend unavailable');
    const data = await res.json() as Record<string, string>;
    return {
      replicate: data.replicate || process.env.REPLICATE_API_TOKEN || '',
      openai: data.openai || process.env.OPENAI_API_KEY || '',
      openrouter: data.openrouter || process.env.OPENROUTER_API_KEY || '',
    };
  } catch {
    // Fallback to env vars if backend is unavailable
    return {
      replicate: process.env.REPLICATE_API_TOKEN || '',
      openai: process.env.OPENAI_API_KEY || '',
      openrouter: process.env.OPENROUTER_API_KEY || '',
    };
  }
}

type GenerateRequest = {
  prompt: string;
  model: string;
  width?: number;
  height?: number;
};

type GenerateResult = { url: string } | { error: string };

/* ─── Model aliases ─────────────────────────────────────────────── */
const MODEL_ALIASES: Record<string, string> = {
  // Free — Replicate
  'flux-schnell':   'black-forest-labs/FLUX.1-schnell',
  'flux-dev':       'black-forest-labs/FLUX.1-dev',
  'sdxl':           'stability-ai/sdxl',
  'sdxl-lightning': 'bytedance/sdxl-lightning-4step',
  // Paid — OpenAI
  'dall-e-3':       'openai/dall-e-3',
  // Paid — Midjourney via OpenRouter (best available substitute)
  'midjourney':     'openai/dall-e-3',
};

function resolveModel(model: string): string {
  return MODEL_ALIASES[model] ?? model;
}

/* ─── Provider dispatch ─────────────────────────────────────────── */
async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const { prompt, width = 1024, height = 1024 } = req;
  const model = resolveModel(req.model);
  const keys = await fetchProviderKeys();

  // DALL·E 3 via OpenAI direct
  if (model.startsWith('openai/') && keys.openai) {
    return generateOpenAI(prompt, width, height, keys.openai);
  }

  // OpenRouter (routes to many providers — also handles openai/* if no direct key)
  if (keys.openrouter) {
    return generateOpenRouter(prompt, model, width, height, keys.openrouter);
  }

  // Replicate (FLUX, SDXL, ByteDance Lightning, etc.)
  if (keys.replicate) {
    return generateReplicate(prompt, model, width, height, keys.replicate);
  }

  return {
    error:
      'Aucun provider configuré. Ajoutez vos clés API dans Paramètres → Connexions.',
  };
}

/* ─── OpenAI (DALL·E 3) ─────────────────────────────────────────── */
async function generateOpenAI(
  prompt: string,
  width: number,
  height: number,
  apiKey: string,
): Promise<GenerateResult> {
  const size =
    width === height ? '1024x1024' : width > height ? '1792x1024' : '1024x1792';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
  apiKey: string,
): Promise<GenerateResult> {
  const res = await fetch('https://openrouter.ai/api/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
  if (item.b64_json) return { url: `data:image/png;base64,${item.b64_json}` };
  return { error: 'OpenRouter: no URL or base64 in response' };
}

/* ─── Replicate ─────────────────────────────────────────────────── */
async function generateReplicate(
  prompt: string,
  model: string,
  width: number,
  height: number,
  token: string,
): Promise<GenerateResult> {
  const createRes = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
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

  const pollUrl = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Token ${token}` },
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
