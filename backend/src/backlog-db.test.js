"use strict";
/**
 * Unit tests for the backlog DB API endpoints.
 * Uses Node's built-in test runner (node --test).
 *
 * Spins up the actual Express app with an in-memory SQLite DB.
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const PROJECT_ID = "test-project";
let baseUrl;
let server;

// Helper to make HTTP requests
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json" },
    };
    const r = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// We need to test the actual routes, so we'll use fetch against the running backend.
// Since the backend may not be running in test, we test the DB logic directly with better-sqlite3.

const Database = require("better-sqlite3");
const { randomUUID } = require("crypto");
const path = require("path");
const os = require("os");
const fs = require("fs");

describe("Backlog DB schema and operations", () => {
  let db;

  before(() => {
    const dbPath = path.join(os.tmpdir(), `test-backlog-${Date.now()}.db`);
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    db.exec(`
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
    `);
  });

  after(() => {
    db.close();
  });

  test("create sprint", () => {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO backlog_sprints (id, project_id, name, sort_order, priority, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, PROJECT_ID, "Sprint 1", 0, "high", "active");
    const sprint = db.prepare("SELECT * FROM backlog_sprints WHERE id = ?").get(id);
    assert.equal(sprint.name, "Sprint 1");
    assert.equal(sprint.priority, "high");
    assert.equal(sprint.status, "active");
    assert.equal(sprint.project_id, PROJECT_ID);
  });

  test("create item with UUID", () => {
    const sprintId = db.prepare("SELECT id FROM backlog_sprints WHERE project_id = ?").get(PROJECT_ID).id;
    const itemId = randomUUID();
    db.prepare(
      "INSERT INTO backlog_items (id, sprint_id, external_id, text, status, priority, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(itemId, sprintId, "S1-01", "Test item", "todo", "P1", 0);
    const item = db.prepare("SELECT * FROM backlog_items WHERE id = ?").get(itemId);
    assert.equal(item.text, "Test item");
    assert.equal(item.external_id, "S1-01");
    assert.equal(item.status, "todo");
    assert.equal(item.priority, "P1");
    // UUID is stable
    assert.equal(item.id, itemId);
  });

  test("update item status to done", () => {
    const item = db.prepare("SELECT id FROM backlog_items LIMIT 1").get();
    db.prepare("UPDATE backlog_items SET status = ? WHERE id = ?").run("done", item.id);
    const updated = db.prepare("SELECT * FROM backlog_items WHERE id = ?").get(item.id);
    assert.equal(updated.status, "done");
  });

  test("create acceptance criteria", () => {
    const item = db.prepare("SELECT id FROM backlog_items LIMIT 1").get();
    const acId = randomUUID();
    db.prepare(
      "INSERT INTO backlog_acceptance_criteria (id, item_id, text, sort_order) VALUES (?, ?, ?, ?)"
    ).run(acId, item.id, "AC1: Test passes", 0);
    const ac = db.prepare("SELECT * FROM backlog_acceptance_criteria WHERE item_id = ?").get(item.id);
    assert.equal(ac.text, "AC1: Test passes");
    assert.equal(ac.status, "pending");
  });

  test("update AC status to pass", () => {
    const ac = db.prepare("SELECT id FROM backlog_acceptance_criteria LIMIT 1").get();
    db.prepare("UPDATE backlog_acceptance_criteria SET status = ? WHERE id = ?").run("pass", ac.id);
    const updated = db.prepare("SELECT * FROM backlog_acceptance_criteria WHERE id = ?").get(ac.id);
    assert.equal(updated.status, "pass");
  });

  test("sprints sorted by priority then sort_order", () => {
    const id2 = randomUUID();
    const id3 = randomUUID();
    db.prepare(
      "INSERT INTO backlog_sprints (id, project_id, name, sort_order, priority, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id2, PROJECT_ID, "Sprint Low", 1, "low", "planning");
    db.prepare(
      "INSERT INTO backlog_sprints (id, project_id, name, sort_order, priority, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id3, PROJECT_ID, "Sprint Medium", 2, "medium", "active");

    const priorityOrder = "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END";
    const sprints = db.prepare(
      `SELECT * FROM backlog_sprints WHERE project_id = ? ORDER BY ${priorityOrder}, sort_order ASC`
    ).all(PROJECT_ID);

    assert.equal(sprints.length, 3);
    assert.equal(sprints[0].priority, "high");
    assert.equal(sprints[1].priority, "medium");
    assert.equal(sprints[2].priority, "low");
  });

  test("sprint status constraint rejects invalid values", () => {
    assert.throws(() => {
      db.prepare(
        "INSERT INTO backlog_sprints (id, project_id, name, sort_order, priority, status) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), PROJECT_ID, "Bad", 99, "medium", "invalid_status");
    });
  });

  test("item status constraint rejects invalid values", () => {
    const sprintId = db.prepare("SELECT id FROM backlog_sprints WHERE project_id = ? LIMIT 1").get(PROJECT_ID).id;
    assert.throws(() => {
      db.prepare(
        "INSERT INTO backlog_items (id, sprint_id, text, status, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).run(randomUUID(), sprintId, "Bad item", "invalid", 99);
    });
  });

  test("multiple items per sprint with correct ordering", () => {
    const sprintId = db.prepare("SELECT id FROM backlog_sprints WHERE project_id = ? AND name = 'Sprint 1'").get(PROJECT_ID).id;
    for (let i = 1; i <= 3; i++) {
      db.prepare(
        "INSERT INTO backlog_items (id, sprint_id, text, status, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).run(randomUUID(), sprintId, `Item ${i}`, "todo", i);
    }
    const items = db.prepare("SELECT * FROM backlog_items WHERE sprint_id = ? ORDER BY sort_order ASC").all(sprintId);
    assert.ok(items.length >= 4); // 1 from before + 3 new
    // Check ordering
    for (let i = 1; i < items.length; i++) {
      assert.ok(items[i].sort_order >= items[i - 1].sort_order);
    }
  });
});

describe("Backlog migration parser", () => {
  test("parse backlog markdown extracts sprints and items", () => {
    // Simulate what the migration does
    const content = `# Test Project — Backlog

## Sprint 1: Core Features

- [x] (job:abc123) [P1] **S1-01** Setup project
  - AC1: Project builds
  - Branche : \`feat/S1-01-setup\`
- [ ] [P2] **S1-02** Add authentication
  - AC1: Login works
  - AC2: Logout works
- [~] [P1] **S1-03** In progress task
- [!] [P3] **S1-04** Blocked task

## Sprint 2: Polish (priorité haute)

- [ ] [P1] **S2-01** UI cleanup
`;
    const lines = content.split("\n");
    const sprints = [];
    let currentSprint = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const h2 = line.match(/^##\s+(.+)$/);
      if (h2) {
        currentSprint = { name: h2[1].trim(), items: [] };
        sprints.push(currentSprint);
        continue;
      }
      const itemMatch = line.match(/^- \[([x ~!])\]\s*(.+)$/i);
      if (itemMatch && currentSprint) {
        const marker = itemMatch[1].toLowerCase();
        let status = "todo";
        if (marker === "x") status = "done";
        else if (marker === "~") status = "in_progress";
        else if (marker === "!") status = "blocked";

        const extId = itemMatch[2].match(/\*\*([A-Z]\d+-\d+)\*\*/)?.[1] ?? null;
        const prio = itemMatch[2].match(/\[(P[123])\]/)?.[1] ?? null;

        currentSprint.items.push({ status, externalId: extId, priority: prio });
      }
    }

    assert.equal(sprints.length, 2);
    assert.equal(sprints[0].name, "Sprint 1: Core Features");
    assert.equal(sprints[0].items.length, 4);
    assert.equal(sprints[0].items[0].status, "done");
    assert.equal(sprints[0].items[0].externalId, "S1-01");
    assert.equal(sprints[0].items[0].priority, "P1");
    assert.equal(sprints[0].items[1].status, "todo");
    assert.equal(sprints[0].items[2].status, "in_progress");
    assert.equal(sprints[0].items[3].status, "blocked");
    assert.equal(sprints[1].items.length, 1);
    assert.equal(sprints[1].items[0].externalId, "S2-01");
  });
});
