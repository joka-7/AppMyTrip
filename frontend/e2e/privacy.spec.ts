import { expect, test } from "@playwright/test";

test.describe("Privacy page", () => {
  test("says what leaves the device and links back to the app", async ({ page }) => {
    await page.goto("/privacy.html");

    await expect(page.getByRole("heading", { level: 1, name: /Privacy/i })).toBeVisible();
    await expect(page.getByText(/hidden app folder in your own Google\s+Drive/i)).toBeVisible();
    await expect(page.getByText(/encrypted on your device with a new random key/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to AppMyTrip/i })).toHaveAttribute("href", "/");
  });
});
