import { test, expect, type Page } from '@playwright/test';

const FAKE_AUDIO = 'https://example.com/fake-audio.mp3';
const TEST_JOB_ID = 'test-job-s309';

/** Mocks the full SSE-based audio generation flow for successful generation. */
async function mockSuccessfulGeneration(page: Page, jobId = TEST_JOB_ID) {
  await page.route('**/api/generate/audio', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, jobId }),
    });
  });
  const sseBody = `data: ${JSON.stringify({ status: 'succeeded', progress: 100, message: 'Terminé', url: FAKE_AUDIO })}\n\n`;
  await page.route(`**/${jobId}/progress`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
      body: sseBody,
    });
  });
}

test.describe('Media Page — Audio Generation Modal (S3-09)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/media?tab=audio');
  });

  test('audio tab is selected when ?tab=audio', async ({ page }) => {
    const tab = page.getByTestId('media-tab-audio');
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('audio generation modal is visible on audio tab', async ({ page }) => {
    await expect(page.getByTestId('audio-gen-modal')).toBeVisible();
  });

  test('prompt textarea is present and accepts input', async ({ page }) => {
    const prompt = page.getByTestId('audio-gen-prompt');
    await expect(prompt).toBeVisible();
    await prompt.fill('calm piano melody with soft strings');
    await expect(prompt).toHaveValue('calm piano melody with soft strings');
  });

  test('model selector is present with audio model options', async ({ page }) => {
    const select = page.getByTestId('audio-gen-model');
    await expect(select).toBeVisible();
    const options = await select.locator('option').allInnerTexts();
    expect(options.some((o) => o.toLowerCase().includes('musicgen') || o.toLowerCase().includes('music'))).toBeTruthy();
  });

  test('type selector has music, sound effect and voice options', async ({ page }) => {
    const typeGroup = page.getByTestId('audio-gen-type');
    await expect(typeGroup).toBeVisible();
    await expect(typeGroup.getByRole('button', { name: /musique/i })).toBeVisible();
    await expect(typeGroup.getByRole('button', { name: /effet/i })).toBeVisible();
    await expect(typeGroup.getByRole('button', { name: /voix/i })).toBeVisible();
  });

  test('music type is selected by default', async ({ page }) => {
    const typeGroup = page.getByTestId('audio-gen-type');
    const musicBtn = typeGroup.getByRole('button', { name: /musique/i });
    await expect(musicBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('type button selection toggles aria-pressed', async ({ page }) => {
    const typeGroup = page.getByTestId('audio-gen-type');
    const voiceBtn = typeGroup.getByRole('button', { name: /voix/i });
    await voiceBtn.click();
    await expect(voiceBtn).toHaveAttribute('aria-pressed', 'true');
    const musicBtn = typeGroup.getByRole('button', { name: /musique/i });
    await expect(musicBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('duration selector has multiple duration options', async ({ page }) => {
    const durationGroup = page.getByTestId('audio-gen-duration');
    await expect(durationGroup).toBeVisible();
    await expect(durationGroup.getByRole('button', { name: '5s', exact: true })).toBeVisible();
    await expect(durationGroup.getByRole('button', { name: '10s', exact: true })).toBeVisible();
    await expect(durationGroup.getByRole('button', { name: '30s', exact: true })).toBeVisible();
  });

  test('10s is selected by default', async ({ page }) => {
    const durationGroup = page.getByTestId('audio-gen-duration');
    const btn10s = durationGroup.getByRole('button', { name: '10s' });
    await expect(btn10s).toHaveAttribute('aria-pressed', 'true');
  });

  test('duration button selection toggles aria-pressed', async ({ page }) => {
    const durationGroup = page.getByTestId('audio-gen-duration');
    const btn30s = durationGroup.getByRole('button', { name: '30s' });
    await btn30s.click();
    await expect(btn30s).toHaveAttribute('aria-pressed', 'true');
    const btn10s = durationGroup.getByRole('button', { name: '10s' });
    await expect(btn10s).toHaveAttribute('aria-pressed', 'false');
  });

  test('Generate button is disabled without a prompt', async ({ page }) => {
    await expect(page.getByTestId('audio-gen-submit')).toBeDisabled();
  });

  test('Generate button is enabled once prompt is filled', async ({ page }) => {
    await page.getByTestId('audio-gen-prompt').fill('upbeat jazz soundtrack');
    await expect(page.getByTestId('audio-gen-submit')).toBeEnabled();
  });

  test('Generate button shows loading state on click', async ({ page }) => {
    await page.route('**/api/generate/audio', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, jobId: 'loading-job-audio' }),
      });
    });
    await page.route('**/loading-job-audio/progress', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });

    await page.getByTestId('audio-gen-prompt').fill('rain ambience');
    await page.getByTestId('audio-gen-submit').click();
    await expect(page.getByTestId('audio-gen-loading')).toBeVisible();
  });

  test('audio player is shown after successful generation', async ({ page }) => {
    await mockSuccessfulGeneration(page);
    await page.getByTestId('audio-gen-prompt').fill('peaceful forest sounds');
    await page.getByTestId('audio-gen-submit').click();
    await expect(page.getByTestId('audio-gen-preview')).toBeVisible({ timeout: 10000 });
  });

  test('download button appears after audio is generated', async ({ page }) => {
    await mockSuccessfulGeneration(page);
    await page.getByTestId('audio-gen-prompt').fill('lofi hip hop beat');
    await page.getByTestId('audio-gen-submit').click();
    await expect(page.getByTestId('audio-gen-download')).toBeVisible({ timeout: 10000 });
  });

  test('error message is displayed on generation failure', async ({ page }) => {
    await page.route('**/api/generate/audio', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Model unavailable' }),
      });
    });

    await page.getByTestId('audio-gen-prompt').fill('test audio');
    await page.getByTestId('audio-gen-submit').click();
    await expect(page.getByTestId('audio-gen-error')).toBeVisible({ timeout: 10000 });
  });

  test('metadata chips show model, type and duration after generation', async ({ page }) => {
    await mockSuccessfulGeneration(page);
    await page.getByTestId('audio-gen-prompt').fill('epic orchestral');
    const durationGroup = page.getByTestId('audio-gen-duration');
    await durationGroup.getByRole('button', { name: '30s' }).click();
    await page.getByTestId('audio-gen-submit').click();
    await expect(page.getByTestId('audio-gen-preview')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('audio-gen-meta')).toBeVisible();
  });

  test('model dropdown loads ElevenLabs models when backend returns them', async ({ page }) => {
    await page.route('**/api/models/audio', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          models: [
            { id: 'musicgen-small',  label: 'MusicGen Small',       provider: 'replicate', tier: 'free' },
            { id: 'musicgen-large',  label: 'MusicGen Large',       provider: 'replicate', tier: 'free' },
            { id: 'bark',            label: 'Bark (voix/effets)',    provider: 'replicate', tier: 'free' },
            { id: 'eleven-multilingual', label: 'ElevenLabs Multilingual', provider: 'elevenlabs', tier: 'free', note: '10k chars/mois' },
          ],
        }),
      });
    });
    await page.goto('/media?tab=audio');
    const select = page.getByTestId('audio-gen-model');
    await expect(select).toBeVisible();
    await expect.poll(async () => {
      const texts = await select.locator('option').allInnerTexts();
      return texts.some((t) => t.includes('ElevenLabs'));
    }, { timeout: 5000 }).toBe(true);
  });
});
