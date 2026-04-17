export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const qs = url.searchParams.toString();
    const upstream = `${BACKEND}/api/audits/summary${qs ? `?${qs}` : ''}`;
    const res = await fetch(upstream, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'backend unreachable';
    return Response.json({ error: msg }, { status: 503 });
  }
}
