"use strict";
/**
 * Unit tests for the agent queue consumer.
 * Uses Node's built-in test runner (node --test).
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { consumeQueue } = require("./queue-consumer.js");

// ── Minimal MockDb for queue-consumer ────────────────────────────────────────

class MockDb {
  constructor() {
    this._queue = [];
  }

  addItem(item) {
    this._queue.push({
      id: item.id ?? "q-1",
      item_id: item.item_id ?? null,
      item_text: item.item_text ?? "Test task",
      project_id: item.project_id ?? "test-project",
      sprint_id: item.sprint_id ?? null,
      priority: item.priority ?? 2,
      status: item.status ?? "queued",
      scheduled_at: item.scheduled_at ?? Date.now(),
      started_at: item.started_at ?? null,
      completed_at: item.completed_at ?? null,
      agent_job_id: item.agent_job_id ?? null,
      estimated_duration_sec: item.estimated_duration_sec ?? null,
      sort_order: item.sort_order ?? 0,
      created_at: item.created_at ?? Date.now(),
    });
    return this;
  }

  prepare(sql) {
    const s = sql.replace(/\s+/g, " ").trim();
    const queue = this._queue;

    return {
      get(...args) {
        // SELECT running item
        if (s.includes("status = 'running'") && s.includes("LIMIT 1")) {
          return queue.find((q) => q.status === "running") ?? undefined;
        }
        // SELECT next queued item
        if (s.includes("status = 'queued'") && s.includes("ORDER BY")) {
          const queued = queue
            .filter((q) => q.status === "queued")
            .sort((a, b) => a.sort_order - b.sort_order || a.priority - b.priority || a.created_at - b.created_at);
          return queued[0] ?? undefined;
        }
        return undefined;
      },

      run(...args) {
        // UPDATE to running
        if (s.includes("status = 'running'") && s.includes("started_at")) {
          const [now, jobId, id] = args;
          const item = queue.find((q) => q.id === id);
          if (item) {
            item.status = "running";
            item.started_at = now;
            item.agent_job_id = jobId;
          }
          return;
        }
        // UPDATE to failed
        if (s.includes("status = 'failed'")) {
          const [now, id] = args;
          const item = queue.find((q) => q.id === id);
          if (item) {
            item.status = "failed";
            item.completed_at = now;
          }
          return;
        }
      },
    };
  }
}

function okFetch(jobId = "fake-job-uuid") {
  return async () => ({
    ok: true,
    json: async () => ({ id: jobId }),
    text: async () => JSON.stringify({ id: jobId }),
  });
}

function errFetch(status = 503) {
  return async () => ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => "service unavailable",
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("consumeQueue", () => {
  test("returns null when queue is empty", async () => {
    const db = new MockDb();
    const result = await consumeQueue({
      db,
      fetchFn: okFetch(),
      sonaApiUrl: "http://sona",
      projectsDir: "/tmp",
    });
    assert.equal(result, null);
  });

  test("returns null when an item is already running", async () => {
    const db = new MockDb();
    db.addItem({ id: "q-running", status: "running" });
    db.addItem({ id: "q-queued", status: "queued" });

    let called = false;
    const result = await consumeQueue({
      db,
      fetchFn: async () => { called = true; return okFetch()(); },
      sonaApiUrl: "http://sona",
      projectsDir: "/tmp",
    });

    assert.equal(result, null);
    assert.equal(called, false);
  });

  test("spawns the next queued item and marks it running", async () => {
    const db = new MockDb();
    db.addItem({ id: "q-1", item_text: "Build feature X", project_id: "my-project" });

    const result = await consumeQueue({
      db,
      fetchFn: okFetch("spawned-job-1"),
      sonaApiUrl: "http://sona",
      projectsDir: "/tmp",
    });

    assert.equal(result.status, "spawned");
    assert.equal(result.jobId, "spawned-job-1");
    assert.equal(result.queueId, "q-1");

    const item = db._queue.find((q) => q.id === "q-1");
    assert.equal(item.status, "running");
    assert.equal(item.agent_job_id, "spawned-job-1");
    assert.ok(item.started_at > 0);
  });

  test("respects sort_order priority", async () => {
    const db = new MockDb();
    db.addItem({ id: "q-low", sort_order: 5, priority: 2 });
    db.addItem({ id: "q-high", sort_order: 1, priority: 1 });

    const result = await consumeQueue({
      db,
      fetchFn: okFetch("job-high"),
      sonaApiUrl: "http://sona",
      projectsDir: "/tmp",
    });

    assert.equal(result.queueId, "q-high");
  });

  test("marks item as failed on fetch error", async () => {
    const db = new MockDb();
    db.addItem({ id: "q-fail" });

    const result = await consumeQueue({
      db,
      fetchFn: errFetch(503),
      sonaApiUrl: "http://sona",
      projectsDir: "/tmp",
    });

    assert.equal(result.status, "error");
    assert.ok(result.error);

    const item = db._queue.find((q) => q.id === "q-fail");
    assert.equal(item.status, "failed");
    assert.ok(item.completed_at > 0);
  });

  test("marks item as failed on network throw", async () => {
    const db = new MockDb();
    db.addItem({ id: "q-throw" });

    const result = await consumeQueue({
      db,
      fetchFn: async () => { throw new Error("ECONNREFUSED"); },
      sonaApiUrl: "http://sona",
      projectsDir: "/tmp",
    });

    assert.equal(result.status, "error");
    assert.match(result.error, /ECONNREFUSED/);
  });

  test("sends correct goal text to sona-agent", async () => {
    const db = new MockDb();
    db.addItem({ id: "q-goal", item_text: "Deploy SSL", project_id: "sona-dashboard" });

    let capturedBody = null;
    const fetchFn = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: "j-1" }), text: async () => "" };
    };

    await consumeQueue({
      db,
      fetchFn,
      sonaApiUrl: "http://sona",
      projectsDir: "/tmp",
    });

    assert.ok(capturedBody.goal.includes("Deploy SSL"));
    assert.ok(capturedBody.goal.includes("sona-dashboard"));
  });
});
