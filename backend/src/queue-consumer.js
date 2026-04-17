"use strict";

/**
 * Agent queue consumer.
 *
 * Called once per minute by the backend cron. Picks the first queued item
 * (ordered by sort_order, priority) and spawns it as an agent job via Sona API.
 * Only one queue item runs at a time — if any item is already running, skip.
 */

/**
 * @param {object}   opts
 * @param {object}   opts.db             better-sqlite3 Database (or duck-typed mock)
 * @param {Function} opts.fetchFn        fetch function (node-fetch or mock)
 * @param {string}   opts.sonaApiUrl     Sona agent base URL
 * @param {string}   opts.projectsDir    Path to the projects directory
 * @returns {Promise<{queueId: string, jobId?: string, status: string, error?: string}|null>}
 */
async function consumeQueue({ db, fetchFn, sonaApiUrl, projectsDir }) {
  // Don't launch if something is already running
  const running = db
    .prepare("SELECT id FROM agent_queue WHERE status = 'running' LIMIT 1")
    .get();
  if (running) return null;

  // Pick the next queued item
  const next = db
    .prepare(
      `SELECT * FROM agent_queue
       WHERE status = 'queued'
       ORDER BY sort_order ASC, priority ASC, created_at ASC
       LIMIT 1`
    )
    .get();
  if (!next) return null;

  const goal = next.item_text
    ? `Project: ${next.project_id}. Task: ${next.item_text}`
    : `Process queued item for project ${next.project_id}`;

  try {
    const res = await fetchFn(`${sonaApiUrl}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`sona-agent HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const jobId = data.id;
    const now = Date.now();

    db.prepare(
      `UPDATE agent_queue
       SET status = 'running', started_at = ?, agent_job_id = ?
       WHERE id = ?`
    ).run(now, jobId, next.id);

    return { queueId: next.id, jobId, status: "spawned" };
  } catch (err) {
    db.prepare(
      "UPDATE agent_queue SET status = 'failed', completed_at = ? WHERE id = ?"
    ).run(Date.now(), next.id);

    return { queueId: next.id, error: err.message, status: "error" };
  }
}

module.exports = { consumeQueue };
