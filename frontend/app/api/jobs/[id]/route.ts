export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });

  const apiUrl = process.env.SONA_API_URL ?? 'http://host.docker.internal:8080';
  try {
    const res = await fetch(`${apiUrl}/api/job/${id}/kill`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 503 });
  }
}
