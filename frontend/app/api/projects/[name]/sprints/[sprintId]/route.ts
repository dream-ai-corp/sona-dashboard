import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
const PROJECTS_DIR = '/home/beniben/sona-workspace/projects';

interface Sprint {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'completed';
}

function sprintsPath(name: string): string {
  return path.join(PROJECTS_DIR, name, 'sprints.json');
}

function readSprints(name: string): Sprint[] {
  const filePath = sprintsPath(name);
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { sprints?: Sprint[] };
    return data.sprints ?? [];
  } catch {
    return [];
  }
}

function writeSprints(name: string, sprints: Sprint[]): void {
  const filePath = sprintsPath(name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ sprints }, null, 2), 'utf-8');
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string; sprintId: string }> },
) {
  const { name, sprintId } = await params;
  const body = await req.json() as Partial<Sprint>;
  const sprints = readSprints(name);
  const idx = sprints.findIndex((s) => s.id === sprintId);
  if (idx === -1) {
    return Response.json({ error: 'sprint not found' }, { status: 404 });
  }
  sprints[idx] = { ...sprints[idx], ...body, id: sprintId };
  writeSprints(name, sprints);
  return Response.json({ sprints });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string; sprintId: string }> },
) {
  const { name, sprintId } = await params;
  const sprints = readSprints(name);
  const filtered = sprints.filter((s) => s.id !== sprintId);
  writeSprints(name, filtered);
  return Response.json({ sprints: filtered });
}
