import { describe, it, expect } from "vitest";
import { googleMapsPlaceUrl, googleMapsDirectionsUrl } from "./mapLinks";
import type { Activity } from "../api";

function act(id: string, title: string, lat: number, lng: number): Activity {
  return { id, time: "10:00", title, desc: "", type: "attraction", map_coordinates: { lat, lng } };
}

describe("googleMapsPlaceUrl", () => {
  it("always opens the exact coordinates, not a name-biased search", () => {
    // A name (even coordinate-biased via the path form) lets Google's text
    // search resolve to a different, same-named place instead of the real
    // spot — see the module comment. Only a bare "lat,lng" query is reliable.
    const url = googleMapsPlaceUrl(act("a1", "Colosseum", 41.89, 12.49));
    const parsed = new URL(url);
    expect(parsed.searchParams.get("query")).toBe("41.89,12.49");
    expect(parsed.searchParams.get("api")).toBe("1");
    expect(url).not.toContain("Colosseum");
  });

  it("ignores the title entirely, blank or not", () => {
    const withTitle = googleMapsPlaceUrl(act("a1", "St. Peter's Basilica", 41.9, 12.45));
    const withoutTitle = googleMapsPlaceUrl(act("a1", "   ", 41.9, 12.45));
    expect(withTitle).toBe(withoutTitle);
    const parsed = new URL(withTitle);
    expect(parsed.searchParams.get("query")).toBe("41.9,12.45");
  });
});

describe("googleMapsDirectionsUrl", () => {
  it("routes through every stop by exact coordinates (Google letters them A/B/C itself)", () => {
    const url = new URL(
      googleMapsDirectionsUrl([
        act("a1", "Start", 41.9, 12.5),
        act("a2", "Middle", 41.91, 12.51),
        act("a3", "End", 41.92, 12.52),
      ]),
    );
    // Coordinates, not the place name — a plain name is resolved as a literal
    // text query and can silently match a same-named place elsewhere, dropping
    // the pin in the wrong spot or failing to draw a route at all.
    expect(url.searchParams.get("origin")).toBe("41.9,12.5");
    expect(url.searchParams.get("destination")).toBe("41.92,12.52");
    expect(url.searchParams.get("waypoints")).toBe("41.91,12.51");
    expect(url.searchParams.get("travelmode")).toBe("walking");
  });

  it("uses coordinates regardless of whether a stop has a title", () => {
    const url = new URL(
      googleMapsDirectionsUrl([act("a1", "   ", 41.9, 12.5), act("a2", "End", 41.92, 12.52)]),
    );
    expect(url.searchParams.get("origin")).toBe("41.9,12.5");
    expect(url.searchParams.get("destination")).toBe("41.92,12.52");
  });

  it("omits waypoints when there are only two stops", () => {
    const url = new URL(
      googleMapsDirectionsUrl([act("a1", "Start", 41.9, 12.5), act("a2", "End", 41.92, 12.52)]),
    );
    expect(url.searchParams.get("waypoints")).toBeNull();
  });
});
