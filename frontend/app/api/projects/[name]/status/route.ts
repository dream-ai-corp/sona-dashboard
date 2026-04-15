import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const PROJECTS_DIR = '/home/beniben/sona-workspace/projects';
const VALID_STATUSES = ['active', 'paused', 'archived'] as const;
type ProjectStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const id = decodeURIComponent(name);

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const newStatus = typeof body.status === 'string' ? body.status.toLowerCase() : null;
  if (!newStatus || !VALID_STATUSES.includes(newStatus as ProjectStatus)) {
    return Response.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const projectDir = path.join(PROJECTS_DIR, id);
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  const jsonPath = path.join(projectDir, 'project.json');

  let raw: Record<string, unknown> = {};
  if (fs.existsSync(jsonPath)) {
    try {
      raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return Response.json({ error: 'Failed to parse project.json' }, { status: 500 });
    }
  }

  raw.status = newStatus;

  try {
    fs.writeFileSync(jsonPath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
  } catch {
    return Response.json({ error: 'Failed to write project.json' }, { status: 500 });
  }

  return Response.json({ status: newStatus });
}
