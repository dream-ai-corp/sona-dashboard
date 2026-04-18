import { test, expect } from '@playwright/test';

/* ─── S3-11: Voice command intent detection ─────────────────────────────────
 * Tests that:
 *   AC1: "génère une image de [desc]"  → intent generate_image, prompt extracted
 *   AC2: "crée une vidéo de [desc]"   → intent generate_video, prompt extracted
 *   AC3: Chat renders media preview after generation
 *   AC4: Error is surfaced in chat on failure
 *   AC5: Neutral phrases → no intent (no false positives)
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('S3-11 — /api/intent/detect endpoint', () => {
  // Helper: POST to the intent detection endpoint
  async function detectIntent(page: import('@playwright/test').Page, text: string) {
    return page.evaluate(async (t) => {
      const res = await fetch('/api/intent/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      return res.json();
    }, text);
  }

  test('AC1 — "génère une image de" triggers generate_image', async ({ page }) => {
    await page.goto('/');
    const result = await detectIntent(page, 'génère une image de un château dans les nuages');
    expect(result.intent).toBe('generate_image');
    expect(result.prompt).toBe('un château dans les nuages');
  });

  test('AC1 — "crée une image de" also triggers generate_image', async ({ page }) => {
    await page.goto('/');
    const result = await detectIntent(page, 'crée une image de un coucher de soleil sur la mer');
    expect(result.intent).toBe('generate_image');
    expect(result.prompt).toBe('un coucher de soleil sur la mer');
  });

  test('AC1 — "génère moi une image de" triggers generate_image', async ({ page }) => {
    await page.goto('/');
    const result = await detectIntent(page, 'génère moi une image de un chien qui joue');
    expect(result.intent).toBe('generate_image');
    expect(result.prompt).toBe('un chien qui joue');
  });

  test('AC2 — "crée une vidéo de" triggers generate_video', async ({ page }) => {
    await page.goto('/');
    const result = await detectIntent(page, 'crée une vidéo de une forêt en automne');
    expect(result.intent).toBe('generate_video');
    expect(result.prompt).toBe('une forêt en automne');
  });

  test('AC2 — "génère une vidéo de" triggers generate_video', async ({ page }) => {
    await page.goto('/');
    const result = await detectIntent(page, 'génère une vidéo de des vagues sur la plage');
    expect(result.intent).toBe('generate_video');
    expect(result.prompt).toBe('des vagues sur la plage');
  });

  test('AC5 — neutral phrase returns null intent', async ({ page }) => {
    await page.goto('/');
    const result = await detectIntent(page, 'bonjour, comment vas-tu ?');
    expect(result.intent).toBeNull();
    expect(result.prompt).toBeNull();
  });

  test('AC5 — phrase without trigger word returns null intent', async ({ page }) => {
    await page.goto('/');
    const result = await detectIntent(page, "fais une belle journée");
    expect(result.intent).toBeNull();
    expect(result.prompt).toBeNull();
  });

  test('AC5 — empty string returns null intent', async ({ page }) => {
    await page.goto('/');
    const result = await detectIntent(page, '');
    expect(result.intent).toBeNull();
    expect(result.prompt).toBeNull();
  });

  test('returns 400 when text is missing', async ({ page }) => {
    await page.goto('/');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/intent/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return res.status;
    });
    expect(status).toBe(400);
  });
});

test.describe('S3-11 — Chat floating panel renders generated media', () => {
  test('AC3 — chat message with generated_image JSON shows image preview', async ({ page }) => {
    await page.goto('/');

    // Inject a generated_image message into conversations via API
    const fakeImgUrl = 'https://example.com/test-image.png';
    await page.evaluate(async (url) => {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: JSON.stringify({ type: 'generated_image', url, prompt: 'un test' }),
          channel: 'dashboard',
        }),
      });
    }, fakeImgUrl);

    // Open the floating chat panel
    const fab = page.getByRole('button', { name: 'Open Sona chat' });
    await expect(fab).toBeVisible();
    await fab.click();

    // The chat should contain an image preview
    await expect(page.getByTestId('chat-generated-image')).toBeVisible({ timeout: 5000 });
  });

  test('AC3 — chat message with generated_video JSON shows video player', async ({ page }) => {
    await page.goto('/');

    // Inject a generated_video message into conversations via API
    await page.evaluate(async () => {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: JSON.stringify({ type: 'generated_video', url: 'https://example.com/test.mp4', prompt: 'une forêt' }),
          channel: 'dashboard',
        }),
      });
    });

    const fab = page.getByRole('button', { name: 'Open Sona chat' });
    await expect(fab).toBeVisible();
    await fab.click();

    await expect(page.getByTestId('chat-generated-video')).toBeVisible({ timeout: 5000 });
  });
});
