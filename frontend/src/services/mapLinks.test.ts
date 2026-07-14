import { describe, it, expect } from "vitest";
import { googleMapsPlaceUrl, googleMapsDirectionsUrl } from "./mapLinks";
import type { Activity } from "../api";

function act(id: string, title: string, lat: number, lng: number): Activity {
  return { id, time: "10:00", title, desc: "", type: "attraction", map_coordinates: { lat, lng } };
}

describe("googleMapsPlaceUrl", () => {
  it("opens a coordinate-biased name search for a named place (not a raw name@coord query)", () => {
    const url = googleMapsPlaceUrl(act("a1", "Colosseum", 41.89, 12.49));
    // Named place biased to its coordinates via the path form.
    expect(url).toBe("https://www.google.com/maps/search/Colosseum/@41.89,12.49,15z");
    // The old bug crammed "name @lat,lng" into the query param — make sure it's gone.
    expect(url).not.toContain("@41.89,12.49,15z&");
    expect(url).not.toMatch(/query=.*@/);
  });

  it("url-encodes place names with spaces and special characters", () => {
    const url = googleMapsPlaceUrl(act("a1", "St. Peter's Basilica", 41.9, 12.45));
    expect(url).toContain("/maps/search/St.%20Peter's%20Basilica/@41.9,12.45,15z");
  });

  it("falls back to a bare coordinate query when the activity has no title", () => {
    const url = googleMapsPlaceUrl(act("a1", "   ", 41.89, 12.49));
    const parsed = new URL(url);
    expect(parsed.searchParams.get("query")).toBe("41.89,12.49");
    expect(parsed.searchParams.get("api")).toBe("1");
  });
});

describe("googleMapsDirectionsUrl", () => {
  it("routes through every stop by exact coordinates with intermediate waypoints", () => {
    const url = new URL(
      googleMapsDirectionsUrl([
        act("a1", "Start", 41.9, 12.5),
        act("a2", "Middle", 41.91, 12.51),
        act("a3", "End", 41.92, 12.52),
      ]),
    );
    expect(url.searchParams.get("origin")).toBe("41.9,12.5");
    expect(url.searchParams.get("destination")).toBe("41.92,12.52");
    expect(url.searchParams.get("waypoints")).toBe("41.91,12.51");
    expect(url.searchParams.get("travelmode")).toBe("walking");
  });

  it("omits waypoints when there are only two stops", () => {
    const url = new URL(
      googleMapsDirectionsUrl([act("a1", "Start", 41.9, 12.5), act("a2", "End", 41.92, 12.52)]),
    );
    expect(url.searchParams.get("waypoints")).toBeNull();
  });
});
