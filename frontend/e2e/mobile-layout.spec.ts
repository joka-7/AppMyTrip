import { test, expect } from "@playwright/test";

/**
 * The builder must never scroll sideways on a phone. Guarding this in e2e
 * rather than by clamping `overflow-x` on the document: an `overflow` ancestor
 * silently disables `position: sticky` on its descendants, and the navbar
 * depends on it — so the only safe fix is to keep the content itself narrow
 * enough, and to notice when something stops being.
 */
async function horizontalOverflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
}

test.describe("mobile layout", () => {
  // Only meaningful at a phone viewport; the desktop project has room to spare.
  test.skip(({ isMobile }) => !isMobile, "phone-viewport regression guard");

  test("builder does not scroll horizontally", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("שלב 1 מתוך 4")).toBeVisible();

    // Sub-pixel rounding on transformed/bordered elements can leave a fraction
    // of a pixel; anything beyond 1px is real overflow.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("navbar controls stay within the viewport", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("שלב 1 מתוך 4")).toBeVisible();

    const viewportWidth = page.viewportSize()!.width;
    const nav = page.locator("nav").first();
    for (const control of await nav.getByRole("button").all()) {
      const box = await control.boundingBox();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 1);
    }
  });
});
