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

export async function GET() {
  try {
    // First try live API
    const apiUrl = process.env.SONA_API_URL ?? 'http://localhost:8080';
    try {
      const res = await fetch(`${apiUrl}/api/jobs`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        const jobs = Array.isArray(data) ? data : (data?.jobs ?? []);
        return Response.json(jobs);
      }
    } catch {
      // fall through to filesystem
    }

    // Fallback: read from filesystem
    const archiveDir = '/home/beniben/sona-workspace/projects/_archive/jobs';
    const jobs: JobResult[] = [];

    if (fs.existsSync(archiveDir)) {
      const entries = fs.readdirSync(archiveDir);
      for (const entry of entries) {
        const resultPath = path.join(archiveDir, entry, 'result.json');
        const goalPath = path.join(archiveDir, entry, 'goal.md');
        if (!fs.existsSync(resultPath)) continue;
        try {
          const stat = fs.statSync(resultPath);
          const raw = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
          let goal = raw.goal;
          if (!goal && fs.existsSync(goalPath)) {
            goal = fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 200);
          }
          jobs.push({
            id: entry,
            goal,
            status: raw.status ?? raw.exitCode === 0 ? 'done' : 'error',
            startedAt: raw.startedAt,
            completedAt: raw.completedAt,
            result: raw.result ?? raw.summary,
            exitCode: raw.exitCode,
            mtime: stat.mtimeMs,
          });
        } catch {
          // skip malformed
        }
      }
    }

    // Also check active jobs directory
    const projectsDir = '/home/beniben/sona-workspace/projects';
    if (fs.existsSync(projectsDir)) {
      const projects = fs.readdirSync(projectsDir).filter(p => p !== '_archive');
      for (const proj of projects) {
        const jobsDir = path.join(projectsDir, proj, 'jobs');
        if (!fs.existsSync(jobsDir)) continue;
        const jobEntries = fs.readdirSync(jobsDir);
        for (const entry of jobEntries) {
          const resultPath = path.join(jobsDir, entry, 'result.json');
          const goalPath = path.join(jobsDir, entry, 'goal.md');
          try {
            const stat = fs.statSync(resultPath);
            const raw = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
            let goal = raw.goal;
            if (!goal && fs.existsSync(goalPath)) {
              goal = fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 200);
            }
            jobs.push({
              id: entry,
              goal,
              status: raw.status,
              startedAt: raw.startedAt,
              completedAt: raw.completedAt,
              result: raw.result ?? raw.summary,
              exitCode: raw.exitCode,
              mtime: stat.mtimeMs,
            });
          } catch {
            // skip missing result.json (job might be running)
            // try reading goal only
            if (fs.existsSync(goalPath)) {
              try {
                const stat = fs.statSync(goalPath);
                const goal = fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 200);
                jobs.push({ id: entry, goal, status: 'running', mtime: stat.mtimeMs });
              } catch {}
            }
          }
        }
      }
    }

    // Sort by mtime desc, return last 20
    jobs.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
    return Response.json(jobs.slice(0, 20));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
