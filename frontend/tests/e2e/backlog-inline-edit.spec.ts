import { test, expect } from "@playwright/test";

const PROJECT_ID = "sona-dashboard";

test.describe("Backlog inline item editing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("networkidle");
    // Wait for at least one backlog item to be visible
    await page.waitForSelector('[data-testid="backlog-item-text"]', { timeout: 15000 });
  });

  test("clicking item text enters edit mode", async ({ page }) => {
    const itemText = page.locator('[data-testid="backlog-item-text"]').first();
    await expect(itemText).toBeVisible();

    const currentText = (await itemText.textContent())?.trim() ?? "";
    await itemText.click();

    // Input should appear with the item's current text pre-filled
    const editInput = page.locator('[data-testid="backlog-item-edit-input"]').first();
    await expect(editInput).toBeVisible();
    const inputValue = await editInput.inputValue();
    expect(inputValue).toBe(currentText);
  });

  test("text span has cursor pointer", async ({ page }) => {
    const itemText = page.locator('[data-testid="backlog-item-text"]').first();
    await expect(itemText).toBeVisible();
    const cursor = await itemText.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe("pointer");
  });

  test("edit input is focused after clicking text", async ({ page }) => {
    const itemText = page.locator('[data-testid="backlog-item-text"]').first();
    await itemText.click();
    const editInput = page.locator('[data-testid="backlog-item-edit-input"]').first();
    await expect(editInput).toBeFocused();
  });

  test("pressing Escape cancels edit without saving", async ({ page }) => {
    const itemText = page.locator('[data-testid="backlog-item-text"]').first();
    const originalText = (await itemText.textContent())?.trim() ?? "";

    await itemText.click();
    const editInput = page.locator('[data-testid="backlog-item-edit-input"]').first();
    await editInput.fill("THIS SHOULD NOT BE SAVED");
    await editInput.press("Escape");

    // Input should be gone, original text restored
    await expect(editInput).not.toBeVisible();
    await expect(page.locator('[data-testid="backlog-item-text"]').first()).toHaveText(originalText);
  });

  test("pressing Enter commits the edit and calls PATCH API", async ({ page }) => {
    let patchCalled = false;
    let patchBody: Record<string, unknown> = {};
    await page.route("**/api/backlogs/**/items/**", async (route) => {
      const req = route.request();
      if (req.method() === "PATCH") {
        patchCalled = true;
        const body = req.postDataJSON();
        if (body) patchBody = body;
      }
      await route.continue();
    });

    const itemText = page.locator('[data-testid="backlog-item-text"]').first();
    const originalText = (await itemText.textContent())?.trim() ?? "";
    const newText = `${originalText} (edited)`;

    await itemText.click();
    const editInput = page.locator('[data-testid="backlog-item-edit-input"]').first();
    await editInput.fill(newText);
    await editInput.press("Enter");

    // Input should disappear after commit
    await expect(editInput).not.toBeVisible({ timeout: 5000 });
    expect(patchCalled).toBe(true);
    expect(patchBody.text).toBe(newText);
  });

  test("clicking save button commits the edit", async ({ page }) => {
    let patchCalled = false;
    await page.route("**/api/backlogs/**/items/**", async (route) => {
      if (route.request().method() === "PATCH") patchCalled = true;
      await route.continue();
    });

    const itemText = page.locator('[data-testid="backlog-item-text"]').first();
    const originalText = (await itemText.textContent())?.trim() ?? "";

    await itemText.click();
    const editInput = page.locator('[data-testid="backlog-item-edit-input"]').first();
    await editInput.fill(`${originalText} v2`);
    await page.locator('[data-testid="backlog-item-save"]').first().click();

    await expect(editInput).not.toBeVisible({ timeout: 5000 });
    expect(patchCalled).toBe(true);
  });

  test("clicking cancel button cancels the edit", async ({ page }) => {
    const itemText = page.locator('[data-testid="backlog-item-text"]').first();
    const originalText = (await itemText.textContent())?.trim() ?? "";

    await itemText.click();
    const editInput = page.locator('[data-testid="backlog-item-edit-input"]').first();
    await editInput.fill("modified text that should not persist");
    await page.locator('[data-testid="backlog-item-cancel"]').first().click();

    await expect(editInput).not.toBeVisible();
    await expect(page.locator('[data-testid="backlog-item-text"]').first()).toHaveText(originalText);
  });

  test("pencil icon is visible on hover", async ({ page }) => {
    const row = page.locator('[data-testid="backlog-item-row"]').first();
    await expect(row).toBeVisible();

    const pencilBtn = row.locator('button[title="Edit item"]');

    // Before hovering — pencil should have opacity 0
    const opacityBefore = await pencilBtn.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacityBefore)).toBe(0);

    // Hover over the row — toBeVisible() checks opacity > 0 implicitly
    await row.hover();
    await expect(pencilBtn).toBeVisible({ timeout: 3000 });
  });
});
