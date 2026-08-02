import { describe, it, expect } from "vitest";
import { dominantTravelMode, haversineKm, inferTravelMode } from "./travelMode";
import type { Activity } from "../api";

function act(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    time: "10:00",
    title: "Stop",
    desc: "",
    type: "attraction",
    ...overrides,
  };
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

describe("inferTravelMode", () => {
  it("lets an explicit mode win over everything else", () => {
    // Far apart and a transport leg, but the user said bicycling.
    const prev = at(41.9, 12.5);
    const here = at(48.85, 2.35, { type: "transport", travel_mode: "bicycling" });
    expect(inferTravelMode(prev, here)).toBe("bicycling");
  });

  it("treats an activity that is itself a hike as walking, however far the stops are", () => {
    const prev = at(32.0, 35.0);
    for (const title of ["Masada hike", "טיול רגלי בנחל דוד", "Randonnée du Mont Blanc"]) {
      // ~50km apart — distance alone would say driving.
      expect(inferTravelMode(prev, at(32.5, 35.2, { title }))).toBe("walking");
    }
  });

  it("finds the keyword in the description too", () => {
    const prev = at(32.0, 35.0);
    const here = at(32.5, 35.2, { title: "Ein Gedi", desc: "A long trail along the stream" });
    expect(inferTravelMode(prev, here)).toBe("walking");
  });

  it("treats a transport activity as driving", () => {
    const prev = at(41.9, 12.5);
    expect(inferTravelMode(prev, at(41.901, 12.501, { type: "transport" }))).toBe("driving");
  });

  it("picks the mode from the distance between stops", () => {
    const prev = at(41.9, 12.5);
    // ~0.4km
    expect(inferTravelMode(prev, at(41.9036, 12.5, {}))).toBe("walking");
    // ~3.3km
    expect(inferTravelMode(prev, at(41.93, 12.5, {}))).toBe("bicycling");
    // ~55km
    expect(inferTravelMode(prev, at(42.4, 12.5, {}))).toBe("driving");
  });

  it("falls back to driving when either stop has no coordinates", () => {
    expect(inferTravelMode(undefined, at(41.9, 12.5))).toBe("driving");
    expect(inferTravelMode(at(41.9, 12.5), act())).toBe("driving");
  });
});

describe("dominantTravelMode", () => {
  it("takes the most demanding leg so a driving day never opens as a walk", () => {
    const day = [at(41.9, 12.5), at(41.903, 12.5), at(42.4, 12.5)];
    expect(dominantTravelMode(day)).toBe("driving");
  });

  it("stays walking when every leg is short", () => {
    // The first stop has no predecessor, so it must not drag the day to driving.
    const day = [at(41.9, 12.5), at(41.9036, 12.5), at(41.907, 12.5)];
    expect(dominantTravelMode(day)).toBe("walking");
  });
});
