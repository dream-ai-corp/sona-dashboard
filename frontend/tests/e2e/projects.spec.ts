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

  test("project detail page shows Job History section", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) > 0) {
      await firstCard.click();
      await page.waitForLoadState("networkidle");
      // Job History heading must be visible
      await expect(page.locator("main h2", { hasText: "Job History" })).toBeVisible();
      // No application error
      await expect(page.locator("text=Application error")).not.toBeVisible();
    } else {
      test.skip();
    }
  });

  test("project detail page job history shows job count", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/projects/"]').first();
    if ((await firstCard.count()) > 0) {
      await firstCard.click();
      await page.waitForLoadState("networkidle");
      // Should show either "N jobs" count or "No jobs found"
      const jobCount = page.locator("text=/\\d+ jobs?/").first();
      const emptyMsg = page.locator("text=No jobs found for this project.").first();
      await expect(jobCount.or(emptyMsg).first()).toBeVisible({ timeout: 10000 });
    } else {
      test.skip();
    }
  });

  test("backlog section headers render with dark-mode styling", async ({ page }) => {
    await page.goto("/projects/sona-dashboard");
    await page.waitForLoadState("networkidle");

    await page.waitForSelector('[data-testid="backlog-section-header"]', { timeout: 10000 });

    const headers = page.locator('[data-testid="backlog-section-header"]');
    const count = await headers.count();
    expect(count).toBeGreaterThan(0);

    const firstHeader = headers.first();
    await expect(firstHeader).toBeVisible();

    // Inner span should use dark-mode accent color, not plain black or white
    const headerSpan = firstHeader.locator("span").first();
    const color = await headerSpan.evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe("rgb(0, 0, 0)");
    expect(color).not.toBe("rgb(255, 255, 255)");
  });

  test("backlog groups items under sprint section headers", async ({ page }) => {
    await page.goto("/projects/sona-dashboard");
    await page.waitForLoadState("networkidle");

    const headers = page.locator('[data-testid="backlog-section-header"]');
    const headerCount = await headers.count();
    if (headerCount === 0) {
      test.skip();
      return;
    }

    await expect(headers.first()).toBeVisible();
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });
});

test.describe("New Project creation", () => {
  const TEST_PROJECT_NAME = `e2e-test-${Date.now()}`;

  test.afterEach(async () => {
    // clean up any project created during the test
    await fetch(`http://localhost:3011/api/projects`, {
      method: 'GET',
    }).catch(() => {});
    // best-effort cleanup via host — ignore errors
    const { execSync } = await import('child_process');
    try {
      execSync(`sudo rm -rf /home/beniben/sona-workspace/projects/${TEST_PROJECT_NAME}`, { stdio: 'ignore' });
    } catch {}
  });

  test("New Project button opens modal", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    const btn = page.locator('[data-testid="new-project-btn"]');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator("text=New Project").nth(1)).toBeVisible();
    await expect(page.locator('[data-testid="new-project-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="new-project-description"]')).toBeVisible();
    await expect(page.locator('[data-testid="new-project-features"]')).toBeVisible();
  });

  test("modal closes on Cancel", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="new-project-btn"]').click();
    await page.locator("button", { hasText: "Cancel" }).click();
    await expect(page.locator('[data-testid="new-project-name"]')).not.toBeVisible();
  });

  test("shows error when name is missing", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="new-project-btn"]').click();
    await page.locator('[data-testid="new-project-description"]').fill("Some description");
    await page.locator('[data-testid="new-project-submit"]').click();
    await expect(page.locator("text=Project name is required")).toBeVisible();
  });

  test("shows error when description is missing", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="new-project-btn"]').click();
    await page.locator('[data-testid="new-project-name"]').fill("some-name");
    await page.locator('[data-testid="new-project-submit"]').click();
    await expect(page.locator("text=Description is required")).toBeVisible();
  });

  test("creates project and generates briefing.md + backlog.md", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="new-project-btn"]').click();
    await page.locator('[data-testid="new-project-name"]').fill(TEST_PROJECT_NAME);
    await page.locator('[data-testid="new-project-description"]').fill("An e2e test project created by Playwright.");
    await page.locator('[data-testid="new-project-features"]').fill("Feature A\nFeature B");
    await page.locator('[data-testid="new-project-submit"]').click();

    // modal should close and new project card should appear
    await expect(page.locator('[data-testid="new-project-name"]')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator("h3", { hasText: TEST_PROJECT_NAME })).toBeVisible({ timeout: 10000 });

    // verify files were created via the API
    const briefRes = await page.request.get(`/api/projects/${TEST_PROJECT_NAME}/briefing`);
    const briefData = await briefRes.json();
    expect(briefData.content).toContain("An e2e test project created by Playwright.");
    expect(briefData.content).toContain("Feature A");

    const backlogRes = await page.request.get(`/api/projects/${TEST_PROJECT_NAME}/backlog`);
    const backlogData = await backlogRes.json();
    expect(backlogData.raw ?? backlogData.content ?? JSON.stringify(backlogData)).toContain("Define acceptance criteria");
  });
});
