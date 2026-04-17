import { test, expect } from '@playwright/test';

/**
 * Auth route and middleware tests.
 *
 * These tests verify that:
 * 1. /sign-in renders the Clerk SignIn component
 * 2. /sign-up renders the Clerk SignUp component
 * 3. Protected routes redirect unauthenticated visitors to /sign-in
 *
 * Note: full end-to-end signup → login → logout flows require real Clerk
 * credentials (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY).
 * These tests are structural/smoke tests that pass even without live Clerk keys
 * in a test environment where the middleware is configured correctly.
 */

test.describe('Auth pages', () => {
  test('/sign-in page renders without errors', async ({ page }) => {
    await page.goto('/sign-in');
    // Should not bounce elsewhere (Clerk shows sign-in UI on this route)
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('/sign-up page renders without errors', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page).toHaveURL(/sign-up/);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('/sign-in page has expected heading', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.locator('h1', { hasText: 'Sona Dashboard' })).toBeVisible();
  });

  test('/sign-up page has expected heading', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.locator('h1', { hasText: 'Sona Dashboard' })).toBeVisible();
  });
});

test.describe('Auth middleware — route protection', () => {
  test('unauthenticated visit to / redirects to sign-in', async ({ page }) => {
    await page.goto('/');
    // Middleware should redirect to /sign-in (Clerk's default)
    await expect(page).toHaveURL(/sign-in/);
  });

  test('unauthenticated visit to /agents redirects to sign-in', async ({ page }) => {
    await page.goto('/agents');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('unauthenticated visit to /jobs redirects to sign-in', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('unauthenticated visit to /settings redirects to sign-in', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('/sign-in itself is publicly accessible (no redirect loop)', async ({ page }) => {
    const response = await page.goto('/sign-in');
    // Should resolve without looping; status 200 or 307 (Clerk CDN)
    expect(response?.status()).not.toBe(500);
    await expect(page).toHaveURL(/sign-in/);
  });

  test('/sign-up itself is publicly accessible (no redirect loop)', async ({ page }) => {
    const response = await page.goto('/sign-up');
    expect(response?.status()).not.toBe(500);
    await expect(page).toHaveURL(/sign-up/);
  });
});
