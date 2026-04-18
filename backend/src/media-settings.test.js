"use strict";
/**
 * Unit tests for /api/settings/media endpoints (S3-01).
 * Uses Node's built-in test runner (node --test).
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// ── Minimal in-memory DB mock ─────────────────────────────────────────────────
class MockDb {
  constructor() {
    this._media = new Map();
  }

  prepare(sql) {
    const s = sql.replace(/\s+/g, " ").trim();
    const db = this;

    if (s.startsWith("SELECT key, value FROM media_settings")) {
      return {
        all: () => Array.from(db._media.entries()).map(([key, value]) => ({ key, value })),
      };
    }
    if (s.includes("INSERT INTO media_settings") && s.includes("ON CONFLICT")) {
      return {
        run: (key, value) => { db._media.set(key, value); },
      };
    }
    throw new Error(`Unmocked SQL: ${s}`);
  }

  transaction(fn) {
    return (arg) => fn(arg);
  }
}

// ── Extracted route logic (pure functions, no express) ────────────────────────
const ALLOWED = ["images", "video", "audio"];

function getMediaSettings(db) {
  const rows = db.prepare("SELECT key, value FROM media_settings").all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value === 1]));
  return {
    images: map.images ?? false,
    video: map.video ?? false,
    audio: map.audio ?? false,
  };
}

function patchMediaSettings(db, body) {
  const upsert = db.prepare(
    "INSERT INTO media_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const update = db.transaction((b) => {
    for (const [key, val] of Object.entries(b)) {
      if (ALLOWED.includes(key) && typeof val === "boolean") {
        upsert.run(key, val ? 1 : 0);
      }
    }
  });
  update(body);
  return getMediaSettings(db);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("GET /api/settings/media", () => {
  test("returns all-false defaults when no rows exist", () => {
    const db = new MockDb();
    const result = getMediaSettings(db);
    assert.deepStrictEqual(result, { images: false, video: false, audio: false });
  });

  test("returns current values from DB", () => {
    const db = new MockDb();
    db._media.set("images", 1);
    db._media.set("video", 0);
    db._media.set("audio", 1);
    const result = getMediaSettings(db);
    assert.deepStrictEqual(result, { images: true, video: false, audio: true });
  });
});

describe("PATCH /api/settings/media", () => {
  test("updates a single field", () => {
    const db = new MockDb();
    const result = patchMediaSettings(db, { images: true });
    assert.strictEqual(result.images, true);
    assert.strictEqual(result.video, false);
    assert.strictEqual(result.audio, false);
  });

  test("partial update only changes specified fields", () => {
    const db = new MockDb();
    // Pre-set images=true
    db._media.set("images", 1);
    const result = patchMediaSettings(db, { video: true });
    assert.strictEqual(result.images, true);
    assert.strictEqual(result.video, true);
    assert.strictEqual(result.audio, false);
  });

  test("ignores unknown fields", () => {
    const db = new MockDb();
    const result = patchMediaSettings(db, { images: true, unknown_field: true });
    assert.deepStrictEqual(result, { images: true, video: false, audio: false });
    assert.ok(!db._media.has("unknown_field"), "unknown field should not be saved");
  });

  test("ignores non-boolean values", () => {
    const db = new MockDb();
    const result = patchMediaSettings(db, { images: "yes", video: 1 });
    assert.deepStrictEqual(result, { images: false, video: false, audio: false });
  });

  test("can disable a previously enabled field", () => {
    const db = new MockDb();
    db._media.set("audio", 1);
    const result = patchMediaSettings(db, { audio: false });
    assert.strictEqual(result.audio, false);
  });

  test("can enable all three fields", () => {
    const db = new MockDb();
    const result = patchMediaSettings(db, { images: true, video: true, audio: true });
    assert.deepStrictEqual(result, { images: true, video: true, audio: true });
  });
});
