import { test, expect } from "@playwright/test";

test.describe("Projects page", () => {
  test("navigates to /projects from sidebar", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Projects");
    await expect(page).toHaveURL("/projects");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("projects page renders without error", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.locator("h1")).toContainText("Projects");
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("projects page shows project count in subtitle", async ({ page }) => {
    await page.goto("/projects");
    // Wait for the loading state to resolve
    await expect(page.locator("h1")).toContainText("Projects");
    // Should show either a count or "0 projects tracked"
    await expect(page.locator("p").filter({ hasText: /\d+ project/ })).toBeVisible({
      timeout: 10000,
    });
  });

  test("projects page shows project cards or empty state", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const cards = page.locator('a[href^="/projects/"]');
    const emptyState = page.locator("text=No projects found");
    const errorState = page.locator('[style*="color: #f87171"]');

    // One of cards, empty state, or error should be visible
    await expect(cards.first().or(emptyState).or(errorState)).toBeVisible({
      timeout: 10000,
    });
  });

  test("project card links to detail page", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    const cardCount = await firstCard.count();

    if (cardCount > 0) {
      const href = await firstCard.getAttribute("href");
      await firstCard.click();
      await expect(page).toHaveURL(href ?? /\/projects\/.+/);
      await expect(page.locator("text=Application error")).not.toBeVisible();
    } else {
      // Skip if no projects exist in this environment
      test.skip();
    }
  });

  test("project detail page shows back-to-projects link", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    const cardCount = await firstCard.count();

    if (cardCount > 0) {
      await firstCard.click();
      // Back link
      await expect(page.locator("text=Projects").first()).toBeVisible();
      // Backlog section heading inside main content
      await expect(page.locator("main h2", { hasText: "Backlog" })).toBeVisible();
    } else {
      test.skip();
    }
  });

  test("project detail page shows project info card", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) > 0) {
      await firstCard.click();
      await page.waitForLoadState("networkidle");
      // Should not show application error
      await expect(page.locator("text=Application error")).not.toBeVisible();
      // Should show a refresh button
      await expect(page.locator("button", { hasText: "Refresh" })).toBeVisible();
    } else {
      test.skip();
    }
  });

  test("active nav item highlighted on projects page", async ({ page }) => {
    await page.goto("/projects");
    const projectsLink = page.locator('a[href="/projects"]');
    await expect(projectsLink).toHaveCSS("color", "rgb(167, 139, 250)");
  });

  test("refresh button reloads projects", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const refreshBtn = page.locator("button", { hasText: "Refresh" });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    // Button should briefly show spinner then settle
    await expect(refreshBtn).toBeVisible();
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("projects page shows status badges on cards", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) > 0) {
      // Status badge — contains one of the known statuses
      const badge = firstCard.locator(
        'span:is(:text("ACTIVE"), :text("PAUSED"), :text("ARCHIVED"))'
      );
      await expect(badge.first()).toBeVisible();
    } else {
      test.skip();
    }
  });
});
