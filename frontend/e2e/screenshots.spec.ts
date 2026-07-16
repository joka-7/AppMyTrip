import { test } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../docs/screenshots");
const LANG_STORAGE_KEY = "appmytrip_lang";

const SAMPLE_TRIP = {
  title: "Family trip to Rome",
  dates: "Thu - Sun",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "a1",
          time: "10:00",
          title: "Spanish Steps",
          desc: "A historic landmark in the heart of Rome.",
          type: "attraction",
          hasPodcast: true,
          price: 15,
          map_coordinates: { lat: 41.9059, lng: 12.4827 },
        },
        {
          id: "a2",
          time: "13:00",
          title: "Trattoria Da Enzo",
          desc: "Classic Roman lunch.",
          type: "food",
          hasPodcast: false,
          price: 45,
          map_coordinates: { lat: 41.8892, lng: 12.4768 },
        },
      ],
    },
    {
      dayNum: 2,
      activities: [
        {
          id: "a3",
          time: "09:00",
          title: "Colosseum",
          desc: "Guided tour of the ancient amphitheatre.",
          type: "attraction",
          hasPodcast: true,
          price: 28,
          map_coordinates: { lat: 41.8902, lng: 12.4922 },
        },
      ],
    },
  ],
};

async function mockBackend(page: import("@playwright/test").Page) {
  await page.route("**/api/trip/parse", async (route) => {
    await route.fulfill({
      json: { trip_data: SAMPLE_TRIP, initial_agent_message: "Your Rome itinerary looks great!" },
    });
  });
  await page.route("**/api/trip/generate-media", async (route) => {
    await route.fulfill({
      json: { trip_data: SAMPLE_TRIP, status: "Media generated successfully" },
    });
  });
}

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:5174";

async function useEnglishUi(page: import("@playwright/test").Page) {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "en");
  }, LANG_STORAGE_KEY);
}

async function goToStep4(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/`);
  await page.getByRole("button", { name: "Create initial app structure" }).click();
  await page.getByRole("button", { name: "Skip, continue to agent" }).click();
  await page.getByRole("button", { name: "Continue to app design" }).click();
  await page.getByText("Step 4 of 4").waitFor();
}

test.describe("capture UI screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await useEnglishUi(page);
    await mockBackend(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("step 4 design screenshots", async ({ page }) => {
    await goToStep4(page);

    await page.screenshot({
      path: path.join(OUT_DIR, "step4-overview.png"),
      fullPage: true,
    });

    const designPanel = page.locator(".flex-1.bg-white.rounded-2xl").first();
    await designPanel.screenshot({
      path: path.join(OUT_DIR, "step4-design-panel.png"),
    });

    const phonePreview = page.locator(".w-\\[350px\\].h-\\[700px\\]");
    await phonePreview.screenshot({
      path: path.join(OUT_DIR, "step4-live-preview.png"),
    });
  });

  test("step 4 with design options applied", async ({ page }) => {
    await goToStep4(page);

    await page.getByPlaceholder("For example: The Cohen family").fill("The Cohen family");
    await page.getByPlaceholder("For example: Pack light, eat well").fill("Pack light, eat well");
    await page.getByRole("button", { name: "Serif" }).click();
    await page.getByRole("button", { name: "Spacious" }).click();
    await page.getByRole("button", { name: "Dots" }).click();
    await page.getByRole("button", { name: "Timeline" }).click();
    await page.getByPlaceholder("For example: Welcome to the trip! Changes are saved locally.").fill(
      "Welcome to Rome! All edits here are saved locally.",
    );

    await page.screenshot({
      path: path.join(OUT_DIR, "step4-customized.png"),
      fullPage: true,
    });

    const phonePreview = page.locator(".w-\\[350px\\].h-\\[700px\\]");
    await phonePreview.screenshot({
      path: path.join(OUT_DIR, "step4-preview-customized.png"),
    });
  });

  test("step 4 preview map tab", async ({ page }) => {
    await goToStep4(page);

    const phonePreview = page.locator(".w-\\[350px\\].h-\\[700px\\]");
    await phonePreview.getByRole("button", { name: "Map", exact: true }).click();

    await phonePreview.screenshot({
      path: path.join(OUT_DIR, "step4-preview-map.png"),
    });
  });
});
