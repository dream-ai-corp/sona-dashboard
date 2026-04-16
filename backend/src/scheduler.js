/**
 * Recurring job scheduler.
 *
 * Extracted into its own module so it can be unit-tested independently
 * of the Express / SQLite runtime.
 *
 * The single public function `runDueJobs` is called once per minute by the
 * backend cron.  It queries every enabled recurring job whose next_run_at
 * timestamp has been reached, POSTs a goal to the Sona agent (/goals), and
 * writes the result back to the recurring_jobs row.
 */

"use strict";

/**
 * Find and fire all enabled recurring jobs that are currently due.
 *
 * @param {object}   opts
 * @param {object}   opts.db             better-sqlite3 Database (or duck-typed mock)
 * @param {Function} opts.fetchFn        fetch function (node-fetch or mock)
 * @param {string}   opts.sonaApiUrl     Sona agent base URL, e.g. "http://localhost:8080"
 * @param {Function} opts.computeNextRun (schedule: string, timezone: string) => number|null
 * @param {number}   [opts.now]          override current timestamp (useful in tests)
 * @returns {Promise<Array<{recurringJobId: string, jobId?: string, status: string, error?: string}>>}
 */
async function runDueJobs({ db, fetchFn, sonaApiUrl, computeNextRun, now = Date.now() }) {
  const due = db
    .prepare(
      `SELECT * FROM recurring_jobs
       WHERE enabled = 1
         AND next_run_at IS NOT NULL
         AND next_run_at <= ?
         AND (current_job_id IS NULL OR current_job_id = '')`
    )
    .all(now);

  const results = [];

  for (const rj of due) {
    try {
      const res = await fetchFn(`${sonaApiUrl}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: rj.goal }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`sona-agent HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      const jobId = data.id;
      const nextRunAt = computeNextRun(rj.schedule, rj.timezone);

      db.prepare(
        `UPDATE recurring_jobs
         SET last_run_at    = ?,
             last_status    = 'running',
             current_job_id = ?,
             next_run_at    = ?
         WHERE id = ?`
      ).run(now, jobId, nextRunAt, rj.id);

      console.log(
        `[scheduler] spawned job ${jobId} for recurring job "${rj.name}" (${rj.id})`
      );
      results.push({ recurringJobId: rj.id, jobId, status: "spawned" });
    } catch (err) {
      const nextRunAt = computeNextRun(rj.schedule, rj.timezone);

      db.prepare(
        `UPDATE recurring_jobs
         SET last_run_at    = ?,
             last_status    = 'error',
             current_job_id = NULL,
             next_run_at    = ?
         WHERE id = ?`
      ).run(now, nextRunAt, rj.id);

      console.error(
        `[scheduler] failed to spawn for recurring job "${rj.name}" (${rj.id}):`,
        err.message
      );
      results.push({ recurringJobId: rj.id, error: err.message, status: "error" });
    }
  }

  return results;
}

module.exports = { runDueJobs };
