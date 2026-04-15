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
    status     = excluded.status,
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

  // No result.json — running or orphaned
  if (goal) {
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

// ── Projects ──────────────────────────────────────────────────────────────────
app.get("/api/projects", (_req, res) => {
  const projectsDir = "/home/beniben/sona-workspace/projects";
  const projects = [];
  if (fs.existsSync(projectsDir)) {
    for (const name of fs.readdirSync(projectsDir)) {
      if (name === "_archive") continue;
      const dir = path.join(projectsDir, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const projectJson = path.join(dir, "project.json");
      const backlogMd = path.join(dir, "backlog.md");
      let meta = { name };
      if (fs.existsSync(projectJson)) {
        try { Object.assign(meta, JSON.parse(fs.readFileSync(projectJson, "utf-8"))); } catch {}
      }
      if (fs.existsSync(backlogMd)) {
        try {
          const backlog = fs.readFileSync(backlogMd, "utf-8");
          meta.hasBacklog = true;
          meta.backlogPreview = backlog.slice(0, 300);
        } catch {}
      }
      projects.push(meta);
    }
  }
  res.json(projects);
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
