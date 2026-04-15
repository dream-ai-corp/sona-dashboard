import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const PROJECTS_DIR = '/home/beniben/sona-workspace/projects';

interface RawProjectJson {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  tags?: string[];
  services?: Array<{ name: string; port: number; url?: string; container?: string }>;
  git?: { remote?: string };
  path?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  tags?: string[];
  services?: Array<{ name: string; port: number; url?: string; container?: string }>;
  git?: { remote?: string };
  hasBacklog: boolean;
}

function readProject(id: string, dir: string): Project {
  const jsonPath = path.join(dir, 'project.json');
  const hasBacklog = fs.existsSync(path.join(dir, 'backlog.md'));
  try {
    if (fs.existsSync(jsonPath)) {
      const raw: RawProjectJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      return {
        id,
        name: raw.name ?? id,
        description: raw.description,
        status: raw.status ?? 'active',
        tags: raw.tags,
        services: raw.services,
        git: raw.git,
        hasBacklog,
      };
    }
  } catch {
    // ignore parse errors
  }
  return { id, name: id, status: 'active', hasBacklog };
}

export async function GET() {
  try {
    const entries = fs
      .readdirSync(PROJECTS_DIR)
      .filter(
        (e) =>
          e !== '_archive' &&
          fs.statSync(path.join(PROJECTS_DIR, e)).isDirectory(),
      );
    const projects = entries.map((name) =>
      readProject(name, path.join(PROJECTS_DIR, name)),
    );
    return Response.json({ projects });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
