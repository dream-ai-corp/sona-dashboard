import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const NOTES_DIR = '/home/beniben/sona-workspace/projects/notes';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled';
}

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

function getTitle(body: string, filename: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : filename;
}

function getPreview(body: string): string {
  const stripped = body
    .replace(/^#{1,6}\s+.+$/m, '')
    .replace(/[*_`#>\[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return stripped.slice(0, 150);
}

export async function GET() {
  try {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
    const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith('.md'));
    const notes = files.map((filename) => {
      const id = filename.replace(/\.md$/, '');
      const filePath = path.join(NOTES_DIR, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const stat = fs.statSync(filePath);
      const { frontmatter, body } = parseFrontmatter(content);
      const title = getTitle(body, id);
      const preview = getPreview(body);
      return {
        id,
        title,
        preview,
        updatedAt: stat.mtimeMs,
        associatedProject: frontmatter.associatedProject || null,
      };
    });
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    return Response.json(notes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
    const body = await req.json() as { title?: string; content?: string; associatedProject?: string };
    const { title = 'Untitled', content = '', associatedProject } = body;

    let id = slugify(title);
    let filePath = path.join(NOTES_DIR, `${id}.md`);

    if (fs.existsSync(filePath)) {
      id = `${id}-${Date.now()}`;
      filePath = path.join(NOTES_DIR, `${id}.md`);
    }

    let fileContent = '';
    if (associatedProject) {
      fileContent += `---\nassociatedProject: ${associatedProject}\n---\n\n`;
    }
    if (!content.trimStart().startsWith('# ')) {
      fileContent += `# ${title}\n\n`;
    }
    fileContent += content;

    fs.writeFileSync(filePath, fileContent, 'utf-8');
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
