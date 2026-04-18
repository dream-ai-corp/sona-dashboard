export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/models/audio`, {
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
      ok: true,
      models: [
        { id: 'musicgen-small', label: 'MusicGen Small (3.3s/s)',       provider: 'replicate', tier: 'free', types: ['music'] },
        { id: 'musicgen-large', label: 'MusicGen Large (haute qualité)', provider: 'replicate', tier: 'free', types: ['music'] },
        { id: 'audiogen',       label: 'AudioGen (effets sonores)',      provider: 'replicate', tier: 'free', types: ['sound_effect'] },
        { id: 'bark',           label: 'Bark (voix/effets)',             provider: 'replicate', tier: 'free', types: ['voice', 'sound_effect'] },
      ],
      error: msg,
    });
  }
}
