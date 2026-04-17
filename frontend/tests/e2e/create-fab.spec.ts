import { test, expect } from '@playwright/test';

test.describe('SonaCreateFab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Create FAB button is visible on the page', async ({ page }) => {
    const fab = page.getByTestId('create-fab-button');
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute('aria-label', /Créer/);
  });

  test('Menu is hidden by default', async ({ page }) => {
    await expect(page.getByTestId('create-fab-menu')).not.toBeVisible();
  });

  test('Clicking FAB opens menu with Image, Vidéo, Audio items', async ({ page }) => {
    await page.getByTestId('create-fab-button').click();
    const menu = page.getByTestId('create-fab-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: /Image/i })).toBeVisible();
    await expect(menu.getByRole('button', { name: /Vidéo/i })).toBeVisible();
    await expect(menu.getByRole('button', { name: /Audio/i })).toBeVisible();
  });

  test('Clicking FAB a second time closes the menu', async ({ page }) => {
    const fab = page.getByTestId('create-fab-button');
    await fab.click();
    await expect(page.getByTestId('create-fab-menu')).toBeVisible();
    await fab.click();
    await expect(page.getByTestId('create-fab-menu')).not.toBeVisible();
  });

  test('Pressing Escape closes the menu', async ({ page }) => {
    await page.getByTestId('create-fab-button').click();
    await expect(page.getByTestId('create-fab-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('create-fab-menu')).not.toBeVisible();
  });

  test('Clicking outside the menu closes it', async ({ page }) => {
    await page.getByTestId('create-fab-button').click();
    await expect(page.getByTestId('create-fab-menu')).toBeVisible();
    await page.mouse.click(100, 100); // click away
    await expect(page.getByTestId('create-fab-menu')).not.toBeVisible();
  });

  test('Clicking Image item navigates to /media?tab=image', async ({ page }) => {
    await page.getByTestId('create-fab-button').click();
    await page.getByTestId('create-fab-menu').getByRole('button', { name: /Image/i }).click();
    await expect(page).toHaveURL(/\/media\?tab=image/);
  });

  test('Clicking Vidéo item navigates to /media?tab=video', async ({ page }) => {
    await page.getByTestId('create-fab-button').click();
    await page.getByTestId('create-fab-menu').getByRole('button', { name: /Vidéo/i }).click();
    await expect(page).toHaveURL(/\/media\?tab=video/);
  });

  test('Clicking Audio item navigates to /media?tab=audio', async ({ page }) => {
    await page.getByTestId('create-fab-button').click();
    await page.getByTestId('create-fab-menu').getByRole('button', { name: /Audio/i }).click();
    await expect(page).toHaveURL(/\/media\?tab=audio/);
  });
});
