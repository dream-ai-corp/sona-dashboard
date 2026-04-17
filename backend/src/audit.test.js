// Tests for audit report endpoints.
// Uses Node.js built-in test runner (node --test).
//
// Uses a MockDb (plain JS Map) instead of better-sqlite3 because the native
// .node binary is compiled for the Alpine Docker image and cannot load on
// the Debian host during CI / local test runs.
"use strict";
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createServer } = require("http");
const { randomUUID } = require("crypto");

// ── MockDb — mirrors the better-sqlite3 prepare().run/get/all interface ───────
class MockDb {
  constructor() {
    this._store = new Map(); // id → row
  }

  prepare(sql) {
    const self = this;
    const s = sql.replace(/\s+/g, " ").trim();

    return {
      run(...args) {
        if (/^INSERT INTO audit_reports/i.test(s)) {
          const [id, project, sprint, item_id, status, detail, created_at] = args;
          self._store.set(id, { id, project, sprint, item_id, status, detail, created_at });
        }
      },
      get(...args) {
        if (/WHERE id = \?/i.test(s)) {
          return self._store.get(args[0]) ?? null;
        }
        return null;
      },
      all(...args) {
        let rows = [...self._store.values()];
        if (/WHERE/i.test(s)) {
          const projectMatch = /project = \?/.test(s);
          const sprintMatch = /sprint = \?/.test(s);
          let pIdx = 0;
          if (projectMatch) {
            const pVal = args[pIdx++];
            rows = rows.filter((r) => r.project === pVal);
          }
          if (sprintMatch) {
            const pVal = args[pIdx++];
            rows = rows.filter((r) => r.sprint === pVal);
          }
        }
        return rows.sort((a, b) => b.created_at - a.created_at);
      },
    };
  }
}

// ── Build minimal Express app with audit routes ───────────────────────────────
function buildApp(db) {
  const app = express();
  app.use(express.json());

  // GET /api/audits
  app.get("/api/audits", (req, res) => {
    const { project, sprint } = req.query;
    const conditions = [];
    const params = [];
    if (project) { conditions.push("project = ?"); params.push(String(project)); }
    if (sprint)  { conditions.push("sprint = ?");  params.push(String(sprint)); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const rows = db.prepare(`SELECT * FROM audit_reports ${where} ORDER BY created_at DESC`).all(...params);
    res.json({ audits: rows });
  });

  // GET /api/audits/:id
  app.get("/api/audits/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM audit_reports WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "audit not found" });
    res.json(row);
  });

  // POST /api/audits
  app.post("/api/audits", (req, res) => {
    const { project, sprint, item_id, status, detail } = req.body || {};
    if (!project || typeof project !== "string" || !project.trim())
      return res.status(400).json({ error: "project is required" });
    if (!sprint || typeof sprint !== "string" || !sprint.trim())
      return res.status(400).json({ error: "sprint is required" });
    if (!["pass", "partial", "fail"].includes(status))
      return res.status(400).json({ error: "status must be pass, partial, or fail" });
    const id = randomUUID();
    db.prepare(
      `INSERT INTO audit_reports (id, project, sprint, item_id, status, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, project.trim(), sprint.trim(),
      item_id ? String(item_id).trim() : null,
      status,
      detail ? String(detail) : null,
      Date.now()
    );
    const row = db.prepare("SELECT * FROM audit_reports WHERE id = ?").get(id);
    res.status(201).json({ audit: row });
  });

  return app;
}

// ── Minimal HTTP request helper ───────────────────────────────────────────────
function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = require("http").request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────
let server;

before(() => {
  const db = new MockDb();
  const app = buildApp(db);
  server = createServer(app);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(() => new Promise((resolve) => server.close(resolve)));

describe("POST /api/audits", () => {
  it("creates an audit report and returns 201", async () => {
    const res = await request(server, "POST", "/api/audits", {
      project: "sona-dashboard",
      sprint: "Sprint 1",
      item_id: "S1-01",
      status: "pass",
      detail: "All checks green",
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.audit.id);
    assert.equal(res.body.audit.project, "sona-dashboard");
    assert.equal(res.body.audit.sprint, "Sprint 1");
    assert.equal(res.body.audit.item_id, "S1-01");
    assert.equal(res.body.audit.status, "pass");
    assert.equal(res.body.audit.detail, "All checks green");
  });

  it("accepts partial and fail statuses", async () => {
    const partial = await request(server, "POST", "/api/audits", {
      project: "p", sprint: "Sprint 2", status: "partial", detail: "Half done",
    });
    assert.equal(partial.status, 201);
    assert.equal(partial.body.audit.status, "partial");

    const fail = await request(server, "POST", "/api/audits", {
      project: "p", sprint: "Sprint 2", status: "fail",
    });
    assert.equal(fail.status, 201);
    assert.equal(fail.body.audit.status, "fail");
  });

  it("rejects missing project", async () => {
    const res = await request(server, "POST", "/api/audits", {
      sprint: "Sprint 1", status: "pass",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it("rejects missing sprint", async () => {
    const res = await request(server, "POST", "/api/audits", {
      project: "p", status: "pass",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it("rejects invalid status", async () => {
    const res = await request(server, "POST", "/api/audits", {
      project: "p", sprint: "Sprint 1", status: "unknown",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

describe("GET /api/audits", () => {
  before(async () => {
    await request(server, "POST", "/api/audits", {
      project: "proj-a", sprint: "Alpha Sprint", status: "pass",
    });
    await request(server, "POST", "/api/audits", {
      project: "proj-a", sprint: "Beta Sprint", status: "fail",
    });
    await request(server, "POST", "/api/audits", {
      project: "proj-b", sprint: "Alpha Sprint", status: "partial",
    });
  });

  it("returns all reports in { audits: [...] } envelope", async () => {
    const res = await request(server, "GET", "/api/audits", undefined);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.audits));
    assert.ok(res.body.audits.length >= 3);
  });

  it("filters by project", async () => {
    const res = await request(server, "GET", "/api/audits?project=proj-a", undefined);
    assert.equal(res.status, 200);
    assert.ok(res.body.audits.every((r) => r.project === "proj-a"));
    assert.equal(res.body.audits.length, 2);
  });

  it("filters by project and sprint", async () => {
    const res = await request(
      server, "GET",
      "/api/audits?project=proj-a&sprint=Alpha%20Sprint",
      undefined
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.audits.length, 1);
    assert.equal(res.body.audits[0].status, "pass");
  });
});

describe("GET /api/audits/:id", () => {
  let createdId;

  before(async () => {
    const res = await request(server, "POST", "/api/audits", {
      project: "test-proj", sprint: "Sprint X", status: "fail", detail: "Broken",
    });
    createdId = res.body.audit.id;
  });

  it("returns the report by id", async () => {
    const res = await request(server, "GET", `/api/audits/${createdId}`, undefined);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, createdId);
    assert.equal(res.body.status, "fail");
    assert.equal(res.body.detail, "Broken");
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(server, "GET", "/api/audits/does-not-exist", undefined);
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });
});
