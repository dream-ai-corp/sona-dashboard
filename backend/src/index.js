require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3011;
const SONA_API = process.env.SONA_API_URL || "http://host.docker.internal:8080";
const DB_PATH = process.env.DB_PATH || "/data/sona-dashboard.db";

// ── SQLite setup ─────────────────────────────────────────────────────────────
const Database = require("better-sqlite3");
let db;
try {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
} catch (err) {
  console.error("Failed to open SQLite DB:", err.message);
  process.exit(1);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    goal TEXT,
    status TEXT,
    project TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    result TEXT,
    exit_code INTEGER,
    mtime INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    channel TEXT DEFAULT 'discord',
    timestamp INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    goal TEXT,
    status TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    job_id TEXT REFERENCES jobs(id)
  );
`);

// Prepared statements
const upsertJob = db.prepare(`
  INSERT INTO jobs (id, goal, status, project, started_at, completed_at, result, exit_code, mtime)
  VALUES (@id, @goal, @status, @project, @started_at, @completed_at, @result, @exit_code, @mtime)
  ON CONFLICT(id) DO UPDATE SET
    goal       = COALESCE(excluded.goal, jobs.goal),
    status     = CASE WHEN jobs.status IN ('done', 'failed', 'error') THEN jobs.status ELSE excluded.status END,
    project    = COALESCE(excluded.project, jobs.project),
    started_at = COALESCE(excluded.started_at, jobs.started_at),
    completed_at = COALESCE(excluded.completed_at, jobs.completed_at),
    result     = COALESCE(excluded.result, jobs.result),
    exit_code  = COALESCE(excluded.exit_code, jobs.exit_code),
    mtime      = excluded.mtime
