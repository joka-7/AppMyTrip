import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportTripToFile, importTripFromFile } from "./tripFile";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "./appDesign";

const sampleTrip: TripData = {
  title: "Rome 2026",
  dates: "Mon - Wed",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "a1",
          time: "10:00",
          title: "Museum",
          desc: "desc",
          type: "attraction",
        },
      ],
    },
  ],
};

describe("tripFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports a downloadable JSON file named after the trip title", () => {
    const click = vi.fn();
    const revoke = vi.fn();
    const createObjectURL = vi.fn(() => "blob:trip");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL: revoke,
    });
    const appendChild = vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    const removeChild = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
    // jsdom's <a> doesn't implement click the same way — stub the element.
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: click });
      }
      return el;
    });

    exportTripToFile(sampleTrip, DEFAULT_APP_DESIGN);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:trip");
    const link = appendChild.mock.calls[0][0] as HTMLAnchorElement;
    expect(link.download).toBe("Rome-2026.json");
    removeChild.mockRestore();
    appendChild.mockRestore();
  });

  it("imports a well-formed trip file and normalizes activity ids", async () => {
    const payload = {
      tripData: {
        title: "Imported",
        dates: "1-3 July",
        days: [
          {
            dayNum: 1,
            activities: [{ id: "", time: "09:00", title: "Stop", desc: "", type: "food" }],
          },
        ],
      },
      appDesign: { theme: "green" },
      exportedAt: "2026-01-01T00:00:00.000Z",
    };
    const file = new File([JSON.stringify(payload)], "trip.json", { type: "application/json" });
    const { tripData, appDesign } = await importTripFromFile(file);
    expect(tripData.title).toBe("Imported");
    expect(tripData.days[0].activities[0].id).not.toBe("");
    expect(appDesign.theme).toBe("green");
  });

  it("rejects a file that isn't a trip", async () => {
    const file = new File([JSON.stringify({ nope: true })], "bad.json", {
      type: "application/json",
    });
    await expect(importTripFromFile(file)).rejects.toThrow(/אינו טיול תקין|invalid/i);
  });
});
