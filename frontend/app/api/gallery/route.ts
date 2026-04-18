export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.toString();
    const res = await fetch(`${BACKEND}/api/gallery${query ? `?${query}` : ''}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'backend unreachable';
    return Response.json({ error: msg }, { status: 503 });
  }
}
