"use strict";
/**
 * Unit tests for S3-08: /api/generate/video backend logic.
 * Uses Node's built-in test runner (node --test).
 * Pure-function tests — no express, no SQLite, no network.
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// ── Extracted logic under test ─────────────────────────────────────────────────

/** Replicates the video job store logic from index.js */
function makeJobStore() {
  const jobs = new Map();

  function createJob() {
    const jobId = require("crypto").randomUUID();
    jobs.set(jobId, {
      status: "pending",
      progress: 0,
      message: "Initialisation...",
      url: null,
      error: null,
      createdAt: Date.now(),
    });
    return jobId;
  }

  function updateJob(jobId, updates) {
    const job = jobs.get(jobId);
    if (job) jobs.set(jobId, { ...job, ...updates });
  }

  function getJob(jobId) {
    return jobs.get(jobId);
  }

  function deleteJob(jobId) {
    jobs.delete(jobId);
  }

  return { jobs, createJob, updateJob, getJob, deleteJob };
}

/** Input validation extracted from POST /api/generate/video */
function validateVideoRequest(body) {
  const { prompt, model = "wan2.1", duration = 4 } = body || {};
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { ok: false, error: "prompt is required" };
  }
  if (typeof model !== "string") {
    return { ok: false, error: "model must be a string" };
  }
  if (![2, 4, 8].includes(duration)) {
    return { ok: false, error: "duration must be 2, 4, or 8" };
  }
  return { ok: true };
}

/** Replicates dev-mode placeholder (no API keys) */
async function devModePlaceholder(prompt) {
  const { Buffer } = require("buffer");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#1e1b4b"/><text x="50%" y="50%" font-family="monospace" font-size="22" fill="#a78bfa" text-anchor="middle" dominant-baseline="middle">[dev] ${prompt.slice(0, 40)}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Replicates Replicate polling logic with injectable fetch */
async function pollReplicateVideo(predictionId, token, onProgress, fetchFn, maxWaitMs = 9000) {
  const startedAt = Date.now();
  const deadline = startedAt + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10)); // tiny delay in tests
    const r = await fetchFn(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${token}` },
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
    onProgress(estimatedProgress, `Génération Replicate… (${data.status})`);
  }
  throw new Error("Replicate: timeout — video generation took too long");
}

/** Replicates fal.ai polling logic with injectable fetch */
async function pollFalVideo(endpoint, requestId, apiKey, onProgress, fetchFn, maxWaitMs = 9000) {
  const startedAt = Date.now();
  const deadline = startedAt + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
    const statusRes = await fetchFn(
      `https://queue.fal.run/${endpoint}/requests/${requestId}/status`,
      { headers: { Authorization: `Key ${apiKey}` } }
    );
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === "COMPLETED") {
      const resultRes = await fetchFn(
        `https://queue.fal.run/${endpoint}/requests/${requestId}`,
        { headers: { Authorization: `Key ${apiKey}` } }
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
    onProgress(estimatedProgress, lastLog.slice(0, 120));
  }
  throw new Error("fal.ai: timeout — video generation took too long");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("video job store", () => {
  test("creates a job with pending status and zero progress", () => {
    const store = makeJobStore();
    const jobId = store.createJob();
    const job = store.getJob(jobId);
    assert.strictEqual(job.status, "pending");
    assert.strictEqual(job.progress, 0);
    assert.ok(job.url === null);
    assert.ok(job.error === null);
  });

  test("returns undefined for unknown job ID", () => {
    const store = makeJobStore();
    assert.strictEqual(store.getJob("nonexistent-id"), undefined);
  });

  test("updateJob merges fields without losing existing ones", () => {
    const store = makeJobStore();
    const jobId = store.createJob();
    store.updateJob(jobId, { status: "running", progress: 25 });
    const job = store.getJob(jobId);
    assert.strictEqual(job.status, "running");
    assert.strictEqual(job.progress, 25);
    assert.strictEqual(job.message, "Initialisation..."); // unchanged
  });

  test("updateJob sets url on success", () => {
    const store = makeJobStore();
    const jobId = store.createJob();
    store.updateJob(jobId, { status: "succeeded", progress: 100, url: "https://example.com/video.mp4" });
    const job = store.getJob(jobId);
    assert.strictEqual(job.status, "succeeded");
    assert.strictEqual(job.url, "https://example.com/video.mp4");
  });

  test("updateJob sets error on failure", () => {
    const store = makeJobStore();
    const jobId = store.createJob();
    store.updateJob(jobId, { status: "failed", error: "provider error" });
    const job = store.getJob(jobId);
    assert.strictEqual(job.status, "failed");
    assert.strictEqual(job.error, "provider error");
  });

  test("deleteJob removes the job", () => {
    const store = makeJobStore();
    const jobId = store.createJob();
    store.deleteJob(jobId);
    assert.strictEqual(store.getJob(jobId), undefined);
  });

  test("multiple jobs are tracked independently", () => {
    const store = makeJobStore();
    const id1 = store.createJob();
    const id2 = store.createJob();
    store.updateJob(id1, { status: "succeeded", progress: 100 });
    assert.strictEqual(store.getJob(id1).status, "succeeded");
    assert.strictEqual(store.getJob(id2).status, "pending");
  });
});

describe("validateVideoRequest", () => {
  test("accepts valid request with defaults", () => {
    const result = validateVideoRequest({ prompt: "a cat flying" });
    assert.deepStrictEqual(result, { ok: true });
  });

  test("accepts explicit valid duration values", () => {
    for (const duration of [2, 4, 8]) {
      const r = validateVideoRequest({ prompt: "test", duration });
      assert.strictEqual(r.ok, true, `duration ${duration} should be valid`);
    }
  });

  test("rejects missing prompt", () => {
    const result = validateVideoRequest({});
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("prompt"));
  });

  test("rejects empty string prompt", () => {
    const result = validateVideoRequest({ prompt: "   " });
    assert.strictEqual(result.ok, false);
  });

  test("rejects non-string model", () => {
    const result = validateVideoRequest({ prompt: "test", model: 42 });
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("model"));
  });

  test("rejects invalid duration", () => {
    const result = validateVideoRequest({ prompt: "test", duration: 5 });
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("duration"));
  });

  test("rejects null body gracefully", () => {
    const result = validateVideoRequest(null);
    assert.strictEqual(result.ok, false);
  });
});

