export const dynamic = 'force-dynamic';

const WHATSAPP_BRIDGE = 'http://host.docker.internal:9997';
const HOST_BRIDGE = process.env.SONA_HOST_BRIDGE_URL ?? 'http://host.docker.internal:9998';
const HOST_TOKEN = process.env.SONA_HOST_TOKEN ?? '';

async function getCurrentStatus(): Promise<'CONNECTED' | 'QR_READY' | 'DISCONNECTED'> {
  try {
    const res = await fetch(`${WHATSAPP_BRIDGE}/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    if (data?.status === 'CONNECTED') return 'CONNECTED';
    if (data?.status === 'QR_READY') return 'QR_READY';
    return 'DISCONNECTED';
  } catch {
    return 'DISCONNECTED';
  }
}

async function execOnHost(command: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${HOST_BRIDGE}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sona-Token': HOST_TOKEN,
      },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return { ok: false, error: msg };
  }
}

export async function POST() {
  const status = await getCurrentStatus();

  const isRunning = status === 'CONNECTED' || status === 'QR_READY';
  const command = isRunning
    ? 'sudo systemctl stop sona-whatsapp'
    : 'sudo systemctl start sona-whatsapp';

  const result = await execOnHost(command);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({ ok: true, action: isRunning ? 'stopped' : 'started' });
}
