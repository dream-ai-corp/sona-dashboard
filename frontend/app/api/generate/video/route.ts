export const dynamic = 'force-dynamic';

/* ─── Config ─────────────────────────────────────────────────────────
 * Supported providers determined by available env vars:
 *   REPLICATE_API_TOKEN  → Replicate (Wan2.1, AnimateDiff, CogVideoX, Mochi, SVD)
 *   FAL_API_KEY          → fal.ai (Wan2.1, fast inference)
 * ──────────────────────────────────────────────────────────────────── */

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN ?? '';
const FAL_KEY = process.env.FAL_API_KEY ?? '';

type GenerateRequest = {
  prompt: string;
  model: string;
  duration?: number; // seconds: 2, 4, or 8
};

type GenerateResult = { url: string } | { error: string };

/* ─── Model alias → Replicate full path ─────────────────────────── */
const MODEL_REPLICATE: Record<string, string> = {
  'wan2.1':       'wavespeedai/wan-2.1-t2v-480p',
  'animatediff':  'lucataco/animate-diff',
  'stable-video': 'stability-ai/stable-video-diffusion',
  'cogvideox':    'chenxwh/cogvideox-5b',
  'mochi-1':      'genmoai/mochi-1',
};

/* ─── Model alias → fal.ai endpoint ─────────────────────────────── */
const MODEL_FAL: Record<string, string> = {
  'wan2.1':   'fal-ai/wan-t2v',
  'mochi-1':  'fal-ai/mochi-v1',
  'cogvideox':'fal-ai/cogvideox-5b',
};

function resolveReplicate(model: string): string {
  return MODEL_REPLICATE[model] ?? model;
}

/* ─── Provider dispatch ─────────────────────────────────────────── */
async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const { prompt, model, duration = 4 } = req;

  // fal.ai — fast inference for supported models
  if (FAL_KEY && MODEL_FAL[model]) {
    return generateFal(prompt, MODEL_FAL[model], duration);
  }

  // Replicate — broader model support
  if (REPLICATE_TOKEN) {
    return generateReplicate(prompt, resolveReplicate(model), duration);
  }

  return {
    error:
      'Aucun provider configuré. Ajoutez REPLICATE_API_TOKEN ou FAL_API_KEY dans les variables d\'environnement.',
  };
}

/* ─── fal.ai ────────────────────────────────────────────────────── */
async function generateFal(
  prompt: string,
  endpoint: string,
  duration: number,
): Promise<GenerateResult> {
  // Submit request
  const submitRes = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${FAL_KEY}`,
    },
    body: JSON.stringify({ prompt, num_frames: duration * 8 }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    return { error: (err as { detail?: string }).detail ?? `fal.ai submit error ${submitRes.status}` };
  }

  const submission = await submitRes.json() as { request_id?: string; status?: string };
  if (!submission.request_id) return { error: 'fal.ai: no request_id' };

  // Poll for result (max 3 min for video)
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));

    const statusRes = await fetch(
      `https://queue.fal.run/${endpoint}/requests/${submission.request_id}/status`,
      {
        headers: { Authorization: `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!statusRes.ok) continue;
    const status = await statusRes.json() as { status?: string; logs?: unknown[] };

    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(
        `https://queue.fal.run/${endpoint}/requests/${submission.request_id}`,
        { headers: { Authorization: `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(10_000) },
      );
      if (!resultRes.ok) return { error: 'fal.ai: could not fetch result' };
      const result = await resultRes.json() as { video?: { url?: string }; video_url?: string };
      const url = result.video?.url ?? result.video_url;
      if (!url) return { error: 'fal.ai: no video URL in response' };
      return { url };
    }

    if (status.status === 'FAILED') {
      return { error: 'fal.ai: generation failed' };
    }
  }

  return { error: 'fal.ai: timeout — video generation took too long' };
}

/* ─── Replicate ─────────────────────────────────────────────────── */
async function generateReplicate(
  prompt: string,
  model: string,
  duration: number,
): Promise<GenerateResult> {
  const createRes = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${REPLICATE_TOKEN}`,
    },
    body: JSON.stringify({
      input: {
        prompt,
        num_frames: duration * 8,
        num_inference_steps: 25,
        guidance_scale: 7.5,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    return { error: (err as { detail?: string }).detail ?? `Replicate create error ${createRes.status}` };
  }

  const prediction = await createRes.json() as {
    id?: string;
    error?: string;
    urls?: { get?: string };
  };

  if (prediction.error) return { error: prediction.error };
  if (!prediction.id) return { error: 'Replicate: no prediction ID' };

  // Poll (max 3 min for video)
  const pollUrl = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`;
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));

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
  }

  return { error: 'Replicate: timeout — video generation took too long' };
}

/* ─── Route handler ─────────────────────────────────────────────── */
export async function POST(req: Request) {
  let body: Partial<GenerateRequest>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, model, duration } = body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return Response.json({ error: 'prompt is required' }, { status: 400 });
  }
  if (!model || typeof model !== 'string') {
    return Response.json({ error: 'model is required' }, { status: 400 });
  }
  if (duration !== undefined && ![2, 4, 8].includes(duration)) {
    return Response.json({ error: 'duration must be 2, 4, or 8' }, { status: 400 });
  }

  try {
    const result = await generate({ prompt: prompt.trim(), model, duration });
    if ('error' in result) {
      return Response.json(result, { status: 422 });
    }
    return Response.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
