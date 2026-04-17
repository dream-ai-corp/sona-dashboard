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
  together: string;
  fal: string;
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
      together: data.together || process.env.TOGETHER_API_KEY || '',
      fal: data.fal || process.env.FAL_API_KEY || '',
    };
  } catch {
    // Fallback to env vars if backend is unavailable
    return {
      replicate: process.env.REPLICATE_API_TOKEN || '',
      openai: process.env.OPENAI_API_KEY || '',
      openrouter: process.env.OPENROUTER_API_KEY || '',
      together: process.env.TOGETHER_API_KEY || '',
      fal: process.env.FAL_API_KEY || '',
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

/* ─── Model config with provider routing ────────────────────────── */
type ModelConfig = { id: string; provider: 'replicate' | 'openai' | 'openrouter' | 'together' | 'fal'; label: string };

const MODELS: Record<string, ModelConfig> = {
  // Replicate models (free/cheap)
  'flux-schnell':   { id: 'black-forest-labs/FLUX.1-schnell', provider: 'replicate', label: 'FLUX.1 Schnell (gratuit)' },
  'sdxl':           { id: 'stability-ai/sdxl', provider: 'replicate', label: 'Stable Diffusion XL (gratuit)' },
  'sdxl-lightning': { id: 'bytedance/sdxl-lightning-4step', provider: 'replicate', label: 'SDXL Lightning (gratuit)' },
  // OpenAI direct
  'dall-e-3':       { id: 'dall-e-3', provider: 'openai', label: 'DALL\u00B7E 3 (payant)' },
  // OpenRouter image models
  'gpt-image':      { id: 'openai/gpt-5-image-mini', provider: 'openrouter', label: 'GPT Image Mini (payant)' },
  'gemini-image':   { id: 'google/gemini-2.5-flash-image', provider: 'openrouter', label: 'Gemini Flash Image (payant)' },
};

function resolveModel(model: string): ModelConfig {
  if (MODELS[model]) return MODELS[model];
  // Together.ai models are prefixed with "together:"
  if (model.startsWith('together:')) return { id: model, provider: 'together', label: model.slice(9) };
  // Fal.ai models are prefixed with "fal:"
  if (model.startsWith('fal:')) return { id: model, provider: 'fal', label: model.slice(4) };
  // Dynamic OpenRouter models have a "/" in their ID (e.g. "openai/dall-e-3")
  if (model.includes('/')) return { id: model, provider: 'openrouter', label: model };
  return MODELS['flux-schnell'];
}

/* ─── Together.ai ───────────────────────────────────────────────── */
async function generateTogether(
  prompt: string,
  model: string,
  width: number,
  height: number,
  apiKey: string,
): Promise<GenerateResult> {
  const modelId = model.startsWith('together:') ? model.slice(9) : model;
  const res = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelId, prompt, n: 1, width, height }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: (err as { error?: { message?: string } }).error?.message ?? `Together.ai error ${res.status}` };
  }

  const data = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> };
  const item = data.data?.[0];
  if (item?.url) return { url: item.url };
  if (item?.b64_json) return { url: `data:image/png;base64,${item.b64_json}` };
  return { error: 'Together.ai: no image URL in response' };
}

