import fs from 'fs';
import path from 'path';
import { parseBacklog, parseBacklogSections } from '@/lib/backlog';

export const dynamic = 'force-dynamic';

const PROJECTS_DIR = '/home/beniben/sona-workspace/projects';

function backlogPath(name: string): string {
  return path.join(PROJECTS_DIR, name, 'backlog.md');
}

function safeName(name: string): boolean {
  return !!name && !name.includes('..');
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!safeName(name)) {
    return Response.json({ error: 'invalid project name' }, { status: 400 });
  }
  const filePath = backlogPath(name);
  if (!fs.existsSync(filePath)) {
    return Response.json({ items: [], sections: [], raw: '' });
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return Response.json({ items: parseBacklog(raw), sections: parseBacklogSections(raw), raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}

// POST: append a new item { text: string }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!safeName(name)) {
    return Response.json({ error: 'invalid project name' }, { status: 400 });
  }
  const filePath = backlogPath(name);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return Response.json({ error: 'text must be a non-empty string' }, { status: 400 });
    }
    const existing = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : '';
    const newContent =
      existing +
      (existing.endsWith('\n') || existing === '' ? '' : '\n') +
      `- [ ] ${body.text.trim()}\n`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, newContent, 'utf-8');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return Response.json({ ok: true, items: parseBacklog(raw), sections: parseBacklogSections(raw), raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
