import fs from 'fs';

export const dynamic = 'force-dynamic';

const ACTIVITY_LOG = '/home/beniben/sona-workspace/activity-log.ndjson';

function readEvents(limit = 200): unknown[] {
  try {
    const raw = fs.readFileSync(ACTIVITY_LOG, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean)
      .slice(-limit);
  } catch {
    return [];
  }
}

export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let watcher: fs.FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    closed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try { watcher?.close(); } catch {}
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch { cleanup(); }
      };

      const pushEvents = () => {
        try {
          const events = readEvents(200);
          send(`data: ${JSON.stringify(events)}\n\n`);
        } catch { /* ignore */ }
      };

      const scheduleDebounce = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(pushEvents, 300);
      };

      // Send initial snapshot
      pushEvents();

      // Watch the activity log file for changes
      try {
        if (fs.existsSync(ACTIVITY_LOG)) {
          watcher = fs.watch(ACTIVITY_LOG, () => scheduleDebounce());
          watcher.on('error', () => { /* ignore */ });
        } else {
          // Poll every 3s if file doesn't exist yet
          const pollTimer = setInterval(() => {
            if (fs.existsSync(ACTIVITY_LOG)) {
              clearInterval(pollTimer);
              watcher = fs.watch(ACTIVITY_LOG, () => scheduleDebounce());
            }
            pushEvents();
          }, 3000);
        }
      } catch { /* fs.watch not supported */ }

      // Heartbeat every 25s
      heartbeatTimer = setInterval(() => send(': heartbeat\n\n'), 25_000);
    },
    cancel() {
      cleanup();
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