`);

// ── SSE client registries ─────────────────────────────────────────────────────
const jobSseClients = new Set();
const conversationSseClients = new Set();
const statusSseClients = new Set();

function sseWrite(res, data) {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastJobs() {
  if (jobSseClients.size === 0) return;
  const rows = db.prepare(
    "SELECT * FROM jobs ORDER BY COALESCE(mtime, created_at) DESC LIMIT 100"
  ).all();
  for (const res of jobSseClients) sseWrite(res, rows);
}

function broadcastConversations() {
  if (conversationSseClients.size === 0) return;
  const rows = db.prepare(
    "SELECT * FROM conversations ORDER BY timestamp ASC LIMIT 200"
  ).all();
  for (const res of conversationSseClients) sseWrite(res, rows);
}

function broadcastStatus(data) {
  if (statusSseClients.size === 0) return;
  for (const res of statusSseClients) sseWrite(res, data);
}

function addSseClient(set, res, req) {
  set.add(res);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": heartbeat\n\n");
    else { clearInterval(heartbeat); set.delete(res); }
  }, 25000);
  req.on("close", () => { clearInterval(heartbeat); set.delete(res); });
}

function sseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

// ── Status cache + polling ────────────────────────────────────────────────────
let cachedStatus = { daemon: null, brain: null, voice: null };

async function refreshStatus() {
  try {
    const [daemon, brain, voice] = await Promise.allSettled([
      fetch(`${SONA_API}/api/daemon`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
      fetch(`${SONA_API}/api/brain`,  { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
      fetch(`${SONA_API}/api/voice`,  { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
    ]);
    const next = {
      daemon: daemon.status === "fulfilled" ? daemon.value : cachedStatus.daemon,
      brain:  brain.status  === "fulfilled" ? brain.value  : cachedStatus.brain,
      voice:  voice.status  === "fulfilled" ? voice.value  : cachedStatus.voice,
    };
    cachedStatus = next;
    broadcastStatus(next);
  } catch { /* ignore transient failures */ }
}

// Refresh status every 15 seconds — ONE server-side poll serves all SSE clients
setInterval(refreshStatus, 15000);

// ── Filesystem sync ───────────────────────────────────────────────────────────
function parseJobDir(jobId, dirPath, project) {
  const resultPath = path.join(dirPath, "result.json");
  const goalPath = path.join(dirPath, "goal.md");

  let goal = null;
  if (fs.existsSync(goalPath)) {
    try { goal = fs.readFileSync(goalPath, "utf-8").trim().slice(0, 500); } catch {}
  }

  let mtime = 0;
  try { mtime = Math.max(
    fs.existsSync(goalPath) ? fs.statSync(goalPath).mtimeMs : 0,
    fs.existsSync(resultPath) ? fs.statSync(resultPath).mtimeMs : 0
  ); } catch {}

  if (fs.existsSync(resultPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
      if (!goal && raw.goal) goal = String(raw.goal).slice(0, 500);

      let status = raw.status;
      if (!status) {
        if (raw.success === true || raw.code === 0 || raw.exitCode === 0) status = "done";
        else if (raw.success === false || (raw.code != null && raw.code !== 0)) status = "error";
        else status = "done";
      }

      return {
        id: jobId, goal, status, project: project || null,
        started_at: raw.startedAt || null, completed_at: raw.completedAt || null,
        result: (raw.result ?? raw.summary ?? raw.output ?? null),
        exit_code: raw.exitCode ?? raw.code ?? null, mtime,
      };
    } catch { /* malformed result.json */ }
  }

  // No result.json — check PID, then fall back to mtime orphan detection
  if (goal) {
    // PID check: if pid.txt exists and process is dead, mark as error immediately
    const pidPath = path.join(dirPath, "pid.txt");
    if (fs.existsSync(pidPath)) {
      try {
        const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
        if (pid > 0) {
          let alive = false;
          try { process.kill(pid, 0); alive = true; } catch {}
          if (!alive) {
            return {
              id: jobId, goal, status: "error",
              project: project || null, started_at: null, completed_at: null,
              result: "Process exited without writing result.json", exit_code: null, mtime,
            };
          }
        }
      } catch {}
    }
    // Mtime-based orphan fallback (no pid.txt or PID appeared alive)
    const ORPHAN_MS = 10 * 60 * 1000;
    const logPath = path.join(dirPath, "log.ndjson");
    let logMtime = 0;
    try { logMtime = fs.existsSync(logPath) ? fs.statSync(logPath).mtimeMs : 0; } catch {}
    const dirMtime = logMtime || mtime;
    const isOrphaned = dirMtime > 0 && (Date.now() - dirMtime) > ORPHAN_MS;
    return {
      id: jobId, goal, status: isOrphaned ? "error" : "running",
      project: project || null, started_at: null, completed_at: null,
      result: null, exit_code: null, mtime,
    };
  }
  return null;
}

function syncFromFilesystem() {
  const syncJob = db.transaction((jobs) => { for (const job of jobs) upsertJob.run(job); });
  const jobs = [];

  const archiveDir = "/home/beniben/sona-workspace/projects/_archive/jobs";
  if (fs.existsSync(archiveDir)) {
    for (const entry of fs.readdirSync(archiveDir)) {
      const dirPath = path.join(archiveDir, entry);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      const job = parseJobDir(entry, dirPath, "_archive");
      if (job) jobs.push(job);
    }
  }

  const projectsDir = "/home/beniben/sona-workspace/projects";
  if (fs.existsSync(projectsDir)) {
    for (const proj of fs.readdirSync(projectsDir)) {
      if (proj === "_archive") continue;
      const jobsDir = path.join(projectsDir, proj, "jobs");
      if (!fs.existsSync(jobsDir)) continue;
      for (const entry of fs.readdirSync(jobsDir)) {
        const dirPath = path.join(jobsDir, entry);
        if (!fs.statSync(dirPath).isDirectory()) continue;
        const job = parseJobDir(entry, dirPath, proj);
        if (job) jobs.push(job);
      }
    }
  }

  const independentDir = "/home/beniben/sona-workspace/independent/jobs";
  if (fs.existsSync(independentDir)) {
    for (const entry of fs.readdirSync(independentDir)) {
      const dirPath = path.join(independentDir, entry);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      const job = parseJobDir(entry, dirPath, "independent");
      if (job) jobs.push(job);
    }
  }

  if (jobs.length > 0) syncJob(jobs);

  // Mark any 'running' jobs not found on filesystem as error (zombie jobs)
  const foundIds = new Set(jobs.map(j => j.id));
  const zombies = db.prepare("SELECT id FROM jobs WHERE status = 'running'").all();
  const markError = db.prepare("UPDATE jobs SET status = 'error', result = 'Job directory no longer exists' WHERE id = ?");
  for (const z of zombies) {
    if (!foundIds.has(z.id)) {
      markError.run(z.id);
      console.log(`[sync] zombie job ${z.id} marked error`);
    }
  }

  console.log(`[sync] upserted ${jobs.length} jobs`);
  // Broadcast new job state to all connected SSE clients
  broadcastJobs();
  return jobs.length;
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, db: DB_PATH }));

// ── Jobs ──────────────────────────────────────────────────────────────────────
app.get("/api/jobs", (_req, res) => {
  const rows = db.prepare(
    "SELECT * FROM jobs ORDER BY COALESCE(mtime, created_at) DESC LIMIT 100"
  ).all();
  res.json(rows);
});

app.get("/api/jobs/running", (_req, res) => {
  const rows = db.prepare("SELECT * FROM jobs WHERE status = 'running' ORDER BY COALESCE(mtime, created_at) DESC").all();
  res.json(rows);
});

// SSE stream — event-driven via broadcastJobs(), must come before /:id
app.get("/api/jobs/stream", (req, res) => {
  sseHeaders(res);
  // Send initial snapshot immediately
  const rows = db.prepare(
    "SELECT * FROM jobs ORDER BY COALESCE(mtime, created_at) DESC LIMIT 100"
  ).all();
  sseWrite(res, rows);
  addSseClient(jobSseClients, res, req);
});

app.get("/api/jobs/sync", (_req, res) => {
  const n = syncFromFilesystem();
  res.json({ synced: n });
});

app.post("/api/jobs/sync", (_req, res) => {
  const n = syncFromFilesystem();
  res.json({ synced: n });
});

app.get("/api/jobs/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

app.get("/api/jobs/:id/log", (req, res) => {
  const id = req.params.id;
  if (!id || id.includes("..")) return res.status(400).json({ error: "invalid id" });

  const candidates = [
    `/home/beniben/sona-workspace/independent/jobs/${id}/log.ndjson`,
    `/home/beniben/sona-workspace/projects/_archive/jobs/${id}/log.ndjson`,
  ];
  const projectsDir = "/home/beniben/sona-workspace/projects";
  if (fs.existsSync(projectsDir)) {
    for (const proj of fs.readdirSync(projectsDir)) {
      if (proj === "_archive") continue;
      candidates.push(`${projectsDir}/${proj}/jobs/${id}/log.ndjson`);
    }
  }

  const logPath = candidates.find((p) => fs.existsSync(p));
  if (!logPath) return res.status(404).json({ lines: [], error: "log not found" });

  try {
    const raw = fs.readFileSync(logPath, "utf-8");
    const lines = raw.split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
    res.json({ lines });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create job (called by sona-agent when spawning)
app.post("/api/jobs", (req, res) => {
  const { id, goal, status, project, started_at } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  db.prepare(`INSERT OR REPLACE INTO jobs (id, goal, status, project, started_at, mtime, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, goal || null, status || "running", project || "independent",
         started_at || Date.now(), Date.now(), Date.now());
  broadcastJobs();
  res.json({ ok: true });
});

