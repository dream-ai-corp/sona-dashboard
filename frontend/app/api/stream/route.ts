export const dynamic = 'force-dynamic';

const SONA_API = process.env.SONA_API_URL ?? 'http://host.docker.internal:8080';

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch { closed = true; }
      };

      try {
        const upstream = await fetch(`${SONA_API}/api/stream`, {
          signal: req.signal,
          headers: { Accept: 'text/event-stream' },
        });

        if (!upstream.ok || !upstream.body) {
          send('event: error\ndata: {"error":"upstream unavailable"}\n\n');
          controller.close();
          return;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done || closed) break;
          send(decoder.decode(value, { stream: true }));
        }
      } catch {
        // Upstream unavailable — close gracefully
        if (!closed) { closed = true; try { controller.close(); } catch {} }
      } finally {
        if (!closed) { closed = true; try { controller.close(); } catch {} }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
