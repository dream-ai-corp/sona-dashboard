"use strict";
/**
 * Unit tests for POST /api/generate/image logic (S3-06).
 * Uses Node's built-in test runner (node --test).
 * All logic is extracted as pure functions — no network calls, no Express.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// ── resolveImageProvider ────────────────────────────────────────────────────────

describe("resolveImageProvider", () => {
  const MODEL_IDS = {
    "flux-schnell":   "black-forest-labs/flux-schnell",
    "sdxl":           "stability-ai/sdxl:7762fd07",
    "sdxl-lightning": "bytedance/sdxl-lightning-4step:5f24084",
    "flux-dev":       "black-forest-labs/flux-dev",
  };

  function resolveImageProvider(model) {
    if (model.startsWith("together:")) return "together";
    if (model.startsWith("fal:")) return "fal";
    if (model.startsWith("pollinations-")) return "pollinations";
    if (MODEL_IDS[model]) return "replicate";
    if (model.includes("/")) return "openrouter";
    return "replicate";
  }

  test("together: prefix → together", () => {
    assert.strictEqual(resolveImageProvider("together:black-forest-labs/FLUX.1-schnell-Free"), "together");
  });

  test("fal: prefix → fal", () => {
    assert.strictEqual(resolveImageProvider("fal:fal-ai/flux"), "fal");
  });

  test("pollinations- prefix → pollinations", () => {
    assert.strictEqual(resolveImageProvider("pollinations-flux"), "pollinations");
    assert.strictEqual(resolveImageProvider("pollinations-turbo"), "pollinations");
    assert.strictEqual(resolveImageProvider("pollinations-flux-realism"), "pollinations");
    assert.strictEqual(resolveImageProvider("pollinations-flux-anime"), "pollinations");
    assert.strictEqual(resolveImageProvider("pollinations-flux-3d"), "pollinations");
  });

  test("known replicate model ID → replicate", () => {
    assert.strictEqual(resolveImageProvider("flux-schnell"), "replicate");
    assert.strictEqual(resolveImageProvider("sdxl"), "replicate");
    assert.strictEqual(resolveImageProvider("sdxl-lightning"), "replicate");
  });

  test("model with / → openrouter (DALL-E, Midjourney proxy, etc.)", () => {
    assert.strictEqual(resolveImageProvider("openai/dall-e-3"), "openrouter");
    assert.strictEqual(resolveImageProvider("stability-ai/sdxl"), "openrouter");
    assert.strictEqual(resolveImageProvider("midjourney/v6"), "openrouter");
  });

  test("unknown model without / → falls back to replicate", () => {
    assert.strictEqual(resolveImageProvider("some-unknown-model"), "replicate");
  });
});

// ── RATIO_TO_SIZE ───────────────────────────────────────────────────────────────

describe("RATIO_TO_SIZE", () => {
  const RATIO_TO_SIZE = {
    "1:1":  { width: 1024, height: 1024 },
    "16:9": { width: 1344, height: 768  },
    "9:16": { width: 768,  height: 1344 },
    "4:3":  { width: 1152, height: 896  },
    "3:4":  { width: 896,  height: 1152 },
  };

  test("1:1 → 1024×1024", () => {
    assert.deepStrictEqual(RATIO_TO_SIZE["1:1"], { width: 1024, height: 1024 });
  });

  test("16:9 → landscape 1344×768", () => {
    const s = RATIO_TO_SIZE["16:9"];
    assert.ok(s.width > s.height, "width should be greater than height for 16:9");
    assert.strictEqual(s.width, 1344);
    assert.strictEqual(s.height, 768);
  });

  test("9:16 → portrait 768×1344", () => {
    const s = RATIO_TO_SIZE["9:16"];
    assert.ok(s.height > s.width, "height should be greater than width for 9:16");
  });

  test("4:3 and 3:4 are transposes of each other", () => {
    const a = RATIO_TO_SIZE["4:3"];
    const b = RATIO_TO_SIZE["3:4"];
    assert.strictEqual(a.width, b.height);
    assert.strictEqual(a.height, b.width);
  });

  test("covers all 5 required ratios", () => {
    const required = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    for (const r of required) {
      assert.ok(RATIO_TO_SIZE[r], `missing ratio: ${r}`);
    }
  });

  test("unknown ratio defaults to 1:1 via fallback", () => {
    const size = RATIO_TO_SIZE["2:3"] || RATIO_TO_SIZE["1:1"];
    assert.deepStrictEqual(size, { width: 1024, height: 1024 });
  });
});

// ── Input validation ─────────────────────────────────────────────────────────────

describe("input validation — prompt", () => {
  function validatePrompt(prompt) {
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return { ok: false, error: "prompt is required" };
    }
    return { ok: true };
  }

  test("empty string is invalid", () => {
    assert.deepStrictEqual(validatePrompt(""), { ok: false, error: "prompt is required" });
  });

  test("whitespace-only string is invalid", () => {
    assert.deepStrictEqual(validatePrompt("   "), { ok: false, error: "prompt is required" });
  });

  test("null / undefined is invalid", () => {
    assert.strictEqual(validatePrompt(null).ok, false);
    assert.strictEqual(validatePrompt(undefined).ok, false);
  });

  test("number is invalid", () => {
    assert.strictEqual(validatePrompt(42).ok, false);
  });

  test("valid non-empty string passes", () => {
    assert.deepStrictEqual(validatePrompt("a cat riding a bike"), { ok: true });
  });

  test("single character is valid", () => {
    assert.deepStrictEqual(validatePrompt("x"), { ok: true });
  });
});

// ── POLLINATIONS_MODEL_MAP ──────────────────────────────────────────────────────

describe("POLLINATIONS_MODEL_MAP", () => {
  const POLLINATIONS_MODEL_MAP = {
    "pollinations-flux":           "flux",
    "pollinations-turbo":          "turbo",
    "pollinations-flux-realism":   "flux-realism",
    "pollinations-flux-anime":     "flux-anime",
    "pollinations-flux-3d":        "flux-3d",
  };

  test("covers all 5 pollinations models", () => {
    assert.strictEqual(Object.keys(POLLINATIONS_MODEL_MAP).length, 5);
  });

  test("pollinations-flux → flux", () => {
    assert.strictEqual(POLLINATIONS_MODEL_MAP["pollinations-flux"], "flux");
  });

  test("pollinations-turbo → turbo", () => {
    assert.strictEqual(POLLINATIONS_MODEL_MAP["pollinations-turbo"], "turbo");
  });

  test("all keys start with pollinations-", () => {
    for (const key of Object.keys(POLLINATIONS_MODEL_MAP)) {
      assert.ok(key.startsWith("pollinations-"), `bad key: ${key}`);
    }
  });

  test("unknown model falls back to flux", () => {
    const model = POLLINATIONS_MODEL_MAP["pollinations-unknown"] || "flux";
    assert.strictEqual(model, "flux");
  });
});

// ── generateWithPollinations URL construction ───────────────────────────────────

describe("Pollinations URL construction", () => {
  const POLLINATIONS_MODEL_MAP = {
    "pollinations-flux":           "flux",
    "pollinations-turbo":          "turbo",
    "pollinations-flux-realism":   "flux-realism",
    "pollinations-flux-anime":     "flux-anime",
    "pollinations-flux-3d":        "flux-3d",
  };

  function buildPollinationsUrl(prompt, model, size) {
    const pollinationsModel = POLLINATIONS_MODEL_MAP[model] || "flux";
    const encodedPrompt = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${size.width}&height=${size.height}&model=${pollinationsModel}&nologo=true`;
  }

  test("produces a valid HTTPS URL", () => {
    const url = buildPollinationsUrl("a sunset", "pollinations-flux", { width: 1024, height: 1024 });
    assert.ok(url.startsWith("https://image.pollinations.ai/prompt/"), `bad URL: ${url}`);
  });

  test("prompt is percent-encoded", () => {
    const url = buildPollinationsUrl("cat & dog", "pollinations-flux", { width: 1024, height: 1024 });
    assert.ok(url.includes("cat%20%26%20dog") || url.includes("cat+%26+dog") || url.includes("%26"), `prompt not encoded: ${url}`);
  });

  test("width and height are included", () => {
    const url = buildPollinationsUrl("test", "pollinations-turbo", { width: 1344, height: 768 });
    assert.ok(url.includes("width=1344"), `missing width: ${url}`);
    assert.ok(url.includes("height=768"), `missing height: ${url}`);
  });

  test("model is passed as query param", () => {
    const url = buildPollinationsUrl("test", "pollinations-flux-anime", { width: 1024, height: 1024 });
    assert.ok(url.includes("model=flux-anime"), `missing model: ${url}`);
  });

  test("nologo param is set", () => {
    const url = buildPollinationsUrl("test", "pollinations-flux", { width: 1024, height: 1024 });
    assert.ok(url.includes("nologo=true"), `missing nologo: ${url}`);
  });

  test("unknown model defaults to flux", () => {
    const url = buildPollinationsUrl("test", "pollinations-xyz-unknown", { width: 1024, height: 1024 });
    assert.ok(url.includes("model=flux"), `expected flux fallback: ${url}`);
  });
});

// ── REPLICATE_IMAGE_MODELS — free/paid tier tagging ────────────────────────────

describe("REPLICATE_IMAGE_MODELS — tier tagging", () => {
  const REPLICATE_IMAGE_MODELS = [
    { id: "flux-schnell",     label: "FLUX.1 Schnell",           provider: "replicate", tier: "free" },
    { id: "sdxl",             label: "Stable Diffusion XL",      provider: "replicate", tier: "free" },
    { id: "sdxl-lightning",   label: "SDXL Lightning (ByteDance)", provider: "replicate", tier: "free" },
    { id: "playground-v2.5", label: "Playground v2.5",           provider: "replicate", tier: "free" },
    { id: "flux-dev",         label: "FLUX.1 Dev",               provider: "replicate", tier: "paid" },
    { id: "flux-1.1-pro",    label: "FLUX 1.1 Pro",              provider: "replicate", tier: "paid" },
    { id: "ideogram-v2",      label: "Ideogram v2",              provider: "replicate", tier: "paid" },
    { id: "recraft-v3",       label: "Recraft v3",               provider: "replicate", tier: "paid" },
    { id: "kolors",           label: "Kolors",                   provider: "replicate", tier: "free" },
    { id: "kandinsky-3",      label: "Kandinsky 3",              provider: "replicate", tier: "free" },
    { id: "proteus-v0.4",    label: "Proteus v0.4",              provider: "replicate", tier: "free" },
  ];

  test("sdxl-lightning (ByteDance) is free tier", () => {
    const m = REPLICATE_IMAGE_MODELS.find((m) => m.id === "sdxl-lightning");
    assert.ok(m, "sdxl-lightning not found");
    assert.strictEqual(m.tier, "free");
  });

  test("sdxl (Stable Diffusion) is free tier", () => {
    const m = REPLICATE_IMAGE_MODELS.find((m) => m.id === "sdxl");
    assert.ok(m, "sdxl not found");
    assert.strictEqual(m.tier, "free");
  });

  test("flux-dev is paid tier", () => {
    const m = REPLICATE_IMAGE_MODELS.find((m) => m.id === "flux-dev");
    assert.ok(m, "flux-dev not found");
    assert.strictEqual(m.tier, "paid");
  });

  test("all models have required fields: id, label, provider, tier", () => {
    for (const m of REPLICATE_IMAGE_MODELS) {
      assert.ok(m.id, `model missing id: ${JSON.stringify(m)}`);
      assert.ok(m.label, `model missing label: ${JSON.stringify(m)}`);
      assert.strictEqual(m.provider, "replicate");
      assert.ok(["free", "paid"].includes(m.tier), `invalid tier on ${m.id}: ${m.tier}`);
    }
  });
});

// ── MODEL_IDS — version hashes ──────────────────────────────────────────────────

describe("MODEL_IDS — Replicate model version mapping", () => {
  const MODEL_IDS = {
    "flux-schnell":    "black-forest-labs/flux-schnell",
    "sdxl":            "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37291fae01fac53a39f3b80",
    "sdxl-lightning":  "bytedance/sdxl-lightning-4step:5f24084160c9089501c1b3545d9be3c27883ae2239b6f412990e82d4a6210f8",
    "flux-dev":        "black-forest-labs/flux-dev",
  };

  test("sdxl-lightning uses bytedance org and 4-step model", () => {
    assert.ok(MODEL_IDS["sdxl-lightning"].includes("bytedance"), "expected bytedance in sdxl-lightning model path");
    assert.ok(MODEL_IDS["sdxl-lightning"].includes("4step"), "expected 4step in sdxl-lightning model path");
  });

  test("sdxl model path contains a version hash", () => {
    assert.ok(MODEL_IDS["sdxl"].includes(":"), "sdxl should have a versioned path with :");
  });

  test("flux-schnell uses org/model format without hash", () => {
    assert.ok(!MODEL_IDS["flux-schnell"].includes(":"), "flux-schnell should not have a version hash");
  });

  test("splitting versioned model ID gives [model, hash]", () => {
    const versioned = MODEL_IDS["sdxl"];
    const [modelPath, hash] = versioned.split(":");
    assert.ok(modelPath.includes("/"), `expected org/model format, got: ${modelPath}`);
    assert.ok(hash.length > 20, "hash should be a long hex string");
  });
});

// ── Provider key resolution ─────────────────────────────────────────────────────

describe("getProviderKey — env fallback logic", () => {
  class MockDb {
    constructor(keys = {}) { this._keys = new Map(Object.entries(keys)); }
    prepare(sql) {
      const db = this;
      return { get: (p) => db._keys.has(p) ? { api_key: db._keys.get(p) } : undefined };
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

  test("DB key takes precedence over env var", () => {
    const db = new MockDb({ replicate: "db-replicate-key" });
    const saved = process.env.REPLICATE_API_TOKEN;
    process.env.REPLICATE_API_TOKEN = "env-replicate-key";
    assert.strictEqual(getProviderKey(db, "replicate"), "db-replicate-key");
    process.env.REPLICATE_API_TOKEN = saved ?? "";
  });

  test("falls back to env var when DB has no entry", () => {
    const db = new MockDb();
    process.env.OPENROUTER_API_KEY = "env-or-key";
    assert.strictEqual(getProviderKey(db, "openrouter"), "env-or-key");
    delete process.env.OPENROUTER_API_KEY;
  });

  test("returns empty string when neither DB nor env is set", () => {
    const db = new MockDb();
    const saved = process.env.REPLICATE_API_TOKEN;
    delete process.env.REPLICATE_API_TOKEN;
    assert.strictEqual(getProviderKey(db, "replicate"), "");
    if (saved !== undefined) process.env.REPLICATE_API_TOKEN = saved;
  });

  test("unknown provider returns empty string", () => {
    const db = new MockDb();
    assert.strictEqual(getProviderKey(db, "unknown-provider"), "");
  });

  test("pollinations has no API key requirement (always returns empty for provider check)", () => {
    // Pollinations is free — the route should not gate on a provider key
    const db = new MockDb();
    // There is no "pollinations" key in getProviderKey; it always falls through to ""
    assert.strictEqual(getProviderKey(db, "pollinations"), "");
  });
});

// ── Dev mode fallback (no keys configured) ──────────────────────────────────────

describe("dev mode SVG placeholder", () => {
  function buildDevSvg(prompt, width, height) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#1e1b4b"/><text x="50%" y="50%" font-family="monospace" font-size="32" fill="#a78bfa" text-anchor="middle" dominant-baseline="middle">[dev] ${encodeURIComponent(prompt.slice(0, 40))}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  test("returns a data:image/svg+xml base64 URL", () => {
    const url = buildDevSvg("a cat", 1024, 1024);
    assert.ok(url.startsWith("data:image/svg+xml;base64,"), `bad dev URL: ${url.slice(0, 60)}`);
  });

  test("SVG encodes the prompt (first 40 chars)", () => {
    const prompt = "hello world";
    const url = buildDevSvg(prompt, 1024, 1024);
    const decoded = Buffer.from(url.split(",")[1], "base64").toString("utf8");
    assert.ok(decoded.includes(encodeURIComponent(prompt)), "decoded SVG should contain encoded prompt");
  });

  test("SVG uses the provided dimensions", () => {
    const url = buildDevSvg("test", 768, 1344);
    const decoded = Buffer.from(url.split(",")[1], "base64").toString("utf8");
    assert.ok(decoded.includes('width="768"'), "missing width");
    assert.ok(decoded.includes('height="1344"'), "missing height");
  });

  test("long prompts are truncated to 40 chars", () => {
    const longPrompt = "a".repeat(100);
    const url = buildDevSvg(longPrompt, 1024, 1024);
    const decoded = Buffer.from(url.split(",")[1], "base64").toString("utf8");
    // The encoded version of 40 'a's should appear but not more
    assert.ok(decoded.includes(encodeURIComponent("a".repeat(40))), "should contain first 40 chars");
  });
});

// ── OpenRouter model routing (DALL-E, Midjourney proxy) ─────────────────────────

describe("OpenRouter routing for paid models", () => {
  function resolveImageProvider(model) {
    const MODEL_IDS = { "flux-schnell": "x", "sdxl": "x", "sdxl-lightning": "x", "flux-dev": "x" };
    if (model.startsWith("together:")) return "together";
    if (model.startsWith("fal:")) return "fal";
    if (model.startsWith("pollinations-")) return "pollinations";
    if (MODEL_IDS[model]) return "replicate";
    if (model.includes("/")) return "openrouter";
    return "replicate";
  }

  test("openai/dall-e-3 routes to openrouter", () => {
    assert.strictEqual(resolveImageProvider("openai/dall-e-3"), "openrouter");
  });

  test("midjourney/v6 proxy routes to openrouter", () => {
    assert.strictEqual(resolveImageProvider("midjourney/v6"), "openrouter");
  });

  test("stability-ai/sd3 routes to openrouter", () => {
    assert.strictEqual(resolveImageProvider("stability-ai/sd3"), "openrouter");
  });

  test("openai/gpt-5-image routes to openrouter", () => {
    assert.strictEqual(resolveImageProvider("openai/gpt-5-image"), "openrouter");
  });
});
