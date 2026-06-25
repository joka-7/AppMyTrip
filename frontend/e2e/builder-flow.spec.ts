import { test, expect } from "@playwright/test";

// Mocks the three backend calls so the flow is deterministic and needs no
// running FastAPI server, GEMINI_API_KEY, or network access.
const SAMPLE_TRIP = {
  title: "Trip to Rome",
  dates: "Thu - Sun",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "a1",
          time: "10:00",
          title: "Spanish Steps",
          desc: "A historic landmark.",
          type: "attraction",
          hasPodcast: true,
          map_coordinates: { lat: 41.9059, lng: 12.4827 },
        },
      ],
    },
  ],
};

test.describe("trip builder flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/trip/parse", async (route) => {
      await route.fulfill({
        json: { trip_data: SAMPLE_TRIP, initial_agent_message: null },
      });
    });
    await page.route("**/api/trip/agent", async (route) => {
      await route.fulfill({
        json: { trip_data: SAMPLE_TRIP, agent_reply: "הוספתי מסעדה" },
      });
    });
    await page.route("**/api/trip/generate-media", async (route) => {
      await route.fulfill({
        json: { trip_data: SAMPLE_TRIP, status: "Media generated successfully" },
      });
    });
  });

  test("walks through steps 1 -> 3 -> 4 with the live preview updating", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("שלב 1 מתוך 4")).toBeVisible();

    await page.getByRole("button", { name: "צור מבנה אפליקציה ראשוני" }).click();

    await expect(page.getByText("שלב 3 מתוך 4")).toBeVisible();
    await expect(page.getByText("Spanish Steps")).toBeVisible();

    const chatInput = page.getByPlaceholder("ענה לסוכן (למשל: 'כן, תוסיף')");
    await chatInput.fill("הוסיפו מסעדה כשרה");
    await chatInput.press("Enter");
    await expect(page.getByText("הוספתי מסעדה")).toBeVisible();

    await page.getByRole("button", { name: "המשך לעיצוב האפליקציה" }).click();
    await expect(page.getByText("שלב 4 מתוך 4")).toBeVisible();
  });

  test("falls back to the offline demo trip when the backend is unreachable", async ({ page }) => {
    await page.unroute("**/api/trip/parse");
    await page.route("**/api/trip/parse", async (route) => {
      await route.abort("failed");
    });

    await page.goto("/");
    await page.getByRole("button", { name: "צור מבנה אפליקציה ראשוני" }).click();

    await expect(page.getByText("שלב 3 מתוך 4")).toBeVisible();
    await expect(page.getByText(/לא הצלחנו להתחבר/)).toBeVisible();
  });
});
