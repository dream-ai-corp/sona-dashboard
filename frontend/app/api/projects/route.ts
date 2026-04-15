import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.SONA_API_URL ?? 'http://host.docker.internal:8080';
  try {
    const res = await fetch(`${apiUrl}/api/projects`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return Response.json(data);
    }
  } catch {
    // fall through to filesystem
  }

  // Filesystem fallback
  const projectsDir = '/home/beniben/sona-workspace/projects';
  try {
    const entries = fs.readdirSync(projectsDir).filter(
      (e) => e !== '_archive' && fs.statSync(path.join(projectsDir, e)).isDirectory()
    );
    const projects = entries.map((name) => ({ id: name, name }));
    return Response.json({ projects, independent: null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
