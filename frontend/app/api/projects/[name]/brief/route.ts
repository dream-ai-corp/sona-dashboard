import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
const PROJECTS_DIR = '/home/beniben/sona-workspace/projects';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const briefPath = path.join(PROJECTS_DIR, name, 'brief.md');
  const content = fs.existsSync(briefPath) ? fs.readFileSync(briefPath, 'utf-8') : '';
  return Response.json({ content });
}

export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { content } = await req.json() as { content: string };
  const briefPath = path.join(PROJECTS_DIR, name, 'brief.md');
  fs.mkdirSync(path.dirname(briefPath), { recursive: true });
  fs.writeFileSync(briefPath, content ?? '', 'utf-8');
  return Response.json({ ok: true });
}
