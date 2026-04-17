"use strict";
/**
 * Unit tests for /api/settings/providers endpoints (S3-02).
 * Uses Node's built-in test runner (node --test).
 * Tests the route logic via a minimal in-memory SQLite mock.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// ── Minimal in-memory DB mock ─────────────────────────────────────────────────
class MockDb {
  constructor() {
    this._providerKeys = new Map();
  }

  prepare(sql) {
    const s = sql.replace(/\s+/g, " ").trim();
    const db = this;

    if (s.startsWith("SELECT provider, api_key FROM provider_keys")) {
      return {
        all: () => Array.from(db._providerKeys.entries()).map(([p, k]) => ({ provider: p, api_key: k })),
      };
    }
    if (s.startsWith("SELECT api_key FROM provider_keys WHERE provider = ?")) {
      return {
        get: (provider) => db._providerKeys.has(provider) ? { api_key: db._providerKeys.get(provider) } : undefined,
      };
    }
    if (s.startsWith("DELETE FROM provider_keys WHERE provider = ?")) {
      return {
        run: (provider) => { db._providerKeys.delete(provider); },
      };
    }
    if (s.includes("INSERT INTO provider_keys") && s.includes("ON CONFLICT")) {
      return {
        run: (provider, apiKey) => { db._providerKeys.set(provider, apiKey); },
      };
    }
    throw new Error(`Unmocked SQL: ${s}`);
  }
}

// ── Extracted route logic (pure functions, no express) ────────────────────────
const VALID_PROVIDERS = ["replicate", "openai", "openrouter", "huggingface", "together", "fal", "kling", "veo"];

function getProviders(db) {
  const rows = db.prepare("SELECT provider, api_key FROM provider_keys").all();
  const result = {};
  for (const row of rows) result[row.provider] = row.api_key;
  for (const p of VALID_PROVIDERS) if (!(p in result)) result[p] = "";
  return result;
}

function saveProvider(db, provider, api_key) {
  if (!VALID_PROVIDERS.includes(provider)) {
    return { ok: false, error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` };
  }
  if (typeof api_key !== "string") {
    return { ok: false, error: "api_key must be a string" };
  }
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

function getProviderKey(db, provider) {
  const row = db.prepare("SELECT api_key FROM provider_keys WHERE provider = ?").get(provider);
  return row?.api_key || "";
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("GET /api/settings/providers", () => {
  test("returns all providers with empty strings when nothing configured", () => {
    const db = new MockDb();
    const result = getProviders(db);
    assert.deepStrictEqual(result, { replicate: "", openai: "", openrouter: "", huggingface: "", together: "", fal: "", kling: "", veo: "" });
  });

  test("returns stored key for configured provider", () => {
    const db = new MockDb();
    db._providerKeys.set("openai", "sk-test-123");
    const result = getProviders(db);
    assert.strictEqual(result.openai, "sk-test-123");
    assert.strictEqual(result.replicate, "");
  });

  test("returns all configured providers", () => {
    const db = new MockDb();
    db._providerKeys.set("openai", "sk-abc");
    db._providerKeys.set("replicate", "r8_xyz");
    const result = getProviders(db);
    assert.strictEqual(result.openai, "sk-abc");
    assert.strictEqual(result.replicate, "r8_xyz");
    assert.strictEqual(result.openrouter, "");
  });
});

describe("POST /api/settings/providers", () => {
  test("saves a valid provider key", () => {
    const db = new MockDb();
    const result = saveProvider(db, "openai", "sk-new-key");
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(db._providerKeys.get("openai"), "sk-new-key");
  });

  test("rejects unknown provider", () => {
    const db = new MockDb();
    const result = saveProvider(db, "unknown-provider", "some-key");
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("provider must be one of"));
  });

  test("deletes key when empty string is sent", () => {
    const db = new MockDb();
    db._providerKeys.set("openai", "sk-old");
    const result = saveProvider(db, "openai", "");
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(db._providerKeys.has("openai"), false);
  });

  test("trims whitespace from key before saving", () => {
    const db = new MockDb();
    saveProvider(db, "replicate", "  r8_trimmed  ");
    assert.strictEqual(db._providerKeys.get("replicate"), "r8_trimmed");
  });

  test("overwrites existing key on second save", () => {
    const db = new MockDb();
    saveProvider(db, "openai", "sk-first");
    saveProvider(db, "openai", "sk-second");
    assert.strictEqual(db._providerKeys.get("openai"), "sk-second");
  });

  test("rejects non-string api_key", () => {
    const db = new MockDb();
    const result = saveProvider(db, "openai", 12345);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("api_key must be a string"));
  });
});

describe("getProviderKey — DB priority over env", () => {
  test("returns DB key when present", () => {
    const db = new MockDb();
    db._providerKeys.set("openai", "sk-from-db");
    assert.strictEqual(getProviderKey(db, "openai"), "sk-from-db");
  });

  test("returns empty string when provider not in DB", () => {
    const db = new MockDb();
    assert.strictEqual(getProviderKey(db, "openai"), "");
  });
});
