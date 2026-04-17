export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const url = new URL(req.url);
  const file = url.searchParams.get('file') ?? '';
  try {
    const res = await fetch(`${BACKEND}/api/projects/${encodeURIComponent(name)}/files/download?file=${encodeURIComponent(file)}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return new Response('File not found', { status: 404 });
    const headers = new Headers();
    headers.set('Content-Disposition', res.headers.get('Content-Disposition') ?? 'attachment');
    headers.set('Content-Type', res.headers.get('Content-Type') ?? 'application/octet-stream');
    return new Response(res.body, { status: 200, headers });
  } catch {
    return new Response('Backend unreachable', { status: 503 });
  }
}
