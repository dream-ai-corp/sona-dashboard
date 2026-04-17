export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/openrouter/config`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unreachable';
    return Response.json({ ok: false, error: msg }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/api/openrouter/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unreachable';
    return Response.json({ ok: false, error: msg }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const res = await fetch(`${BACKEND}/api/openrouter/config`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unreachable';
    return Response.json({ ok: false, error: msg }, { status: 503 });
  }
}
