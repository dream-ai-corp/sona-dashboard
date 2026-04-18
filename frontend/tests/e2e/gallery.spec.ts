import { test, expect } from "@playwright/test";

test.describe("Gallery page (S3-12)", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the gallery API endpoint so tests don't depend on real data
    await page.route("**/api/gallery**", async (route) => {
      const url = route.request().url();
      const typeParam = new URL(url).searchParams.get("type") ?? "all";
      const mockItems = [
        {
          id: "img-1",
          type: "image",
          prompt: "A purple sunset over the ocean",
          model: "flux-schnell",
          url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCI+PC9zdmc+",
          created_at: new Date("2026-04-17T10:00:00Z").toISOString(),
          provider: "replicate",
        },
        {
          id: "vid-1",
          type: "video",
          prompt: "A flying dragon",
          model: "wan2.1",
          url: "https://example.com/video.mp4",
          created_at: new Date("2026-04-17T11:00:00Z").toISOString(),
          provider: "replicate",
        },
        {
          id: "aud-1",
          type: "audio",
          prompt: "Relaxing ambient music",
          model: "musicgen-small",
          url: "https://example.com/audio.mp3",
          created_at: new Date("2026-04-17T12:00:00Z").toISOString(),
          provider: "replicate",
        },
      ];
      const filtered = typeParam === "all" ? mockItems : mockItems.filter((i) => i.type === typeParam);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, items: filtered, total: filtered.length }),
      });
    });

    // Mock delete endpoint
    await page.route("**/api/gallery/**", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      } else {
        await route.continue();
      }
    });
  });

  test("Gallery page renders without error", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.locator("text=Application error")).not.toBeVisible();
    await expect(page.getByTestId("gallery-page")).toBeVisible();
  });

  test("Gallery page shows correct heading", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.locator("h1")).toContainText("Galerie");
  });

  test("Gallery shows all items by default", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByTestId("gallery-item")).toHaveCount(3);
  });

  test("Filter by image type shows only images", async ({ page }) => {
    await page.goto("/gallery?type=image");
    await expect(page.getByTestId("gallery-tab-image")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("gallery-item")).toHaveCount(1);
  });

  test("Filter by video type shows only videos", async ({ page }) => {
    await page.goto("/gallery?type=video");
    await expect(page.getByTestId("gallery-tab-video")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("gallery-item")).toHaveCount(1);
  });

  test("Filter by audio type shows only audio", async ({ page }) => {
    await page.goto("/gallery?type=audio");
    await expect(page.getByTestId("gallery-tab-audio")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("gallery-item")).toHaveCount(1);
  });

  test("Clicking a type tab navigates to correct URL", async ({ page }) => {
    await page.goto("/gallery");
    await page.getByTestId("gallery-tab-video").click();
    await expect(page).toHaveURL(/\/gallery\?type=video/);
  });

  test("Each item shows prompt text", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByTestId("gallery-item").first()).toContainText("A purple sunset");
  });

  test("Each item has a download button", async ({ page }) => {
    await page.goto("/gallery");
    const firstItem = page.getByTestId("gallery-item").first();
    await expect(firstItem.getByTestId("download-btn")).toBeVisible();
  });

  test("Gallery sidebar link is present and navigates correctly", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Galerie");
    await expect(page).toHaveURL("/gallery");
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("Empty state is shown when no items exist", async ({ page }) => {
    await page.route("**/api/gallery**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, items: [], total: 0 }),
      });
    });
    await page.goto("/gallery");
    await expect(page.getByTestId("gallery-empty")).toBeVisible();
  });

  test("Item count badge shows correct number", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByTestId("gallery-count")).toContainText("3");
  });
});
