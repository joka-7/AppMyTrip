import { describe, it, expect } from "vitest";
import { ensureActivityIds, ensureStartWeekday, normalizeTripForLoad } from "./normalizeTrip";
import type { TripData } from "../api";

function trip(activities: Array<Partial<{ id: string; title: string }>>): TripData {
  return {
    title: "T",
    dates: "d",
    days: [
      {
        dayNum: 1,
        // Cast: the whole point is tolerating activities that omit fields like id.
        activities: activities.map((a) => ({
          time: "10:00",
          title: a.title ?? "x",
          desc: "",
          type: "attraction" as const,
          map_coordinates: { lat: 1, lng: 2 },
          ...a,
        })),
      },
    ],
  } as TripData;
}

describe("ensureActivityIds", () => {
  it("assigns ids to activities that are missing them", () => {
    const result = ensureActivityIds(trip([{}, {}, {}]));
    const ids = result.days[0].activities.map((a) => a.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(3); // all unique
  });

  it("keeps existing unique ids unchanged", () => {
    const result = ensureActivityIds(trip([{ id: "a" }, { id: "b" }]));
    expect(result.days[0].activities.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("replaces duplicate ids so every activity ends up unique", () => {
    const result = ensureActivityIds(trip([{ id: "dup" }, { id: "dup" }, { id: "dup" }]));
    const ids = result.days[0].activities.map((a) => a.id);
    expect(ids[0]).toBe("dup");
    expect(new Set(ids).size).toBe(3);
  });
});

describe("ensureStartWeekday", () => {
  it("fills startWeekday from parseable dates when missing", () => {
    const result = ensureStartWeekday({ ...trip([]), dates: "Mon - Wed" });
    expect(result.startWeekday).toBe(1);
  });

  it("keeps an existing startWeekday on saved JSON", () => {
    const saved = { ...trip([]), dates: "12-19 ביולי", startWeekday: 4 };
    expect(ensureStartWeekday(saved).startWeekday).toBe(4);
  });

  it("leaves startWeekday unset when dates cannot be parsed", () => {
    const result = ensureStartWeekday({ ...trip([]), dates: "12-19 ביולי" });
    expect(result.startWeekday).toBeUndefined();
  });
});

describe("normalizeTripForLoad", () => {
  it("assigns ids and weekday together on import", () => {
    const result = normalizeTripForLoad({
      title: "T",
      dates: "יום א׳ – יום ג׳",
      days: [
        { dayNum: 1, activities: [{ time: "10:00", title: "x", desc: "", type: "attraction" }] },
      ],
    });
    expect(result.days[0].activities[0].id).toBeTruthy();
    expect(result.startWeekday).toBe(0);
  });
});
