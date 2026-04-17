import { test, expect } from '@playwright/test';

const FAKE_VIDEO = 'https://example.com/fake-video.mp4';

test.describe('Media Page — Video Generation Modal (S3-07)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/media?tab=video');
  });

  test('video tab is selected when ?tab=video', async ({ page }) => {
    const tab = page.getByTestId('media-tab-video');
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('video generation modal is visible on video tab', async ({ page }) => {
    await expect(page.getByTestId('video-gen-modal')).toBeVisible();
  });

  test('prompt textarea is present and accepts input', async ({ page }) => {
    const prompt = page.getByTestId('video-gen-prompt');
    await expect(prompt).toBeVisible();
    await prompt.fill('a futuristic city flyover at night, cinematic');
    await expect(prompt).toHaveValue('a futuristic city flyover at night, cinematic');
  });

  test('model selector is present with video model options', async ({ page }) => {
    const select = page.getByTestId('video-gen-model');
    await expect(select).toBeVisible();
    const options = await select.locator('option').allInnerTexts();
    expect(options.some((o) => o.includes('Wan'))).toBeTruthy();
    expect(options.some((o) => o.includes('ByteDance') || o.includes('AnimateDiff'))).toBeTruthy();
  });

  test('duration selector has 2s, 4s and 8s options', async ({ page }) => {
    const durationGroup = page.getByTestId('video-gen-duration');
    await expect(durationGroup).toBeVisible();
    await expect(durationGroup.getByRole('button', { name: '2s' })).toBeVisible();
    await expect(durationGroup.getByRole('button', { name: '4s' })).toBeVisible();
    await expect(durationGroup.getByRole('button', { name: '8s' })).toBeVisible();
  });

  test('4s is selected by default', async ({ page }) => {
    const durationGroup = page.getByTestId('video-gen-duration');
    const btn4s = durationGroup.getByRole('button', { name: '4s' });
    await expect(btn4s).toHaveAttribute('aria-pressed', 'true');
  });

  test('duration button selection toggles aria-pressed', async ({ page }) => {
    const durationGroup = page.getByTestId('video-gen-duration');
    const btn8s = durationGroup.getByRole('button', { name: '8s' });
    await btn8s.click();
    await expect(btn8s).toHaveAttribute('aria-pressed', 'true');
    const btn4s = durationGroup.getByRole('button', { name: '4s' });
    await expect(btn4s).toHaveAttribute('aria-pressed', 'false');
  });

  test('Generate button is disabled without a prompt', async ({ page }) => {
    await expect(page.getByTestId('video-gen-submit')).toBeDisabled();
  });

  test('Generate button is enabled once prompt is filled', async ({ page }) => {
    await page.getByTestId('video-gen-prompt').fill('a dragon soaring over mountains');
    await expect(page.getByTestId('video-gen-submit')).toBeEnabled();
  });

  test('Generate button shows loading state on click', async ({ page }) => {
    await page.route('**/api/generate/video', async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: FAKE_VIDEO }),
      });
    });

    await page.getByTestId('video-gen-prompt').fill('a test video');
    await page.getByTestId('video-gen-submit').click();
    await expect(page.getByTestId('video-gen-loading')).toBeVisible();
  });

  test('video preview is shown after successful generation', async ({ page }) => {
    await page.route('**/api/generate/video', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: FAKE_VIDEO }),
      });
    });

    await page.getByTestId('video-gen-prompt').fill('a beautiful sunset timelapse');
    await page.getByTestId('video-gen-submit').click();
    await expect(page.getByTestId('video-gen-preview')).toBeVisible({ timeout: 10000 });
  });

  test('download button appears after video is generated', async ({ page }) => {
    await page.route('**/api/generate/video', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: FAKE_VIDEO }),
      });
    });

    await page.getByTestId('video-gen-prompt').fill('ocean waves');
    await page.getByTestId('video-gen-submit').click();
    await expect(page.getByTestId('video-gen-download')).toBeVisible({ timeout: 10000 });
  });

  test('error message is displayed on generation failure', async ({ page }) => {
    await page.route('**/api/generate/video', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Model unavailable' }),
      });
    });

    await page.getByTestId('video-gen-prompt').fill('test');
    await page.getByTestId('video-gen-submit').click();
    await expect(page.getByTestId('video-gen-error')).toBeVisible({ timeout: 10000 });
  });

  test('metadata chips show model and duration after generation', async ({ page }) => {
    await page.route('**/api/generate/video', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: FAKE_VIDEO }),
      });
    });

    await page.getByTestId('video-gen-prompt').fill('sunset');
    const durationGroup = page.getByTestId('video-gen-duration');
    await durationGroup.getByRole('button', { name: '8s' }).click();
    await page.getByTestId('video-gen-submit').click();
    await expect(page.getByTestId('video-gen-preview')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('video-gen-meta')).toBeVisible();
  });
});
