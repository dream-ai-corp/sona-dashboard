export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiUrl = process.env.SONA_API_URL ?? 'http://localhost:8080';
    const res = await fetch(`${apiUrl}/api/daemon`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    return Response.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unreachable';
    return Response.json({ error: msg }, { status: 503 });
  }
}