// Update job status (called by sona-agent on completion/error)
app.patch("/api/jobs/:id", (req, res) => {
  const { status, completed_at, result } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });
  db.prepare(`UPDATE jobs SET status=?, completed_at=?, result=?, mtime=? WHERE id=?`)
    .run(status, completed_at || Date.now(), result ? JSON.stringify(result) : null,
         Date.now(), req.params.id);
  broadcastJobs();
  res.json({ ok: true });
});

app.delete("/api/jobs/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const upstream = await fetch(`${SONA_API}/api/job/${id}/kill`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    const data = await upstream.json().catch(() => ({}));
    db.prepare("UPDATE jobs SET status = 'killed' WHERE id = ?").run(id);
    broadcastJobs();
    res.status(upstream.status).json(data);
  } catch (err) {
    db.prepare("UPDATE jobs SET status = 'killed' WHERE id = ?").run(id);
    broadcastJobs();
    res.status(503).json({ error: err.message });
  }
});

// ── Agents ────────────────────────────────────────────────────────────────────
app.get("/api/agents", (_req, res) => {
  const rows = db.prepare(`
    SELECT * FROM jobs
    ORDER BY
      CASE WHEN status = 'running' THEN 0
           WHEN status = 'in_progress' THEN 0
           ELSE 1 END ASC,
      COALESCE(mtime, created_at) DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// ── Conversations ─────────────────────────────────────────────────────────────
app.get("/api/conversations", (_req, res) => {
  const rows = db.prepare(
    "SELECT * FROM conversations ORDER BY timestamp ASC LIMIT 200"
  ).all();
  res.json(rows);
});

// SSE stream for conversations — event-driven
app.get("/api/conversations/stream", (req, res) => {
  sseHeaders(res);
  const rows = db.prepare(
    "SELECT * FROM conversations ORDER BY timestamp ASC LIMIT 200"
  ).all();
  sseWrite(res, rows);
  addSseClient(conversationSseClients, res, req);
});

app.post("/api/conversations", (req, res) => {
  const { role, content, channel, timestamp } = req.body;
  if (!role || !content) return res.status(400).json({ error: "role and content required" });
  const ts = timestamp ? Number(timestamp) : Date.now();
  const result = db.prepare(
    "INSERT INTO conversations (role, content, channel, timestamp) VALUES (?, ?, ?, ?)"
  ).run(role, content, channel || "discord", ts);
  broadcastConversations();
  res.json({ id: result.lastInsertRowid });
});

app.delete("/api/conversations", (_req, res) => {
  db.prepare("DELETE FROM conversations").run();
  broadcastConversations();
  res.json({ ok: true });
});

// ── System proxies ────────────────────────────────────────────────────────────
async function proxyGet(url, res) {
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
}

app.get("/api/system", (_req, res) => proxyGet(`${SONA_API}/api/daemon`, res));
app.get("/api/brain",  (_req, res) => proxyGet(`${SONA_API}/api/brain`, res));
app.get("/api/voice",  (_req, res) => proxyGet(`${SONA_API}/api/voice`, res));

// SSE stream for status (daemon + brain + voice) — server polls sona-agent, pushes to clients
app.get("/api/status/stream", async (req, res) => {
  sseHeaders(res);
  // Send cached state immediately, then kick off a fresh fetch
  sseWrite(res, cachedStatus);
  addSseClient(statusSseClients, res, req);
  // Eagerly refresh if cache is empty
  if (!cachedStatus.daemon && !cachedStatus.brain) {
    refreshStatus().catch(() => {});
  }
});

// ── Backlog helpers (ported from frontend lib/backlog.ts) ─────────────────────
function parseBacklog(content) {
  const items = [];
  const lines = content.split('\n');
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const checked = /^- \[x\]/i.test(line);
    const unchecked = /^- \[ \]/.test(line);
    if (!checked && !unchecked) continue;
    let text = line.replace(/^- \[.\]\s*/, '').replace(/\s*\(job:[^)]+\)/, '').trim();
    const priorityMatch = text.match(/^\[(P[123])\]\s*/);
    const priority = priorityMatch ? priorityMatch[1] : null;
    if (priorityMatch) text = text.slice(priorityMatch[0].length);
    items.push({ index: idx++, lineIndex: i, text, checked, priority });
  }
  return items;
}

function parseBacklogSections(content) {
  const sections = [];
  const lines = content.split('\n');
  let current = { header: null, level: 0, items: [] };
  let itemIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hm = line.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      if (current.header !== null || current.items.length > 0) sections.push(current);
      current = { header: hm[2].trim(), level: hm[1].length, items: [] };
      continue;
    }
    const checked = /^- \[x\]/i.test(line);
    const unchecked = /^- \[ \]/.test(line);
    if (!checked && !unchecked) continue;
    let text = line.replace(/^- \[.\]\s*/, '').replace(/\s*\(job:[^)]+\)/, '').trim();
    const priorityMatch = text.match(/^\[(P[123])\]\s*/);
    const priority = priorityMatch ? priorityMatch[1] : null;
    if (priorityMatch) text = text.slice(priorityMatch[0].length);
    current.items.push({ index: itemIdx++, lineIndex: i, text, checked, priority });
  }
  if (current.header !== null || current.items.length > 0) sections.push(current);
  return sections;
}

const PROJECTS_DIR = "/home/beniben/sona-workspace/projects";
const ACTIVITY_LOG = "/home/beniben/sona-workspace/activity-log.ndjson";
const VALID_STATUSES = ['active', 'paused', 'archived'];

function readProjectMeta(name) {
  const dir = path.join(PROJECTS_DIR, name);
  const projectJson = path.join(dir, "project.json");
  const hasBacklog = fs.existsSync(path.join(dir, "backlog.md"));
  let raw = {};
  if (fs.existsSync(projectJson)) {
    try { raw = JSON.parse(fs.readFileSync(projectJson, "utf-8")); } catch {}
  }
  return {
    id: name,
    name: raw.name ?? name,
    description: raw.description,
    status: raw.status ?? 'active',
    tags: raw.tags,
    services: raw.services,
    git: raw.git,
    path: raw.path,
    hasBacklog,
  };
}

// ── Projects ──────────────────────────────────────────────────────────────────
app.get("/api/projects", (_req, res) => {
  const projects = [];
  if (fs.existsSync(PROJECTS_DIR)) {
    for (const name of fs.readdirSync(PROJECTS_DIR)) {
      if (name === "_archive") continue;
      const dir = path.join(PROJECTS_DIR, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      projects.push(readProjectMeta(name));
    }
  }
  res.json({ projects });
});

app.get("/api/projects/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const dir = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return res.status(404).json({ error: "project not found" });
  }
  res.json(readProjectMeta(name));
});

// ── Project status ────────────────────────────────────────────────────────────
app.get("/api/projects/:name/status", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const dir = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return res.status(404).json({ error: "project not found" });
  }
  const jsonPath = path.join(dir, "project.json");
  let raw = {};
  if (fs.existsSync(jsonPath)) {
    try { raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")); } catch {}
  }
  res.json({ status: raw.status ?? 'active' });
});

app.patch("/api/projects/:name/status", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const newStatus = typeof req.body.status === 'string' ? req.body.status.toLowerCase() : null;
  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  const dir = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return res.status(404).json({ error: "project not found" });
  }
  const jsonPath = path.join(dir, "project.json");
  let raw = {};
  if (fs.existsSync(jsonPath)) {
    try { raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")); } catch {
      return res.status(500).json({ error: "failed to parse project.json" });
    }
  }
  raw.status = newStatus;
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
  } catch {
    return res.status(500).json({ error: "failed to write project.json" });
  }
  res.json({ status: newStatus });
});

// ── Project backlog ───────────────────────────────────────────────────────────
app.get("/api/projects/:name/backlog", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const filePath = path.join(PROJECTS_DIR, name, "backlog.md");
  if (!fs.existsSync(filePath)) return res.json({ items: [], sections: [], raw: '' });
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    res.json({ items: parseBacklog(raw), sections: parseBacklogSections(raw), raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/projects/:name/backlog", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  if (typeof req.body.text !== 'string' || !req.body.text.trim()) {
    return res.status(400).json({ error: "text must be a non-empty string" });
  }
  const filePath = path.join(PROJECTS_DIR, name, "backlog.md");
  try {
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : '';
    const newContent = existing
      + (existing.endsWith('\n') || existing === '' ? '' : '\n')
      + `- [ ] ${req.body.text.trim()}\n`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, newContent, "utf-8");
    const raw = fs.readFileSync(filePath, "utf-8");
    res.json({ ok: true, items: parseBacklog(raw), sections: parseBacklogSections(raw), raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/projects/:name/backlog/:index", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const index = parseInt(req.params.index, 10);
  if (isNaN(index) || index < 0) return res.status(400).json({ error: "invalid index" });
  const filePath = path.join(PROJECTS_DIR, name, "backlog.md");
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "backlog not found" });
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const items = parseBacklog(raw);
    const item = items.find((it) => it.index === index);
    if (!item) return res.status(404).json({ error: "item not found" });
    const lines = raw.split('\n');
    if (typeof req.body.checked === 'boolean') {
      const line = lines[item.lineIndex];
      lines[item.lineIndex] = req.body.checked
        ? line.replace(/^- \[ \]/, '- [x]')
        : line.replace(/^- \[x\]/i, '- [ ]');
    }
    if (typeof req.body.text === 'string' && req.body.text.trim()) {
      const line = lines[item.lineIndex];
      const cbPrefix = (line.match(/^- \[.\]\s*/)?.[0]) ?? '- [ ] ';
      const priorityTag = (line.slice(cbPrefix.length).match(/^\[P[123]\]\s*/)?.[0]) ?? '';
      const jobSuffix = (line.match(/\s*\(job:[^)]+\)/)?.[0]) ?? '';
      lines[item.lineIndex] = `${cbPrefix}${priorityTag}${req.body.text.trim()}${jobSuffix}`;
    }
    if ('priority' in req.body) {
      const line = lines[item.lineIndex];
      const cbPrefix = (line.match(/^- \[.\]\s*/)?.[0]) ?? '- [ ] ';
      const rest = line.slice(cbPrefix.length).replace(/^\[P[123]\]\s*/, '');
      const newPriority = req.body.priority;
      if (newPriority && ['P1', 'P2', 'P3'].includes(newPriority)) {
        lines[item.lineIndex] = `${cbPrefix}[${newPriority}] ${rest}`;
      } else {
        lines[item.lineIndex] = `${cbPrefix}${rest}`;
      }
    }
    const newContent = lines.join('\n');
    fs.writeFileSync(filePath, newContent, "utf-8");
    res.json({ ok: true, items: parseBacklog(newContent), sections: parseBacklogSections(newContent), raw: newContent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Project brainstorm ────────────────────────────────────────────────────────
const BRAINSTORM_TEMPLATE = (name) => `# Brainstorm — ${name}

> Zone de réflexion libre. Les idées ici ne sont pas encore validées. 
> Une fois discutées avec Pierre, elles partent dans backlog.md avec une priorité.

## Idées en attente de discussion

<!-- Ajouter les idées ici. Format suggéré: -->
<!-- - Idée courte — contexte ou motivation -->

## Idées approuvées → à déplacer dans le backlog

<!-- Pierre approuve une idée ici avant qu'elle parte dans le backlog -->

## Idées rejetées / en pause

<!-- Garder la trace des idées qu'on a décidé de ne pas faire pour l'instant -->
`;

app.get("/api/projects/:name/brainstorm", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const filePath = path.join(PROJECTS_DIR, name, "brainstorm.md");
  if (!fs.existsSync(filePath)) return res.json({ raw: '', exists: false });
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    res.json({ raw, exists: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/projects/:name/brainstorm", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const { idea } = req.body;
  if (typeof idea !== "string" || !idea.trim()) {
    return res.status(400).json({ error: "idea must be a non-empty string" });
  }
  const filePath = path.join(PROJECTS_DIR, name, "brainstorm.md");
  try {
    let content = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, "utf-8")
      : BRAINSTORM_TEMPLATE(name);
    const marker = "## Idées en attente de discussion";
    const nextSection = "## Idées approuvées";
    const markerIdx = content.indexOf(marker);
    if (markerIdx === -1) {
      content = content + `\n- ${idea.trim()}\n`;
    } else {
      const afterMarker = content.indexOf(nextSection, markerIdx + marker.length);
      const insertPos = afterMarker === -1 ? content.length : afterMarker;
      const before = content.slice(0, insertPos).trimEnd();
      const after = content.slice(insertPos);
      content = before + `\n- ${idea.trim()}\n\n` + after;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    res.json({ ok: true, raw: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/projects/:name/brainstorm/promote", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const { idea, priority = "P2" } = req.body;
  if (typeof idea !== "string" || !idea.trim()) {
    return res.status(400).json({ error: "idea must be a non-empty string" });
  }
  if (!["P1", "P2", "P3"].includes(priority)) {
    return res.status(400).json({ error: "priority must be P1, P2, or P3" });
  }
  const backlogPath = path.join(PROJECTS_DIR, name, "backlog.md");
  if (!fs.existsSync(backlogPath)) {
    return res.status(404).json({ error: "backlog not found for project" });
  }
  try {
    const existing = fs.readFileSync(backlogPath, "utf-8");
    const newLine = `- [ ] [${priority}] ${idea.trim()}`;
    const newContent = existing.trimEnd() + "\n" + newLine + "\n";
    fs.writeFileSync(backlogPath, newContent, "utf-8");
    res.json({ ok: true, added: newLine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Project jobs ──────────────────────────────────────────────────────────────
app.get("/api/projects/:name/jobs", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const jobsDir = path.join(PROJECTS_DIR, name, "jobs");
  if (!fs.existsSync(jobsDir)) return res.json({ jobs: [] });
  try {
    const entries = fs.readdirSync(jobsDir);
    const jobs = entries
      .filter((e) => fs.statSync(path.join(jobsDir, e)).isDirectory())
      .map((e) => parseJobDir(e, path.join(jobsDir, e), name))
      .filter(Boolean)
      .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Project sprints ───────────────────────────────────────────────────────────
function readSprints(name) {
  const filePath = path.join(PROJECTS_DIR, name, "sprints.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data.sprints ?? [];
  } catch { return []; }
}

function writeSprints(name, sprints) {
  const filePath = path.join(PROJECTS_DIR, name, "sprints.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ sprints }, null, 2), "utf-8");
}

app.get("/api/projects/:name/sprints", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  res.json({ sprints: readSprints(name) });
});

app.post("/api/projects/:name/sprints", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const body = req.body;
  const sprints = readSprints(name);
  const newSprint = {
    id: `sprint-${Date.now()}`,
    name: body.name ?? 'New Sprint',
    goal: body.goal ?? '',
    startDate: body.startDate ?? '',
    endDate: body.endDate ?? '',
    status: body.status ?? 'planning',
  };
  sprints.push(newSprint);
  writeSprints(name, sprints);
  res.json({ sprints });
});

app.patch("/api/projects/:name/sprints/:sprintId", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { sprintId } = req.params;
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const sprints = readSprints(name);
  const idx = sprints.findIndex((s) => s.id === sprintId);
  if (idx === -1) return res.status(404).json({ error: "sprint not found" });
  sprints[idx] = { ...sprints[idx], ...req.body, id: sprintId };
  writeSprints(name, sprints);
  res.json({ sprints });
});

app.delete("/api/projects/:name/sprints/:sprintId", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { sprintId } = req.params;
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const sprints = readSprints(name).filter((s) => s.id !== sprintId);
  writeSprints(name, sprints);
  res.json({ sprints });
});

// ── Project brief ─────────────────────────────────────────────────────────────
app.get("/api/projects/:name/brief", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const briefPath = path.join(PROJECTS_DIR, name, "brief.md");
  const content = fs.existsSync(briefPath) ? fs.readFileSync(briefPath, "utf-8") : '';
  res.json({ content });
});

app.put("/api/projects/:name/brief", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const briefPath = path.join(PROJECTS_DIR, name, "brief.md");
  try {
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.writeFileSync(briefPath, req.body.content ?? '', "utf-8");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Activity log ──────────────────────────────────────────────────────────────
app.get("/api/activity", (_req, res) => {
  try {
    const raw = fs.readFileSync(ACTIVITY_LOG, "utf-8");
    const events = raw.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    res.json(events.slice(-500));
  } catch {
    res.json([]);
  }
});

// SSE activity stream — tails activity-log.ndjson with fs.watch
app.get("/api/activity/stream", (req, res) => {
  sseHeaders(res);

  let closed = false;
  let watcher = null;
  let debounceTimer = null;

  const cleanup = () => {
    closed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    try { watcher?.close(); } catch {}
  };
  req.on("close", cleanup);

  const readEvents = (limit = 200) => {
    try {
      const raw = fs.readFileSync(ACTIVITY_LOG, "utf-8");
      return raw.split('\n').filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean).slice(-limit);
    } catch { return []; }
  };

  const pushEvents = () => {
    if (!closed && !res.writableEnded) {
      try { res.write(`data: ${JSON.stringify(readEvents(200))}\n\n`); } catch { cleanup(); }
    }
  };

  const scheduleDebounce = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(pushEvents, 300);
  };

  // Send initial snapshot
  pushEvents();

  // Watch the activity log file for changes
  try {
    if (fs.existsSync(ACTIVITY_LOG)) {
      watcher = fs.watch(ACTIVITY_LOG, () => scheduleDebounce());
      watcher.on('error', () => {});
    } else {
      const pollTimer = setInterval(() => {
        if (closed) { clearInterval(pollTimer); return; }
        if (fs.existsSync(ACTIVITY_LOG)) {
          clearInterval(pollTimer);
          watcher = fs.watch(ACTIVITY_LOG, () => scheduleDebounce());
        }
        pushEvents();
      }, 3000);
    }
  } catch { /* fs.watch not supported */ }
});

// ── Start ─────────────────────────────────────────────────────────────────────
syncFromFilesystem();

// Periodic filesystem sync every 30 seconds — also broadcasts to job SSE clients
cron.schedule("*/30 * * * * *", () => {
  try { syncFromFilesystem(); } catch (err) { console.error("[sync error]", err.message); }
});

// Kick off initial status fetch
refreshStatus().catch(() => {});

app.listen(PORT, () => {
  console.log(`Sona dashboard backend running on port ${PORT}`);
  console.log(`  DB: ${DB_PATH}`);
  console.log(`  Upstream Sona API: ${SONA_API}`);
});
