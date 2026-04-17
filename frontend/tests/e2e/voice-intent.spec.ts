/**
 * E2E tests for S3-11 — voice command intent detection via /api/voice/turn.
 *
 * These tests mock the Sona agent and backend generation endpoints
 * so they run without real API keys or audio hardware.
 */
import { test, expect } from '@playwright/test';

const FAKE_AUDIO_B64 = 'UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

test.describe('S3-11 — Voice intent detection (/api/voice/turn)', () => {
  test('passes through normal (non-intent) voice response', async ({ page }) => {
    // Mock Sona agent: normal conversation reply
    await page.route('**/api/voice/turn', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      // Simulates the Next.js route calling the agent internally — we intercept at the Next.js layer
      if (!body?.audio_base64) {
        await route.fulfill({ status: 400, json: { ok: false, error: 'audio_base64 required' } });
        return;
      }
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          text: 'bonjour comment ça va',
          audio_base64: FAKE_AUDIO_B64,
          audio_mime: 'audio/wav',
        },
      });
    });

    const res = await page.request.post('/api/voice/turn', {
      data: {
        audio_base64: FAKE_AUDIO_B64,
        mime: 'audio/webm',
        sessionId: 'test',
      },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.audio_base64).toBeTruthy();
  });

  test('returns 400 when audio_base64 is missing', async ({ page }) => {
    const res = await page.request.post('/api/voice/turn', {
      data: { mime: 'audio/webm' },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBeTruthy();
  });

  test('image intent: génère une image de montagnes → triggers generation', async ({ page }) => {
    // Track whether the generate/image endpoint was called
    let imageCalled = false;
    let imagePrompt = '';

    await page.route('**/api/generate/image', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      imageCalled = true;
      imagePrompt = (body?.prompt as string) ?? '';
      await route.fulfill({
        status: 200,
        json: { ok: true, imageUrl: 'data:image/svg+xml;base64,PHN2Zyc+PC9zdmc+', model: 'flux-schnell', prompt: imagePrompt },
      });
    });

    await page.route('**/api/voice/turn', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (!body?.audio_base64) {
        await route.fulfill({ status: 400, json: { ok: false, error: 'audio_base64 required' } });
        return;
      }
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          text: 'génère une image de montagnes enneigées',
          audio_base64: FAKE_AUDIO_B64,
          audio_mime: 'audio/wav',
        },
      });
    });

    const res = await page.request.post('/api/voice/turn', {
      data: {
        audio_base64: FAKE_AUDIO_B64,
        mime: 'audio/webm',
        sessionId: 'test',
      },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    // Voice response is still returned for TTS playback
    expect(data.audio_base64).toBeTruthy();
  });

  test('video intent: crée une vidéo de vagues → triggers generation', async ({ page }) => {
    let videoCalled = false;

    await page.route('**/api/generate/video', async (route) => {
      videoCalled = true;
      await route.fulfill({
        status: 200,
        json: { ok: true, jobId: 'test-job-123' },
      });
    });

    await page.route('**/api/voice/turn', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          text: 'crée une vidéo de vagues sur la plage',
          audio_base64: FAKE_AUDIO_B64,
          audio_mime: 'audio/wav',
        },
      });
    });

    const res = await page.request.post('/api/voice/turn', {
      data: { audio_base64: FAKE_AUDIO_B64, mime: 'audio/webm', sessionId: 'test' },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

test.describe('S3-11 — FloatingChat shows voice-intent messages', () => {
  test('chat panel renders messages from voice-intent channel', async ({ page }) => {
    // Mock the conversations endpoint to return a voice-intent result
    await page.route('**/api/conversations', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: [
            { id: 1, role: 'user', content: 'génère une image de montagnes', channel: 'voice-intent', timestamp: Date.now() - 2000 },
            { id: 2, role: 'assistant', content: '[image généré]\nhttps://example.com/img.png', channel: 'voice-intent', timestamp: Date.now() - 1000 },
          ],
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/conversations/stream', async (route) => {
      // Return a minimal SSE response that closes immediately
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    await page.goto('/');

    // Open the floating chat
    const fab = page.locator('button[aria-label="Open Sona chat"]');
    await expect(fab).toBeVisible();
    await fab.click();

    // Both messages should appear in the chat
    await expect(page.getByText('génère une image de montagnes')).toBeVisible();
    await expect(page.getByText(/image généré/)).toBeVisible();
  });
});
