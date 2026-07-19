import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hebrewWeekdayLetter, tripStartWeekdayIndex } from "./hebrewDate";

// Several cases below have no year at all, which resolves relative to "now" —
// pin it so those assertions don't depend on when the suite actually runs.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 19)); // 2026-07-19
});
afterEach(() => {
  vi.useRealTimers();
});

describe("tripStartWeekdayIndex", () => {
  it("parses an ISO date", () => {
    // 2025-06-12 is a Thursday
    expect(tripStartWeekdayIndex("2025-06-12 - 2025-06-18")).toBe(4);
  });

  it("parses a DD/MM/YYYY date", () => {
    expect(tripStartWeekdayIndex("12/06/2025 - 18/06/2025")).toBe(4);
  });

  it("parses a DD.MM.YYYY date", () => {
    expect(tripStartWeekdayIndex("12.06.2025 - 18.06.2025")).toBe(4);
  });

  it("parses a 2-digit year the same as its 4-digit equivalent", () => {
    expect(tripStartWeekdayIndex("12/06/25 - 18/06/25")).toBe(4);
    expect(tripStartWeekdayIndex("12.06.25 - 18.06.25")).toBe(4);
  });

  it("falls back to a Hebrew weekday letter after 'יום'", () => {
    expect(tripStartWeekdayIndex("יום א׳ – יום ג׳")).toBe(0);
    expect(tripStartWeekdayIndex("יום ג' - יום ה'")).toBe(2);
  });

  it("falls back to a full Hebrew weekday name after 'יום'", () => {
    expect(tripStartWeekdayIndex("יום ראשון עד יום שלישי")).toBe(0);
    expect(tripStartWeekdayIndex("מיום שני הקרוב")).toBe(1);
  });

  it("parses English weekday names", () => {
    expect(tripStartWeekdayIndex("Mon - Wed")).toBe(1);
    expect(tripStartWeekdayIndex("Thu - Sun")).toBe(4);
  });

  it("parses French weekday names", () => {
    expect(tripStartWeekdayIndex("lundi au mercredi")).toBe(1);
    expect(tripStartWeekdayIndex("jeudi - dimanche")).toBe(4);
    expect(tripStartWeekdayIndex("du samedi")).toBe(6);
  });

  it("returns null for a freeform string with no day, month, or weekday at all", () => {
    expect(tripStartWeekdayIndex("בקרוב")).toBeNull();
  });

  it("parses a bare Hebrew weekday letter without the יום prefix", () => {
    expect(tripStartWeekdayIndex("א׳–ג׳")).toBe(0);
    expect(tripStartWeekdayIndex("ג' - ה'")).toBe(2);
  });

  it("parses a Hebrew day-range + month name + year", () => {
    // 2026-07-20 is a Monday
    expect(tripStartWeekdayIndex("20-27 ביולי 2026")).toBe(1);
    expect(tripStartWeekdayIndex("20-27 יולי 2026")).toBe(1);
    expect(tripStartWeekdayIndex("20 ביולי - 27 ביולי 2026")).toBe(1);
  });

  it("parses an English day-range + month name + year, either order", () => {
    expect(tripStartWeekdayIndex("20-27 July 2026")).toBe(1);
    expect(tripStartWeekdayIndex("July 20-27, 2026")).toBe(1);
  });

  it("parses a French day-range + month name + year", () => {
    expect(tripStartWeekdayIndex("20-27 juillet 2026")).toBe(1);
  });

  it("assumes the nearest upcoming year when a month name has none", () => {
    // "now" is 2026-07-19 (fake system time above); July 20 hasn't happened
    // yet this year, so it resolves to 2026-07-20, a Monday.
    expect(tripStartWeekdayIndex("20-27 יולי")).toBe(1);
    expect(tripStartWeekdayIndex("20-27 July")).toBe(1);
  });

  it("rolls a yearless month/day that already passed this year to next year", () => {
    // "now" is 2026-07-19; July 12 already happened this year, so it resolves
    // to 2027-07-12, also a Monday — distinct from 2026-07-12 (a Sunday).
    expect(tripStartWeekdayIndex("12-19 ביולי")).toBe(1);
  });

  it("parses a bare day + numeric month with no year at all", () => {
    // Resolves to 2026-07-20 (nearest upcoming), a Monday.
    expect(tripStartWeekdayIndex("20-27.07")).toBe(1);
    expect(tripStartWeekdayIndex("20-27/07")).toBe(1);
    expect(tripStartWeekdayIndex("20/07 - 27/07")).toBe(1);
    expect(tripStartWeekdayIndex("20.07 - 27.07")).toBe(1);
  });
});

describe("hebrewWeekdayLetter", () => {
  it("maps 0-6 to the Hebrew weekday letters", () => {
    expect(hebrewWeekdayLetter(0)).toBe("א");
    expect(hebrewWeekdayLetter(6)).toBe("ש");
  });

  it("wraps around past Saturday", () => {
    expect(hebrewWeekdayLetter(7)).toBe("א");
    expect(hebrewWeekdayLetter(8)).toBe("ב");
  });
});
