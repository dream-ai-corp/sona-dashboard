import { test, expect } from '@playwright/test';

const FAKE_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Media Page — Image Generation Modal (S3-05)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/media?tab=image');
  });

  test('renders the media page with image tab active', async ({ page }) => {
    await expect(page).toHaveURL(/\/media\?tab=image/);
    await expect(page.getByTestId('media-page')).toBeVisible();
    await expect(page.getByTestId('media-tab-image')).toBeVisible();
  });

  test('image tab is selected by default when ?tab=image', async ({ page }) => {
    const tab = page.getByTestId('media-tab-image');
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('image generation modal is visible on image tab', async ({ page }) => {
    await expect(page.getByTestId('image-gen-modal')).toBeVisible();
  });

  test('video and audio tabs are visible', async ({ page }) => {
    await expect(page.getByTestId('media-tab-video')).toBeVisible();
    await expect(page.getByTestId('media-tab-audio')).toBeVisible();
  });

  test('prompt textarea is present and accepts input', async ({ page }) => {
    const prompt = page.getByTestId('image-gen-prompt');
    await expect(prompt).toBeVisible();
    await prompt.fill('a futuristic city at night, neon lights');
    await expect(prompt).toHaveValue('a futuristic city at night, neon lights');
  });

  test('model selector is present with FLUX and SDXL options', async ({ page }) => {
    // Mock the models API so we control the option labels
    await page.route('**/api/models/image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            { id: 'flux-schnell',   label: 'FLUX.1 Schnell',      provider: 'replicate', tier: 'free' },
            { id: 'sdxl-lightning', label: 'SDXL Lightning',       provider: 'replicate', tier: 'free' },
            { id: 'sdxl',           label: 'Stable Diffusion XL',  provider: 'replicate', tier: 'free' },
          ],
        }),
      });
    });
    await page.goto('/media?tab=image');
    const select = page.getByTestId('image-gen-model');
    // Wait for models to finish loading (select becomes enabled)
    await expect(select).toBeEnabled({ timeout: 10000 });
    const options = await select.locator('option').allInnerTexts();
    expect(options.some((o) => o.includes('FLUX'))).toBeTruthy();
    expect(options.some((o) => o.includes('SDXL'))).toBeTruthy();
  });

  test('ratio selector has 1:1, 16:9 and 9:16 options', async ({ page }) => {
    const ratioGroup = page.getByTestId('image-gen-ratio');
    await expect(ratioGroup).toBeVisible();
    await expect(ratioGroup.getByRole('button', { name: '1:1' })).toBeVisible();
    await expect(ratioGroup.getByRole('button', { name: '16:9' })).toBeVisible();
    await expect(ratioGroup.getByRole('button', { name: '9:16' })).toBeVisible();
  });

  test('ratio button selection toggles aria-pressed', async ({ page }) => {
    const ratioGroup = page.getByTestId('image-gen-ratio');
    const btn169 = ratioGroup.getByRole('button', { name: '16:9' });
    await btn169.click();
    await expect(btn169).toHaveAttribute('aria-pressed', 'true');
  });

  test('Generate button is disabled without a prompt', async ({ page }) => {
    await expect(page.getByTestId('image-gen-submit')).toBeDisabled();
  });

  test('Generate button is enabled once prompt is filled', async ({ page }) => {
    await page.getByTestId('image-gen-prompt').fill('a dragon in the sky');
    await expect(page.getByTestId('image-gen-submit')).toBeEnabled();
  });

  test('Generate button shows loading state on click', async ({ page }) => {
    await page.route('**/api/generate/image', async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: FAKE_IMG }),
      });
    });

    await page.getByTestId('image-gen-prompt').fill('a test image');
    await page.getByTestId('image-gen-submit').click();
    await expect(page.getByTestId('image-gen-loading')).toBeVisible();
  });

  test('result preview is shown after successful generation', async ({ page }) => {
    await page.route('**/api/generate/image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: FAKE_IMG }),
      });
    });

    await page.getByTestId('image-gen-prompt').fill('a beautiful sunset');
    await page.getByTestId('image-gen-submit').click();
    await expect(page.getByTestId('image-gen-preview')).toBeVisible({ timeout: 10000 });
  });

  test('download button appears after image is generated', async ({ page }) => {
    await page.route('**/api/generate/image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: FAKE_IMG }),
      });
    });

    await page.getByTestId('image-gen-prompt').fill('a mountain');
    await page.getByTestId('image-gen-submit').click();
    await expect(page.getByTestId('image-gen-download')).toBeVisible({ timeout: 10000 });
  });

  test('error message is displayed on generation failure', async ({ page }) => {
    await page.route('**/api/generate/image', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Model unavailable' }),
      });
    });

    await page.getByTestId('image-gen-prompt').fill('test');
    await page.getByTestId('image-gen-submit').click();
    await expect(page.getByTestId('image-gen-error')).toBeVisible({ timeout: 10000 });
  });

  test('navigating to /media?tab=video shows video tab selected', async ({ page }) => {
    await page.goto('/media?tab=video');
    await expect(page.getByTestId('media-tab-video')).toHaveAttribute('aria-selected', 'true');
  });

  test('navigating to /media?tab=audio shows audio tab selected', async ({ page }) => {
    await page.goto('/media?tab=audio');
    await expect(page.getByTestId('media-tab-audio')).toHaveAttribute('aria-selected', 'true');
  });
});
