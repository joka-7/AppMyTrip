import { describe, it, expect } from "vitest";
import { googleTravelMode, haversineKm, isDrivingMode, legTravelMode } from "./travelMode";
import type { Activity } from "../api";

function act(overrides: Partial<Activity> = {}): Activity {
  return { id: "a1", time: "10:00", title: "Stop", desc: "", type: "attraction", ...overrides };
}

function at(lat: number, lng: number, overrides: Partial<Activity> = {}): Activity {
  return act({ map_coordinates: { lat, lng }, ...overrides });
}

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm({ lat: 41.9, lng: 12.5 }, { lat: 41.9, lng: 12.5 })).toBe(0);
  });

  it("matches a known distance (Rome → Paris ≈ 1105km)", () => {
    const km = haversineKm({ lat: 41.9028, lng: 12.4964 }, { lat: 48.8566, lng: 2.3522 });
    expect(km).toBeGreaterThan(1090);
    expect(km).toBeLessThan(1120);
  });

  it("is symmetric", () => {
    const a = { lat: 32.08, lng: 34.78 };
    const b = { lat: 31.77, lng: 35.21 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });
});

describe("legTravelMode", () => {
  // A day's first stop is reached from wherever you slept, which the itinerary
  // doesn't describe — so there is no leg, and nothing to label or navigate.
  it("has no mode for the first stop of a day", () => {
    expect(legTravelMode(undefined, at(41.9, 12.5))).toBeNull();
  });

  it("lets an explicit mode win over everything else", () => {
    const here = at(48.85, 2.35, { type: "transport", travel_mode: "bicycling" });
    expect(legTravelMode(at(41.9, 12.5), here)).toBe("bicycling");
  });

  it("detects a bus/train/ferry leg as transit", () => {
    const prev = at(32.0, 35.0);
    for (const title of ["Bus to Masada", "אוטובוס לים המלח", "Ferry to the island"]) {
      expect(legTravelMode(prev, at(32.5, 35.2, { title }))).toBe("transit");
    }
  });

  it("detects a hike as its own mode, not plain walking", () => {
    const prev = at(32.0, 35.0);
    for (const title of ["Masada hike", "טיול רגלי בנחל דוד", "Randonnée du Mont Blanc"]) {
      // ~50km apart — distance alone would say driving.
      expect(legTravelMode(prev, at(32.5, 35.2, { title }))).toBe("hiking");
    }
  });

  it("finds the keyword in the description too", () => {
    const here = at(32.5, 35.2, { title: "Ein Gedi", desc: "A long trail along the stream" });
    expect(legTravelMode(at(32.0, 35.0), here)).toBe("hiking");
  });

  it("prefers transit over hiking when a bus takes you to the trail", () => {
    const here = at(32.5, 35.2, { title: "Bus to the trail head" });
    expect(legTravelMode(at(32.0, 35.0), here)).toBe("transit");
  });

  it("only calls a leg cycling when something actually says so", () => {
    const prev = at(41.9, 12.5);
    expect(legTravelMode(prev, at(41.93, 12.5, { title: "Bike tour of the park" }))).toBe(
      "bicycling",
    );
    // Regression: a ~3km hop to a restaurant used to be labelled "Cycling" purely
    // because it fell in a made-up distance band. Nobody cycles to lunch.
    expect(legTravelMode(prev, at(41.93, 12.5, { title: "Trattoria Da Enzo" }))).toBe("driving");
  });

  it("walks only when the stops are genuinely close", () => {
    const prev = at(41.9, 12.5);
    expect(legTravelMode(prev, at(41.9036, 12.5))).toBe("walking"); // ~0.4km
    expect(legTravelMode(prev, at(42.4, 12.5))).toBe("driving"); // ~55km
  });

  it("falls back to driving when a stop has no coordinates", () => {
    expect(legTravelMode(at(41.9, 12.5), act())).toBe("driving");
    expect(legTravelMode(act(), at(41.9, 12.5))).toBe("driving");
  });
});

describe("googleTravelMode", () => {
  it("maps hiking onto walking, since Google has no hiking mode", () => {
    expect(googleTravelMode("hiking")).toBe("walking");
  });

  it("passes Google's own modes through untouched", () => {
    expect(googleTravelMode("driving")).toBe("driving");
    expect(googleTravelMode("transit")).toBe("transit");
    expect(googleTravelMode("bicycling")).toBe("bicycling");
    expect(googleTravelMode("walking")).toBe("walking");
  });
});

describe("isDrivingMode", () => {
  // Waze has no walking/cycling/transit mode, and a null mode means there's no
  // leg at all — offering Waze in any of those cases sends people the wrong way.
  it("is true only for driving", () => {
    expect(isDrivingMode("driving")).toBe(true);
    for (const mode of ["walking", "hiking", "bicycling", "transit"] as const) {
      expect(isDrivingMode(mode)).toBe(false);
    }
    expect(isDrivingMode(null)).toBe(false);
  });
});
