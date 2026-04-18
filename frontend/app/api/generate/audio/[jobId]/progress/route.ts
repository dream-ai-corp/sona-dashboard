export const dynamic = 'force-dynamic';

/* ─── SSE proxy: streams audio job progress from the backend ─────────────────
 * GET /api/generate/audio/[jobId]/progress
 * Proxies the backend SSE stream to the browser.
 * ──────────────────────────────────────────────────────────────────────────── */

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } },
) {
  const { jobId } = params;

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND}/api/generate/audio/${jobId}/progress`, {
      headers: { Accept: 'text/event-stream' },
      // No timeout — SSE stream stays open until done (max ~3 min)
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'backend unreachable';
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }

  if (!backendRes.ok) {
    const data = await backendRes.json().catch(() => ({ error: 'Unknown error' }));
    return Response.json(data, { status: backendRes.status });
  }

  // Pipe the backend SSE stream straight through to the browser
  return new Response(backendRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
