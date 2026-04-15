import { readFile } from "node:fs/promises";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await readFile("/home/beniben/sona-workspace/activity-log.ndjson", "utf8");
    const events = raw
      .split("\n")
      .filter(Boolean)
      .map((line: string) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
    return Response.json(events.slice(-500));
  } catch {
    return Response.json([]);
  }
}
