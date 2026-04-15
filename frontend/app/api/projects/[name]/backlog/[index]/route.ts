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

// PATCH: toggle checked or update text for item at index
// body: { checked?: boolean, text?: string }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string; index: string }> },
) {
  const { name, index: indexStr } = await params;
  if (!safeName(name)) {
    return Response.json({ error: 'invalid project name' }, { status: 400 });
  }
  const index = parseInt(indexStr, 10);
  if (isNaN(index) || index < 0) {
    return Response.json({ error: 'invalid index' }, { status: 400 });
  }

  const filePath = backlogPath(name);
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: 'backlog not found' }, { status: 404 });
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const items = parseBacklog(raw);
    const item = items.find((it) => it.index === index);
    if (!item) {
      return Response.json({ error: 'item not found' }, { status: 404 });
    }

    const lines = raw.split('\n');

    if (typeof body.checked === 'boolean') {
      const line = lines[item.lineIndex];
      lines[item.lineIndex] = body.checked
        ? line.replace(/^- \[ \]/, '- [x]')
        : line.replace(/^- \[x\]/i, '- [ ]');
    }

    if (typeof body.text === 'string' && body.text.trim()) {
      const line = lines[item.lineIndex];
      const prefix = line.match(/^- \[.\]\s*/)?.[0] ?? '- [ ] ';
      const jobSuffix = line.match(/\s*\(job:[^)]+\)/)?.[0] ?? '';
      lines[item.lineIndex] = `${prefix}${body.text.trim()}${jobSuffix}`;
    }

    const newContent = lines.join('\n');
    fs.writeFileSync(filePath, newContent, 'utf-8');
    return Response.json({ ok: true, items: parseBacklog(newContent), sections: parseBacklogSections(newContent), raw: newContent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
