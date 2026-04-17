export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string; id: string }> },
) {
  const { name, id } = await params;
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/api/projects/${encodeURIComponent(name)}/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'backend unreachable';
    return Response.json({ error: msg }, { status: 503 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string; id: string }> },
) {
  const { name, id } = await params;
  try {
    const res = await fetch(`${BACKEND}/api/projects/${encodeURIComponent(name)}/leads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'backend unreachable';
    return Response.json({ error: msg }, { status: 503 });
  }
}
