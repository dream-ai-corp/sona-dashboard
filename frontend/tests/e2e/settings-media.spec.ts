import { test, expect } from "@playwright/test";

test.describe("Settings — onglet Média", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage so each test starts with a clean state
    await page.goto("/settings");
    await page.evaluate(() => localStorage.removeItem("sona_media_settings"));
  });

  test("l'onglet Média est visible dans la barre de navigation", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Média")).toBeVisible();
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("cliquer sur Média affiche les 3 toggles (Images, Vidéo, Audio)", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Média").click();

    await expect(page.getByText("Images")).toBeVisible();
    await expect(page.getByText("Vidéo")).toBeVisible();
    await expect(page.getByText("Audio")).toBeVisible();

    await expect(page.getByTestId("media-toggle-images")).toBeVisible();
    await expect(page.getByTestId("media-toggle-video")).toBeVisible();
    await expect(page.getByTestId("media-toggle-audio")).toBeVisible();
  });

  test("les toggles sont désactivés par défaut", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Média").click();

    await expect(page.getByTestId("media-toggle-images")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("media-toggle-video")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("media-toggle-audio")).toHaveAttribute("aria-checked", "false");
  });

  test("activer le toggle Images affiche le guide Connexions", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Média").click();

    // Toggle should be off initially
    await expect(page.getByTestId("media-toggle-images-guide")).not.toBeVisible();

    // Enable it
    await page.getByTestId("media-toggle-images").click();
    await expect(page.getByTestId("media-toggle-images")).toHaveAttribute("aria-checked", "true");

    // Guide should appear
    await expect(page.getByTestId("media-toggle-images-guide")).toBeVisible();
    await expect(page.getByTestId("media-toggle-images-guide")).toContainText("Connexions");
  });

  test("activer le toggle Vidéo affiche le guide Connexions", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Média").click();

    await page.getByTestId("media-toggle-video").click();
    await expect(page.getByTestId("media-toggle-video")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("media-toggle-video-guide")).toBeVisible();
  });

  test("activer le toggle Audio affiche le guide Connexions", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Média").click();

    await page.getByTestId("media-toggle-audio").click();
    await expect(page.getByTestId("media-toggle-audio")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("media-toggle-audio-guide")).toBeVisible();
  });

  test("le bouton 'Onglet Connexions' navigue vers l'onglet Connexions", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Média").click();

    // Enable Images to show the guide
    await page.getByTestId("media-toggle-images").click();

    // Click the navigation button
    await page.getByTestId("media-toggle-images-go-connections").click();

    // Should now be on the Connexions tab
    await expect(page.getByText("Manage external service integrations")).toBeVisible();
    await expect(page.getByText("WhatsApp")).toBeVisible();
  });

  test("désactiver un toggle masque le guide", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Média").click();

    // Enable then disable
    await page.getByTestId("media-toggle-images").click();
    await expect(page.getByTestId("media-toggle-images-guide")).toBeVisible();

    await page.getByTestId("media-toggle-images").click();
    await expect(page.getByTestId("media-toggle-images")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("media-toggle-images-guide")).not.toBeVisible();
  });

  test("l'état est persisté dans localStorage", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Média").click();

    // Enable Images and Audio
    await page.getByTestId("media-toggle-images").click();
    await page.getByTestId("media-toggle-audio").click();

    // Reload the page
    await page.reload();
    await page.getByText("Média").click();

    // State should be restored
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
