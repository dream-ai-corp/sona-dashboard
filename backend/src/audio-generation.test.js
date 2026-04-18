"use strict";
/**
 * Unit tests for S3-10: /api/generate/audio backend logic.
 * Uses Node's built-in test runner (node --test).
 * Pure-function tests — no express, no SQLite, no network.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// ── Extracted logic under test ─────────────────────────────────────────────────

/** Replicates the audio job store logic from index.js */
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

/** Input validation extracted from POST /api/generate/audio */
function validateAudioRequest(body) {
  const { prompt, model = "musicgen-small", type = "music", duration = 10 } = body || {};
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { ok: false, error: "prompt is required" };
  }
  if (typeof model !== "string") {
    return { ok: false, error: "model must be a string" };
  }
  if (!["music", "sound_effect", "voice"].includes(type)) {
    return { ok: false, error: "type must be music, sound_effect, or voice" };
  }
  if (![5, 10, 15, 30].includes(duration)) {
    return { ok: false, error: "duration must be 5, 10, 15, or 30" };
  }
  return { ok: true };
}

/** Replicates Replicate polling logic for audio with injectable fetch */
async function pollReplicateAudio(predictionId, apiKey, onProgress, fetchFn, maxWaitMs = 9000) {
  const startedAt = Date.now();
  const deadline = startedAt + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10)); // tiny delay in tests
    const r = await fetchFn(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (!r.ok) throw new Error(`Replicate poll HTTP ${r.status}`);
    const data = await r.json();
    if (data.status === "succeeded") {
      const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!outputUrl) throw new Error("Replicate: empty output");
      onProgress(100, "Terminé");
      return outputUrl;
    }
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(data.error || `Replicate: status ${data.status}`);
    }
    const elapsed = Date.now() - startedAt;
    const estimatedProgress = Math.min(95, 15 + Math.round((elapsed / maxWaitMs) * 80));
    onProgress(estimatedProgress, `Génération Replicate… (${data.status})`);
  }
  throw new Error("Replicate: timeout — audio generation took too long");
}

/** Replicates buildAudioInput from index.js */
function buildAudioInput(model, prompt, duration) {
  if (model === "bark") {
    return { prompt, text_prompt: prompt };
  } else if (model === "audiogen") {
    return { model_version: "stereo-large", prompt, duration };
  } else {
    // musicgen-small / musicgen-large
    return {
      model_version: model === "musicgen-large" ? "stereo-large" : "stereo-melody-large",
      prompt,
      duration,
      output_format: "mp3",
    };
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("audio job store", () => {
  test("creates a job with pending status and zero progress", () => {
    const store = makeJobStore();
    const jobId = store.createJob();
    const job = store.getJob(jobId);
    assert.strictEqual(job.status, "pending");
    assert.strictEqual(job.progress, 0);
    assert.strictEqual(job.url, null);
    assert.strictEqual(job.error, null);
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
    store.updateJob(jobId, { status: "succeeded", progress: 100, url: "https://example.com/audio.mp3" });
    const job = store.getJob(jobId);
    assert.strictEqual(job.status, "succeeded");
    assert.strictEqual(job.url, "https://example.com/audio.mp3");
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

describe("validateAudioRequest", () => {
  test("accepts valid request with defaults", () => {
    const result = validateAudioRequest({ prompt: "upbeat jazz music" });
    assert.deepStrictEqual(result, { ok: true });
  });

  test("accepts all valid type values", () => {
    for (const type of ["music", "sound_effect", "voice"]) {
      const r = validateAudioRequest({ prompt: "test", type });
      assert.strictEqual(r.ok, true, `type "${type}" should be valid`);
    }
  });

  test("accepts all valid duration values", () => {
    for (const duration of [5, 10, 15, 30]) {
      const r = validateAudioRequest({ prompt: "test", duration });
      assert.strictEqual(r.ok, true, `duration ${duration} should be valid`);
    }
  });

  test("rejects missing prompt — AC4", () => {
    const result = validateAudioRequest({});
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("prompt"));
  });

  test("rejects empty string prompt — AC4", () => {
    const result = validateAudioRequest({ prompt: "   " });
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("prompt"));
  });

  test("rejects null body gracefully", () => {
    const result = validateAudioRequest(null);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("prompt"));
  });

  test("rejects non-string model", () => {
    const result = validateAudioRequest({ prompt: "test", model: 42 });
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("model"));
  });

  test("rejects invalid type", () => {
    const result = validateAudioRequest({ prompt: "test", type: "invalid" });
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("type"));
  });

  test("rejects invalid duration", () => {
    const result = validateAudioRequest({ prompt: "test", duration: 7 });
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("duration"));
  });
});

