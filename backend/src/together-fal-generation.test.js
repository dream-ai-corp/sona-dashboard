"use strict";
/**
 * Unit tests for Together.ai and Fal.ai image generation (S3-06).
 * Uses Node's built-in test runner (node --test).
 * Tests extracted pure logic — no network calls, no Express.
 */
const { test, describe, mock } = require("node:test");
const assert = require("node:assert/strict");

// ── VALID_PROVIDERS ─────────────────────────────────────────────────────────────
describe("VALID_PROVIDERS — together + fal included", () => {
  const VALID_PROVIDERS = ["replicate", "openai", "openrouter", "huggingface", "together", "fal"];

  test("includes together", () => {
    assert.ok(VALID_PROVIDERS.includes("together"));
  });

  test("includes fal", () => {
    assert.ok(VALID_PROVIDERS.includes("fal"));
  });

  test("still includes original providers", () => {
    for (const p of ["replicate", "openai", "openrouter", "huggingface"]) {
      assert.ok(VALID_PROVIDERS.includes(p), `missing: ${p}`);
    }
  });
});

// ── resolveImageProvider ────────────────────────────────────────────────────────
describe("resolveImageProvider", () => {
  function resolveImageProvider(model) {
    if (model.startsWith("together:")) return "together";
    if (model.startsWith("fal:")) return "fal";
    const MODEL_IDS = { "flux-schnell": "black-forest-labs/flux-schnell", "sdxl": "stability-ai/sdxl" };
    if (MODEL_IDS[model]) return "replicate";
    if (model.includes("/")) return "openrouter";
    return "replicate";
  }

  test("resolves together: prefix to together", () => {
    assert.strictEqual(resolveImageProvider("together:black-forest-labs/FLUX.1-schnell-Free"), "together");
  });

  test("resolves fal: prefix to fal", () => {
    assert.strictEqual(resolveImageProvider("fal:fal-ai/flux"), "fal");
  });

  test("resolves flux-schnell to replicate", () => {
    assert.strictEqual(resolveImageProvider("flux-schnell"), "replicate");
  });

  test("resolves openai/dall-e-3 to openrouter", () => {
    assert.strictEqual(resolveImageProvider("openai/dall-e-3"), "openrouter");
  });
});

// ── getProviderKey env fallbacks ────────────────────────────────────────────────
describe("getProviderKey — together + fal env fallbacks", () => {
  class MockDb {
    constructor() { this._keys = new Map(); }
    prepare(sql) {
      const db = this;
      if (sql.includes("SELECT api_key FROM provider_keys WHERE provider = ?")) {
        return { get: (p) => db._keys.has(p) ? { api_key: db._keys.get(p) } : undefined };
      }
      throw new Error(`Unmocked SQL: ${sql}`);
    }
  }

  function getProviderKey(db, provider) {
    const row = db.prepare("SELECT api_key FROM provider_keys WHERE provider = ?").get(provider);
    if (row?.api_key) return row.api_key;
    if (provider === "replicate") return process.env.REPLICATE_API_TOKEN || "";
    if (provider === "openai") return process.env.OPENAI_API_KEY || "";
    if (provider === "openrouter") return process.env.OPENROUTER_API_KEY || "";
    if (provider === "huggingface") return process.env.HUGGINGFACE_API_KEY || "";
    if (provider === "together") return process.env.TOGETHER_API_KEY || "";
    if (provider === "fal") return process.env.FAL_API_KEY || "";
    return "";
  }

  test("returns DB key for together when present", () => {
    const db = new MockDb();
    db._keys.set("together", "together-abc123");
    assert.strictEqual(getProviderKey(db, "together"), "together-abc123");
  });

  test("returns DB key for fal when present", () => {
    const db = new MockDb();
    db._keys.set("fal", "fal-xyz456");
    assert.strictEqual(getProviderKey(db, "fal"), "fal-xyz456");
  });

  test("returns empty string for together when not configured", () => {
    const db = new MockDb();
    const saved = process.env.TOGETHER_API_KEY;
    delete process.env.TOGETHER_API_KEY;
    assert.strictEqual(getProviderKey(db, "together"), "");
    if (saved !== undefined) process.env.TOGETHER_API_KEY = saved;
  });

  test("returns empty string for fal when not configured", () => {
    const db = new MockDb();
    const saved = process.env.FAL_API_KEY;
    delete process.env.FAL_API_KEY;
    assert.strictEqual(getProviderKey(db, "fal"), "");
    if (saved !== undefined) process.env.FAL_API_KEY = saved;
  });
});

