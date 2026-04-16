import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const NOTES_DIR = '/home/beniben/sona-workspace/projects/notes';

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  if (!content.startsWith('---')) return { frontmatter: {}, body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: content };
  const fm = content.slice(4, end).trim();
  const body = content.slice(end + 4).trim();
  const frontmatter: Record<string, string> = {};
  for (const line of fm.split('\n')) {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { frontmatter, body };
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const safeId = path.basename(id);
  const filePath = path.join(NOTES_DIR, `${safeId}.md`);
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  const { frontmatter, body } = parseFrontmatter(content);
  return Response.json({ id: safeId, content: body, frontmatter, updatedAt: stat.mtimeMs });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const safeId = path.basename(id);
  const filePath = path.join(NOTES_DIR, `${safeId}.md`);
  const body = await req.json() as { content?: string; associatedProject?: string };
  const { content = '', associatedProject } = body;

  let fileContent = '';
  if (associatedProject) {
    fileContent += `---\nassociatedProject: ${associatedProject}\n---\n\n`;
  }
  fileContent += content;

  fs.mkdirSync(NOTES_DIR, { recursive: true });
  fs.writeFileSync(filePath, fileContent, 'utf-8');
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const safeId = path.basename(id);
  const filePath = path.join(NOTES_DIR, `${safeId}.md`);
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  fs.unlinkSync(filePath);
  return Response.json({ ok: true });
}
