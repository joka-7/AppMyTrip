import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("accessibility smoke", () => {
  test("builder home has no critical or serious axe violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("שלב 1 מתוך 4")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
  });
});