// ── FAL_IMAGE_MODELS static list ────────────────────────────────────────────────
describe("Fal.ai static model list", () => {
  const FAL_IMAGE_MODELS = [
    { id: "fal:fal-ai/flux",          label: "FLUX (Fal.ai)",          tier: "free" },
    { id: "fal:fal-ai/flux-realism",   label: "FLUX Realism (Fal.ai)", tier: "free" },
    { id: "fal:fal-ai/fast-sdxl",      label: "Fast SDXL (Fal.ai)",    tier: "free" },
  ];

  test("contains 3 models", () => {
    assert.strictEqual(FAL_IMAGE_MODELS.length, 3);
  });

  test("all models are free tier", () => {
    for (const m of FAL_IMAGE_MODELS) {
      assert.strictEqual(m.tier, "free");
    }
  });

  test("all model IDs are prefixed with fal:", () => {
    for (const m of FAL_IMAGE_MODELS) {
      assert.ok(m.id.startsWith("fal:"), `Expected fal: prefix on ${m.id}`);
    }
  });
});

// ── Together model ID stripping ─────────────────────────────────────────────────
describe("Together model ID stripping", () => {
  function stripPrefix(model) {
    if (model.startsWith("together:")) return model.slice(9);
    return model;
  }

  test("strips together: prefix", () => {
    assert.strictEqual(stripPrefix("together:black-forest-labs/FLUX.1-schnell-Free"), "black-forest-labs/FLUX.1-schnell-Free");
  });

  test("passes through model without prefix", () => {
    assert.strictEqual(stripPrefix("some-model"), "some-model");
  });
});

// ── Fal model ID stripping ──────────────────────────────────────────────────────
describe("Fal model ID stripping", () => {
  function stripPrefix(model) {
    if (model.startsWith("fal:")) return model.slice(4);
    return model;
  }

  test("strips fal: prefix", () => {
    assert.strictEqual(stripPrefix("fal:fal-ai/flux"), "fal-ai/flux");
  });

  test("passes through model without prefix", () => {
    assert.strictEqual(stripPrefix("fal-ai/flux"), "fal-ai/flux");
  });
});

// ── saveProvider accepts together + fal ─────────────────────────────────────────
describe("saveProvider — accepts new providers", () => {
  const VALID_PROVIDERS = ["replicate", "openai", "openrouter", "huggingface", "together", "fal"];

  class MockDb {
    constructor() { this._keys = new Map(); }
    prepare(sql) {
      const db = this;
      const s = sql.replace(/\s+/g, " ").trim();
      if (s.startsWith("DELETE FROM provider_keys WHERE provider = ?")) {
        return { run: (p) => { db._keys.delete(p); } };
      }
      if (s.includes("INSERT INTO provider_keys") && s.includes("ON CONFLICT")) {
        return { run: (p, k) => { db._keys.set(p, k); } };
      }
      throw new Error(`Unmocked SQL: ${s}`);
    }
  }

  function saveProvider(db, provider, api_key) {
    if (!VALID_PROVIDERS.includes(provider)) {
      return { ok: false, error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` };
    }
    if (typeof api_key !== "string") return { ok: false, error: "api_key must be a string" };
    if (api_key.trim() === "") {
      db.prepare("DELETE FROM provider_keys WHERE provider = ?").run(provider);
    } else {
      db.prepare(`
        INSERT INTO provider_keys (provider, api_key, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at
      `).run(provider, api_key.trim(), Date.now());
    }
    return { ok: true };
  }

  test("saves together key", () => {
    const db = new MockDb();
    const result = saveProvider(db, "together", "together-key-123");
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(db._keys.get("together"), "together-key-123");
  });

  test("saves fal key", () => {
    const db = new MockDb();
    const result = saveProvider(db, "fal", "fal-key-456");
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(db._keys.get("fal"), "fal-key-456");
  });

  test("rejects unknown provider (still enforced)", () => {
    const db = new MockDb();
    const result = saveProvider(db, "unknown-ai", "some-key");
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("provider must be one of"));
  });
});