describe("dev mode placeholder", () => {
  test("returns a data URL", async () => {
    const url = await devModePlaceholder("a test prompt");
    assert.ok(url.startsWith("data:image/svg+xml;base64,"), "should be a base64 SVG data URL");
  });

  test("encodes prompt text into SVG", async () => {
    const url = await devModePlaceholder("flying dragon");
    const decoded = Buffer.from(url.replace("data:image/svg+xml;base64,", ""), "base64").toString();
    assert.ok(decoded.includes("[dev]"), "SVG should contain [dev] tag");
  });

  test("truncates long prompts to 40 chars", async () => {
    const longPrompt = "a".repeat(100);
    const url = await devModePlaceholder(longPrompt);
    const decoded = Buffer.from(url.replace("data:image/svg+xml;base64,", ""), "base64").toString();
    // The embedded text in the SVG should not exceed 40 a's
    assert.ok(!decoded.includes("a".repeat(41)), "prompt should be truncated to 40 chars");
  });
});

describe("pollReplicateVideo", () => {
  test("returns url when prediction succeeds on first poll", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        json: async () => ({ status: "succeeded", output: ["https://cdn.example.com/out.mp4"] }),
      };
    };
    const progressUpdates = [];
    const result = await pollReplicateVideo("pred-123", "r8_token", (p, m) => progressUpdates.push({ p, m }), mockFetch);
    assert.strictEqual(result.url, "https://cdn.example.com/out.mp4");
    assert.strictEqual(callCount, 1);
  });

  test("returns url when output is a string (not array)", async () => {
    const mockFetch = async () => ({
      json: async () => ({ status: "succeeded", output: "https://cdn.example.com/single.mp4" }),
    });
    const result = await pollReplicateVideo("pred-abc", "token", () => {}, mockFetch);
    assert.strictEqual(result.url, "https://cdn.example.com/single.mp4");
  });

  test("throws on failed prediction", async () => {
    const mockFetch = async () => ({
      json: async () => ({ status: "failed", error: "NSFW content detected" }),
    });
    await assert.rejects(
      () => pollReplicateVideo("pred-fail", "token", () => {}, mockFetch),
      /NSFW content detected/
    );
  });

  test("throws on canceled prediction", async () => {
    const mockFetch = async () => ({
      json: async () => ({ status: "canceled" }),
    });
    await assert.rejects(
      () => pollReplicateVideo("pred-cancel", "token", () => {}, mockFetch),
      /canceled/
    );
  });

  test("calls onProgress while waiting", async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls++;
      if (calls < 3) return { json: async () => ({ status: "processing" }) };
      return { json: async () => ({ status: "succeeded", output: ["https://example.com/v.mp4"] }) };
    };
    const progressUpdates = [];
    await pollReplicateVideo("pred-progress", "token", (p, m) => progressUpdates.push(p), mockFetch);
    // Should have called onProgress for the two 'processing' polls
    assert.ok(progressUpdates.length >= 2);
  });

  test("throws on timeout", async () => {
    const mockFetch = async () => ({
      json: async () => ({ status: "processing" }),
    });
    await assert.rejects(
      () => pollReplicateVideo("pred-timeout", "token", () => {}, mockFetch, 50),
      /timeout/i
    );
  });
});

