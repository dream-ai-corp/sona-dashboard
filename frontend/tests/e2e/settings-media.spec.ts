import { test, expect, type Page } from "@playwright/test";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Click the "Média" tab button (not the sidebar nav link) */
async function clickMediaTab(page: Page) {
  await page.getByRole("button", { name: "Média" }).click();
}

/** Enable a media toggle and wait until aria-checked is true */
async function enableToggle(page: Page, testId: string) {
  await page.getByTestId(testId).click();
  await expect(page.getByTestId(testId)).toHaveAttribute("aria-checked", "true");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Settings — onglet Média", () => {
  // Mock /api/settings/media so the page doesn't fail when the backend is not
  // running during CI or when the feature branch hasn't been deployed yet.
  test.beforeEach(async ({ page }) => {
    let state = { images: false, video: false, audio: false };

    await page.route("/api/settings/media", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: state });
      } else if (route.request().method() === "PATCH") {
        const body = await route.request().postDataJSON();
        state = { ...state, ...body };
        await route.fulfill({ status: 200, json: state });
      } else {
        await route.continue();
      }
    });
  });

  test("l'onglet Média est visible dans la barre de navigation", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Média" })).toBeVisible();
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("cliquer sur Média affiche les 3 toggles (Images, Vidéo, Audio)", async ({ page }) => {
    await page.goto("/settings");
    await clickMediaTab(page);

    // Use exact match to avoid matching description paragraphs
    await expect(page.getByText("Images", { exact: true })).toBeVisible();
    await expect(page.getByText("Vidéo", { exact: true })).toBeVisible();
    await expect(page.getByText("Audio", { exact: true })).toBeVisible();

    await expect(page.getByTestId("media-toggle-images")).toBeVisible();
    await expect(page.getByTestId("media-toggle-video")).toBeVisible();
    await expect(page.getByTestId("media-toggle-audio")).toBeVisible();
  });

  test("les toggles sont désactivés par défaut", async ({ page }) => {
    await page.goto("/settings");
    await clickMediaTab(page);

    await expect(page.getByTestId("media-toggle-images")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("media-toggle-video")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("media-toggle-audio")).toHaveAttribute("aria-checked", "false");
  });

  test("activer le toggle Images affiche le guide Connexions", async ({ page }) => {
    await page.goto("/settings");
    await clickMediaTab(page);

    await expect(page.getByTestId("media-toggle-images-guide")).not.toBeVisible();

    await enableToggle(page, "media-toggle-images");

    await expect(page.getByTestId("media-toggle-images-guide")).toBeVisible();
    await expect(page.getByTestId("media-toggle-images-guide")).toContainText("Connexions");
  });

  test("activer le toggle Vidéo affiche le guide Connexions", async ({ page }) => {
    await page.goto("/settings");
    await clickMediaTab(page);

    await enableToggle(page, "media-toggle-video");
    await expect(page.getByTestId("media-toggle-video-guide")).toBeVisible();
  });

  test("activer le toggle Audio affiche le guide Connexions", async ({ page }) => {
    await page.goto("/settings");
    await clickMediaTab(page);

    await enableToggle(page, "media-toggle-audio");
    await expect(page.getByTestId("media-toggle-audio-guide")).toBeVisible();
  });

  test("le bouton 'Onglet Connexions' navigue vers l'onglet Connexions", async ({ page }) => {
    await page.goto("/settings");
    await clickMediaTab(page);

    // Enable Images and wait for guide to appear
    await enableToggle(page, "media-toggle-images");
    await expect(page.getByTestId("media-toggle-images-guide")).toBeVisible();

    // Click the nav button
    await page.getByTestId("media-toggle-images-go-connections").click();

    // Should now be on the Connexions tab
    await expect(page.getByText("Manage external service integrations")).toBeVisible();
    await expect(page.getByText("WhatsApp", { exact: true })).toBeVisible();
  });

  test("désactiver un toggle masque le guide", async ({ page }) => {
    await page.goto("/settings");
    await clickMediaTab(page);

    await enableToggle(page, "media-toggle-images");
    await expect(page.getByTestId("media-toggle-images-guide")).toBeVisible();

    await page.getByTestId("media-toggle-images").click();
    await expect(page.getByTestId("media-toggle-images")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("media-toggle-images-guide")).not.toBeVisible();
  });

  test("l'état est persisté entre les rechargements", async ({ page }) => {
    await page.goto("/settings");
    await clickMediaTab(page);

    // Enable Images and Audio
    await enableToggle(page, "media-toggle-images");
    await enableToggle(page, "media-toggle-audio");

    // Reload — state must survive (via API or localStorage depending on impl)
    await page.reload();
    await clickMediaTab(page);

    await expect(page.getByTestId("media-toggle-images")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("media-toggle-video")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("media-toggle-audio")).toHaveAttribute("aria-checked", "true");
  });

  test("la page Settings se charge sans erreur", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });
});
