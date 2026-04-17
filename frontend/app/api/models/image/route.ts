export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/models/image`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`backend error ${res.status}`);
    const data = await res.json();
    return Response.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unavailable';
    // Return a static fallback list so the UI never breaks
    return Response.json({
      models: [
        { id: 'flux-schnell',   label: 'FLUX.1 Schnell',      provider: 'replicate', tier: 'free' },
        { id: 'sdxl',           label: 'Stable Diffusion XL',  provider: 'replicate', tier: 'free' },
        { id: 'sdxl-lightning', label: 'SDXL Lightning',        provider: 'replicate', tier: 'free' },
      ],
      error: msg,
    });
  }
}
