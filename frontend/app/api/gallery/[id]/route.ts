export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${BACKEND}/api/gallery/${params.id}`, {
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
