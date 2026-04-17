export const dynamic = 'force-dynamic';

import { promises as fs } from 'fs';
import path from 'path';

const FILE_PATH = '/home/beniben/sona-workspace/brainstorm-general.md';

export async function GET() {
  try {
    let raw = '';
    let exists = false;
    try {
      raw = await fs.readFile(FILE_PATH, 'utf-8');
      exists = true;
    } catch {
      exists = false;
    }
    return Response.json({ raw, exists });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'read error';
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idea: string = (body.idea ?? '').trim();
    if (!idea) {
      return Response.json({ error: 'idea is required' }, { status: 400 });
    }

    let existing = '';
    try {
      existing = await fs.readFile(FILE_PATH, 'utf-8');
    } catch {
      existing = `# Brainstorm — Nouveaux projets\n\n`;
    }

    const line = `- ${idea}`;
    const newContent = existing.endsWith('\n')
      ? existing + line + '\n'
      : existing + '\n' + line + '\n';

    await fs.writeFile(FILE_PATH, newContent, 'utf-8');
    return Response.json({ raw: newContent, exists: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'write error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
