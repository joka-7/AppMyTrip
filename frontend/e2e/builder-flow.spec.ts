import { test, expect } from "@playwright/test";
import { mockAi } from "./mockAi";

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
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title.startsWith("falls back")) {
      await mockAi(page, { parse: "fail" });
    } else {
      await mockAi(page, {
        parse: SAMPLE_TRIP,
        agent: { trip: SAMPLE_TRIP, reply: "הוספתי מסעדה" },
      });
    }
  });

  test("walks through steps 1 -> 3 -> 4 with the live preview updating", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");

    await expect(page.getByText("שלב 1 מתוך 4")).toBeVisible();

    await page.getByRole("button", { name: "צור מבנה אפליקציה ראשוני" }).click();

    await expect(page.getByText("שלב 2 מתוך 4")).toBeVisible();
    await page.getByRole("button", { name: "דלג, המשך לסוכן" }).click();

    await expect(page.getByText("שלב 3 מתוך 4")).toBeVisible();

    if (isMobile) {
      // The side-by-side preview is desktop-only — a 350px bezel inside a
      // phone-width column is clipped and just costs a screen of scrolling. On a
      // phone the navbar's "preview app" button opens it full-screen instead,
      // so that's the path worth asserting here.
      await page.getByRole("button", { name: "תצוגה מקדימה של האפליקציה" }).click();
      // Scoped to the dialog: the desktop preview is display:none rather than
      // unmounted, so an unscoped lookup matches it too.
      const preview = page.getByRole("dialog", { name: "תצוגה מקדימה של האפליקציה" });
      await expect(preview.getByText("Spanish Steps")).toBeVisible();
      await preview.getByRole("button", { name: "חזרה" }).click();
    } else {
      await expect(page.getByText("Spanish Steps")).toBeVisible();
    }

    const chatInput = page.getByPlaceholder("ענה לסוכן (למשל: 'כן, תוסיף')");
    await chatInput.fill("הוסיפו מסעדה");
    await chatInput.press("Enter");
    await expect(page.getByText("הוספתי מסעדה")).toBeVisible();

    await page.getByRole("button", { name: "המשך לעיצוב האפליקציה" }).click();
    await expect(page.getByText("שלב 4 מתוך 4")).toBeVisible();
  });

  test("falls back to the offline demo trip when the AI provider is unreachable", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "צור מבנה אפליקציה ראשוני" }).click();

    await expect(page.getByText("שלב 2 מתוך 4")).toBeVisible();
    await expect(page.getByText(/לא הצלחנו להגיע לספק/)).toBeVisible();
    await page.getByRole("button", { name: "דלג, המשך לסוכן" }).click();

    await expect(page.getByText("שלב 3 מתוך 4")).toBeVisible();
  });
});