describe("buildAudioInput", () => {
  test("musicgen-small uses stereo-melody-large version", () => {
    const input = buildAudioInput("musicgen-small", "jazz melody", 10);
    assert.strictEqual(input.model_version, "stereo-melody-large");
    assert.strictEqual(input.prompt, "jazz melody");
    assert.strictEqual(input.duration, 10);
    assert.strictEqual(input.output_format, "mp3");
  });

  test("musicgen-large uses stereo-large version", () => {
    const input = buildAudioInput("musicgen-large", "epic orchestra", 30);
    assert.strictEqual(input.model_version, "stereo-large");
    assert.strictEqual(input.output_format, "mp3");
  });

  test("audiogen uses stereo-large and no output_format", () => {
    const input = buildAudioInput("audiogen", "rain sound", 15);
    assert.strictEqual(input.model_version, "stereo-large");
    assert.strictEqual(input.prompt, "rain sound");
    assert.strictEqual(input.duration, 15);
    assert.strictEqual(input.output_format, undefined);
  });

  test("bark sets both prompt and text_prompt, no duration", () => {
    const input = buildAudioInput("bark", "hello world", 10);
    assert.strictEqual(input.prompt, "hello world");
    assert.strictEqual(input.text_prompt, "hello world");
    assert.strictEqual(input.duration, undefined);
  });
});

describe("pollReplicateAudio", () => {
  test("returns url when prediction succeeds on first poll — AC3", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ status: "succeeded", output: ["https://cdn.replicate.com/audio.mp3"] }),
      };
    };
    const progressUpdates = [];
    const url = await pollReplicateAudio("pred-123", "r8_token", (p, m) => progressUpdates.push({ p, m }), mockFetch);
    assert.strictEqual(url, "https://cdn.replicate.com/audio.mp3");
    assert.strictEqual(callCount, 1);
  });

  test("returns url when output is a string (not array) — AC3", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ status: "succeeded", output: "https://cdn.replicate.com/single.mp3" }),
    });
    const url = await pollReplicateAudio("pred-abc", "token", () => {}, mockFetch);
    assert.strictEqual(url, "https://cdn.replicate.com/single.mp3");
  });

  test("throws on failed prediction", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ status: "failed", error: "model overloaded" }),
    });
    await assert.rejects(
      () => pollReplicateAudio("pred-fail", "token", () => {}, mockFetch),
      /model overloaded/
    );
  });

  test("throws on canceled prediction", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ status: "canceled" }),
    });
    await assert.rejects(
      () => pollReplicateAudio("pred-cancel", "token", () => {}, mockFetch),
      /canceled/
    );
  });

  test("throws when output is empty after success", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ status: "succeeded", output: null }),
    });
    await assert.rejects(
      () => pollReplicateAudio("pred-empty", "token", () => {}, mockFetch),
      /empty output/
    );
  });

  test("throws when poll returns non-ok HTTP", async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    await assert.rejects(
      () => pollReplicateAudio("pred-429", "token", () => {}, mockFetch),
      /HTTP 429/
    );
  });

  test("calls onProgress while waiting", async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls++;
      if (calls < 3) return { ok: true, json: async () => ({ status: "processing" }) };
      return { ok: true, json: async () => ({ status: "succeeded", output: ["https://example.com/a.mp3"] }) };
    };
    const progressUpdates = [];
    await pollReplicateAudio("pred-progress", "token", (p, m) => progressUpdates.push(p), mockFetch);
    assert.ok(progressUpdates.length >= 2, "should have called onProgress for intermediate polls");
  });

  test("throws on timeout", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ status: "processing" }),
    });
    await assert.rejects(
      () => pollReplicateAudio("pred-timeout", "token", () => {}, mockFetch, 50),
      /timeout/i
    );
  });
});

describe("audio models list", () => {
  const REPLICATE_AUDIO_MODELS = {
    "musicgen-small": "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
    "musicgen-large": "meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ebb84d27d063c",
    "audiogen": "meta/audiogen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ebb84d27d063c",
    "bark": "suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787",
  };

  test("MusicGen and Bark are available model IDs", () => {
    assert.ok("musicgen-small" in REPLICATE_AUDIO_MODELS, "musicgen-small should exist");
    assert.ok("musicgen-large" in REPLICATE_AUDIO_MODELS, "musicgen-large should exist");
    assert.ok("bark" in REPLICATE_AUDIO_MODELS, "bark should exist");
    assert.ok("audiogen" in REPLICATE_AUDIO_MODELS, "audiogen should exist");
  });

  test("all model IDs are valid Replicate version strings", () => {
    for (const [id, version] of Object.entries(REPLICATE_AUDIO_MODELS)) {
      assert.ok(typeof version === "string" && version.length > 10, `${id} should have a valid version string`);
      assert.ok(version.includes(":"), `${id} version should include a hash separator`);
    }
  });
});
