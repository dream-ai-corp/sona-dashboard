import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const PROJECTS_DIR = '/home/beniben/sona-workspace/projects';

interface JobResult {
  id: string;
  goal?: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  elapsedSec?: number;
  exitCode?: number;
  mtime?: number;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const projectName = decodeURIComponent(name);
  const jobsDir = path.join(PROJECTS_DIR, projectName, 'jobs');

  if (!fs.existsSync(jobsDir)) {
    return Response.json({ jobs: [] });
  }

  const jobs: JobResult[] = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(jobsDir);
  } catch {
    return Response.json({ jobs: [] });
  }

  for (const entry of entries) {
    const jobDir = path.join(jobsDir, entry);
    if (!fs.statSync(jobDir).isDirectory()) continue;

    const resultPath = path.join(jobDir, 'result.json');
    const goalPath = path.join(jobDir, 'goal.md');

    const goalText = fs.existsSync(goalPath)
      ? fs.readFileSync(goalPath, 'utf-8').trim().slice(0, 300)
      : undefined;

    if (fs.existsSync(resultPath)) {
      try {
        const stat = fs.statSync(resultPath);
        const raw = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        const success: boolean = typeof raw.success === 'boolean'
          ? raw.success
          : raw.exitCode === 0;
        jobs.push({
          id: entry,
          goal: raw.goal ?? goalText,
          status: raw.status ?? (success ? 'done' : 'error'),
          startedAt: raw.startedAt,
          completedAt: raw.completedAt ?? stat.mtimeMs,
          elapsedSec: raw.elapsedSec,
          exitCode: raw.exitCode,
          mtime: stat.mtimeMs,
        });
      } catch {
        // skip malformed result.json
      }
    } else if (fs.existsSync(goalPath)) {
      // No result yet — check if process is alive via pid.txt
      const pidPath = path.join(jobDir, 'pid.txt');
      let isAlive = false;
      if (fs.existsSync(pidPath)) {
        try {
          const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
          process.kill(pid, 0);
          isAlive = true;
        } catch {
          // pid dead
        }
      }
      const stat = fs.statSync(goalPath);
      jobs.push({
        id: entry,
        goal: goalText,
        status: isAlive ? 'running' : 'error',
        mtime: stat.mtimeMs,
      });
    }
  }

  // Sort newest first
  jobs.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));

  return Response.json({ jobs });
}
