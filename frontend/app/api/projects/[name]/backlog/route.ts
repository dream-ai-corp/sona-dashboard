import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const PROJECTS_DIR = '/home/beniben/sona-workspace/projects';

function backlogPath(name: string): string {
  return path.join(PROJECTS_DIR, name, 'backlog.md');
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!name || name.includes('..')) {
    return Response.json({ error: 'invalid project name' }, { status: 400 });
  }
  const filePath = backlogPath(name);
  if (!fs.existsSync(filePath)) {
    return Response.json({ content: '' });
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return Response.json({ content });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!name || name.includes('..')) {
    return Response.json({ error: 'invalid project name' }, { status: 400 });
  }
  const filePath = backlogPath(name);
  try {
    const body = await req.json();
    if (typeof body.content !== 'string') {
      return Response.json({ error: 'content must be a string' }, { status: 400 });
    }
    fs.writeFileSync(filePath, body.content, 'utf-8');
    return Response.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
