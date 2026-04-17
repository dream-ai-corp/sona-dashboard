export const dynamic = 'force-dynamic';

/* ─── Proxy to backend video generation API ──────────────────────────────────
 * POST /api/generate/video  → backend POST, returns { ok, jobId }
 * The frontend VideoGenModal then subscribes to:
 *   GET  /api/generate/video/[jobId]/progress  (SSE stream)
 * ──────────────────────────────────────────────────────────────────────────── */

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const backendRes = await fetch(`${BACKEND}/api/generate/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await backendRes.json();
    return Response.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'backend unreachable';
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
