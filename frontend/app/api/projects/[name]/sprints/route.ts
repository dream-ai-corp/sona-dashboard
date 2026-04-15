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

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const sprints = readSprints(name);
  return Response.json({ sprints });
}

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const body = await req.json() as Partial<Sprint>;
  const sprints = readSprints(name);
  const newSprint: Sprint = {
    id: `sprint-${Date.now()}`,
    name: body.name ?? 'New Sprint',
    goal: body.goal ?? '',
    startDate: body.startDate ?? '',
    endDate: body.endDate ?? '',
    status: body.status ?? 'planning',
  };
  sprints.push(newSprint);
  writeSprints(name, sprints);
  return Response.json({ sprints });
}
