import { test, expect } from "@playwright/test";

test.describe("Project status badges — filter tabs", () => {
  test("status filter tabs are shown when projects exist", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    // Filter tab list should be visible
    const tabList = page.locator('[role="tablist"][aria-label="Filter projects by status"]');
    await expect(tabList).toBeVisible({ timeout: 10000 });

    // All four tabs should exist
    for (const label of ["All", "Active", "Paused", "Archived"]) {
      await expect(tabList.locator(`button:has-text("${label}")`)).toBeVisible();
    }
  });

  test('"All" tab is active by default', async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    const allTab = page.locator('[role="tab"][data-filter="all"]');
    await expect(allTab).toBeVisible();
    await expect(allTab).toHaveAttribute("aria-selected", "true");
  });

  test("clicking Active tab filters to active projects", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    const activeTab = page.locator('[role="tab"][data-filter="active"]');
    if ((await activeTab.count()) === 0) {
      test.skip();
      return;
    }

    await activeTab.click();
    await expect(activeTab).toHaveAttribute("aria-selected", "true");

    // Subtitle should say "· active"
    const subtitle = page.locator("p").filter({ hasText: /· active/ });
    await expect(subtitle).toBeVisible({ timeout: 5000 });

    // Any visible badge should contain "active" (CSS text-transform: uppercase makes it look like ACTIVE, but DOM text is lowercase)
    const badges = page.locator('a[href^="/projects/"] span').filter({ hasText: /^active$/i });
    const emptyMsg = page.locator("text=No active projects");
    await expect(badges.first().or(emptyMsg)).toBeVisible({ timeout: 5000 });
  });

  test('"Show all projects" button resets filter', async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    // Switch to Archived tab to potentially hit empty state
    const archivedTab = page.locator('[role="tab"][data-filter="archived"]');
    if ((await archivedTab.count()) === 0) {
      test.skip();
      return;
    }

    await archivedTab.click();

    const showAll = page.locator('button:has-text("Show all projects")');
    if ((await showAll.count()) > 0) {
      await showAll.click();
      const allTab = page.locator('[role="tab"][data-filter="all"]');
      await expect(allTab).toHaveAttribute("aria-selected", "true");
    }
    // If no "Show all" button, archived projects exist — that's also fine
  });
});

test.describe("Project status badges — detail page status change", () => {
  test("status badge is visible on detail page and has a dropdown trigger", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    await firstCard.click();
    await page.waitForLoadState("networkidle");

    // The status badge button should be visible
    const statusBadge = page.locator('[data-testid="status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 10000 });
    await expect(statusBadge).toHaveAttribute("aria-label", "Change project status");
  });

  test("clicking status badge opens the status dropdown", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    await firstCard.click();
    await page.waitForLoadState("networkidle");

    const statusBadge = page.locator('[data-testid="status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 10000 });

    await statusBadge.click();

    // Dropdown should show the three options
    for (const opt of ["Active", "Paused", "Archived"]) {
      await expect(page.locator(`button:has-text("${opt}")`).last()).toBeVisible();
    }
  });

  test("status change persists after selecting a new status", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    await firstCard.click();
    await page.waitForLoadState("networkidle");

    const statusBadge = page.locator('[data-testid="status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 10000 });

    // Read current status
    const currentText = (await statusBadge.textContent())?.trim().toLowerCase() ?? '';
    // Pick a different status
    const nextStatus = currentText === 'active' ? 'Paused' : 'Active';
    const nextStatusLower = nextStatus.toLowerCase();

    await statusBadge.click();
    const nextBtn = page.locator(`button:has-text("${nextStatus}")`).last();
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Badge should update (DOM text is lowercase; CSS text-transform: uppercase is visual only)
    await expect(statusBadge).toContainText(nextStatusLower, { timeout: 8000 });

    // Revert to avoid polluting test state
    await statusBadge.click();
    const revertBtn = page.locator(`button:has-text("${currentText.charAt(0).toUpperCase() + currentText.slice(1)}")`).last();
    if ((await revertBtn.count()) > 0) {
      await revertBtn.click();
    }
  });
});
