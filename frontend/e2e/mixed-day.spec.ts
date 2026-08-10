import { test, expect } from "@playwright/test";

/**
 * A day is not one mode. This walks a realistic mixed day end to end —
 * walk to the museum, drive to the trailhead, hike the trail, bus back — and
 * checks each leg is labelled and linked on its own.
 *
 * There is deliberately no whole-day route link to assert: Google Maps applies a
 * single `travelmode` to an entire route, so one day-long link would be wrong
 * for three of these four legs whichever mode it picked.
 */
const MIXED_TRIP = {
  title: "Mixed day",
  dates: "Mon - Mon",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "s1",
          time: "08:00",
          title: "Hotel Tel Aviv",
          desc: "",
          type: "lodging",
          map_coordinates: { lat: 32.08, lng: 34.78 },
        },
        // ~400m from the hotel.
        {
          id: "s2",
          time: "09:00",
          title: "Eretz Israel Museum",
          desc: "",
          type: "attraction",
          map_coordinates: { lat: 32.0836, lng: 34.78 },
        },
        // ~120km away.
        {
          id: "s3",
          time: "11:00",
          title: "Ein Gedi parking",
          desc: "",
          type: "transport",
          map_coordinates: { lat: 31.46, lng: 35.39 },
        },
        {
          id: "s4",
          time: "12:00",
          title: "Nahal David trail",
          desc: "A marked hike up the stream",
          type: "attraction",
          map_coordinates: { lat: 31.47, lng: 35.38 },
        },
        {
          id: "s5",
          time: "17:00",
          title: "Bus back to the city",
          desc: "",
          type: "transport",
          map_coordinates: { lat: 32.07, lng: 34.79 },
        },
      ],
    },
  ],
};

test.describe("a day that mixes travel modes", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/trip/parse", (route) =>
      route.fulfill({ json: { trip_data: MIXED_TRIP, initial_agent_message: "ok" } }),
    );
  });

  async function openGeneratedApp(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByRole("button", { name: "צור מבנה אפליקציה ראשוני" }).click();
    await expect(page.getByText("שלב 2 מתוך 4")).toBeVisible();
    await page.getByRole("button", { name: "דלג, המשך לסוכן" }).click();
    await expect(page.getByText("שלב 3 מתוך 4")).toBeVisible();
    // The dialog is the one place the generated app is visible at every viewport
    // — the side-by-side preview is desktop-only and stays in the DOM hidden.
    await page.getByRole("button", { name: "תצוגה מקדימה של האפליקציה" }).click();
    return page.getByRole("dialog", { name: "תצוגה מקדימה של האפליקציה" });
  }

  test("labels every leg with its own mode", async ({ page }) => {
    const app = await openGeneratedApp(page);
    const legs = app.getByRole("link", { name: /הוראות הגעה מהעצירה הקודמת/ });

    // Five stops make four legs — the first stop has no leg into it.
    await expect(legs).toHaveCount(4);
    await expect(legs.nth(0)).toHaveAccessibleName(/הליכה ברגל/); // 400m walk
    await expect(legs.nth(1)).toHaveAccessibleName(/נסיעה ברכב/); // 120km drive
    await expect(legs.nth(2)).toHaveAccessibleName(/טיול רגלי/); // the trail itself
    await expect(legs.nth(3)).toHaveAccessibleName(/תחבורה ציבורית/); // the bus
  });

  test("sends each leg to Google Maps in its own travel mode", async ({ page }) => {
    const app = await openGeneratedApp(page);
    const legs = app.getByRole("link", { name: /הוראות הגעה מהעצירה הקודמת/ });

    // `all()` resolves immediately against whatever is rendered right now, so
    // wait for the list to settle first or this races the app mounting.
    await expect(legs).toHaveCount(4);
    const modes = await Promise.all(
      (await legs.all()).map(async (leg) =>
        new URL(await leg.getAttribute("href")!).searchParams.get("travelmode"),
      ),
    );
    // Hiking has no Google mode of its own, so it travels as walking.
    expect(modes).toEqual(["walking", "driving", "walking", "transit"]);
  });

  test("offers Waze on the driving leg only", async ({ page }) => {
    const app = await openGeneratedApp(page);
    const waze = app.getByRole("link", { name: /Waze/ });

    await expect(waze).toHaveCount(1);
    await expect(waze).toHaveAccessibleName(/Ein Gedi parking/);
    expect(await waze.getAttribute("href")).toMatch(/^https:\/\/waze\.com\/ul\?ll=/);
  });
});
