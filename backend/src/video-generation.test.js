"use strict";
/**
 * Unit tests for video generation helpers and /api/models/video (S3-07).
 * Uses Node's built-in test runner.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("crypto");

// ── Extracted helpers (mirrors index.js logic) ────────────────────────────────

function buildKlingJwt(apiKeyPair) {
  const [accessKey, secretKey] = apiKeyPair.split(":");
  if (!accessKey || !secretKey) throw new Error("Kling key must be 'accessKey:secretKey'");
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header  = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ iss: accessKey, exp: now + 1800, nbf: now - 5 });
  const sig = createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const VIDEO_MODELS_CATALOG = [
  { id: "wan2.1",       label: "Wan 2.1 T2V 480p",        provider: "replicate", tier: "free" },
  { id: "cogvideox",    label: "CogVideoX 5B",             provider: "replicate", tier: "free" },
  { id: "animatediff",  label: "AnimateDiff",              provider: "replicate", tier: "free" },
  { id: "stable-video", label: "Stable Video Diffusion",   provider: "replicate", tier: "free" },
  { id: "mochi-1",      label: "Mochi 1",                  provider: "replicate", tier: "free" },
  { id: "kling-v1",     label: "Kling v1 (standard)",      provider: "kling",     tier: "free" },
  { id: "kling-v1-5",   label: "Kling v1.5 (pro)",         provider: "kling",     tier: "free" },
  { id: "kling-v2",     label: "Kling v2 / 3.0 (master)",  provider: "kling",     tier: "free" },
  { id: "veo-2",        label: "Google Veo 2 (HD)",        provider: "veo",       tier: "free" },
];

function getAvailableVideoModels(replicateKey, falKey, klingKey, veoKey) {
  return VIDEO_MODELS_CATALOG.filter((m) => {
    if (m.provider === "replicate") return true; // always show (dev placeholder)
    if (m.provider === "kling")     return !!klingKey;
    if (m.provider === "veo")       return !!veoKey;
    return false;
  });
}

// ── Tests: buildKlingJwt ──────────────────────────────────────────────────────

describe("buildKlingJwt", () => {
  test("produces a three-part JWT string", () => {
    const jwt = buildKlingJwt("myAccessKey:mySecretKey");
    const parts = jwt.split(".");
    assert.strictEqual(parts.length, 3);
  });

  test("header decodes to HS256/JWT", () => {
    const jwt = buildKlingJwt("ak:sk");
    const headerJson = JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString());
    assert.strictEqual(headerJson.alg, "HS256");
    assert.strictEqual(headerJson.typ, "JWT");
  });

  test("payload contains iss = accessKey", () => {
    const jwt = buildKlingJwt("testAK:testSK");
    const payloadJson = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    assert.strictEqual(payloadJson.iss, "testAK");
  });

  test("payload exp is ~30 min in the future", () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = buildKlingJwt("ak:sk");
    const payloadJson = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    assert.ok(payloadJson.exp > now + 1700, "exp should be > 1700s from now");
    assert.ok(payloadJson.exp < now + 1900, "exp should be < 1900s from now");
  });

  test("signature is valid HMAC-SHA256", () => {
    const jwt = buildKlingJwt("ak:mySecret");
    const [header, payload, sig] = jwt.split(".");
    const expected = createHmac("sha256", "mySecret")
      .update(`${header}.${payload}`)
      .digest("base64url");
    assert.strictEqual(sig, expected);
  });

  test("throws on malformed key (no colon)", () => {
    assert.throws(() => buildKlingJwt("noColonHere"), /accessKey:secretKey/);
  });

  test("throws on empty key", () => {
    assert.throws(() => buildKlingJwt(":"), /accessKey:secretKey/);
  });
});

// ── Tests: getAvailableVideoModels ────────────────────────────────────────────

describe("GET /api/models/video — model availability", () => {
  test("always returns replicate models (dev placeholder)", () => {
    const models = getAvailableVideoModels("", "", "", "");
    const ids = models.map((m) => m.id);
    assert.ok(ids.includes("wan2.1"));
    assert.ok(ids.includes("cogvideox"));
    assert.ok(ids.includes("mochi-1"));
  });

  test("does NOT return Kling models when no kling key", () => {
    const models = getAvailableVideoModels("", "", "", "");
    assert.ok(!models.some((m) => m.provider === "kling"));
  });

  test("does NOT return Veo models when no veo key", () => {
    const models = getAvailableVideoModels("", "", "", "");
    assert.ok(!models.some((m) => m.provider === "veo"));
  });

  test("returns Kling models when kling key is set", () => {
    const models = getAvailableVideoModels("", "", "ak:sk", "");
    const klingModels = models.filter((m) => m.provider === "kling");
    assert.ok(klingModels.length >= 3, "should have at least 3 Kling models");
    assert.ok(klingModels.some((m) => m.id === "kling-v1"));
    assert.ok(klingModels.some((m) => m.id === "kling-v2"));
  });

  test("returns Veo models when veo key is set", () => {
    const models = getAvailableVideoModels("", "", "", "AIzaSy_test");
    const veoModels = models.filter((m) => m.provider === "veo");
    assert.ok(veoModels.length >= 1, "should have at least 1 Veo model");
    assert.ok(veoModels.some((m) => m.id === "veo-2"));
  });

  test("returns all models when all keys are set", () => {
    const models = getAvailableVideoModels("r8_key", "fal_key", "ak:sk", "AIza_key");
    const providers = [...new Set(models.map((m) => m.provider))];
    assert.ok(providers.includes("replicate"));
    assert.ok(providers.includes("kling"));
    assert.ok(providers.includes("veo"));
  });

  test("each model has id, label, provider, tier", () => {
    const models = getAvailableVideoModels("", "", "ak:sk", "AIza_key");
    for (const m of models) {
      assert.ok(typeof m.id === "string" && m.id.length > 0, `model.id must be a string: ${JSON.stringify(m)}`);
      assert.ok(typeof m.label === "string" && m.label.length > 0, `model.label: ${JSON.stringify(m)}`);
      assert.ok(typeof m.provider === "string", `model.provider: ${JSON.stringify(m)}`);
      assert.ok(typeof m.tier === "string", `model.tier: ${JSON.stringify(m)}`);
    }
  });
});
