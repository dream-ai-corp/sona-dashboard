export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/openrouter/models`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unreachable';
    return Response.json({ ok: false, error: msg }, { status: 503 });
  }
}
