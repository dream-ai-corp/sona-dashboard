import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface JobResult {
  id: string;
  goal?: string;
  status?: string;
  startedAt?: number | string;
  completedAt?: number | string;
  result?: string;
  exitCode?: number;
  mtime?: number;
}

async function getLiveRunningIds(apiUrl: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${apiUrl}/api/daemon`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.runningJobIds)) {
        return new Set(data.runningJobIds);
      }
    }
  } catch { /* ignore */ }
  return new Set();
}

async function readJobs(): Promise<JobResult[]> {
  const apiUrl = process.env.SONA_API_URL ?? 'http://localhost:8080';

  // Try live API first
  try {
    const res = await fetch(`${apiUrl}/api/jobs`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.jobs ?? []);
    }
  } catch {
    // fall through to filesystem
  }

  const liveRunningIds = await getLiveRunningIds(apiUrl);
  const jobs: JobResult[] = [];

  // Archive jobs
  const archiveDir = '/home/beniben/sona-workspace/projects/_archive/jobs';
  if (fs.existsSync(archiveDir)) {
    for (const entry of fs.readdirSync(archiveDir)) {
      const resultPath = path.join(archiveDir, entry, 'result.json');
      const goalPath = path.join(archiveDir, entry, 'goal.md');
      if (!fs.existsSync(resultPath)) continue;
      try {
        const stat = fs.statSync(resultPath);
        const raw = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        let goal = raw.goal;
        if (!goal && fs.existsSync(goalPath)) goal = fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 200);
        jobs.push({
          id: entry, goal,
          status: raw.status ?? (raw.exitCode === 0 ? 'done' : 'error'),
          startedAt: raw.startedAt, completedAt: raw.completedAt,
          result: raw.result ?? raw.summary, exitCode: raw.exitCode,
          mtime: stat.mtimeMs,
        });
      } catch { /* skip malformed */ }
    }
  }

  // Active project jobs
  const projectsDir = '/home/beniben/sona-workspace/projects';
  if (fs.existsSync(projectsDir)) {
    for (const proj of fs.readdirSync(projectsDir).filter((p) => p !== '_archive')) {
      const jobsDir = path.join(projectsDir, proj, 'jobs');
      if (!fs.existsSync(jobsDir)) continue;
      for (const entry of fs.readdirSync(jobsDir)) {
        const resultPath = path.join(jobsDir, entry, 'result.json');
        const goalPath = path.join(jobsDir, entry, 'goal.md');
        try {
          const stat = fs.statSync(resultPath);
          const raw = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
          let goal = raw.goal;
          if (!goal && fs.existsSync(goalPath)) goal = fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 200);
          jobs.push({
            id: entry, goal, status: raw.status,
            startedAt: raw.startedAt, completedAt: raw.completedAt,
            result: raw.result ?? raw.summary, exitCode: raw.exitCode,
            mtime: stat.mtimeMs,
          });
        } catch {
          if (fs.existsSync(goalPath)) {
            try {
              const stat = fs.statSync(goalPath);
              const goal = fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 200);
              jobs.push({ id: entry, goal, status: liveRunningIds.has(entry) ? 'running' : 'orphaned', mtime: stat.mtimeMs });
            } catch {}
          }
        }
      }
    }
  }

  // Independent jobs
  const independentJobsDir = '/home/beniben/sona-workspace/independent/jobs';
  if (fs.existsSync(independentJobsDir)) {
    for (const entry of fs.readdirSync(independentJobsDir)) {
      const resultPath = path.join(independentJobsDir, entry, 'result.json');
      const goalPath = path.join(independentJobsDir, entry, 'goal.md');
      try {
        const stat = fs.statSync(resultPath);
        const raw = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        let goal = raw.goal;
        if (!goal && fs.existsSync(goalPath)) goal = fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 200);
        jobs.push({
          id: entry, goal, status: raw.status,
          startedAt: raw.startedAt, completedAt: raw.completedAt,
          result: raw.result ?? raw.summary, exitCode: raw.exitCode,
          mtime: stat.mtimeMs,
        });
      } catch {
        if (fs.existsSync(goalPath)) {
          try {
            const stat = fs.statSync(goalPath);
            const goal = fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 200);
            jobs.push({ id: entry, goal, status: liveRunningIds.has(entry) ? 'running' : 'orphaned', mtime: stat.mtimeMs });
          } catch {}
        }
      }
    }
  }

  jobs.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  return jobs.slice(0, 20);
}

export async function GET() {
  const encoder = new TextEncoder();

  // Mutable cleanup state — shared between start() and cancel()
  let closed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const watchers: fs.FSWatcher[] = [];

  const cleanup = () => {
    closed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    for (const w of watchers) {
      try { w.close(); } catch {}
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch { cleanup(); }
      };

      const pushJobs = async () => {
        try {
          const jobs = await readJobs();
          send(`data: ${JSON.stringify(jobs)}\n\n`);
        } catch { /* ignore — next event will retry */ }
      };

      const scheduleDebounce = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(pushJobs, 500);
      };

      // Send initial snapshot immediately
      await pushJobs();

      // Watch dirs for changes
      const watchDirs = [
        '/home/beniben/sona-workspace/independent/jobs',
        '/home/beniben/sona-workspace/projects',
      ];
      for (const dir of watchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
          const w = fs.watch(dir, { recursive: true }, () => scheduleDebounce());
          w.on('error', () => { /* ignore — watcher may not be supported */ });
          watchers.push(w);
        } catch { /* fs.watch not supported on this kernel */ }
      }

      // Heartbeat every 25 s to keep the connection alive through proxies
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
