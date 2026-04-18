import { test, expect } from "@playwright/test";

const API = "http://localhost:3011";
const PROJECT_ID = "sona-dashboard";

test.describe("Backlog DB API", () => {
  test("GET /api/backlogs/:projectId/sprints returns sprints", async ({ request }) => {
    const res = await request.get(`${API}/api/backlogs/${PROJECT_ID}/sprints`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.sprints).toBeDefined();
    expect(Array.isArray(data.sprints)).toBe(true);
  });

  test("GET /api/backlogs/:projectId/full returns sections and items", async ({ request }) => {
    const res = await request.get(`${API}/api/backlogs/${PROJECT_ID}/full`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.sections).toBeDefined();
    expect(data.items).toBeDefined();
    expect(data.sprints).toBeDefined();
    expect(Array.isArray(data.sections)).toBe(true);
    expect(Array.isArray(data.items)).toBe(true);
  });

  test("POST /api/backlogs/:projectId/sprints creates a sprint", async ({ request }) => {
    const res = await request.post(`${API}/api/backlogs/${PROJECT_ID}/sprints`, {
      data: { name: "E2E Test Sprint", priority: "low", sort_order: 99 },
    });
    expect(res.status()).toBe(201);
    const sprint = await res.json();
    expect(sprint.id).toBeDefined();
    expect(sprint.name).toBe("E2E Test Sprint");
    expect(sprint.priority).toBe("low");
    expect(sprint.project_id).toBe(PROJECT_ID);
  });

  test("PATCH /api/backlogs/:projectId/sprints/:id updates sprint status", async ({ request }) => {
    // Create a sprint first
    const createRes = await request.post(`${API}/api/backlogs/${PROJECT_ID}/sprints`, {
      data: { name: "Status Test Sprint", priority: "medium" },
    });
    const sprint = await createRes.json();

    // Pause it
    const patchRes = await request.patch(`${API}/api/backlogs/${PROJECT_ID}/sprints/${sprint.id}`, {
      data: { status: "paused" },
    });
    expect(patchRes.status()).toBe(200);
    const updated = await patchRes.json();
    expect(updated.status).toBe("paused");
  });

  test("POST + GET items CRUD flow", async ({ request }) => {
    // Get first sprint
    const sprintsRes = await request.get(`${API}/api/backlogs/${PROJECT_ID}/sprints`);
    const sprints = (await sprintsRes.json()).sprints;
    expect(sprints.length).toBeGreaterThan(0);
    const sprintId = sprints[0].id;

    // Create item
    const createRes = await request.post(`${API}/api/backlogs/${PROJECT_ID}/items`, {
      data: { sprint_id: sprintId, text: "E2E test item", priority: "P1" },
    });
    expect(createRes.status()).toBe(201);
    const item = await createRes.json();
    expect(item.id).toBeDefined();
    expect(item.text).toBe("E2E test item");
    expect(item.status).toBe("todo");
    expect(item.priority).toBe("P1");

    // Update item status to done
    const patchRes = await request.patch(`${API}/api/backlogs/${PROJECT_ID}/items/${item.id}`, {
      data: { status: "done" },
    });
    expect(patchRes.status()).toBe(200);
    const updated = await patchRes.json();
    expect(updated.status).toBe("done");

    // Get items for sprint
    const getRes = await request.get(`${API}/api/backlogs/${PROJECT_ID}/items?sprint_id=${sprintId}`);
    expect(getRes.status()).toBe(200);
    const items = (await getRes.json()).items;
    const found = items.find((i: { id: string }) => i.id === item.id);
    expect(found).toBeDefined();
    expect(found.status).toBe("done");
  });

  test("POST + GET acceptance criteria flow", async ({ request }) => {
    // Get first item
    const itemsRes = await request.get(`${API}/api/backlogs/${PROJECT_ID}/items`);
    const items = (await itemsRes.json()).items;
    expect(items.length).toBeGreaterThan(0);
    const itemId = items[0].id;

    // Create AC
    const createRes = await request.post(`${API}/api/backlogs/${PROJECT_ID}/items/${itemId}/ac`, {
      data: { text: "E2E AC: test passes" },
    });
    expect(createRes.status()).toBe(201);
    const ac = await createRes.json();
    expect(ac.id).toBeDefined();
    expect(ac.text).toBe("E2E AC: test passes");
    expect(ac.status).toBe("pending");

    // Update AC to pass
    const patchRes = await request.patch(`${API}/api/backlogs/${PROJECT_ID}/ac/${ac.id}`, {
      data: { status: "pass" },
    });
    expect(patchRes.status()).toBe(200);
    const updated = await patchRes.json();
    expect(updated.status).toBe("pass");

    // List ACs
    const listRes = await request.get(`${API}/api/backlogs/${PROJECT_ID}/items/${itemId}/ac`);
    expect(listRes.status()).toBe(200);
    const criteria = (await listRes.json()).criteria;
    expect(criteria.length).toBeGreaterThan(0);
  });
});

test.describe("Backlog DB Frontend", () => {
  test("project detail page loads backlog from DB", async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("networkidle");

    // Should show Backlog section
    await expect(page.locator("main h2", { hasText: "Backlog" })).toBeVisible();

    // Should show sprint headers from DB (section headers)
    const headers = page.locator('[data-testid="backlog-section-header"]');
    await expect(headers.first()).toBeVisible({ timeout: 10000 });
  });

  test("sprint control buttons are visible", async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("networkidle");

    // Wait for backlog to load
    await expect(page.locator('[data-testid="backlog-section-header"]').first()).toBeVisible({ timeout: 10000 });

    // Play/Pause/Stop buttons should be visible
    await expect(page.locator('[data-testid="sprint-play"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="sprint-pause"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="sprint-stop"]').first()).toBeVisible();
  });

  test("sprint headers show priority badges", async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="backlog-section-header"]').first()).toBeVisible({ timeout: 10000 });

    // Should have at least one priority badge (high/medium/low)
    const badges = page.locator('[data-testid="backlog-section-header"] span').filter({
      hasText: /^(high|medium|low)$/i,
    });
    await expect(badges.first()).toBeVisible();
  });

  test("sprint headers show status badges", async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="backlog-section-header"]').first()).toBeVisible({ timeout: 10000 });

    // Should have at least one status badge
    const statusBadges = page.locator('[data-testid="backlog-section-header"] span').filter({
      hasText: /^(active|paused|planning|done)$/i,
    });
    await expect(statusBadges.first()).toBeVisible();
  });

  test("migration endpoint works", async ({ request }) => {
    const res = await request.post(`${API}/api/backlogs/migrate`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.migrated)).toBe(true);
  });
});