/* ─── Fal.ai ────────────────────────────────────────────────────── */
async function generateFal(
  prompt: string,
  model: string,
  width: number,
  height: number,
  apiKey: string,
): Promise<GenerateResult> {
  const modelId = model.startsWith('fal:') ? model.slice(4) : model;
  const submitRes = await fetch(`https://queue.fal.run/${modelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({ prompt, image_size: { width, height }, num_images: 1 }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => '');
    let errMsg = `Fal.ai submit error ${submitRes.status}`;
    try { errMsg = (JSON.parse(text) as { detail?: string }).detail ?? errMsg; } catch {}
    return { error: errMsg };
  }

  const job = await submitRes.json() as { images?: Array<{ url?: string }>; request_id?: string };

  // Sync response
  if (job.images?.[0]?.url) return { url: job.images[0].url! };

  const requestId = job.request_id;
  if (!requestId) return { error: 'Fal.ai: no request_id in response' };

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://queue.fal.run/${modelId}/requests/${requestId}`, {
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!pollRes.ok) continue;
    const poll = await pollRes.json() as {
      status?: string;
      images?: Array<{ url?: string }>;
      output?: { images?: Array<{ url?: string }> };
      error?: string;
    };
    if (poll.status === 'COMPLETED' || poll.images?.[0]?.url) {
      const url = poll.images?.[0]?.url ?? poll.output?.images?.[0]?.url;
      if (url) return { url };
      return { error: 'Fal.ai: no image URL in completed response' };
    }
    if (poll.status === 'FAILED') return { error: poll.error ?? 'Fal.ai: generation failed' };
  }
  return { error: 'Fal.ai: timeout — generation took too long' };
}

/* ─── Provider dispatch ─────────────────────────────────────────── */
async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const { prompt, width = 1024, height = 1024 } = req;
  const cfg = resolveModel(req.model);
  const keys = await fetchProviderKeys();

  // Route to the correct provider based on model config
  if (cfg.provider === 'together' && keys.together) {
    return generateTogether(prompt, cfg.id, width, height, keys.together);
  }
  if (cfg.provider === 'fal' && keys.fal) {
    return generateFal(prompt, cfg.id, width, height, keys.fal);
  }
  if (cfg.provider === 'openai' && keys.openai) {
    return generateOpenAI(prompt, width, height, keys.openai);
  }
  if (cfg.provider === 'openrouter' && keys.openrouter) {
    return generateOpenRouter(prompt, cfg.id, width, height, keys.openrouter);
  }
  if (cfg.provider === 'replicate' && keys.replicate) {
    return generateReplicate(prompt, cfg.id, width, height, keys.replicate);
  }

  // Fallback: try any available provider
  if (keys.together) return generateTogether(prompt, cfg.id, width, height, keys.together);
  if (keys.fal) return generateFal(prompt, cfg.id, width, height, keys.fal);
  if (keys.replicate) return generateReplicate(prompt, cfg.id, width, height, keys.replicate);
  if (keys.openrouter) return generateOpenRouter(prompt, cfg.id, width, height, keys.openrouter);
  if (keys.openai) return generateOpenAI(prompt, width, height, keys.openai);

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

/* ─── OpenRouter (uses chat completions endpoint with image models) ── */
async function generateOpenRouter(
  prompt: string,
  model: string,
  width: number,
  height: number,
  apiKey: string,
): Promise<GenerateResult> {
  // OpenRouter doesn't have /images/generations — use chat completions
  // with image-capable models that return base64 or URLs
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://sona.beniben.dev',
      'X-Title': 'Sona Dashboard',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: `Generate an image: ${prompt}. Dimensions: ${width}x${height}.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const err = JSON.parse(text);
      return { error: err?.error?.message ?? `OpenRouter error ${res.status}` };
    } catch {
      return { error: `OpenRouter error ${res.status}: ${text.slice(0, 200)}` };
    }
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  // Some image models return data[] (like OpenAI format)
  if (data.data?.[0]) {
    const item = data.data[0];
    if (item.url) return { url: item.url };
    if (item.b64_json) return { url: `data:image/png;base64,${item.b64_json}` };
  }

  // Others return base64 in the message content
  const content = data.choices?.[0]?.message?.content ?? '';
  if (content.startsWith('data:image')) return { url: content };

  // Try to extract a URL from the response
  const urlMatch = content.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp)/i);
  if (urlMatch) return { url: urlMatch[0] };

  return { error: 'OpenRouter: model did not return an image. Try a different model (e.g. FLUX.1 Schnell via Replicate).' };
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
