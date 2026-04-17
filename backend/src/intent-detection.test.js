"use strict";
/**
 * Unit tests for S3-11 — voice command intent detection.
 * Uses Node's built-in test runner.
 *
 * Run: node --test backend/src/intent-detection.test.js
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// ── Intent detection logic (mirrors index.js) ─────────────────────────────────

/**
 * Detect a media generation intent from a transcribed voice command.
 * Handles French and common English patterns.
 *
 * @param {string} text - transcribed voice text
 * @returns {{ intent: 'image'|'video'|'audio'|null, prompt: string|null }}
 */
function detectMediaIntent(text) {
  if (!text || typeof text !== "string") return { intent: null, prompt: null };

  const normalized = text.trim().toLowerCase();

  // Image patterns (FR + EN)
  const imagePatterns = [
    /(?:génère?|generè?|générer?|générez?|crée?|créer?|créez?|fais?|faire?)\s+(?:une?\s+)?(?:image|photo|illustration|dessin|visuel)\s+(?:de\s+|d'|du\s+|des\s+)?(.+)/i,
    /(?:generate?|create?|draw|make?)\s+(?:an?\s+)?(?:image|photo|picture|illustration)\s+(?:of\s+|from\s+)?(.+)/i,
    // "dessine ..." — standalone draw command always implies image
    /^dessines?\s+(.+)/i,
    /^(?:image|photo)\s*[:;]\s*(.+)/i,
  ];

  // Video patterns (FR + EN)
  const videoPatterns = [
    /(?:génère?|generè?|générer?|générez?|crée?|créer?|créez?|fais?|faire?)\s+(?:une?\s+)?(?:vidéo|video|clip|animation|animé)\s+(?:de\s+|d'|du\s+|des\s+)?(.+)/i,
    /(?:generate?|create?|make?)\s+(?:an?\s+)?(?:video|clip|animation)\s+(?:of\s+|from\s+)?(.+)/i,
    /^(?:vidéo|video)\s*[:;]\s*(.+)/i,
  ];

  // Audio patterns (FR + EN)
  const audioPatterns = [
    /(?:génère?|generè?|générer?|générez?|crée?|créer?|créez?|compose?|joue?)\s+(?:une?\s+)?(?:musique|chanson|son|audio|mélodie|bande.son)\s+(?:de\s+|d'|du\s+|des\s+|sur\s+)?(.+)/i,
    /(?:generate?|create?|compose?|make?)\s+(?:an?\s+)?(?:music|song|audio|sound|melody)\s+(?:of\s+|from\s+|about\s+)?(.+)/i,
    /^(?:musique|music|audio)\s*[:;]\s*(.+)/i,
  ];

  for (const re of imagePatterns) {
    const m = normalized.match(re);
    if (m) return { intent: "image", prompt: m[1].trim() };
  }

  for (const re of videoPatterns) {
    const m = normalized.match(re);
    if (m) return { intent: "video", prompt: m[1].trim() };
  }

  for (const re of audioPatterns) {
    const m = normalized.match(re);
    if (m) return { intent: "audio", prompt: m[1].trim() };
  }

  return { intent: null, prompt: null };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("detectMediaIntent — image commands (FR)", () => {
  test("génère une image de montagnes enneigées", () => {
    const r = detectMediaIntent("génère une image de montagnes enneigées");
    assert.strictEqual(r.intent, "image");
    assert.strictEqual(r.prompt, "montagnes enneigées");
  });

  test("crée une image d'un chat orange", () => {
    const r = detectMediaIntent("crée une image d'un chat orange");
    assert.strictEqual(r.intent, "image");
    assert.strictEqual(r.prompt, "un chat orange");
  });

  test("génère une photo de coucher de soleil", () => {
    const r = detectMediaIntent("génère une photo de coucher de soleil");
    assert.strictEqual(r.intent, "image");
    assert.strictEqual(r.prompt, "coucher de soleil");
  });

  test("fais une illustration du futur", () => {
    const r = detectMediaIntent("fais une illustration du futur");
    assert.strictEqual(r.intent, "image");
    assert.strictEqual(r.prompt, "futur");
  });

  test("dessine un dragon cracheur de feu", () => {
    const r = detectMediaIntent("dessine un dragon cracheur de feu");
    assert.strictEqual(r.intent, "image");
    assert.strictEqual(r.prompt, "un dragon cracheur de feu");
  });
});

describe("detectMediaIntent — image commands (EN)", () => {
  test("generate an image of a forest at night", () => {
    const r = detectMediaIntent("generate an image of a forest at night");
    assert.strictEqual(r.intent, "image");
    assert.strictEqual(r.prompt, "a forest at night");
  });

  test("create a photo of mountains", () => {
    const r = detectMediaIntent("create a photo of mountains");
    assert.strictEqual(r.intent, "image");
    assert.strictEqual(r.prompt, "mountains");
  });
});

describe("detectMediaIntent — video commands (FR)", () => {
  test("crée une vidéo de vagues sur la plage", () => {
    const r = detectMediaIntent("crée une vidéo de vagues sur la plage");
    assert.strictEqual(r.intent, "video");
    assert.strictEqual(r.prompt, "vagues sur la plage");
  });

  test("génère une vidéo d'une ville futuriste", () => {
    const r = detectMediaIntent("génère une vidéo d'une ville futuriste");
    assert.strictEqual(r.intent, "video");
    assert.strictEqual(r.prompt, "une ville futuriste");
  });

  test("fais une animation d'un robot qui danse", () => {
    const r = detectMediaIntent("fais une animation d'un robot qui danse");
    assert.strictEqual(r.intent, "video");
    assert.strictEqual(r.prompt, "un robot qui danse");
  });
});

describe("detectMediaIntent — video commands (EN)", () => {
  test("create a video of a sunset", () => {
    const r = detectMediaIntent("create a video of a sunset");
    assert.strictEqual(r.intent, "video");
    assert.strictEqual(r.prompt, "a sunset");
  });
});

describe("detectMediaIntent — audio commands (FR)", () => {
  test("génère une musique de jazz relaxant", () => {
    const r = detectMediaIntent("génère une musique de jazz relaxant");
    assert.strictEqual(r.intent, "audio");
    assert.strictEqual(r.prompt, "jazz relaxant");
  });

  test("crée une chanson sur l'été", () => {
    const r = detectMediaIntent("crée une chanson sur l'été");
    assert.strictEqual(r.intent, "audio");
  });
});

describe("detectMediaIntent — no match (null intent)", () => {
  test("empty string returns null", () => {
    const r = detectMediaIntent("");
    assert.strictEqual(r.intent, null);
    assert.strictEqual(r.prompt, null);
  });

  test("bonjour returns null", () => {
    const r = detectMediaIntent("bonjour comment ça va");
    assert.strictEqual(r.intent, null);
  });

  test("quelle heure est-il returns null", () => {
    const r = detectMediaIntent("quelle heure est-il ?");
    assert.strictEqual(r.intent, null);
  });

  test("null input returns null", () => {
    const r = detectMediaIntent(null);
    assert.strictEqual(r.intent, null);
  });

  test("undefined input returns null", () => {
    const r = detectMediaIntent(undefined);
    assert.strictEqual(r.intent, null);
  });
});

describe("detectMediaIntent — case insensitivity", () => {
  test("GÉNÈRE UNE IMAGE DE MONTAGNE", () => {
    const r = detectMediaIntent("GÉNÈRE UNE IMAGE DE MONTAGNE");
    assert.strictEqual(r.intent, "image");
    assert.strictEqual(r.prompt, "montagne");
  });
});
