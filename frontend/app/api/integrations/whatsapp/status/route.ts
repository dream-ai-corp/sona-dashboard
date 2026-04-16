export const dynamic = 'force-dynamic';

const WHATSAPP_BRIDGE = 'http://host.docker.internal:9997';

export async function GET() {
  try {
    const res = await fetch(`${WHATSAPP_BRIDGE}/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    // Normalise the response to our expected shape
    const status: 'CONNECTED' | 'QR_READY' | 'DISCONNECTED' =
      data?.status === 'CONNECTED'
        ? 'CONNECTED'
        : data?.status === 'QR_READY'
        ? 'QR_READY'
        : 'DISCONNECTED';
    return Response.json({ status, qr: data?.qr ?? undefined });
  } catch {
    return Response.json({ status: 'DISCONNECTED' });
  }
}
