import { test, expect } from '@playwright/test';

test.describe('Media page — /media?tab=image', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/media?tab=image');
  });

  test('renders the media page with all three tabs', async ({ page }) => {
    await expect(page.getByTestId('media-tab-image')).toBeVisible();
    await expect(page.getByTestId('media-tab-video')).toBeVisible();
    await expect(page.getByTestId('media-tab-audio')).toBeVisible();
  });

  test('image tab is active by default when navigating to ?tab=image', async ({ page }) => {
    const imageTab = page.getByTestId('media-tab-image');
    await expect(imageTab).toHaveAttribute('aria-selected', 'true');
  });

  test('image generation panel renders on image tab', async ({ page }) => {
    await expect(page.getByTestId('image-gen-modal')).toBeVisible();
  });

  test('prompt textarea is present and accepts input', async ({ page }) => {
    const textarea = page.getByTestId('image-gen-prompt');
    await expect(textarea).toBeVisible();
    await textarea.fill('Un coucher de soleil sur une ville futuriste');
    await expect(textarea).toHaveValue('Un coucher de soleil sur une ville futuriste');
  });

  test('model selector shows FLUX.1 Schnell by default', async ({ page }) => {
    const select = page.getByTestId('image-gen-model');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('flux-schnell');
  });

  test('model selector lists all expected models including paid options', async ({ page }) => {
    const select = page.getByTestId('image-gen-model');
    // Free models
    await expect(select.locator('option[value="flux-schnell"]')).toBeAttached();
    await expect(select.locator('option[value="sdxl"]')).toBeAttached();
    await expect(select.locator('option[value="sdxl-lightning"]')).toBeAttached();
    // Paid models
    await expect(select.locator('option[value="dall-e-3"]')).toBeAttached();
    await expect(select.locator('option[value="midjourney"]')).toBeAttached();
  });

  test('paid models are labelled as payant in options', async ({ page }) => {
    const select = page.getByTestId('image-gen-model');
    const dalleOption = select.locator('option[value="dall-e-3"]');
    const mjOption = select.locator('option[value="midjourney"]');
    await expect(dalleOption).toContainText('payant');
    await expect(mjOption).toContainText('payant');
  });

  test('free models are labelled as gratuit in options', async ({ page }) => {
    const select = page.getByTestId('image-gen-model');
    await expect(select.locator('option[value="flux-schnell"]')).toContainText('gratuit');
  });

  test('model can be changed via select', async ({ page }) => {
    await page.getByTestId('image-gen-model').selectOption('sdxl');
    await expect(page.getByTestId('image-gen-model')).toHaveValue('sdxl');
  });

  test('ratio buttons are visible (1:1, 16:9, 9:16)', async ({ page }) => {
    const ratioContainer = page.getByTestId('image-gen-ratio');
    await expect(ratioContainer).toBeVisible();
    await expect(ratioContainer.getByTitle('1:1')).toBeVisible();
    await expect(ratioContainer.getByTitle('16:9')).toBeVisible();
    await expect(ratioContainer.getByTitle('9:16')).toBeVisible();
  });

  test('clicking a ratio button selects it', async ({ page }) => {
    const btn16x9 = page.getByTestId('image-gen-ratio').getByTitle('16:9');
    await btn16x9.click();
    await expect(btn16x9).toHaveAttribute('aria-pressed', 'true');
  });

  test('generate button is disabled when prompt is empty', async ({ page }) => {
    await expect(page.getByTestId('image-gen-submit')).toBeDisabled();
  });

  test('generate button becomes enabled when prompt is filled', async ({ page }) => {
    await page.getByTestId('image-gen-prompt').fill('A mountain lake at dawn');
    await expect(page.getByTestId('image-gen-submit')).toBeEnabled();
  });

  test('generate button shows "Générer" when idle', async ({ page }) => {
    await expect(page.getByTestId('image-gen-submit')).toContainText('Générer');
  });

  test('idle placeholder is shown when no image generated yet', async ({ page }) => {
    await expect(page.getByText("L'image apparaîtra ici")).toBeVisible();
  });

  test('navigating to video tab shows coming soon panel', async ({ page }) => {
    await page.getByTestId('media-tab-video').click();
    await expect(page.getByTestId('image-gen-modal')).not.toBeVisible();
    await expect(page.getByText('Génération vidéo')).toBeVisible();
  });

  test('navigating to audio tab shows coming soon panel', async ({ page }) => {
    await page.getByTestId('media-tab-audio').click();
    await expect(page.getByTestId('image-gen-modal')).not.toBeVisible();
    await expect(page.getByText('Génération audio')).toBeVisible();
  });

  test('clicking back to image tab shows the generation panel again', async ({ page }) => {
    await page.getByTestId('media-tab-video').click();
    await page.getByTestId('media-tab-image').click();
    await expect(page.getByTestId('image-gen-modal')).toBeVisible();
  });

  test('FAB → Image navigates to /media?tab=image and shows panel', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('create-fab-button').click();
    await page.getByTestId('create-fab-menu').getByRole('button', { name: /Image/i }).click();
    await expect(page).toHaveURL(/\/media\?tab=image/);
    await expect(page.getByTestId('image-gen-modal')).toBeVisible();
  });
});

test.describe('Image Generation — API error handling', () => {
  test('shows error message when generation API returns error', async ({ page }) => {
    await page.route('/api/generate/image', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Aucun provider configuré' }),
      }),
    );

    await page.goto('/media?tab=image');
    await page.getByTestId('image-gen-prompt').fill('test prompt');
    await page.getByTestId('image-gen-submit').click();

    await expect(page.getByTestId('image-gen-error')).toBeVisible();
    await expect(page.getByTestId('image-gen-error')).toContainText('Aucun provider configuré');
  });

  test('shows image preview and download button on success', async ({ page }) => {
    await page.route('/api/generate/image', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://placehold.co/1024x1024/a78bfa/0a0f1a?text=Sona+AI' }),
      }),
    );

    await page.goto('/media?tab=image');
    await page.getByTestId('image-gen-prompt').fill('a test image');
    await page.getByTestId('image-gen-submit').click();

    await expect(page.getByTestId('image-gen-preview')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('image-gen-download')).toBeVisible();
  });

  test('generate button shows loading state during request', async ({ page }) => {
    // Stall the API so we can observe loading state
    await page.route('/api/generate/image', async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://placehold.co/1024x1024' }),
      });
    });

    await page.goto('/media?tab=image');
    await page.getByTestId('image-gen-prompt').fill('loading state test');
    await page.getByTestId('image-gen-submit').click();

    await expect(page.getByTestId('image-gen-loading')).toBeVisible();
    await expect(page.getByTestId('image-gen-submit')).toBeDisabled();
  });
});
