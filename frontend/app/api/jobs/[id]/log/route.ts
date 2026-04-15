export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.includes('..')) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BACKEND}/api/jobs/${id}/log`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'backend unreachable';
    return Response.json({ error: msg, lines: [] }, { status: 503 });
  }
}
