import { test, expect } from '@playwright/test';

test.describe('Sidebar navigation', () => {
  test('Dashboard link navigates to /', async ({ page }) => {
    await page.goto('/agents');
    await page.click('text=Dashboard');
    await expect(page).toHaveURL('/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('Agents link navigates to /agents', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Agents');
    await expect(page).toHaveURL('/agents');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('Jobs link navigates to /jobs', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Jobs');
    await expect(page).toHaveURL('/jobs');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('System link navigates to /system', async ({ page }) => {
    await page.goto('/');
    await page.click('text=System');
    await expect(page).toHaveURL('/system');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('Memory link navigates to /memory', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Memory');
    await expect(page).toHaveURL('/memory');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('Agents page renders content without error', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.locator('h1')).toContainText('Active Agents');
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('Jobs page renders content without error', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('h1')).toContainText('All Jobs');
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('System page renders content without error', async ({ page }) => {
    await page.goto('/system');
    await expect(page.locator('h1')).toContainText('System');
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('Memory page renders content without error', async ({ page }) => {
    await page.goto('/memory');
    await expect(page.locator('h1')).toContainText('Memory');
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('Dashboard page still renders without error', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Sona Dashboard")')).toBeVisible();
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('Active nav item is highlighted on agents page', async ({ page }) => {
    await page.goto('/agents');
    const agentsLink = page.locator('a[href="/agents"]');
    await expect(agentsLink).toHaveCSS('color', 'rgb(167, 139, 250)');
  });

  test('Active nav item is highlighted on jobs page', async ({ page }) => {
    await page.goto('/jobs');
    const jobsLink = page.locator('a[href="/jobs"]');
    await expect(jobsLink).toHaveCSS('color', 'rgb(167, 139, 250)');
  });
});
