import { describe, it, expect } from "vitest";
import {
  googleMapsPlaceUrl,
  googleMapsDirectionsUrl,
  googleMapsLegUrl,
  hasMapLink,
  parseMapUrlCoords,
  wazeUrl,
} from "./mapLinks";
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
      googleMapsDirectionsUrl(
        [
          act("a1", "Start", 41.9, 12.5),
          act("a2", "Middle", 41.91, 12.51),
          act("a3", "End", 41.92, 12.52),
        ],
        "walking",
      ),
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
      googleMapsDirectionsUrl(
        [act("a1", "   ", 41.9, 12.5), act("a2", "End", 41.92, 12.52)],
        "walking",
      ),
    );
    expect(url.searchParams.get("origin")).toBe("41.9,12.5");
    expect(url.searchParams.get("destination")).toBe("41.92,12.52");
  });

  it("omits waypoints when there are only two stops", () => {
    const url = new URL(
      googleMapsDirectionsUrl(
        [act("a1", "Start", 41.9, 12.5), act("a2", "End", 41.92, 12.52)],
        "walking",
      ),
    );
    expect(url.searchParams.get("waypoints")).toBeNull();
  });

  // Every route used to open as "walking" no matter how far apart the stops
  // were, which made a driving day useless in Google Maps.
  it("opens in the mode it is given", () => {
    const stops = [act("a1", "Start", 41.9, 12.5), act("a2", "End", 42.5, 13.2)];
    expect(new URL(googleMapsDirectionsUrl(stops, "driving")).searchParams.get("travelmode")).toBe(
      "driving",
    );
    expect(
      new URL(googleMapsDirectionsUrl(stops, "bicycling")).searchParams.get("travelmode"),
    ).toBe("bicycling");
  });
});

describe("googleMapsLegUrl", () => {
  it("routes from the previous stop to this one in the given mode", () => {
    const url = new URL(
      googleMapsLegUrl(act("a1", "Start", 41.9, 12.5), act("a2", "End", 41.92, 12.52), "driving"),
    );
    expect(url.searchParams.get("origin")).toBe("41.9,12.5");
    expect(url.searchParams.get("destination")).toBe("41.92,12.52");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("waypoints")).toBeNull();
  });
});

describe("wazeUrl", () => {
  it("navigates straight to the coordinates", () => {
    const url = new URL(wazeUrl(act("a1", "Parking", 32.08, 34.78)));
    expect(url.host).toBe("www.waze.com");
    expect(url.searchParams.get("ll")).toBe("32.08,34.78");
    expect(url.searchParams.get("navigate")).toBe("yes");
  });
});

describe("map_url override", () => {
  it("wins over the generated coordinate link", () => {
    const pasted = "https://www.google.com/maps/place/Real+Spot/@41.5,12.1,17z";
    const withOverride: Activity = { ...act("a1", "Wrong pin", 41.89, 12.49), map_url: pasted };
    expect(googleMapsPlaceUrl(withOverride)).toBe(pasted);
  });

  // Only an absolute http(s) URL is a real override. A relative-looking value
  // would otherwise resolve against our own origin and navigate back into the
  // app instead of out to a map.
  it("falls back to coordinates for an unsafe, relative or empty override", () => {
    const coordUrl = googleMapsPlaceUrl(act("a1", "Colosseum", 41.89, 12.49));
    for (const bad of [
      "javascript:alert(1)",
      "   ",
      "not a url at all",
      "maps.google.com/?q=1,2",
      "/maps/place/X",
    ]) {
      const activity: Activity = { ...act("a1", "Colosseum", 41.89, 12.49), map_url: bad };
      expect(googleMapsPlaceUrl(activity)).toBe(coordUrl);
    }
  });

  it("still builds the day route from coordinates, not the override", () => {
    const stops: Activity[] = [
      { ...act("a1", "Start", 41.9, 12.5), map_url: "https://maps.app.goo.gl/abc" },
      act("a2", "End", 41.92, 12.52),
    ];
    const url = new URL(googleMapsDirectionsUrl(stops, "driving"));
    expect(url.searchParams.get("origin")).toBe("41.9,12.5");
  });
});

describe("parseMapUrlCoords", () => {
  it("reads the resolved place coordinates in preference to the viewport centre", () => {
    // !3d/!4d is the place itself; @ is wherever the map happened to be centred.
    expect(
      parseMapUrlCoords(
        "https://www.google.com/maps/place/X/@41.5,12.1,17z/data=!3d41.8902!4d12.4922",
      ),
    ).toEqual({ lat: 41.8902, lng: 12.4922 });
  });

  it.each([
    ["https://www.google.com/maps/place/Colosseo/@41.8902,12.4922,17z", 41.8902, 12.4922],
    ["https://www.google.com/maps/search/?api=1&query=41.8902,12.4922", 41.8902, 12.4922],
    ["https://maps.google.com/?q=-33.8688,151.2093", -33.8688, 151.2093],
    ["https://maps.google.com/?ll=51.5074,-0.1278&z=12", 51.5074, -0.1278],
    ["https://www.google.com/maps?daddr=48.8584,2.2945", 48.8584, 2.2945],
  ])("parses %s", (url, lat, lng) => {
    expect(parseMapUrlCoords(url)).toEqual({ lat, lng });
  });

  it("handles a percent-encoded query", () => {
    expect(
      parseMapUrlCoords("https://www.google.com/maps/search/?api=1&query=41.89%2C12.49"),
    ).toEqual({ lat: 41.89, lng: 12.49 });
  });

  // Short links carry no coordinates — they still work as a link override, the
  // pin just can't be repaired from them.
  it("returns null for shortened links and for nonsense", () => {
    expect(parseMapUrlCoords("https://maps.app.goo.gl/aBcDeF123")).toBeNull();
    expect(parseMapUrlCoords("https://goo.gl/maps/aBcDeF123")).toBeNull();
    expect(parseMapUrlCoords("https://example.com/no-coords-here")).toBeNull();
    expect(parseMapUrlCoords("")).toBeNull();
    expect(parseMapUrlCoords(null)).toBeNull();
  });

  it("rejects number pairs that aren't valid coordinates", () => {
    expect(parseMapUrlCoords("https://www.google.com/maps/@999.5,12.1,17z")).toBeNull();
    expect(parseMapUrlCoords("https://maps.google.com/?q=41.5,900.2")).toBeNull();
  });
});

describe("hasMapLink", () => {
  it("is true with coordinates, with an override, and false with neither", () => {
    const bare: Activity = { id: "a", time: "", title: "T", desc: "", type: "attraction" };
    expect(hasMapLink(act("a1", "X", 1, 2))).toBe(true);
    expect(hasMapLink({ ...bare, map_url: "https://maps.app.goo.gl/x" })).toBe(true);
    expect(hasMapLink(bare)).toBe(false);
  });
});
