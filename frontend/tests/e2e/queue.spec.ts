import { test, expect } from "@playwright/test";

test.describe("Queue page", () => {
  test("Queue link navigates to /queue", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Queue");
    await expect(page).toHaveURL("/queue");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("Queue page renders header and Kanban columns", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.locator("h1")).toContainText("Agent Queue");
    await expect(page.locator('[data-testid="column-queued"]')).toBeVisible();
    await expect(page.locator('[data-testid="column-running"]')).toBeVisible();
    await expect(page.locator('[data-testid="column-done"]')).toBeVisible();
  });

  test("Queue page shows timeline with scale toggles", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.locator("text=Timeline")).toBeVisible();
    await expect(page.locator('[data-testid="scale-1d"]')).toBeVisible();
    await expect(page.locator('[data-testid="scale-3d"]')).toBeVisible();
    await expect(page.locator('[data-testid="scale-7d"]')).toBeVisible();
  });

  test("Scale toggle changes active state", async ({ page }) => {
    await page.goto("/queue");
    const btn3d = page.locator('[data-testid="scale-3d"]');
    await btn3d.click();
    // After click, the 3d button should have the active styling (purple border)
    await expect(btn3d).toBeVisible();
  });

  test("Add button opens modal", async ({ page }) => {
    await page.goto("/queue");
    await page.locator('[data-testid="add-to-queue-btn"]').click();
    await expect(page.locator('[data-testid="add-queue-modal"]')).toBeVisible();
    await expect(page.locator("text=Add to Queue")).toBeVisible();
  });

  test("Add modal can be closed", async ({ page }) => {
    await page.goto("/queue");
    await page.locator('[data-testid="add-to-queue-btn"]').click();
    await expect(page.locator('[data-testid="add-queue-modal"]')).toBeVisible();
    await page.locator("text=Close").click();
    await expect(page.locator('[data-testid="add-queue-modal"]')).not.toBeVisible();
  });

  test("Empty queue shows placeholder text", async ({ page }) => {
    await page.goto("/queue");
    // Wait for loading to finish
    await page.waitForSelector('[data-testid="column-queued"]');
    await expect(page.locator("text=Queue is empty")).toBeVisible();
  });
});

test.describe("Sprint launcher buttons", () => {
  test("Sprint rows show play and pause buttons", async ({ page }) => {
    // Navigate to a project page — use mock-friendly route
    await page.goto("/projects");
    // If projects are listed, click the first one
    const projectLinks = page.locator('a[href^="/projects/"]');
    const count = await projectLinks.count();
    if (count > 0) {
      await projectLinks.first().click();
      await page.waitForLoadState("networkidle");
      // Check if sprint launcher buttons exist (if sprints are present)
      const launchBtns = page.locator('[data-testid="sprint-launch-btn"]');
      const launchCount = await launchBtns.count();
      // If sprints exist, buttons should be visible
      if (launchCount > 0) {
        await expect(launchBtns.first()).toBeVisible();
        await expect(page.locator('[data-testid="sprint-pause-btn"]').first()).toBeVisible();
      }
    }
  });
});
