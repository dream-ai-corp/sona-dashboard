import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function findLogPath(id: string): string | null {
  const candidates = [
    path.join('/home/beniben/sona-workspace/independent/jobs', id, 'log.ndjson'),
    path.join('/home/beniben/sona-workspace/projects/_archive/jobs', id, 'log.ndjson'),
  ];
  const projectsDir = '/home/beniben/sona-workspace/projects';
  if (fs.existsSync(projectsDir)) {
    for (const proj of fs.readdirSync(projectsDir)) {
      if (proj === '_archive') continue;
      candidates.push(path.join(projectsDir, proj, 'jobs', id, 'log.ndjson'));
    }
  }
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.includes('..')) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }

  const logPath = findLogPath(id);
  if (!logPath) {
    return Response.json({ lines: [], error: 'log not found' }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(logPath, 'utf-8');
    const lines = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
    return Response.json({ lines });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
