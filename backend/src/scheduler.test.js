"use strict";
/**
 * Unit tests for the recurring-job scheduler.
 * Uses Node's built-in test runner (node --test).
 *
 * A lightweight in-memory MockDb replaces better-sqlite3 so tests run on the
 * host without needing the native .node module (which is compiled for the
 * Alpine Docker image and cannot load on Debian/glibc).
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { runDueJobs } = require("./scheduler.js");

// ── Minimal MockDb ────────────────────────────────────────────────────────────
// Implements exactly the prepare().all() / prepare().run() / prepare().get()
// patterns used in scheduler.js.

class MockDb {
  constructor() {
    this._rows = [];
  }

  insert(row) {
    this._rows.push({ ...row });
    return this;
  }

  prepare(sql) {
    // Normalise whitespace so multi-space SQL templates still match our checks
    const s = sql.replace(/\s+/g, " ").trim();
    const rows = this._rows;

    return {
      // SELECT: filter rows based on SQL keywords we know scheduler.js uses
      all(now) {
        if (
          s.includes("enabled = 1") &&
          s.includes("next_run_at <= ?") &&
          s.includes("current_job_id IS NULL")
        ) {
          return rows.filter(
            (r) =>
              r.enabled === 1 &&
              r.next_run_at !== null &&
              r.next_run_at !== undefined &&
              r.next_run_at <= now &&
              (r.current_job_id === null || r.current_job_id === undefined || r.current_job_id === "")
          );
        }
        return [];
      },

      // UPDATE — parse the SET clause by matching known SQL shapes
      run(...args) {
        // Shape 1: mark running
        //   SET last_run_at = ?, last_status = 'running', current_job_id = ?, next_run_at = ? WHERE id = ?
        if (s.includes("last_status = 'running'") && s.includes("current_job_id = ?")) {
          const [last_run_at, current_job_id, next_run_at, id] = args;
          const r = rows.find((x) => x.id === id);
          if (r) { r.last_run_at = last_run_at; r.last_status = "running"; r.current_job_id = current_job_id; r.next_run_at = next_run_at; }
          return;
        }

        // Shape 2: mark error
        //   SET last_run_at = ?, last_status = 'error', current_job_id = NULL, next_run_at = ? WHERE id = ?
        if (s.includes("last_status = 'error'")) {
          const [last_run_at, next_run_at, id] = args;
          const r = rows.find((x) => x.id === id);
          if (r) { r.last_run_at = last_run_at; r.last_status = "error"; r.current_job_id = null; r.next_run_at = next_run_at; }
          return;
        }
      },

      get(id) {
        return rows.find((r) => r.id === id) ?? null;
      },
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(overrides = {}) {
  return {
    id: "rj-test-1",
    name: "Test job",
    goal: "Do something useful",
    schedule: "* * * * *",
    timezone: "UTC",
    enabled: 1,
    last_run_at: null,
    last_status: null,
    next_run_at: Date.now() - 1_000, // already due
    current_job_id: null,
    ...overrides,
  };
}

const fakeNextRun = () => Date.now() + 60_000;

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runDueJobs", () => {
  test("fires a due job and updates DB with running status + job id", async () => {
    const db = new MockDb();
    db.insert(makeJob());

    const results = await runDueJobs({
      db,
      fetchFn: okFetch("spawned-uuid"),
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "spawned");
    assert.equal(results[0].jobId, "spawned-uuid");

    const row = db._rows.find((r) => r.id === "rj-test-1");
    assert.equal(row.last_status, "running");
    assert.equal(row.current_job_id, "spawned-uuid");
    assert.ok(row.last_run_at > 0, "last_run_at must be set");
    assert.ok(row.next_run_at > Date.now(), "next_run_at must be advanced");
  });

  test("skips a job that already has a current_job_id (already running)", async () => {
    const db = new MockDb();
    db.insert(makeJob({ current_job_id: "already-running-job" }));

    let called = false;
    const results = await runDueJobs({
      db,
      fetchFn: async () => { called = true; return okFetch()(); },
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
    });

    assert.equal(results.length, 0);
    assert.equal(called, false, "fetch must not be called when job is already running");
  });

  test("skips disabled jobs", async () => {
    const db = new MockDb();
    db.insert(makeJob({ enabled: 0 }));

    let called = false;
    const results = await runDueJobs({
      db,
      fetchFn: async () => { called = true; return okFetch()(); },
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
    });

    assert.equal(results.length, 0);
    assert.equal(called, false);
  });

  test("skips jobs whose next_run_at is in the future", async () => {
    const db = new MockDb();
    db.insert(makeJob({ next_run_at: Date.now() + 3_600_000 }));

    let called = false;
    const results = await runDueJobs({
      db,
      fetchFn: async () => { called = true; return okFetch()(); },
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
    });

    assert.equal(results.length, 0);
    assert.equal(called, false);
  });

  test("skips jobs whose next_run_at is null", async () => {
    const db = new MockDb();
    db.insert(makeJob({ next_run_at: null }));

    const results = await runDueJobs({
      db,
      fetchFn: okFetch(),
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
    });

    assert.equal(results.length, 0);
  });

  test("records error status when sona-agent returns a non-2xx response", async () => {
    const db = new MockDb();
    db.insert(makeJob());

    const results = await runDueJobs({
      db,
      fetchFn: errFetch(503),
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "error");
    assert.ok(results[0].error, "error message must be populated");

    const row = db._rows.find((r) => r.id === "rj-test-1");
    assert.equal(row.last_status, "error");
    assert.equal(row.current_job_id, null, "current_job_id must be cleared on error");
    assert.ok(row.next_run_at > Date.now(), "next_run_at must be advanced even after error");
    assert.ok(row.last_run_at > 0, "last_run_at must be recorded even after error");
  });

  test("records error status when fetch throws (network failure)", async () => {
    const db = new MockDb();
    db.insert(makeJob());

    const results = await runDueJobs({
      db,
      fetchFn: async () => { throw new Error("ECONNREFUSED"); },
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "error");
    assert.match(results[0].error, /ECONNREFUSED/);

    const row = db._rows.find((r) => r.id === "rj-test-1");
    assert.equal(row.last_status, "error");
    assert.equal(row.current_job_id, null);
  });

  test("fires multiple due jobs independently; one failure does not abort others", async () => {
    const db = new MockDb();
    const now = Date.now();
    db.insert(makeJob({ id: "rj-ok", name: "OK job", goal: "ok-goal", next_run_at: now - 1_000 }));
    db.insert(makeJob({ id: "rj-fail", name: "Fail job", goal: "fail-goal", next_run_at: now - 500 }));

    let callCount = 0;
    const fetchFn = async (_url, opts) => {
      callCount++;
      const body = JSON.parse(opts.body);
      if (body.goal === "fail-goal") throw new Error("simulated failure");
      return { ok: true, json: async () => ({ id: `job-${callCount}` }), text: async () => "" };
    };

    const results = await runDueJobs({
      db,
      fetchFn,
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
    });

    assert.equal(results.length, 2, "both jobs must produce a result");
    assert.equal(results.filter((r) => r.status === "spawned").length, 1);
    assert.equal(results.filter((r) => r.status === "error").length, 1);
  });

  test("respects the 'now' override for deterministic timestamp comparisons", async () => {
    const db = new MockDb();
    const futureTs = Date.now() + 5_000;
    // next_run_at is 5 s in the future relative to real clock, but 'now' is set to 6 s ahead
    db.insert(makeJob({ next_run_at: futureTs }));

    const results = await runDueJobs({
      db,
      fetchFn: okFetch(),
      sonaApiUrl: "http://sona",
      computeNextRun: fakeNextRun,
      now: futureTs + 1_000,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "spawned");
  });

  test("sends the correct goal text and URL to the sona-agent", async () => {
    const db = new MockDb();
    const customGoal = "Analyse all backlog items and report to Discord";
    db.insert(makeJob({ goal: customGoal }));

    let capturedUrl = null;
    let capturedBody = null;
    const fetchFn = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: "job-x" }), text: async () => "" };
    };

    await runDueJobs({
      db,
      fetchFn,
      sonaApiUrl: "http://sona-api",
      computeNextRun: fakeNextRun,
    });

    assert.equal(capturedUrl, "http://sona-api/goals");
    assert.ok(capturedBody, "fetch must have been called with a body");
    assert.equal(capturedBody.goal, customGoal);
  });
});
