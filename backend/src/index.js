require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const fetch = require("node-fetch");
const { randomUUID, createHmac } = require("crypto");
const TimeMatcher = require("node-cron/src/time-matcher");
const { runDueJobs } = require("./scheduler.js");
const { consumeQueue } = require("./queue-consumer.js");

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

  CREATE TABLE IF NOT EXISTS recurring_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    goal TEXT NOT NULL,
    schedule TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at INTEGER,
    last_status TEXT,
    next_run_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS openrouter_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS backlog_sprints (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
    status TEXT DEFAULT 'active' CHECK(status IN ('planning','active','paused','done')),
    created_at INTEGER DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS backlog_items (
    id TEXT PRIMARY KEY,
    sprint_id TEXT NOT NULL REFERENCES backlog_sprints(id),
    external_id TEXT,
    text TEXT NOT NULL,
    status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','done')),
    priority TEXT CHECK(priority IN ('P1','P2','P3')),
    branch TEXT,
    assigned_job_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS backlog_acceptance_criteria (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES backlog_items(id),
    text TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','pass','fail')),
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit_reports (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    sprint TEXT,
    item_id TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','pass','partial','fail')),
    detail TEXT,
    created_at INTEGER DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS agent_queue (
    id TEXT PRIMARY KEY,
    item_id TEXT,
    item_text TEXT,
    project_id TEXT NOT NULL,
    sprint_id TEXT,
    priority INTEGER NOT NULL DEFAULT 2,
    status TEXT DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed','cancelled')),
    scheduled_at INTEGER,
    started_at INTEGER,
    completed_at INTEGER,
    agent_job_id TEXT,
    estimated_duration_sec INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
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
    "SELECT * FROM conversations ORDER BY timestamp DESC LIMIT 200"
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
    try { goal = fs.readFileSync(goalPath, "utf-8").trim().slice(0, 2000); } catch {}
  }

  let mtime = 0;
  try { mtime = Math.max(
    fs.existsSync(goalPath) ? fs.statSync(goalPath).mtimeMs : 0,
    fs.existsSync(resultPath) ? fs.statSync(resultPath).mtimeMs : 0
  ); } catch {}

  if (fs.existsSync(resultPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
      if (!goal && raw.goal) goal = String(raw.goal).slice(0, 2000);

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
    // NOTE: the former PID liveness check (process.kill(pid, 0)) was removed
    // because it runs inside the dashboard-backend docker container, which has
    // its OWN PID namespace and cannot see host PIDs. The check always returned
    // "dead" and caused running jobs to be mis-marked as error between the
    // moment they started and the moment result.json appeared on disk. The
    // mtime-based orphan fallback below is the authoritative liveness signal.
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

  // Propagate completion back to the recurring job that spawned this one
  if (status !== "running") {
    const rj = db
      .prepare("SELECT id FROM recurring_jobs WHERE current_job_id = ?")
      .get(req.params.id);
    if (rj) {
      const finalStatus =
        status === "done" || status === "completed" ? "done" : "error";
      db.prepare(
        "UPDATE recurring_jobs SET last_status = ?, current_job_id = NULL WHERE id = ?"
      ).run(finalStatus, rj.id);
    }
  }

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
    "SELECT * FROM conversations ORDER BY timestamp DESC LIMIT 200"
  ).all();
  res.json(rows);
});

// SSE stream for conversations — event-driven
app.get("/api/conversations/stream", (req, res) => {
  sseHeaders(res);
  const rows = db.prepare(
    "SELECT * FROM conversations ORDER BY timestamp DESC LIMIT 200"
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
function extractSubLines(lines, itemLineIndex) {
  const acceptanceCriteria = [];
  let branch = null;
  for (let j = itemLineIndex + 1; j < lines.length; j++) {
    const sub = lines[j];
    if (/^\s{2,}- /.test(sub)) {
      const subText = sub.replace(/^\s+- /, '').trim();
      if (/^Branche\s*:/i.test(subText)) {
        const branchMatch = subText.match(/`([^`]+)`/);
        branch = branchMatch ? branchMatch[1] : subText.replace(/^Branche\s*:\s*/i, '').trim();
      } else if (/^AC\d*/i.test(subText)) {
        acceptanceCriteria.push(subText);
      }
    } else if (sub.trim() === '' || /^[-#]/.test(sub)) {
      break;
    }
  }
  return { acceptanceCriteria, branch };
}

function parseBacklog(content) {
  const items = [];
  const lines = content.split('\n');
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const checked = /^- \[x\]/i.test(line);
    const unchecked = /^- \[ \]/.test(line);
    const inProgress = /^- \[~\]/.test(line);
    const blocked = /^- \[!\]/.test(line);
    if (!checked && !unchecked && !inProgress && !blocked) continue;
    let text = line.replace(/^- \[.\]\s*/, '').replace(/\s*\(job:[^)]+\)/, '').trim();
    const priorityMatch = text.match(/^\[(P[123])\]\s*/);
    const priority = priorityMatch ? priorityMatch[1] : null;
    if (priorityMatch) text = text.slice(priorityMatch[0].length);
    const { acceptanceCriteria, branch } = extractSubLines(lines, i);
    const status = inProgress ? 'in_progress' : blocked ? 'blocked' : checked ? 'done' : 'todo';
    items.push({ index: idx++, lineIndex: i, text, checked, priority, status, acceptanceCriteria, branch });
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
    const { acceptanceCriteria, branch } = extractSubLines(lines, i);
    current.items.push({ index: itemIdx++, lineIndex: i, text, checked, priority, acceptanceCriteria, branch });
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
    urls: raw.urls,
    path: raw.path,
    hasBacklog,
    priority: raw.priority,
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

app.post("/api/projects", (req, res) => {
  const { name, description, features } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) return res.status(400).json({ error: "invalid name" });
  if (slug.includes('..')) return res.status(400).json({ error: "invalid name" });

  const dir = path.join(PROJECTS_DIR, slug);
  if (fs.existsSync(dir)) {
    return res.status(409).json({ error: `project "${slug}" already exists` });
  }

  try {
    fs.mkdirSync(dir, { recursive: true });

    // project.json
    const projectJson = {
      name: name.trim(),
      description: description?.trim() || undefined,
      status: 'active',
      created: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(projectJson, null, 2) + '\n', 'utf-8');

    // briefing.md
    const featuresText = features?.trim()
      ? features.trim().split('\n').filter(Boolean).map(l => `- ${l.trim()}`).join('\n')
      : '- TBD';
    const briefing = `# ${name.trim()} — Briefing

## Description
${description?.trim() || 'TBD'}

## Key Features / Goals
${featuresText}

## Context
Created: ${new Date().toISOString()}

## Acceptance Criteria
- [ ] TBD

## Out of Scope
- TBD
`;
    fs.writeFileSync(path.join(dir, 'briefing.md'), briefing, 'utf-8');

    // backlog.md
    const backlog = `# ${name.trim()} — Backlog

## In Progress
- [ ] Define acceptance criteria (see briefing.md)

## To Do
- [ ] TBD

## Done
`;
    fs.writeFileSync(path.join(dir, 'backlog.md'), backlog, 'utf-8');

    res.status(201).json({ project: readProjectMeta(slug) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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


// ── Project files (list + download) ──────────────────────────────────────────
app.get("/api/projects/:name/files", (req, res) => {
  const name = req.params.name;
  const projDir = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projDir)) return res.status(404).json({ error: "project not found" });

  const EXTENSIONS = new Set([".md", ".txt", ".pdf", ".csv", ".gs"]);
  const EXCLUDED_DIRS = new Set(["node_modules", ".git", "jobs", ".next", "dist", "build", "tests", "dashboard", "__pycache__"]);
  const EXCLUDED_FILES = new Set(["package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "docker-compose.yml", "docker-compose.dev.yml", "Dockerfile", "Dockerfile.dev", "Makefile", ".gitignore", ".env", ".env.example", "README.md"]);
  const files = [];

  function scan(dir, prefix) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = prefix ? prefix + "/" + entry.name : entry.name;
        if (entry.isDirectory()) {
          scan(full, rel);
        } else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && !EXCLUDED_FILES.has(entry.name)) {
          const stat = fs.statSync(full);
          files.push({ name: rel, fullPath: full, size: stat.size, modified: stat.mtimeMs });
        }
      }
    } catch {}
  }
  scan(projDir, "");
  files.sort((a, b) => b.modified - a.modified);
  res.json(files);
});

app.get("/api/projects/:name/files/download", (req, res) => {
  const name = req.params.name;
  const file = String(req.query.file || "");
  if (!file || file.includes("..") || file.startsWith("/")) {
    return res.status(400).json({ error: "invalid file path" });
  }
  const full = path.join(PROJECTS_DIR, name, file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: "file not found" });
  res.setHeader("Content-Disposition", "attachment; filename=\"" + path.basename(file) + "\"");
  res.sendFile(full);
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
app.get("/api/projects/:name/briefing", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.includes("..")) return res.status(400).json({ error: "invalid name" });
  const briefingPath = path.join(PROJECTS_DIR, name, "briefing.md");
  const content = fs.existsSync(briefingPath) ? fs.readFileSync(briefingPath, "utf-8") : '';
  res.json({ content });
});

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


// ── Project leads ─────────────────────────────────────────────────────────────
function getLeadsPath(name) {
  return path.join(PROJECTS_DIR, name, 'leads.json');
}

function readLeads(name) {
  const filePath = getLeadsPath(name);
  if (!fs.existsSync(filePath)) return [];
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return []; }
}

function writeLeads(name, leads) {
  const filePath = getLeadsPath(name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(leads, null, 2), 'utf-8');
}

app.get('/api/projects/:name/leads', (req, res) => {
  const { name } = req.params;
  res.json(readLeads(name));
});

app.post('/api/projects/:name/leads', (req, res) => {
  const { name } = req.params;
  const body = req.body;
  const lead = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    name: body.name ?? '',
    email: body.email ?? '',
    phone: body.phone ?? '',
    linkedinUrl: body.linkedinUrl ?? '',
    notes: body.notes ?? '',
    status: body.status ?? 'new',
  };
  const leads = readLeads(name);
  leads.push(lead);
  writeLeads(name, leads);
  res.status(201).json(lead);
});

app.patch('/api/projects/:name/leads/:id', (req, res) => {
  const { name, id } = req.params;
  const leads = readLeads(name);
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Lead not found' });
  leads[idx] = { ...leads[idx], ...req.body };
  writeLeads(name, leads);
  res.json(leads[idx]);
});

app.delete('/api/projects/:name/leads/:id', (req, res) => {
  const { name, id } = req.params;
  const leads = readLeads(name);
  const filtered = leads.filter((l) => l.id !== id);
  if (filtered.length === leads.length) return res.status(404).json({ error: 'Lead not found' });
  writeLeads(name, filtered);
  res.json({ ok: true });
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

// ── Recurring Jobs ────────────────────────────────────────────────────────────

// Schema migrations — add columns that may not exist in older DB files
for (const col of [
  "ALTER TABLE recurring_jobs ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'custom'",
  "ALTER TABLE recurring_jobs ADD COLUMN start_time TEXT",
  "ALTER TABLE recurring_jobs ADD COLUMN end_time TEXT",
  "ALTER TABLE recurring_jobs ADD COLUMN days_of_week TEXT",
  // tracks the currently in-flight job spawned by this recurring job
  "ALTER TABLE recurring_jobs ADD COLUMN current_job_id TEXT",
]) {
  try { db.exec(col); } catch { /* column already exists */ }
}

/**
 * Compute the next timestamp (ms) at which a cron expression will fire.
 * Uses node-cron's internal TimeMatcher — no extra dependency needed.
 * Iterates minute-by-minute up to 7 days ahead; returns null on any error.
 */
function computeNextRun(schedule, timezone = "UTC") {
  try {
    const matcher = new TimeMatcher(schedule, timezone);
    // Start from the top of the next minute
    const candidate = new Date();
    candidate.setSeconds(0, 0);
    candidate.setTime(candidate.getTime() + 60_000);
    for (let i = 0; i < 10_080; i++) {
      if (matcher.match(candidate)) return candidate.getTime();
      candidate.setTime(candidate.getTime() + 60_000);
    }
    return null;
  } catch {
    return null;
  }
}

// Seed sample recurring jobs once on startup (INSERT OR IGNORE preserves existing rows)
db.transaction(() => {
  const seed = [
    {
      id: "rj-sample-1",
      name: "Daily project sync",
      goal: "Scan all active projects, check their backlog.md for stale [~] items older than 24 h, and post a summary to Discord.",
      schedule: "0 9 * * *",
      timezone: "UTC",
      enabled: 1,
      last_run_at: Date.now() - 3 * 3600_000,
      last_status: "done",
    },
    {
      id: "rj-sample-2",
      name: "Hourly job sweeper",
      goal: "Check for orphaned running jobs (no activity for >10 min) and mark them as error, then broadcast a status update.",
      schedule: "0 * * * *",
      timezone: "UTC",
      enabled: 1,
      last_run_at: Date.now() - 45 * 60_000,
      last_status: "done",
    },
    {
      id: "rj-sample-3",
      name: "Weekly memory digest",
      goal: "Summarise the week's Discord conversations, job completions, and memory updates into a digest and store it in /memory.",
      schedule: "0 8 * * 1",
      timezone: "Europe/Paris",
      enabled: 0,
      last_run_at: Date.now() - 7 * 86400_000,
      last_status: "done",
    },
  ];
  const ins = db.prepare(`
    INSERT OR IGNORE INTO recurring_jobs (id, name, goal, schedule, timezone, enabled, last_run_at, last_status, next_run_at)
    VALUES (@id, @name, @goal, @schedule, @timezone, @enabled, @last_run_at, @last_status, @next_run_at)
  `);
  for (const row of seed) {
    ins.run({ ...row, next_run_at: row.enabled ? computeNextRun(row.schedule, row.timezone) : null });
  }
})();

app.get("/api/recurring-jobs", (_req, res) => {
  const rows = db.prepare(
    "SELECT * FROM recurring_jobs ORDER BY created_at ASC"
  ).all();
  // Re-compute next_run_at in memory so it's always fresh
  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    goal: r.goal,
    schedule: r.schedule,
    timezone: r.timezone,
    scheduleType: r.schedule_type ?? "custom",
    startTime: r.start_time ?? null,
    endTime: r.end_time ?? null,
    daysOfWeek: r.days_of_week ? r.days_of_week.split(",").map(Number) : [],
    enabled: r.enabled === 1,
    lastRunAt: r.last_run_at ?? null,
    lastStatus: r.last_status ?? null,
    nextRunAt: r.enabled ? computeNextRun(r.schedule, r.timezone) : null,
  }));
  res.json(result);
});

app.post("/api/recurring-jobs", (req, res) => {
  const {
    name, goal, schedule, timezone = "UTC", enabled = true,
    scheduleType = "custom", startTime = null, endTime = null, daysOfWeek = null,
  } = req.body ?? {};
  if (!name || !goal || !schedule) {
    return res.status(400).json({ error: "name, goal, and schedule are required" });
  }
  if (!cron.validate(schedule)) {
    return res.status(400).json({ error: "invalid cron expression" });
  }
  const id = randomUUID();
  const enabledInt = enabled ? 1 : 0;
  const nextRunAt = enabledInt ? computeNextRun(schedule, timezone) : null;
  const dowStr = Array.isArray(daysOfWeek) && daysOfWeek.length ? daysOfWeek.join(",") : (daysOfWeek ?? null);
  db.prepare(`
    INSERT INTO recurring_jobs (id, name, goal, schedule, timezone, enabled, next_run_at, schedule_type, start_time, end_time, days_of_week)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, goal, schedule, timezone, enabledInt, nextRunAt, scheduleType, startTime, endTime, dowStr);
  const row = db.prepare("SELECT * FROM recurring_jobs WHERE id = ?").get(id);
  res.status(201).json({
    id: row.id, name: row.name, goal: row.goal,
    schedule: row.schedule, timezone: row.timezone,
    scheduleType: row.schedule_type, startTime: row.start_time, endTime: row.end_time,
    daysOfWeek: row.days_of_week ? row.days_of_week.split(",").map(Number) : [],
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at ?? null,
    lastStatus: row.last_status ?? null,
    nextRunAt,
  });
});

app.delete("/api/recurring-jobs/:id", (req, res) => {
  const { id } = req.params;
  const row = db.prepare("SELECT id FROM recurring_jobs WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "not found" });
  db.prepare("DELETE FROM recurring_jobs WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.post("/api/recurring-jobs/:id/toggle", (req, res) => {
  const { id } = req.params;
  const row = db.prepare("SELECT * FROM recurring_jobs WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "not found" });
  const newEnabled = row.enabled === 1 ? 0 : 1;
  const nextRunAt = newEnabled ? computeNextRun(row.schedule, row.timezone) : null;
  db.prepare(
    "UPDATE recurring_jobs SET enabled = ?, next_run_at = ? WHERE id = ?"
  ).run(newEnabled, nextRunAt, id);
  res.json({ id, enabled: newEnabled === 1, nextRunAt });
});

// Manual trigger — run a recurring job immediately regardless of schedule
app.post("/api/recurring-jobs/:id/run", async (req, res) => {
  const { id } = req.params;
  const row = db.prepare("SELECT * FROM recurring_jobs WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.current_job_id) {
    return res.status(409).json({
      error: "job is already running",
      currentJobId: row.current_job_id,
    });
  }
  try {
    const upstream = await fetch(`${SONA_API}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: row.goal }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return res.status(502).json({
        error: `sona-agent returned HTTP ${upstream.status}: ${text.slice(0, 200)}`,
      });
    }
    const data = await upstream.json();
    const jobId = data.id;
    const now = Date.now();
    db.prepare(
      `UPDATE recurring_jobs
       SET last_run_at = ?, last_status = 'running', current_job_id = ?
       WHERE id = ?`
    ).run(now, jobId, id);
    console.log(`[scheduler] manual run: spawned job ${jobId} for recurring job "${row.name}" (${id})`);
    res.json({ ok: true, jobId });
  } catch (err) {
    console.error(`[scheduler] manual run failed for "${row.name}" (${id}):`, err.message);
    res.status(503).json({ error: err.message });
  }
});

// ── Agent Queue ──────────────────────────────────────────────────────────────

app.get("/api/queue", (_req, res) => {
  const rows = db.prepare(
    "SELECT * FROM agent_queue ORDER BY sort_order ASC, priority ASC, created_at ASC"
  ).all();
  res.json(rows);
});

app.post("/api/queue/add", (req, res) => {
  const { item_id, item_text, project_id, sprint_id, priority = 2 } = req.body ?? {};
  if (!project_id) {
    return res.status(400).json({ error: "project_id is required" });
  }
  const id = randomUUID();
  const maxOrder = db.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM agent_queue WHERE status = 'queued'"
  ).get();
  // Estimate duration from past jobs of this project
  const avg = db.prepare(
    `SELECT AVG(completed_at - started_at) / 1000 AS avg_sec
     FROM jobs
     WHERE project = ? AND status = 'done' AND started_at IS NOT NULL AND completed_at IS NOT NULL`
  ).get(project_id);
  const estimatedDuration = avg?.avg_sec ? Math.round(avg.avg_sec) : null;

  db.prepare(`
    INSERT INTO agent_queue (id, item_id, item_text, project_id, sprint_id, priority, sort_order, estimated_duration_sec, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, item_id ?? null, item_text ?? null, project_id, sprint_id ?? null, priority, maxOrder.next, estimatedDuration, Date.now());

  const row = db.prepare("SELECT * FROM agent_queue WHERE id = ?").get(id);
  res.status(201).json(row);
});

app.delete("/api/queue/:id", (req, res) => {
  const { id } = req.params;
  const row = db.prepare("SELECT id, status FROM agent_queue WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.status === "running") {
    db.prepare("UPDATE agent_queue SET status = 'cancelled', completed_at = ? WHERE id = ?")
      .run(Date.now(), id);
  } else {
    db.prepare("DELETE FROM agent_queue WHERE id = ?").run(id);
  }
  res.json({ ok: true });
});

app.patch("/api/queue/reorder", (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: "ids array required" });
  }
  const update = db.prepare("UPDATE agent_queue SET sort_order = ? WHERE id = ?");
  db.transaction(() => {
    for (let i = 0; i < ids.length; i++) {
      update.run(i, ids[i]);
    }
  })();
  res.json({ ok: true });
});

app.post("/api/queue/sprint/:sprintId/launch", (req, res) => {
  const { sprintId } = req.params;
  const { project_id } = req.body ?? {};
  if (!project_id) {
    return res.status(400).json({ error: "project_id is required" });
  }
  const name = project_id;
  const filePath = path.join(PROJECTS_DIR, name, "backlog.md");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "backlog not found" });
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const sections = parseBacklogSections(raw);
  const sprints = readSprints(name);
  const sprint = sprints.find((s) => s.id === sprintId);
  if (!sprint) {
    return res.status(404).json({ error: "sprint not found" });
  }
  // Find sprint-specific section or fall back to all unchecked items
  const sprintSection = sections.find((s) =>
    s.header && sprint.name && s.header.toLowerCase().includes(sprint.name.toLowerCase())
  );
  const items = sprintSection ? sprintSection.items.filter((i) => !i.checked) : [];
  const todoItems = items.length > 0 ? items : sections.flatMap((s) => s.items.filter((i) => !i.checked));

  const maxOrder = db.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM agent_queue WHERE status = 'queued'"
  ).get();
  const avg = db.prepare(
    `SELECT AVG(completed_at - started_at) / 1000 AS avg_sec
     FROM jobs
     WHERE project = ? AND status = 'done' AND started_at IS NOT NULL AND completed_at IS NOT NULL`
  ).get(project_id);
  const estimatedDuration = avg?.avg_sec ? Math.round(avg.avg_sec) : null;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO agent_queue (id, item_id, item_text, project_id, sprint_id, priority, sort_order, estimated_duration_sec, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const added = [];
  db.transaction(() => {
    for (let i = 0; i < todoItems.length; i++) {
      const item = todoItems[i];
      const existing = db.prepare(
        "SELECT id FROM agent_queue WHERE project_id = ? AND item_text = ? AND status IN ('queued', 'running')"
      ).get(project_id, item.text);
      if (existing) continue;
      const id = randomUUID();
      const prio = item.priority === 'P1' ? 1 : item.priority === 'P3' ? 3 : 2;
      insert.run(id, `${item.index}`, item.text, project_id, sprintId, prio, maxOrder.next + i, estimatedDuration, Date.now());
      added.push(id);
    }
  })();
  res.json({ ok: true, added: added.length, ids: added });
});

app.post("/api/queue/sprint/:sprintId/pause", (req, res) => {
  const { sprintId } = req.params;
  const removed = db.prepare(
    "DELETE FROM agent_queue WHERE sprint_id = ? AND status = 'queued'"
  ).run(sprintId);
  res.json({ ok: true, removed: removed.changes });
});

// ── Provider API Keys Settings ─────────────────────────────────────────────────
// GET  /api/settings/providers  → { replicate, openai, openrouter } (keys masked)
// POST /api/settings/providers  → { provider, api_key } saves/updates a key
// POST /api/settings/providers/:provider/test → tests a provider key

const VALID_PROVIDERS = ["replicate", "openai", "openrouter", "huggingface", "together", "fal", "kling", "veo"];

app.get("/api/settings/providers", (req, res) => {
  const rows = db.prepare("SELECT provider, api_key FROM provider_keys").all();
  const result = {};
  for (const row of rows) {
    result[row.provider] = row.api_key;
  }
  // Fill missing providers with empty strings
  for (const p of VALID_PROVIDERS) {
    if (!(p in result)) result[p] = "";
  }
  res.json(result);
});

app.post("/api/settings/providers", (req, res) => {
  const { provider, api_key } = req.body || {};
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ ok: false, error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` });
  }
  if (typeof api_key !== "string") {
    return res.status(400).json({ ok: false, error: "api_key must be a string" });
  }

  if (api_key.trim() === "") {
    // Delete the key if empty string is sent
    db.prepare("DELETE FROM provider_keys WHERE provider = ?").run(provider);
  } else {
    db.prepare(`
      INSERT INTO provider_keys (provider, api_key, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at
    `).run(provider, api_key.trim(), Date.now());
  }

  res.json({ ok: true });
});

app.post("/api/settings/providers/:provider/test", async (req, res) => {
  const { provider } = req.params;
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ ok: false, error: "unknown provider" });
  }

  const row = db.prepare("SELECT api_key FROM provider_keys WHERE provider = ?").get(provider);
  const apiKey = row?.api_key || process.env[`${provider.toUpperCase()}_API_KEY`] || process.env.REPLICATE_API_TOKEN || "";

  if (!apiKey) {
    return res.json({ ok: false, error: "No API key configured for this provider" });
  }

  try {
    let testOk = false;
    let errorMsg = "";

    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      testOk = r.ok;
      if (!testOk) errorMsg = `OpenAI HTTP ${r.status}`;
    } else if (provider === "openrouter") {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      testOk = r.ok;
      if (!testOk) errorMsg = `OpenRouter HTTP ${r.status}`;
    } else if (provider === "replicate") {
      const r = await fetch("https://api.replicate.com/v1/account", {
        headers: { Authorization: `Token ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      testOk = r.ok;
      if (!testOk) errorMsg = `Replicate HTTP ${r.status}`;
    } else if (provider === "huggingface") {
      const r = await fetch("https://huggingface.co/api/whoami", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      testOk = r.ok;
      if (!testOk) errorMsg = `HuggingFace HTTP ${r.status}`;
    } else if (provider === "together") {
      const r = await fetch("https://api.together.xyz/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      testOk = r.ok;
      if (!testOk) errorMsg = `Together.ai HTTP ${r.status}`;
    } else if (provider === "fal") {
      const r = await fetch("https://queue.fal.run/fal-ai/flux/health", {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      // fal.ai returns 200 or 404/405 on health but 401 on bad key
      testOk = r.status !== 401 && r.status !== 403;
      if (!testOk) errorMsg = `Fal.ai HTTP ${r.status}`;
    } else if (provider === "kling") {
      // Validate key format: "accessKey:secretKey"
      if (!apiKey.includes(":")) {
        testOk = false;
        errorMsg = "Kling key must be in format 'accessKey:secretKey'";
      } else {
        try {
          const jwt = buildKlingJwt(apiKey);
          const r = await fetch("https://api.klingai.com/v1/account/costs", {
            headers: { Authorization: `Bearer ${jwt}` },
            signal: AbortSignal.timeout(8000),
          });
          // 200 = valid key; 401/403 = bad key; anything else = key might be ok
          testOk = r.status !== 401 && r.status !== 403;
          if (!testOk) errorMsg = `Kling HTTP ${r.status}`;
        } catch (e) {
          testOk = false;
          errorMsg = e.message;
        }
      }
    } else if (provider === "veo") {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      testOk = r.ok;
      if (!testOk) errorMsg = `Google API HTTP ${r.status}`;
    }

    res.json({ ok: testOk, error: testOk ? undefined : errorMsg });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Image Models ───────────────────────────────────────────────────────────────
// GET /api/models/image
// Returns available image generation models based on configured providers.
// OpenRouter models are fetched dynamically; Replicate models are static.

const REPLICATE_IMAGE_MODELS = [
  // Free / very cheap models
  { id: "flux-schnell",       label: "FLUX.1 Schnell (Black Forest Labs)",       provider: "replicate", tier: "free" },
  { id: "sdxl",               label: "Stable Diffusion XL (Stability AI)",       provider: "replicate", tier: "free" },
  { id: "sdxl-lightning",     label: "SDXL Lightning 4-Step (ByteDance)",         provider: "replicate", tier: "free" },
  { id: "playground-v2.5",    label: "Playground v2.5 (Playground AI)",           provider: "replicate", tier: "free" },
  // Paid models
  { id: "flux-dev",           label: "FLUX.1 Dev (Black Forest Labs)",            provider: "replicate", tier: "paid" },
  { id: "flux-1.1-pro",      label: "FLUX 1.1 Pro (Black Forest Labs)",          provider: "replicate", tier: "paid" },
  { id: "flux-1.1-pro-ultra", label: "FLUX 1.1 Pro Ultra (Black Forest Labs)",   provider: "replicate", tier: "paid" },
  { id: "ideogram-v2",       label: "Ideogram v2 (Ideogram AI)",                 provider: "replicate", tier: "paid" },
  { id: "recraft-v3",        label: "Recraft v3 (Recraft AI)",                   provider: "replicate", tier: "paid" },
  { id: "kolors",            label: "Kolors (Kwai)",                              provider: "replicate", tier: "free" },
  { id: "kandinsky-3",       label: "Kandinsky 3 (AI Forever)",                  provider: "replicate", tier: "free" },
  { id: "proteus-v0.4",      label: "Proteus v0.4 (DataAutogpt3)",              provider: "replicate", tier: "free" },
];

app.get("/api/models/image", async (req, res) => {
  const models = [];

  const replicateKey = getProviderKey("replicate");
  if (replicateKey) {
    models.push(...REPLICATE_IMAGE_MODELS);
  }

  const openrouterKey = getProviderKey("openrouter");
  if (openrouterKey) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${openrouterKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const data = await r.json();
        // Only include models that are actual image generators, not chat LLMs
        // OpenRouter's real image gen models have "image" in their ID
        const OPENROUTER_IMAGE_MODELS = [
          { id: "openai/gpt-5-image-mini", label: "GPT-5 Image Mini", tier: "paid" },
          { id: "openai/gpt-5-image", label: "GPT-5 Image", tier: "paid" },
          { id: "google/gemini-2.5-flash-image", label: "Gemini Flash Image", tier: "paid" },
          { id: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image", tier: "paid" },
          { id: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image", tier: "paid" },
        ];
        // Verify which ones actually exist in the API response
        const available = new Set((data.data || []).map((m) => m.id));
        for (const m of OPENROUTER_IMAGE_MODELS) {
          if (available.has(m.id)) {
            models.push({ ...m, provider: "openrouter" });
          }
        }
      } else {
        console.error("[models/image] OpenRouter HTTP", r.status);
      }
    } catch (err) {
      console.error("[models/image] OpenRouter fetch failed:", err.message);
    }
  }

  // Together.ai — fetch dynamically, filter type === "image"
  const togetherKey = getProviderKey("together");
  if (togetherKey) {
    try {
      const r = await fetch("https://api.together.xyz/v1/models", {
        headers: { Authorization: `Bearer ${togetherKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const data = await r.json();
        const imageModels = (data || []).filter((m) => m.type === "image");
        for (const m of imageModels) {
          models.push({
            id: `together:${m.id}`,
            label: m.display_name || m.id,
            provider: "together",
            tier: "free",
          });
        }
      } else {
        console.error("[models/image] Together.ai HTTP", r.status);
      }
    } catch (err) {
      console.error("[models/image] Together.ai fetch failed:", err.message);
    }
  }

  // Fal.ai — static list of free models
  const falKey = getProviderKey("fal");
  if (falKey) {
    const FAL_IMAGE_MODELS = [
      { id: "fal:fal-ai/flux",          label: "FLUX (Fal.ai)",          tier: "free" },
      { id: "fal:fal-ai/flux-realism",   label: "FLUX Realism (Fal.ai)", tier: "free" },
      { id: "fal:fal-ai/fast-sdxl",      label: "Fast SDXL (Fal.ai)",    tier: "free" },
    ];
    for (const m of FAL_IMAGE_MODELS) {
      models.push({ ...m, provider: "fal" });
    }
  }

  // Pollinations.ai — always available, free, no API key needed
  models.push(
    { id: "pollinations-flux", label: "FLUX (Pollinations - gratuit)", provider: "pollinations", tier: "free" },
    { id: "pollinations-turbo", label: "Turbo (Pollinations - gratuit)", provider: "pollinations", tier: "free" },
    { id: "pollinations-flux-realism", label: "FLUX Realism (Pollinations - gratuit)", provider: "pollinations", tier: "free" },
    { id: "pollinations-flux-anime", label: "FLUX Anime (Pollinations - gratuit)", provider: "pollinations", tier: "free" },
    { id: "pollinations-flux-3d", label: "FLUX 3D (Pollinations - gratuit)", provider: "pollinations", tier: "free" },
  );

  // Fallback: return static Replicate list when no providers are configured
  if (models.length === 0) {
    models.push(...REPLICATE_IMAGE_MODELS);
  }

  res.json({ models });
});

// ── Image Generation ──────────────────────────────────────────────────────────
// POST /api/generate/image
// Body: { prompt, model, ratio, provider? }
// Returns: { ok, imageUrl } or { ok: false, error }
//
// API keys are read from provider_keys DB table first, then env vars as fallback.

function getProviderKey(provider) {
  const row = db.prepare("SELECT api_key FROM provider_keys WHERE provider = ?").get(provider);
  if (row?.api_key) return row.api_key;
  // env fallback
  if (provider === "replicate") return process.env.REPLICATE_API_TOKEN || "";
  if (provider === "openai") return process.env.OPENAI_API_KEY || "";
  if (provider === "openrouter") return process.env.OPENROUTER_API_KEY || "";
  if (provider === "huggingface") return process.env.HUGGINGFACE_API_KEY || "";
  if (provider === "together") return process.env.TOGETHER_API_KEY || "";
  if (provider === "fal") return process.env.FAL_API_KEY || "";
  if (provider === "kling") return process.env.KLING_API_KEY || "";
  if (provider === "veo") return process.env.VEO_API_KEY || "";
  return "";
}

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

const MODEL_IDS = {
  "flux-schnell":    "black-forest-labs/flux-schnell",
  "sdxl":            "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37291fae01fac53a39f3b80",
  "sdxl-lightning":  "bytedance/sdxl-lightning-4step:5f24084160c9089501c1b3545d9be3c27883ae2239b6f412990e82d4a6210f8",
  "flux-dev":        "black-forest-labs/flux-dev",
};

const RATIO_TO_SIZE = {
  "1:1":  { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768  },
  "9:16": { width: 768,  height: 1344 },
  "4:3":  { width: 1152, height: 896  },
  "3:4":  { width: 896,  height: 1152 },
};

async function pollReplicate(predictionId, token, maxWaitMs = 120000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    if (data.status === "succeeded") return data.output;
    if (data.status === "failed" || data.status === "canceled") throw new Error(data.error || "Prediction failed");
  }
  throw new Error("Timed out waiting for image generation");
}

// Determine which provider to use for a given model ID
function resolveImageProvider(model) {
  if (model.startsWith("together:")) return "together";
  if (model.startsWith("fal:")) return "fal";
  if (model.startsWith("pollinations-")) return "pollinations";
  if (MODEL_IDS[model]) return "replicate";
  // OpenRouter models contain a "/" (e.g. "openai/dall-e-3", "stability-ai/sd3")
  if (model.includes("/")) return "openrouter";
  return "replicate";
}

// Map frontend model IDs to Pollinations model names
const POLLINATIONS_MODEL_MAP = {
  "pollinations-flux":           "flux",
  "pollinations-turbo":          "turbo",
  "pollinations-flux-realism":   "flux-realism",
  "pollinations-flux-anime":     "flux-anime",
  "pollinations-flux-3d":        "flux-3d",
};

async function generateWithPollinations(prompt, model, size) {
  const pollinationsModel = POLLINATIONS_MODEL_MAP[model] || "flux";
  const encodedPrompt = encodeURIComponent(prompt);
  // Pollinations returns the image directly — we use a redirect-safe URL
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${size.width}&height=${size.height}&model=${pollinationsModel}&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`;

  // HEAD request to verify the URL resolves before returning it
  const check = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30000) });
  if (!check.ok) throw new Error(`Pollinations: HTTP ${check.status}`);
  return { imageUrl: url };
}

async function generateWithTogether(prompt, model, size, apiKey) {
  // Strip "together:" prefix to get the actual model id
  const modelId = model.startsWith("together:") ? model.slice(9) : model;
  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      n: 1,
      width: size.width,
      height: size.height,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errMsg = `Together.ai error ${res.status}`;
    try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  const item = data.data?.[0];
  if (item?.url) return { imageUrl: item.url };
  if (item?.b64_json) return { imageUrl: `data:image/png;base64,${item.b64_json}` };
  throw new Error("Together.ai: no image URL in response");
}

async function generateWithFal(prompt, model, size, apiKey) {
  // Strip "fal:" prefix to get the actual model id (e.g. "fal-ai/flux")
  const modelId = model.startsWith("fal:") ? model.slice(4) : model;
  const submitRes = await fetch(`https://queue.fal.run/${modelId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      image_size: { width: size.width, height: size.height },
      num_images: 1,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    let errMsg = `Fal.ai submit error ${submitRes.status}`;
    try { errMsg = JSON.parse(text)?.detail || errMsg; } catch {}
    throw new Error(errMsg);
  }

  const job = await submitRes.json();

  // If response already contains images (sync mode)
  if (job.images?.[0]?.url) return { imageUrl: job.images[0].url };

  // Otherwise poll the queue
  const requestId = job.request_id;
  if (!requestId) throw new Error("Fal.ai: no request_id in response");

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://queue.fal.run/${modelId}/requests/${requestId}`, {
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!pollRes.ok) continue;
    const poll = await pollRes.json();
    if (poll.status === "COMPLETED" || poll.images?.[0]?.url) {
      const url = poll.images?.[0]?.url || poll.output?.images?.[0]?.url;
      if (url) return { imageUrl: url };
      throw new Error("Fal.ai: no image URL in completed response");
    }
    if (poll.status === "FAILED") throw new Error(poll.error || "Fal.ai: generation failed");
  }
  throw new Error("Fal.ai: timeout — generation took too long");
}

async function generateWithOpenRouter(prompt, model, size, apiKey) {
  // Try /images/generations first (OpenAI-compatible)
  const res = await fetch("https://openrouter.ai/api/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://sona.beniben.dev",
      "X-Title": "Sona Dashboard",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: `${size.width}x${size.height}`,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (res.ok) {
    const data = await res.json();
    const item = data.data?.[0];
    if (item?.url) return { imageUrl: item.url };
    if (item?.b64_json) return { imageUrl: `data:image/png;base64,${item.b64_json}` };
  }

  // Fallback: chat completions endpoint (for multimodal models)
  const chatRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://sona.beniben.dev",
      "X-Title": "Sona Dashboard",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: `Generate an image: ${prompt}. Dimensions: ${size.width}x${size.height}.` }],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!chatRes.ok) {
    const text = await chatRes.text().catch(() => "");
    let errMsg = `OpenRouter error ${chatRes.status}`;
    try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
    throw new Error(errMsg);
  }

  const chatData = await chatRes.json();
  if (chatData.data?.[0]?.url) return { imageUrl: chatData.data[0].url };
  if (chatData.data?.[0]?.b64_json) return { imageUrl: `data:image/png;base64,${chatData.data[0].b64_json}` };

  const content = chatData.choices?.[0]?.message?.content ?? "";
  if (content.startsWith("data:image")) return { imageUrl: content };
  const urlMatch = content.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp)/i);
  if (urlMatch) return { imageUrl: urlMatch[0] };

  throw new Error("OpenRouter: le modèle n'a pas retourné d'image. Essayez un autre modèle.");
}

app.post("/api/generate/image", async (req, res) => {
  const { prompt, model = "flux-schnell", ratio = "1:1", provider: explicitProvider } = req.body || {};
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ ok: false, error: "prompt is required" });
  }

  const size = RATIO_TO_SIZE[ratio] || RATIO_TO_SIZE["1:1"];
  const replicateKey = getProviderKey("replicate");
  const openrouterKey = getProviderKey("openrouter");
  const togetherKey = getProviderKey("together");
  const falKey = getProviderKey("fal");

  // Determine provider: explicit param > model-based detection > fallback to whatever is configured
  const detectedProvider = explicitProvider || resolveImageProvider(model);

  // Together.ai path
  if (detectedProvider === "together") {
    if (!togetherKey) {
      return res.status(400).json({ ok: false, error: "Clé Together.ai non configurée. Ajoutez-la dans Paramètres → Connexions." });
    }
    try {
      const result = await generateWithTogether(prompt.trim(), model, size, togetherKey);
      return res.json({ ok: true, ...result, model, ratio, prompt, provider: "together" });
    } catch (err) {
      console.error("[generate/image] Together.ai error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // Fal.ai path
  if (detectedProvider === "fal") {
    if (!falKey) {
      return res.status(400).json({ ok: false, error: "Clé Fal.ai non configurée. Ajoutez-la dans Paramètres → Connexions." });
    }
    try {
      const result = await generateWithFal(prompt.trim(), model, size, falKey);
      return res.json({ ok: true, ...result, model, ratio, prompt, provider: "fal" });
    } catch (err) {
      console.error("[generate/image] Fal.ai error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // Pollinations path — free, no API key required
  if (detectedProvider === "pollinations") {
    try {
      const result = await generateWithPollinations(prompt.trim(), model, size);
      return res.json({ ok: true, ...result, model, ratio, prompt, provider: "pollinations" });
    } catch (err) {
      console.error("[generate/image] Pollinations error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // OpenRouter path
  if (detectedProvider === "openrouter" || (!replicateKey && openrouterKey)) {
    if (!openrouterKey) {
      return res.status(400).json({ ok: false, error: "Clé OpenRouter non configurée. Ajoutez-la dans Paramètres → Connexions." });
    }
    try {
      const result = await generateWithOpenRouter(prompt.trim(), model, size, openrouterKey);
      return res.json({ ok: true, ...result, model, ratio, prompt, provider: "openrouter" });
    } catch (err) {
      console.error("[generate/image] OpenRouter error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // Replicate path
  if (!replicateKey) {
    // Dev placeholder when no keys configured at all
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><rect width="100%" height="100%" fill="#1e1b4b"/><text x="50%" y="50%" font-family="monospace" font-size="32" fill="#a78bfa" text-anchor="middle" dominant-baseline="middle">[dev] ${encodeURIComponent(prompt.slice(0, 40))}</text></svg>`;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    return res.json({ ok: true, imageUrl: dataUrl, model, ratio, prompt, dev: true });
  }

  const modelId = MODEL_IDS[model] || MODEL_IDS["flux-schnell"];
  const input = { prompt: prompt.trim(), width: size.width, height: size.height, num_outputs: 1 };
  if (model === "sdxl-lightning") input.num_inference_steps = 4;

  try {
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: { Authorization: `Bearer ${replicateKey}`, "Content-Type": "application/json", "Prefer": "wait" },
      body: JSON.stringify({ version: modelId.includes(":") ? modelId.split(":")[1] : undefined, model: modelId.includes(":") ? undefined : modelId, input }),
      signal: AbortSignal.timeout(30000),
    });
    const prediction = await createRes.json();

    if (prediction.error) throw new Error(prediction.error);

    let output = prediction.output;
    if (!output && prediction.id) output = await pollReplicate(prediction.id, replicateKey);
    if (!output) throw new Error("No output from model");

    const imageUrl = Array.isArray(output) ? output[0] : output;
    res.json({ ok: true, imageUrl, model, ratio, prompt, provider: "replicate" });
  } catch (err) {
    console.error("[generate/image] Replicate error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Video Generation ──────────────────────────────────────────────────────────
// POST /api/generate/video          → { ok: true, jobId }
// GET  /api/generate/video/:jobId   → { ok, status, progress, message, url?, error? }
// GET  /api/generate/video/:jobId/progress → SSE stream of job state until done

const VIDEO_MODEL_REPLICATE = {
  "wan2.1":       "wavespeedai/wan-2.1-t2v-480p",
  "animatediff":  "lucataco/animate-diff",
  "stable-video": "stability-ai/stable-video-diffusion",
  "cogvideox":    "chenxwh/cogvideox-5b",
  "mochi-1":      "genmoai/mochi-1",
};

const VIDEO_MODEL_FAL = {
  "wan2.1":    "fal-ai/wan-t2v",
  "mochi-1":   "fal-ai/mochi-v1",
  "cogvideox": "fal-ai/cogvideox-5b",
};

// In-memory job store — completed jobs are pruned after 10 min
const videoJobs = new Map();

function createVideoJob() {
  const jobId = randomUUID();
  videoJobs.set(jobId, {
    status: "pending",
    progress: 0,
    message: "Initialisation...",
    url: null,
    error: null,
    createdAt: Date.now(),
  });
  return jobId;
}

function updateVideoJob(jobId, updates) {
  const job = videoJobs.get(jobId);
  if (job) videoJobs.set(jobId, { ...job, ...updates });
}

// Prune jobs older than 10 min that are no longer running
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of videoJobs) {
    if (job.status !== "running" && job.status !== "pending" && job.createdAt < cutoff) {
      videoJobs.delete(id);
    }
  }
}, 60_000);

async function pollReplicateVideo(predictionId, token, jobId, maxWaitMs = 180_000) {
  const startedAt = Date.now();
  const deadline = startedAt + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await r.json();
    if (data.status === "succeeded") {
      const output = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!output) throw new Error("Replicate: empty output");
      return { url: output };
    }
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(data.error || `Replicate: prediction ${data.status}`);
    }
    const elapsed = Date.now() - startedAt;
    const estimatedProgress = Math.min(95, 15 + Math.round((elapsed / maxWaitMs) * 80));
    updateVideoJob(jobId, { progress: estimatedProgress, message: `Génération Replicate… (${data.status})` });
  }
  throw new Error("Replicate: timeout — video generation took too long");
}

async function pollFalVideo(endpoint, requestId, apiKey, jobId, maxWaitMs = 180_000) {
  const startedAt = Date.now();
  const deadline = startedAt + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://queue.fal.run/${endpoint}/requests/${requestId}/status`,
      { headers: { Authorization: `Key ${apiKey}` }, signal: AbortSignal.timeout(10_000) }
    );
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${endpoint}/requests/${requestId}`,
        { headers: { Authorization: `Key ${apiKey}` }, signal: AbortSignal.timeout(10_000) }
      );
      if (!resultRes.ok) throw new Error("fal.ai: could not fetch result");
      const result = await resultRes.json();
      const url = result.video?.url ?? result.video_url;
      if (!url) throw new Error("fal.ai: no video URL in response");
      return { url };
    }
    if (status.status === "FAILED") throw new Error("fal.ai: generation failed");
    const elapsed = Date.now() - startedAt;
    const estimatedProgress = Math.min(95, 15 + Math.round((elapsed / maxWaitMs) * 80));
    const logs = Array.isArray(status.logs) ? status.logs : [];
    const lastLog = logs[logs.length - 1]?.message ?? "En cours…";
    updateVideoJob(jobId, { progress: estimatedProgress, message: lastLog.slice(0, 120) });
  }
  throw new Error("fal.ai: timeout — video generation took too long");
}

async function runVideoGeneration(jobId, prompt, model, duration) {
  updateVideoJob(jobId, { status: "running", progress: 5, message: "Connexion au provider…" });
  try {
    const replicateKey = getProviderKey("replicate");
    const falKey = getProviderKey("fal");

    if (!replicateKey && !falKey) {
      // Dev mode placeholder — returns an SVG data URL
      await new Promise((r) => setTimeout(r, 1500));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#1e1b4b"/><text x="50%" y="50%" font-family="monospace" font-size="22" fill="#a78bfa" text-anchor="middle" dominant-baseline="middle">[dev] ${prompt.slice(0, 40)}</text></svg>`;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      updateVideoJob(jobId, { status: "succeeded", progress: 100, message: "Terminé (dev mode)", url: dataUrl });
      return;
    }

    // fal.ai — fast inference for supported models
    if (falKey && VIDEO_MODEL_FAL[model]) {
      updateVideoJob(jobId, { progress: 10, message: "Soumission à fal.ai…" });
      const submitRes = await fetch(`https://queue.fal.run/${VIDEO_MODEL_FAL[model]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
        body: JSON.stringify({ prompt, num_frames: duration * 8 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!submitRes.ok) {
        const err = await submitRes.json().catch(() => ({}));
        throw new Error(err.detail ?? `fal.ai submit error ${submitRes.status}`);
      }
      const submission = await submitRes.json();
      if (!submission.request_id) throw new Error("fal.ai: no request_id");
      updateVideoJob(jobId, { progress: 15, message: "Requête soumise, génération en cours…" });
      const result = await pollFalVideo(VIDEO_MODEL_FAL[model], submission.request_id, falKey, jobId);
      updateVideoJob(jobId, { status: "succeeded", progress: 100, message: "Vidéo générée !", url: result.url });
      return;
    }

    // Replicate — broader model support
    if (replicateKey) {
      const modelPath = VIDEO_MODEL_REPLICATE[model] ?? model;
      updateVideoJob(jobId, { progress: 10, message: "Soumission à Replicate…" });
      const createRes = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Token ${replicateKey}` },
        body: JSON.stringify({
          input: { prompt, num_frames: duration * 8, num_inference_steps: 25, guidance_scale: 7.5 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.detail ?? `Replicate create error ${createRes.status}`);
      }
      const prediction = await createRes.json();
      if (prediction.error) throw new Error(prediction.error);
      if (!prediction.id) throw new Error("Replicate: no prediction ID");
      updateVideoJob(jobId, { progress: 15, message: "Prédiction créée, génération en cours…" });
      const result = await pollReplicateVideo(prediction.id, replicateKey, jobId);
      updateVideoJob(jobId, { status: "succeeded", progress: 100, message: "Vidéo générée !", url: result.url });
      return;
    }

    throw new Error("Aucun provider configuré. Ajoutez votre clé Replicate dans Paramètres → Connexions.");
  } catch (err) {
    console.error("[generate/video] error:", err.message);
    updateVideoJob(jobId, { status: "failed", progress: 0, message: err.message, error: err.message });
  }
}

app.post("/api/generate/video", (req, res) => {
  const { prompt, model = "wan2.1", duration = 4 } = req.body || {};
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: "prompt is required" });
  }
  if (typeof model !== "string") {
    return res.status(400).json({ ok: false, error: "model must be a string" });
  }
  if (![2, 4, 8].includes(duration)) {
    return res.status(400).json({ ok: false, error: "duration must be 2, 4, or 8" });
  }
  const jobId = createVideoJob();
  runVideoGeneration(jobId, prompt.trim(), model, duration).catch((err) => {
    console.error("[generate/video] unhandled:", err.message);
    updateVideoJob(jobId, { status: "failed", error: err.message, message: err.message });
  });
  res.json({ ok: true, jobId });
});

app.get("/api/generate/video/:jobId", (req, res) => {
  const job = videoJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
  res.json({ ok: true, ...job });
});

app.get("/api/generate/video/:jobId/progress", (req, res) => {
  const { jobId } = req.params;
  const job = videoJobs.get(jobId);
  if (!job) return res.status(404).json({ ok: false, error: "Job not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({ ...videoJobs.get(jobId) })}\n\n`);

  // If already terminal, close right away
  const initial = videoJobs.get(jobId);
  if (initial && (initial.status === "succeeded" || initial.status === "failed")) {
    res.end();
    return;
  }

  let lastSent = JSON.stringify(initial);

  const pollInterval = setInterval(() => {
    const j = videoJobs.get(jobId);
    if (!j) { clearInterval(pollInterval); if (!res.writableEnded) res.end(); return; }
    const serialized = JSON.stringify(j);
    if (serialized !== lastSent && !res.writableEnded) {
      res.write(`data: ${serialized}\n\n`);
      lastSent = serialized;
    }
    if (j.status === "succeeded" || j.status === "failed") {
      clearInterval(pollInterval);
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }, 1000);

  const heartbeat = setInterval(() => {
    if (res.writableEnded) { clearInterval(heartbeat); return; }
    res.write(": heartbeat\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(pollInterval);
    clearInterval(heartbeat);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
syncFromFilesystem();

// Periodic filesystem sync every 30 seconds — also broadcasts to job SSE clients.
// Also cleans up any stale current_job_id entries for completed jobs and queue items.
cron.schedule("*/30 * * * * *", () => {
  try {
    syncFromFilesystem();
    // Resolve recurring jobs whose tracked sub-job has now finished
    const tracked = db
      .prepare("SELECT id, current_job_id FROM recurring_jobs WHERE current_job_id IS NOT NULL")
      .all();
    for (const rj of tracked) {
      const job = db.prepare("SELECT status FROM jobs WHERE id = ?").get(rj.current_job_id);
      if (job && job.status !== "running") {
        const finalStatus = job.status === "done" ? "done" : "error";
        db.prepare(
          "UPDATE recurring_jobs SET last_status = ?, current_job_id = NULL WHERE id = ?"
        ).run(finalStatus, rj.id);
      }
    }
    // Resolve queue items whose agent job has finished
    const runningQueue = db
      .prepare("SELECT id, agent_job_id FROM agent_queue WHERE status = 'running' AND agent_job_id IS NOT NULL")
      .all();
    for (const qi of runningQueue) {
      const job = db.prepare("SELECT status FROM jobs WHERE id = ?").get(qi.agent_job_id);
      if (job && job.status !== "running") {
        const finalStatus = job.status === "done" ? "done" : "failed";
        db.prepare(
          "UPDATE agent_queue SET status = ?, completed_at = ? WHERE id = ?"
        ).run(finalStatus, Date.now(), qi.id);
      }
    }
  } catch (err) {
    console.error("[sync error]", err.message);
  }
});

// Minute-by-minute scheduler — fires recurring jobs and consumes the agent queue
cron.schedule("* * * * *", async () => {
  try {
    const results = await runDueJobs({
      db,
      fetchFn: fetch,
      sonaApiUrl: SONA_API,
      computeNextRun,
    });
    if (results.length > 0) {
      console.log(`[scheduler] tick: ${results.length} job(s) processed`, results);
    }
  } catch (err) {
    console.error("[scheduler] tick error:", err.message);
  }
  // Consume agent queue — launch next queued item if nothing is running
  try {
    const result = await consumeQueue({
      db,
      fetchFn: fetch,
      sonaApiUrl: SONA_API,
      projectsDir: PROJECTS_DIR,
    });
    if (result) {
      console.log(`[queue] ${result.status}: queue item ${result.queueId}`, result);
    }
  } catch (err) {
    console.error("[queue] consume error:", err.message);
  }
});

// ── OpenRouter config ─────────────────────────────────────────────────────────
const OPENROUTER_API = "https://openrouter.ai/api/v1";

function orGet(key) {
  const row = db.prepare("SELECT value FROM openrouter_config WHERE key = ?").get(key);
  return row ? row.value : null;
}

function orSet(key, value) {
  db.prepare("INSERT INTO openrouter_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

// GET /api/openrouter/config — return masked key + model prefs
app.get("/api/openrouter/config", (_req, res) => {
  const apiKey = orGet("api_key");
  const defaultImage = orGet("default_model_image") || null;
  const defaultVideo = orGet("default_model_video") || null;
  const defaultAudio = orGet("default_model_audio") || null;
  res.json({
    ok: true,
    configured: !!apiKey,
    apiKeyMasked: apiKey ? `sk-or-...${apiKey.slice(-6)}` : null,
    defaults: { image: defaultImage, video: defaultVideo, audio: defaultAudio },
  });
});

// POST /api/openrouter/config — save api key and/or model prefs
app.post("/api/openrouter/config", (req, res) => {
  const { apiKey, defaults } = req.body ?? {};
  if (apiKey !== undefined) {
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      return res.status(400).json({ ok: false, error: "apiKey must be a non-empty string" });
    }
    orSet("api_key", apiKey.trim());
  }
  if (defaults) {
    if (defaults.image !== undefined) orSet("default_model_image", defaults.image);
    if (defaults.video !== undefined) orSet("default_model_video", defaults.video);
    if (defaults.audio !== undefined) orSet("default_model_audio", defaults.audio);
  }
  res.json({ ok: true });
});

// DELETE /api/openrouter/config — clear api key
app.delete("/api/openrouter/config", (_req, res) => {
  db.prepare("DELETE FROM openrouter_config WHERE key = 'api_key'").run();
  res.json({ ok: true });
});

// POST /api/openrouter/test — verify key is valid by hitting /models
app.post("/api/openrouter/test", async (_req, res) => {
  const apiKey = orGet("api_key");
  if (!apiKey) return res.status(400).json({ ok: false, error: "No API key configured" });
  try {
    const r = await fetch(`${OPENROUTER_API}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const data = await r.json();
      const count = data?.data?.length ?? 0;
      return res.json({ ok: true, modelCount: count });
    }
    const err = await r.text();
    return res.status(r.status).json({ ok: false, error: err });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message });
  }
});

// GET /api/openrouter/models — list available models
app.get("/api/openrouter/models", async (_req, res) => {
  const apiKey = orGet("api_key");
  if (!apiKey) return res.status(400).json({ ok: false, error: "No API key configured" });
  try {
    const r = await fetch(`${OPENROUTER_API}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ ok: false, error: err });
    }
    const data = await r.json();
    // Normalize: id, name, pricing (prompt cost per token), context_length, modality
    const models = (data?.data ?? []).map((m) => ({
      id: m.id,
      name: m.name || m.id,
      contextLength: m.context_length ?? null,
      pricing: m.pricing ?? {},
      modality: m.modality ?? null,
      isFree: m.pricing?.prompt === "0" || m.pricing?.prompt === 0,
    }));
    return res.json({ ok: true, models });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message });
  }
});

// ── Backlog DB API ───────────────────────────────────────────────────────────

// GET /api/backlogs/:projectId/sprints — list sprints sorted by priority then sort_order
app.get("/api/backlogs/:projectId/sprints", (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId);
  if (!projectId || projectId.includes("..")) return res.status(400).json({ error: "invalid project id" });
  const priorityOrder = "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END";
  const rows = db.prepare(
    `SELECT * FROM backlog_sprints WHERE project_id = ? ORDER BY ${priorityOrder}, sort_order ASC`
  ).all(projectId);
  res.json({ sprints: rows });
});

// POST /api/backlogs/:projectId/sprints — create sprint
app.post("/api/backlogs/:projectId/sprints", (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId);
  if (!projectId || projectId.includes("..")) return res.status(400).json({ error: "invalid project id" });
  const { name, priority = "medium", sort_order = 0, status = "active" } = req.body;
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
  const id = randomUUID();
  db.prepare(
    "INSERT INTO backlog_sprints (id, project_id, name, sort_order, priority, status) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, projectId, name, sort_order, priority, status);
  const sprint = db.prepare("SELECT * FROM backlog_sprints WHERE id = ?").get(id);
  res.status(201).json(sprint);
});

// PATCH /api/backlogs/:projectId/sprints/:id — update sprint
app.patch("/api/backlogs/:projectId/sprints/:id", (req, res) => {
  const { projectId, id: sprintId } = req.params;
  const existing = db.prepare("SELECT * FROM backlog_sprints WHERE id = ? AND project_id = ?").get(sprintId, decodeURIComponent(projectId));
  if (!existing) return res.status(404).json({ error: "sprint not found" });
  const allowed = ["name", "priority", "status", "sort_order"];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (key in req.body) { updates.push(`${key} = ?`); values.push(req.body[key]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: "no valid fields to update" });
  values.push(sprintId);
  db.prepare(`UPDATE backlog_sprints SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const sprint = db.prepare("SELECT * FROM backlog_sprints WHERE id = ?").get(sprintId);
  res.json(sprint);
});

// GET /api/backlogs/:projectId/items — list items for a sprint
app.get("/api/backlogs/:projectId/items", (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId);
  if (!projectId || projectId.includes("..")) return res.status(400).json({ error: "invalid project id" });
  const { sprint_id } = req.query;
  let rows;
  if (sprint_id) {
    rows = db.prepare(
      "SELECT i.* FROM backlog_items i JOIN backlog_sprints s ON i.sprint_id = s.id WHERE s.project_id = ? AND i.sprint_id = ? ORDER BY i.sort_order ASC"
    ).all(projectId, sprint_id);
  } else {
    rows = db.prepare(
      "SELECT i.* FROM backlog_items i JOIN backlog_sprints s ON i.sprint_id = s.id WHERE s.project_id = ? ORDER BY i.sort_order ASC"
    ).all(projectId);
  }
  res.json({ items: rows });
});

// POST /api/backlogs/:projectId/items — create item
app.post("/api/backlogs/:projectId/items", (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId);
  if (!projectId || projectId.includes("..")) return res.status(400).json({ error: "invalid project id" });
  const { sprint_id, text, priority, branch } = req.body;
  if (!sprint_id) return res.status(400).json({ error: "sprint_id is required" });
  if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });
  // Verify sprint belongs to project
  const sprint = db.prepare("SELECT id FROM backlog_sprints WHERE id = ? AND project_id = ?").get(sprint_id, projectId);
  if (!sprint) return res.status(404).json({ error: "sprint not found for this project" });
  const maxOrder = db.prepare("SELECT MAX(sort_order) as mx FROM backlog_items WHERE sprint_id = ?").get(sprint_id);
  const id = randomUUID();
  db.prepare(
    "INSERT INTO backlog_items (id, sprint_id, text, priority, branch, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, sprint_id, text, priority || null, branch || null, (maxOrder?.mx ?? -1) + 1);
  const item = db.prepare("SELECT * FROM backlog_items WHERE id = ?").get(id);
  res.status(201).json(item);
});

// PATCH /api/backlogs/:projectId/items/:id — update item
app.patch("/api/backlogs/:projectId/items/:id", (req, res) => {
  const { id: itemId } = req.params;
  const projectId = decodeURIComponent(req.params.projectId);
  const existing = db.prepare(
    "SELECT i.* FROM backlog_items i JOIN backlog_sprints s ON i.sprint_id = s.id WHERE i.id = ? AND s.project_id = ?"
  ).get(itemId, projectId);
  if (!existing) return res.status(404).json({ error: "item not found" });
  const allowed = ["text", "status", "priority", "branch", "assigned_job_id", "sort_order", "external_id"];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (key in req.body) { updates.push(`${key} = ?`); values.push(req.body[key]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: "no valid fields to update" });
  values.push(itemId);
  db.prepare(`UPDATE backlog_items SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const item = db.prepare("SELECT * FROM backlog_items WHERE id = ?").get(itemId);
  res.json(item);
});

// GET /api/backlogs/:projectId/items/:id/ac — list acceptance criteria
app.get("/api/backlogs/:projectId/items/:id/ac", (req, res) => {
  const { id: itemId } = req.params;
  const rows = db.prepare(
    "SELECT * FROM backlog_acceptance_criteria WHERE item_id = ? ORDER BY sort_order ASC"
  ).all(itemId);
  res.json({ criteria: rows });
});

// POST /api/backlogs/:projectId/items/:id/ac — create AC
app.post("/api/backlogs/:projectId/items/:id/ac", (req, res) => {
  const { id: itemId } = req.params;
  const { text } = req.body;
  if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });
  const existing = db.prepare("SELECT id FROM backlog_items WHERE id = ?").get(itemId);
  if (!existing) return res.status(404).json({ error: "item not found" });
  const maxOrder = db.prepare("SELECT MAX(sort_order) as mx FROM backlog_acceptance_criteria WHERE item_id = ?").get(itemId);
  const id = randomUUID();
  db.prepare(
    "INSERT INTO backlog_acceptance_criteria (id, item_id, text, sort_order) VALUES (?, ?, ?, ?)"
  ).run(id, itemId, text, (maxOrder?.mx ?? -1) + 1);
  const ac = db.prepare("SELECT * FROM backlog_acceptance_criteria WHERE id = ?").get(id);
  res.status(201).json(ac);
});

// PATCH /api/backlogs/:projectId/ac/:id — update AC status
app.patch("/api/backlogs/:projectId/ac/:id", (req, res) => {
  const { id: acId } = req.params;
  const existing = db.prepare("SELECT * FROM backlog_acceptance_criteria WHERE id = ?").get(acId);
  if (!existing) return res.status(404).json({ error: "acceptance criteria not found" });
  const { status, text } = req.body;
  const updates = [];
  const values = [];
  if (status && ["pending", "pass", "fail"].includes(status)) { updates.push("status = ?"); values.push(status); }
  if (typeof text === "string") { updates.push("text = ?"); values.push(text); }
  if (updates.length === 0) return res.status(400).json({ error: "no valid fields to update" });
  values.push(acId);
  db.prepare(`UPDATE backlog_acceptance_criteria SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const ac = db.prepare("SELECT * FROM backlog_acceptance_criteria WHERE id = ?").get(acId);
  res.json(ac);
});

// ── Backlog migration from markdown ──────────────────────────────────────────

// ── Audits ──────────────────────────────────────────────────────────────────
app.get("/api/audits", (req, res) => {
  const project = req.query.project;
  try {
    const rows = project
      ? db.prepare("SELECT * FROM audit_reports WHERE project = ? ORDER BY created_at DESC").all(project)
      : db.prepare("SELECT * FROM audit_reports ORDER BY created_at DESC LIMIT 200").all();
    res.json({ audits: rows });
  } catch (err) {
    res.json({ audits: [] });
  }
});

app.post("/api/backlogs/migrate", (_req, res) => {
  try {
    const migrated = migrateAllBacklogs();
    res.json({ ok: true, migrated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function backfillACs(projectId, backlogPath) {
  const content = fs.readFileSync(backlogPath, "utf-8");
  const lines = content.split("\n");
  let acCount = 0;

  // Get all items for this project keyed by external_id and text
  const items = db.prepare(
    `SELECT i.id, i.external_id, i.text FROM backlog_items i
     JOIN backlog_sprints s ON i.sprint_id = s.id
     WHERE s.project_id = ?`
  ).all(projectId);

  const byExtId = {};
  for (const item of items) {
    if (item.external_id) byExtId[item.external_id] = item.id;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const itemMatch = line.match(/^- \[([x ~!])\]\s*(.+)$/i);
    if (!itemMatch) continue;

    const itemText = itemMatch[2].trim();
    const extIdMatch = itemText.match(/\*\*([A-Z]\d+-\d+)\*\*/);
    const externalId = extIdMatch ? extIdMatch[1] : null;

    // Find the matching DB item
    let dbItemId = externalId ? byExtId[externalId] : null;
    if (!dbItemId) {
      // Fallback: match by text similarity (strip job refs, priority tags)
      const cleanText = itemText.replace(/\s*\(job:[^)]+\)\s*/g, "").trim();
      const found = items.find(it => it.text === cleanText || cleanText.includes(it.text) || it.text.includes(cleanText));
      if (found) dbItemId = found.id;
    }
    if (!dbItemId) continue;

    const { acceptanceCriteria } = extractSubLines(lines, i);
    let acOrder = 0;
    for (const acText of acceptanceCriteria) {
      db.prepare(
        "INSERT INTO backlog_acceptance_criteria (id, item_id, text, sort_order) VALUES (?, ?, ?, ?)"
      ).run(randomUUID(), dbItemId, acText, acOrder++);
      acCount++;
    }
  }
  return acCount;
}

function migrateAllBacklogs() {
  const results = [];
  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith('.') && !d.name.startsWith('_'));

  const migrateOne = db.transaction((projectId) => {
    const backlogPath = path.join(PROJECTS_DIR, projectId, "backlog.md");
    if (!fs.existsSync(backlogPath)) return null;

    // Skip if already migrated (has sprints for this project)
    const existing = db.prepare("SELECT COUNT(*) as cnt FROM backlog_sprints WHERE project_id = ?").get(projectId);
    if (existing.cnt > 0) {
      // Backfill ACs if items exist but have no acceptance criteria
      const acExists = db.prepare(
        `SELECT COUNT(*) as cnt FROM backlog_acceptance_criteria ac
         JOIN backlog_items i ON ac.item_id = i.id
         JOIN backlog_sprints s ON i.sprint_id = s.id
         WHERE s.project_id = ?`
      ).get(projectId);
      if (acExists.cnt === 0) {
        const backfilled = backfillACs(projectId, backlogPath);
        if (backfilled > 0) return { project: projectId, skipped: false, reason: "backfilled ACs", acs: backfilled };
      }
      return { project: projectId, skipped: true, reason: "already migrated" };
    }

    const content = fs.readFileSync(backlogPath, "utf-8");
    const lines = content.split("\n");

    let currentSprintName = null;
    let currentSubsection = null;
    let sprintId = null;
    let sprintOrder = 0;
    let itemOrder = 0;
    let sprintCount = 0;
    let itemCount = 0;
    let acCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match ## Sprint headers or ## section headers
      const h2Match = line.match(/^##\s+(.+)$/);
      if (h2Match) {
        const headerText = h2Match[1].trim();
        // Create a new sprint for each H2 section that contains items
        currentSprintName = headerText;
        currentSubsection = null;
        sprintId = randomUUID();
        itemOrder = 0;

        // Determine priority from the header
        let sprintPriority = "medium";
        if (/priorit[ée]\s*(haute|high|critique)/i.test(headerText)) sprintPriority = "high";
        else if (/priorit[ée]\s*(basse|low)/i.test(headerText)) sprintPriority = "low";

        // Determine status
        let sprintStatus = "active";
        if (/post-mvp|phase\s*2|hors\s*p[ée]rim/i.test(headerText)) sprintStatus = "planning";

        db.prepare(
          "INSERT INTO backlog_sprints (id, project_id, name, sort_order, priority, status) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(sprintId, projectId, currentSprintName, sprintOrder++, sprintPriority, sprintStatus);
        sprintCount++;
        continue;
      }

      // Match ### subsection headers
      const h3Match = line.match(/^###\s+(.+)$/);
      if (h3Match) {
        currentSubsection = h3Match[1].trim();
        continue;
      }

      // Match backlog items: - [x], - [ ], - [~], - [!]
      const itemMatch = line.match(/^- \[([x ~!])\]\s*(.+)$/i);
      if (itemMatch && sprintId) {
        const marker = itemMatch[1].toLowerCase();
        let itemText = itemMatch[2].trim();

        // Remove (job:...) suffix
        const jobMatch = itemText.match(/\(job:([a-f0-9-]+)\)/);
        const assignedJobId = jobMatch ? jobMatch[1] : null;
        itemText = itemText.replace(/\s*\(job:[^)]+\)\s*/g, "").trim();

        // Extract external ID like S1-01, S3-04, etc.
        const extIdMatch = itemText.match(/\*\*([A-Z]\d+-\d+)\*\*/);
        const externalId = extIdMatch ? extIdMatch[1] : null;

        // Extract priority [P1], [P2], [P3]
        const prioMatch = itemText.match(/\[(P[123])\]/);
        const priority = prioMatch ? prioMatch[1] : null;

        // Determine status
        let status = "todo";
        if (marker === "x") status = "done";
        else if (marker === "~") status = "in_progress";
        else if (marker === "!") status = "blocked";

        // Extract branch from sub-lines
        const { acceptanceCriteria, branch } = extractSubLines(lines, i);

        const itemId = randomUUID();
        db.prepare(
          "INSERT INTO backlog_items (id, sprint_id, external_id, text, status, priority, branch, assigned_job_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(itemId, sprintId, externalId, itemText, status, priority, branch, assignedJobId, itemOrder++);
        itemCount++;

        // Insert acceptance criteria
        let acOrder = 0;
        for (const acText of acceptanceCriteria) {
          db.prepare(
            "INSERT INTO backlog_acceptance_criteria (id, item_id, text, sort_order) VALUES (?, ?, ?, ?)"
          ).run(randomUUID(), itemId, acText, acOrder++);
          acCount++;
        }
      }
    }

    return { project: projectId, sprints: sprintCount, items: itemCount, acs: acCount };
  });

  for (const dir of projectDirs) {
    const result = migrateOne(dir.name);
    if (result) results.push(result);
  }

  return results;
}

// Run migration on startup (idempotent — skips already-migrated projects)
try {
  const migrated = migrateAllBacklogs();
  const actual = migrated.filter(m => !m.skipped);
  if (actual.length > 0) {
    console.log("Backlog migration completed:", actual);
  }
} catch (err) {
  console.error("Backlog migration failed:", err.message);
}

// ── Backlog DB-backed project backlog endpoint ───────────────────────────────
// This returns backlog data in the same shape as the old markdown-based endpoint
// so the frontend can switch seamlessly
app.get("/api/backlogs/:projectId/full", (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId);
  if (!projectId || projectId.includes("..")) return res.status(400).json({ error: "invalid project id" });

  const priorityOrder = "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END";
  const sprints = db.prepare(
    `SELECT * FROM backlog_sprints WHERE project_id = ? ORDER BY ${priorityOrder}, sort_order ASC`
  ).all(projectId);

  const sections = [];
  const allItems = [];
  let globalIdx = 0;

  for (const sprint of sprints) {
    const items = db.prepare(
      "SELECT * FROM backlog_items WHERE sprint_id = ? ORDER BY sort_order ASC"
    ).all(sprint.id);

    const sectionItems = items.map((item) => {
      const acs = db.prepare(
        "SELECT * FROM backlog_acceptance_criteria WHERE item_id = ? ORDER BY sort_order ASC"
      ).all(item.id);
      const mapped = {
        id: item.id,
        index: globalIdx,
        lineIndex: globalIdx,
        text: item.text,
        checked: item.status === "done",
        status: item.status,
        priority: item.priority,
        acceptanceCriteria: acs.map(ac => ({ id: ac.id, text: ac.text, status: ac.status })),
        branch: item.branch,
        external_id: item.external_id,
        sprint_id: item.sprint_id,
        assigned_job_id: item.assigned_job_id,
      };
      allItems.push(mapped);
      globalIdx++;
      return mapped;
    });

    sections.push({
      header: sprint.name,
      level: 2,
      sprint_id: sprint.id,
      sprint_status: sprint.status,
      sprint_priority: sprint.priority,
      items: sectionItems,
    });
  }

  res.json({ items: allItems, sections, sprints });
});

// Kick off initial status fetch
refreshStatus().catch(() => {});

app.listen(PORT, () => {
  console.log(`Sona dashboard backend running on port ${PORT}`);
  console.log(`  DB: ${DB_PATH}`);
  console.log(`  Upstream Sona API: ${SONA_API}`);
});