describe("pollFalVideo", () => {
  test("returns url when status is COMPLETED", async () => {
    let callCount = 0;
    const mockFetch = async (url) => {
      callCount++;
      if (url.includes("/status")) {
        return { ok: true, json: async () => ({ status: "COMPLETED" }) };
      }
      return { ok: true, json: async () => ({ video: { url: "https://fal.ai/output.mp4" } }) };
    };
    const result = await pollFalVideo("fal-ai/wan-t2v", "req-456", "fal_key", () => {}, mockFetch);
    assert.strictEqual(result.url, "https://fal.ai/output.mp4");
  });

  test("also accepts video_url top-level field", async () => {
    const mockFetch = async (url) => {
      if (url.includes("/status")) return { ok: true, json: async () => ({ status: "COMPLETED" }) };
      return { ok: true, json: async () => ({ video_url: "https://fal.ai/video_url.mp4" }) };
    };
    const result = await pollFalVideo("fal-ai/wan-t2v", "req-789", "key", () => {}, mockFetch);
    assert.strictEqual(result.url, "https://fal.ai/video_url.mp4");
  });

  test("throws when FAILED", async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ status: "FAILED" }) });
    await assert.rejects(
      () => pollFalVideo("fal-ai/wan-t2v", "req-fail", "key", () => {}, mockFetch),
      /fal\.ai: generation failed/
    );
  });

  test("skips non-ok status responses and retries", async () => {
    let calls = 0;
    const mockFetch = async (url) => {
      calls++;
      if (url.includes("/status")) {
        if (calls <= 2) return { ok: false, json: async () => ({}) };
        return { ok: true, json: async () => ({ status: "COMPLETED" }) };
      }
      return { ok: true, json: async () => ({ video: { url: "https://example.com/retry.mp4" } }) };
    };
    const result = await pollFalVideo("fal-ai/wan-t2v", "req-retry", "key", () => {}, mockFetch);
    assert.strictEqual(result.url, "https://example.com/retry.mp4");
  });

  test("propagates progress from fal.ai logs", async () => {
    let calls = 0;
    const progressMessages = [];
    const mockFetch = async (url) => {
      calls++;
      if (url.includes("/status")) {
        if (calls < 3) {
          return {
            ok: true,
            json: async () => ({
              status: "IN_QUEUE",
              logs: [{ message: `step ${calls}/10` }],
            }),
          };
        }
        return { ok: true, json: async () => ({ status: "COMPLETED" }) };
      }
      return { ok: true, json: async () => ({ video: { url: "https://example.com/log.mp4" } }) };
    };
    await pollFalVideo("fal-ai/wan-t2v", "req-log", "key", (p, m) => progressMessages.push(m), mockFetch);
    assert.ok(progressMessages.some((m) => m.includes("step")), "should propagate log messages");
  });

  test("throws on timeout", async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ status: "IN_QUEUE" }) });
    await assert.rejects(
      () => pollFalVideo("fal-ai/wan-t2v", "req-timeout", "key", () => {}, mockFetch, 50),
      /timeout/i
    );
  });
});
