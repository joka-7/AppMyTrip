import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildIcsCalendar,
  exportTripToIcs,
  parseActivityStartTime,
  parseTripStartDate,
} from "./icsExport";
import type { TripData } from "../api";

const sampleTrip: TripData = {
  title: "Rome",
  dates: "20-22 July 2026",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "a1",
          time: "10:30",
          title: "Colosseum",
          desc: "Ancient amphitheatre",
          type: "attraction",
          url: "https://example.com",
        },
      ],
    },
    {
      dayNum: 2,
      activities: [
        {
          id: "a2",
          time: "afternoon",
          title: "Gelato",
          desc: "",
          type: "food",
        },
      ],
    },
  ],
};

describe("icsExport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses absolute trip start dates from common formats", () => {
    const iso = parseTripStartDate("2026-07-20 - 2026-07-22");
    expect(iso?.getFullYear()).toBe(2026);
    expect(iso?.getMonth()).toBe(6);
    expect(iso?.getDate()).toBe(20);
    expect(parseTripStartDate("20/07/2026")?.getDate()).toBe(20);
    expect(parseTripStartDate("20-22 July 2026")?.getMonth()).toBe(6);
    expect(parseTripStartDate("Mon - Wed")).toBeNull();
  });

  it("parses leading HH:MM activity times", () => {
    expect(parseActivityStartTime("10:30")).toEqual({ hours: 10, minutes: 30 });
    expect(parseActivityStartTime("9:05-11:00")).toEqual({ hours: 9, minutes: 5 });
    expect(parseActivityStartTime("afternoon")).toBeNull();
  });

  it("builds a VCALENDAR with one VEVENT per activity", () => {
    const ics = buildIcsCalendar(sampleTrip);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Colosseum");
    expect(ics).toContain("SUMMARY:Gelato");
    expect(ics).toContain("DTSTART:20260720T103000");
    expect(ics).toContain("URL:https://example.com");
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
  });

  it("triggers a .ics download", () => {
    const click = vi.fn();
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "a") {
        return {
          click,
          set href(_: string) {},
          set download(_: string) {},
        } as unknown as HTMLAnchorElement;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    });
    vi.spyOn(document.body, "appendChild").mockImplementation((n) => n);
    vi.spyOn(document.body, "removeChild").mockImplementation((n) => n);
    // jsdom may not implement createObjectURL — stub on the prototype.
    const createObjectURL = vi.fn(() => "blob:ics");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    exportTripToIcs(sampleTrip);
    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    createElement.mockRestore();
  });
});
