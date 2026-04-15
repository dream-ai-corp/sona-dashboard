export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:3011';

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch { closed = true; }
      };

      // Proxy the backend SSE stream
      try {
        const upstream = await fetch(`${BACKEND}/api/jobs/stream`, {
          signal: req.signal,
          headers: { Accept: 'text/event-stream' },
        });

        if (!upstream.ok || !upstream.body) {
          send(`data: []\n\n`);
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
        // Backend unavailable — send empty and close
        send(`data: []\n\n`);
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (!closed) { closed = true; try { controller.close(); } catch {} }
      }
    },
    cancel() {
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
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
