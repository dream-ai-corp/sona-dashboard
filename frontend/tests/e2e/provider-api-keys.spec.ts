import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3011';

test.describe('Settings → Connexions — Provider API Keys (S3-02)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the backend /api/settings/providers GET endpoint
    await page.route(`${BACKEND_URL}/api/settings/providers`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            replicate: '',
            openai: '',
            openrouter: '',
            huggingface: '',
          }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      }
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Connections' }).click();
  });

  test('shows Provider API Keys section in Connexions tab', async ({ page }) => {
    await expect(page.getByText('Provider API Keys')).toBeVisible();
  });

  test('shows "Aucun provider configuré" when no keys are set', async ({ page }) => {
    await expect(page.getByTestId('provider-keys-configured-count')).toContainText('Aucun provider configuré');
  });

  test('shows input fields for all providers', async ({ page }) => {
    await expect(page.getByTestId('provider-key-input-openrouter')).toBeVisible();
    await expect(page.getByTestId('provider-key-input-replicate')).toBeVisible();
    await expect(page.getByTestId('provider-key-input-openai')).toBeVisible();
    await expect(page.getByTestId('provider-key-input-huggingface')).toBeVisible();
  });

  test('provider key inputs are masked by default', async ({ page }) => {
    const input = page.getByTestId('provider-key-input-openai');
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('save button is visible for each provider', async ({ page }) => {
    await expect(page.getByTestId('provider-key-save-openrouter')).toBeVisible();
    await expect(page.getByTestId('provider-key-save-replicate')).toBeVisible();
    await expect(page.getByTestId('provider-key-save-openai')).toBeVisible();
  });

  test('test button is visible for each provider', async ({ page }) => {
    await expect(page.getByTestId('provider-key-test-openrouter')).toBeVisible();
    await expect(page.getByTestId('provider-key-test-replicate')).toBeVisible();
    await expect(page.getByTestId('provider-key-test-openai')).toBeVisible();
  });

  test('test button is disabled when no key is entered', async ({ page }) => {
    await expect(page.getByTestId('provider-key-test-openai')).toBeDisabled();
  });

  test('test button becomes enabled after entering a key', async ({ page }) => {
    await page.getByTestId('provider-key-input-openai').fill('sk-test-12345');
    await expect(page.getByTestId('provider-key-test-openai')).toBeEnabled();
  });

  test('clicking save calls POST /api/settings/providers', async ({ page }) => {
    let savedPayload: unknown = null;

    await page.route(`${BACKEND_URL}/api/settings/providers`, async (route) => {
      if (route.request().method() === 'POST') {
        savedPayload = await route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ replicate: '', openai: '', openrouter: '', huggingface: '' }),
        });
      }
    });

    await page.getByTestId('provider-key-input-openai').fill('sk-test-abc123');
    await page.getByTestId('provider-key-save-openai').click();

    await expect.poll(() => savedPayload).toEqual({ provider: 'openai', api_key: 'sk-test-abc123' });
  });

  test('configured count updates when a key is saved', async ({ page }) => {
    let callCount = 0;

    await page.route(`${BACKEND_URL}/api/settings/providers`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        callCount++;
        const body = callCount === 1
          ? { replicate: '', openai: '', openrouter: '', huggingface: '' }
          : { replicate: '', openai: 'sk-test', openrouter: '', huggingface: '' };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
    });

    await page.getByTestId('provider-key-input-openai').fill('sk-test');
    await page.getByTestId('provider-key-save-openai').click();

    await expect(page.getByTestId('provider-keys-configured-count')).toContainText('1 configuré', { timeout: 5000 });
  });

  test('test button shows success on passing test', async ({ page }) => {
    await page.route(`${BACKEND_URL}/api/settings/providers/openai/test`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.getByTestId('provider-key-input-openai').fill('sk-test-valid');
    await page.getByTestId('provider-key-test-openai').click();

    await expect(page.getByTestId('provider-key-test-openai')).toContainText('Connexion réussie', { timeout: 5000 });
  });

  test('test button shows failure message on failed test', async ({ page }) => {
    await page.route(`${BACKEND_URL}/api/settings/providers/openai/test`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'OpenAI HTTP 401' }),
      });
    });

    await page.getByTestId('provider-key-input-openai').fill('sk-bad-key');
    await page.getByTestId('provider-key-test-openai').click();

    await expect(page.getByTestId('provider-key-test-openai')).toContainText('OpenAI HTTP 401', { timeout: 5000 });
  });
});
